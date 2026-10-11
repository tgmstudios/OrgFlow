import Foundation
import Observation
import OSLog
import UIKit
import AVFAudio

/// Owns the Ask screen's services and its explicit state machine.
/// Audio capture, transcription and the agent are independent; the coordinator only wires them together.
@Observable
final class AskScreenCoordinator {
    private(set) var state: AskViewState = .idle
    private(set) var entries: [ConversationEntry] = []
    /// Live transcript while capturing/transcribing; nil otherwise.
    private(set) var transcript: TranscriptUpdate?
    /// False when on-device transcription is unavailable; voice then drives the visualizer only.
    private(set) var transcriptionAvailable = true
    /// Prompts asked this session, newest first.
    private(set) var recentPrompts: [String] = []
    /// Composer text. Preserved across errors and voice sessions.
    var draft: String = ""

    var isConversationActive: Bool { !entries.isEmpty }

    @ObservationIgnored let capture = MicrophoneCaptureController()
    @ObservationIgnored private let agent: any KnowledgeAgentProviding
    @ObservationIgnored private var transcriber: SpeechAnalyzerTranscriber?
    @ObservationIgnored private var transcriberActive = false
    @ObservationIgnored private var transcriptTask: Task<Void, Never>?
    @ObservationIgnored private var answerTask: Task<Void, Never>?
    @ObservationIgnored private var voiceSession = 0
    @ObservationIgnored private var draftBeforeVoice = ""
    @ObservationIgnored private var conversationID = UUID()
    @ObservationIgnored private var isEditing = false

    /// The signed-in OrgFlow account, once known.
    private(set) var user: OrgFlowUser?
    /// Asked to present sign-in; the coordinator retries the pending question afterwards.
    @ObservationIgnored var onSignInRequested: (() -> Void)?

    init(agent: any KnowledgeAgentProviding = RemoteKnowledgeAgent()) {
        self.agent = agent
        capture.onEvent = { [weak self] event in self?.handle(event) }
    }

    // MARK: - Typing

    func setEditing(_ editing: Bool) {
        isEditing = editing
        switch state {
        case .idle where editing: state = .typing
        case .typing where !editing: state = .idle
        case .error(let error) where editing && !isAgentError(error): state = .typing
        default: break
        }
    }

    // MARK: - Voice

    func toggleMicrophone() {
        switch state {
        case .listening: Task { await stopListening() }
        case .transcribing: break
        default: Task { await startListening() }
        }
    }

    func startListening() async {
        guard !state.isCapturing, state != .transcribing else { return }
        guard await MicrophoneCaptureController.requestPermission() else {
            state = .error(.permissionDenied)
            return
        }
        voiceSession += 1
        let session = voiceSession
        do {
            let format = try await capture.prepareSessionAndFormat()
            try capture.start(transcriber: nil)
            draftBeforeVoice = draft.isEmpty ? "" : draft.trimmingCharacters(in: .whitespaces) + " "
            transcript = nil
            state = .listening(speechDetected: false)
            await attachTranscription(format: format, session: session)
        } catch {
            capture.stop()
            Self.log.error("Microphone start failed: \(String(describing: error), privacy: .public)")
            state = .error(.captureFailed(error.localizedDescription))
        }
    }

    /// Starts transcription after capture is already live, so the visualizer reacts immediately
    /// even while speech assets load.
    private func attachTranscription(format: AVAudioFormat, session: Int) async {
        if transcriber == nil {
            transcriber = await SpeechAnalyzerTranscriber.makeIfSupported()
        }
        guard let transcriber, session == voiceSession, state.isCapturing else {
            if transcriber == nil { Self.log.error("Transcription unavailable for \(Locale.current.identifier, privacy: .public)") }
            transcriptionAvailable = transcriber != nil
            return
        }
        do {
            let updates = try await transcriber.start(inputFormat: format)
            guard session == voiceSession, state.isCapturing else {
                transcriber.cancel()
                return
            }
            transcriptionAvailable = true
            transcriberActive = true
            capture.attachTranscriber(transcriber)
            let prefix = draftBeforeVoice
            transcriptTask = Task { [weak self] in
                for await update in updates {
                    guard let self, session == self.voiceSession else { break }
                    self.transcript = TranscriptUpdate(finalized: prefix + update.finalized, volatile: update.volatile)
                }
            }
        } catch {
            Self.log.error("Transcription start failed: \(String(describing: error), privacy: .public)")
            transcriptionAvailable = false
        }
    }

    /// Ends capture and finalizes the transcript into the editable draft.
    func stopListening() async {
        guard state.isCapturing else { return }
        capture.stop()
        await finalizeTranscript()
        state = isEditing ? .typing : .idle
    }

    private func finalizeTranscript() async {
        if transcriberActive, let transcriber {
            state = .transcribing
            transcriberActive = false
            await transcriber.finish()
            await transcriptTask?.value
        }
        transcriptTask = nil
        if let transcript {
            draft = transcript.combined.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        transcript = nil
    }

    private func handle(_ event: MicrophoneCaptureController.Event) {
        switch event {
        case .speechDetected(let detected):
            if state.isCapturing { state = .listening(speechDetected: detected) }
        case .interrupted:
            Task {
                await finalizeTranscript()
                state = .error(.interrupted)
            }
        case .failed(let message):
            Task {
                await finalizeTranscript()
                state = .error(.captureFailed(message))
            }
        }
    }

    // MARK: - Asking

    func submit(_ rawText: String) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, state != .thinking, state != .responding else { return }
        if state.isCapturing {
            // Sending mid-capture: keep what the user sees, stop the microphone immediately.
            capture.stop()
            transcriber?.cancel()
            transcriberActive = false
            transcriptTask?.cancel()
            transcript = nil
            voiceSession += 1
        }
        draft = ""
        recentPrompts.removeAll { $0 == text }
        recentPrompts.insert(text, at: 0)
        UserDefaults.standard.set(true, forKey: AskScreenCoordinator.hasAskedKey)
        let entry = ConversationEntry(id: UUID(), prompt: text)
        entries.append(entry)
        run(entry.id)
    }

    func retry(_ id: UUID) {
        guard let index = entries.firstIndex(where: { $0.id == id }), state != .thinking, state != .responding else { return }
        entries[index].answer = ""
        entries[index].citations = []
        entries[index].status = .thinking
        run(id)
    }

    private func run(_ id: UUID) {
        state = .thinking
        let history = entries
            .filter { $0.id != id && $0.status == .complete }
            .flatMap { [ConversationTurn(role: .user, text: $0.prompt), ConversationTurn(role: .assistant, text: $0.answer)] }
        guard let prompt = entries.first(where: { $0.id == id })?.prompt else { return }
        let stream = agent.ask(prompt, conversationID: conversationID, history: history)

        answerTask?.cancel()
        answerTask = Task { [weak self] in
            do {
                for try await event in stream {
                    guard let self, let index = self.entries.firstIndex(where: { $0.id == id }) else { return }
                    switch event {
                    case .delta(let text):
                        if self.state == .thinking { self.state = .responding }
                        self.entries[index].status = .streaming
                        self.entries[index].answer += text
                    case .source(let citation):
                        if !self.entries[index].citations.contains(citation) {
                            self.entries[index].citations.append(citation)
                        }
                    case .done:
                        self.entries[index].status = .complete
                    }
                }
                guard let self else { return }
                if let index = self.entries.firstIndex(where: { $0.id == id }), self.entries[index].status != .complete {
                    self.entries[index].status = .complete
                }
                self.state = self.isEditing ? .typing : .idle
            } catch OrgFlowAPIError.signInRequired {
                guard let self, !Task.isCancelled else { return }
                if let index = self.entries.firstIndex(where: { $0.id == id }) {
                    self.entries[index].status = .failed(OrgFlowAPIError.signInRequired.errorDescription ?? "")
                }
                self.user = nil
                self.state = .error(.signInRequired)
                self.onSignInRequested?()
            } catch {
                guard let self, !Task.isCancelled else { return }
                let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                if let index = self.entries.firstIndex(where: { $0.id == id }) {
                    self.entries[index].status = .failed(message)
                }
                self.state = .error(.agentUnavailable(message))
            }
        }
    }

    func newConversation() {
        answerTask?.cancel()
        answerTask = nil
        entries = []
        conversationID = UUID()
        state = isEditing ? .typing : .idle
    }

    // MARK: - Recovery

    func recover() {
        guard case .error(let error) = state else { return }
        switch error {
        case .permissionDenied:
            state = .idle
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        case .interrupted, .captureFailed:
            state = .idle
            Task { await startListening() }
        case .signInRequired:
            onSignInRequested?()
        case .agentUnavailable:
            if let failed = entries.last(where: { if case .failed = $0.status { true } else { false } }) {
                state = .idle
                retry(failed.id)
            } else {
                state = .idle
            }
        }
    }

    // MARK: - Account

    func refreshUser() async {
        user = try? await OrgFlowAPI.shared.currentUser()
    }

    /// After signing in, asks the question that was waiting on it.
    func didSignIn(_ user: OrgFlowUser) {
        self.user = user
        guard case .error(.signInRequired) = state else { return }
        state = .idle
        if let failed = entries.last(where: { if case .failed = $0.status { true } else { false } }) {
            retry(failed.id)
        }
    }

    func signOut() {
        user = nil
        Task { await OrgFlowAPI.shared.signOut() }
    }

    func dismissError() {
        if case .error = state { state = isEditing ? .typing : .idle }
    }

    func enterBackground() {
        if state.isCapturing {
            Task { await stopListening() }
        }
    }

    private func isAgentError(_ error: AskError) -> Bool {
        if case .agentUnavailable = error { true } else { false }
    }

    private static let log = Logger(subsystem: "ryannair05.OrgFlow", category: "Ask")

    static let hasAskedKey = "continuity.hasAsked"
    static var isReturningUser: Bool { UserDefaults.standard.bool(forKey: hasAskedKey) }
}
