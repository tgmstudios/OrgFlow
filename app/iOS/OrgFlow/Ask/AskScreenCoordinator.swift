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
    /// Ask, Capture or Handoff.
    private(set) var mode: AskMode = .ask
    /// Recent conversations on this device, newest first.
    private(set) var conversations: [SavedConversation] = ConversationStore.load()
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
    /// The running capture session: what was narrated and the draft it is building.
    @ObservationIgnored private var captureTurns: [PlaybookDrafter.Turn] = []
    @ObservationIgnored private var captureArticleID: String?
    /// Agreement to send this capture conversation's narration to the backend drafting AI.
    @ObservationIgnored private var sharingConsented = false

    /// Capture and Handoff narrations go to the backend drafter only with consent, once per
    /// conversation. Drafting on device needs none.
    var needsSharingConsent: Bool {
        mode != .ask && !sharingConsented && !(PlaybookDrafter.prefersOnDevice && PlaybookDrafter.isOnDeviceAvailable)
    }

    func grantSharingConsent() {
        sharingConsented = true
    }

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
        case .interviewing: Task { await finishInterview() }
        case .transcribing: break
        default:
            if usesInterview { Task { await startInterview() } } else { Task { await startListening() } }
        }
    }

    // MARK: - Live interview (ElevenLabs)

    /// Every mode talks with OrgFlow's voice agent unless the person chose to dictate or type.
    var voiceStyle: VoiceStyle = VoiceStyle.saved {
        didSet { VoiceStyle.saved = voiceStyle }
    }

    var usesInterview: Bool { voiceStyle == .conversation }

    @ObservationIgnored private var interview: VoiceInterviewSession?
    /// The latest line of the live call, for captions.
    private(set) var interviewCaption: String?
    private(set) var interviewCaptionFromAgent = true
    /// Receives the call transcript when a call ends with something said, ready to draft.
    @ObservationIgnored var onInterviewFinished: ((String) -> Void)?
    /// The next submitted narration came from an interview transcript.
    @ObservationIgnored private var draftIsInterview = false
    /// A gap-driven plan for the next Handoff call; OrgFlow's voice agent receives its brief on connect.
    private(set) var interviewPlan: InterviewPlan?

    /// Switches to Handoff with a planned interview, talking with OrgFlow, ready to start.
    func loadInterviewPlan(_ plan: InterviewPlan) {
        if mode != .handoff { setMode(.handoff) }
        guard mode == .handoff else { return }
        voiceStyle = .conversation
        interviewPlan = plan
    }

    func clearInterviewPlan() {
        interviewPlan = nil
    }

    /// Knot input: the interview's voices while talking with OrgFlow, otherwise the microphone.
    func currentVoiceFeatures() -> AudioFeatureSnapshot {
        interview?.currentFeatures() ?? capture.currentFeatures()
    }

    func startInterview() async {
        guard interview == nil, !state.isCapturing, !state.isInterviewing else { return }
        guard await MicrophoneCaptureController.requestPermission() else {
            state = .error(.permissionDenied)
            return
        }
        let session = VoiceInterviewSession()
        interview = session
        draftBeforeVoice = draft.isEmpty ? "" : draft.trimmingCharacters(in: .whitespacesAndNewlines) + "\n"
        state = .interviewing(.connecting)
        switch mode {
        case .handoff: session.initialContext = interviewPlan?.agentBrief
        case .ask: session.initialContext = await Self.askBrief()
        case .capture: break
        }
        guard interview === session else { return }
        session.onPhase = { [weak self] phase in
            guard let self, interview === session else { return }
            switch phase {
            case .connecting: state = .interviewing(.connecting)
            case .listening(let muted): state = .interviewing(.listening(muted: muted))
            case .agentSpeaking: state = .interviewing(.agentSpeaking)
            case .ended: break
            }
        }
        session.onTranscript = { [weak self] lines in
            guard let self, interview === session else { return }
            interviewCaption = lines.last?.text
            interviewCaptionFromAgent = lines.last?.fromAgent ?? true
        }
        session.onEnded = { [weak self] reason in
            guard let self, interview === session else { return }
            if let reason { Self.log.error("Interview ended: \(reason, privacy: .public)") }
            Task { await self.finishInterview() }
        }
        do {
            try await session.start()
        } catch {
            guard interview === session else { return }
            interview = nil
            Self.log.error("Interview start failed: \(String(describing: error), privacy: .public)")
            switch error as? OrgFlowAPIError {
            case .signInRequired:
                user = nil
                state = .error(.signInRequired)
                onSignInRequested?()
            case .planRequired(let detail):
                state = .error(.planRequired(detail))
            case .server(_, let message):
                state = .error(.captureFailed(message))
            default:
                state = .error(.captureFailed("Couldn't start the conversation with OrgFlow. Try again, or switch to Dictate."))
            }
        }
    }

    /// Ends the call. Ask keeps the spoken exchange as the conversation; Capture and Handoff hand the
    /// transcript on to be drafted.
    func finishInterview() async {
        guard let session = interview else { return }
        interview = nil
        let text = await session.finish()
        interviewCaption = nil
        state = isEditing ? .typing : .idle
        // Only keep or draft a call where the person actually said something.
        guard session.lines.contains(where: { !$0.fromAgent }) else { return }
        if mode == .ask {
            recordSpokenExchanges(session.lines)
            return
        }
        interviewPlan = nil
        let combined = (draftBeforeVoice + text).trimmingCharacters(in: .whitespacesAndNewlines)
        draftIsInterview = true
        onInterviewFinished?(combined)
    }

    /// Each thing the person said becomes a question, with OrgFlow's spoken reply as its answer.
    private func recordSpokenExchanges(_ lines: [VoiceInterviewSession.Line]) {
        var exchanges: [ConversationEntry] = []
        for line in lines {
            if !line.fromAgent {
                if let last = exchanges.last, last.answer.isEmpty {
                    exchanges[exchanges.count - 1] = ConversationEntry(id: last.id, prompt: last.prompt + " " + line.text, mode: .ask, fromInterview: true, answer: "", status: .complete)
                } else {
                    exchanges.append(ConversationEntry(id: UUID(), prompt: line.text, mode: .ask, fromInterview: true, status: .complete))
                }
            } else if !exchanges.isEmpty {
                let answer = exchanges[exchanges.count - 1].answer
                exchanges[exchanges.count - 1].answer = answer.isEmpty ? line.text : answer + "\n\n" + line.text
            }
        }
        guard !exchanges.isEmpty else { return }
        UserDefaults.standard.set(true, forKey: Self.hasAskedKey)
        entries.append(contentsOf: exchanges)
        persistConversation()
    }

    /// Grounds a spoken Ask in approved knowledge: published playbooks, sent to the voice agent as
    /// context once the call connects. Drafts are never included.
    private static func askBrief() async -> String? {
        guard let workspace = try? await OrgFlowAPI.shared.workspace() else { return nil }
        let published = workspace.articles.filter { $0.hasPublishedVersion || !$0.isDraft }
        var brief = [
            "The person is asking questions about how their organization works. Answer from the organization's approved playbooks below, and say which playbook you used.",
            "If the playbooks don't cover the question, say so plainly and suggest capturing it in OrgFlow. Never invent steps, names or dates. Keep spoken answers short.",
            "Approved playbooks:",
        ].joined(separator: "\n")
        for article in published {
            let text = (article.publishedContent ?? article.content)?.plainText ?? ""
            let entry = "\n\n## \(article.displayTitle)\n" + String(text.prefix(1500))
            guard brief.count + entry.count < 12000 else { break }
            brief += entry
        }
        return published.isEmpty ? nil : brief
    }

    func setInterviewMuted(_ muted: Bool) {
        Task { await interview?.setMuted(muted) }
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
        guard !text.isEmpty, state != .thinking, state != .responding, !state.isInterviewing else { return }
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
        UserDefaults.standard.set(true, forKey: AskScreenCoordinator.hasAskedKey)
        var entry = ConversationEntry(id: UUID(), prompt: text, mode: mode)
        if draftIsInterview, mode != .ask { entry.fromInterview = true }
        draftIsInterview = false
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
        guard let entry = entries.first(where: { $0.id == id }) else { return }
        if entry.mode == .ask { runAsk(id) } else { runCapture(entry) }
    }

    private func runAsk(_ id: UUID) {
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
                self.persistConversation()
            } catch {
                guard let self, !Task.isCancelled else { return }
                self.fail(id, error)
            }
        }
    }

    /// Capture and Handoff: the narration becomes (or revises) a draft article awaiting approval.
    /// Speaking again in the same conversation adds detail to the same draft.
    private func runCapture(_ entry: ConversationEntry) {
        state = .thinking
        let id = entry.id
        let turns = captureTurns + [PlaybookDrafter.Turn(role: "user", content: PlaybookDrafter.frame(entry.prompt, mode: entry.mode, isFirst: captureArticleID == nil, interview: entry.fromInterview == true))]
        let articleID = captureArticleID
        answerTask?.cancel()
        answerTask = Task { [weak self] in
            do {
                let result = try await PlaybookDrafter.draft(turns: turns, mode: entry.mode, articleID: articleID)
                guard let self, !Task.isCancelled, let index = self.entries.firstIndex(where: { $0.id == id }) else { return }
                self.captureTurns = turns + [PlaybookDrafter.Turn(role: "assistant", content: result.message)]
                self.captureArticleID = result.article.id
                let origin = result.onDevice ? "Draft · written on this iPhone · awaiting review" : "Draft · awaiting review"
                self.entries[index].draftArticleID = result.article.id
                self.entries[index].citations = [Citation(id: result.article.id, title: result.article.title, snippet: origin, url: nil)]
                self.entries[index].status = .streaming
                self.state = .responding
                let closing = articleID == nil
                    ? "Open the draft to review and publish it, or keep talking to add detail."
                    : "The draft is updated. Keep going, or open it to review and publish."
                for chunk in Self.words(result.message + "\n\n" + closing) {
                    self.entries[index].answer += chunk
                    try await Task.sleep(for: .milliseconds(24))
                }
                self.entries[index].status = .complete
                self.state = self.isEditing ? .typing : .idle
                self.persistConversation()
            } catch {
                guard let self, !Task.isCancelled else { return }
                self.fail(id, error)
            }
        }
    }

    private func fail(_ id: UUID, _ error: Error) {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        if let index = entries.firstIndex(where: { $0.id == id }) {
            entries[index].status = .failed(message)
        }
        switch error as? OrgFlowAPIError {
        case .signInRequired:
            user = nil
            state = .error(.signInRequired)
            onSignInRequested?()
        case .planRequired(let detail):
            state = .error(.planRequired(detail))
        default:
            state = .error(.agentUnavailable(message))
        }
    }

    private static func words(_ text: String) -> [String] {
        var chunks: [String] = []
        var current = ""
        for character in text {
            current.append(character)
            if character.isWhitespace, current.count >= 3 {
                chunks.append(current)
                current = ""
            }
        }
        if !current.isEmpty { chunks.append(current) }
        return chunks
    }

    // MARK: - Modes and history

    func setMode(_ newMode: AskMode) {
        guard newMode != mode, state != .thinking, state != .responding else { return }
        if state.isCapturing { Task { await stopListening() } }
        if state.isInterviewing { Task { await finishInterview() } }
        if isConversationActive { newConversation() }
        mode = newMode
        interviewPlan = nil
        resetCapture()
    }

    private func resetCapture() {
        captureTurns = []
        captureArticleID = nil
        sharingConsented = false
    }

    private func persistConversation() {
        let finished = entries.filter { $0.status == .complete }
        guard !finished.isEmpty else { return }
        conversations.removeAll { $0.id == conversationID }
        conversations.insert(SavedConversation(id: conversationID, updatedAt: .now, mode: mode, entries: finished), at: 0)
        ConversationStore.save(conversations)
    }

    /// Reopens a saved conversation; Capture conversations continue building the same draft.
    func restore(_ id: UUID) {
        guard let saved = conversations.first(where: { $0.id == id }), state != .thinking, state != .responding else { return }
        answerTask?.cancel()
        entries = saved.entries
        conversationID = saved.id
        mode = saved.mode
        resetCapture()
        if saved.mode != .ask {
            for (index, entry) in saved.entries.enumerated() {
                captureTurns.append(.init(role: "user", content: PlaybookDrafter.frame(entry.prompt, mode: saved.mode, isFirst: index == 0, interview: entry.fromInterview == true)))
                captureTurns.append(.init(role: "assistant", content: entry.answer))
            }
            captureArticleID = saved.entries.last { $0.draftArticleID != nil }?.draftArticleID
        }
        state = isEditing ? .typing : .idle
    }

    /// After a draft is approved in the article sheet, its chip says so.
    func markPublished(_ article: Article) {
        for index in entries.indices {
            entries[index].citations = entries[index].citations.map {
                $0.id == article.id ? Citation(id: $0.id, title: article.displayTitle, snippet: "Published", url: $0.url) : $0
            }
        }
        persistConversation()
    }

    func clearHistory() {
        conversations = []
        ConversationStore.save([])
    }

    func newConversation() {
        answerTask?.cancel()
        answerTask = nil
        entries = []
        conversationID = UUID()
        resetCapture()
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
        case .planRequired:
            state = .idle
            UIApplication.shared.open(OrgFlowAPI.shared.pricingURL)
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
        if state.isInterviewing {
            Task { await finishInterview() }
        }
    }

    private func isAgentError(_ error: AskError) -> Bool {
        if case .agentUnavailable = error { true } else { false }
    }

    private static let log = Logger(subsystem: "ryannair05.OrgFlow", category: "Ask")

    static let hasAskedKey = "continuity.hasAsked"
    static var isReturningUser: Bool { UserDefaults.standard.bool(forKey: hasAskedKey) }
}
