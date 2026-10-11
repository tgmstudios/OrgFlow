import AVFAudio
import Combine
import ElevenLabs
import Foundation
import LiveKit
import os

/// A live spoken interview with OrgFlow's ElevenLabs agent (the same private agent the web app uses).
/// The backend mints a short-lived WebRTC conversation token (`GET /api/voice/session-token`), so no
/// ElevenLabs key ships in the app. While it runs, both voices are metered so the knot can carry
/// them as light: the person's voice in cool tones, OrgFlow's in warm ones.
final class VoiceInterviewSession {
    enum Phase: Equatable {
        case connecting
        /// OrgFlow is listening (`muted` when the person has muted their microphone).
        case listening(muted: Bool)
        case agentSpeaking
        case ended
    }

    struct Line: Equatable {
        let fromAgent: Bool
        let text: String
    }

    var onPhase: ((Phase) -> Void)?
    var onTranscript: (([Line]) -> Void)?
    /// The call ended on its own (agent hung up or the connection dropped).
    var onEnded: ((String?) -> Void)?
    /// Sent to the agent as a contextual update once the call connects (an interview plan's brief).
    var initialContext: String?

    private(set) var phase: Phase = .connecting
    private(set) var lines: [Line] = []
    private var conversation: Conversation?
    private var subscriptions: Set<AnyCancellable> = []
    private let userMeter = LevelMeter()
    private let agentMeter = LevelMeter()
    private var meteredAgentTrack: RemoteAudioTrack?
    private var meteredInputTrack: LocalAudioTrack?
    private var endedByUser = false
    private var smoothedLevel: Float = 0
    private var lastLevel: Float = 0

    /// Connects and starts the interview. Throws `OrgFlowAPIError` for sign-in, plan or availability.
    func start() async throws {
        let token = try await OrgFlowAPI.shared.voiceSessionToken()
        let conversation = try await ElevenLabs.startConversation(conversationToken: token)
        self.conversation = conversation
        conversation.$state
            .sink { [weak self] state in self?.stateChanged(state) }
            .store(in: &subscriptions)
        conversation.$agentState
            .combineLatest(conversation.$isMuted)
            .sink { [weak self] agent, muted in
                guard let self, phase != .ended, conversation.state.isActive else { return }
                self.attachMeters()
                setPhase(agent == .speaking ? .agentSpeaking : .listening(muted: muted))
            }
            .store(in: &subscriptions)
        conversation.$messages
            .sink { [weak self] messages in
                let lines = messages
                    .map { Line(fromAgent: $0.role == .agent, text: $0.content.trimmingCharacters(in: .whitespacesAndNewlines)) }
                    .filter { !$0.text.isEmpty }
                self?.lines = lines
                self?.onTranscript?(lines)
            }
            .store(in: &subscriptions)
    }

    func setMuted(_ muted: Bool) async {
        try? await conversation?.setMuted(muted)
    }

    var isMuted: Bool { conversation?.isMuted ?? false }

    /// Ends the call and returns the transcript as plain text ("OrgFlow: …" / "Me: …" lines).
    func finish() async -> String {
        endedByUser = true
        detachMeters()
        await conversation?.endConversation()
        subscriptions.removeAll()
        conversation = nil
        setPhase(.ended)
        return Self.transcript(lines)
    }

    static func transcript(_ lines: [Line]) -> String {
        lines.map { "\($0.fromAgent ? "OrgFlow" : "Me"): \($0.text)" }.joined(separator: "\n")
    }

    /// Knot input: whichever voice is louder, colored by who is speaking.
    func currentFeatures() -> AudioFeatureSnapshot {
        let user = userMeter.level, agent = agentMeter.level
        let level = max(user, agent)
        // Attack fast, release slower, like the microphone extractor.
        smoothedLevel += (level - smoothedLevel) * (level > smoothedLevel ? 0.5 : 0.12)
        var snapshot = AudioFeatureSnapshot()
        snapshot.loudness = min(1, smoothedLevel)
        snapshot.rms = level
        snapshot.peak = level
        snapshot.onset = max(0, level - lastLevel) * 2
        snapshot.centroid = agent > user ? 0.42 : 0.12
        snapshot.isSpeech = smoothedLevel > 0.06
        lastLevel = level
        return snapshot
    }

    // MARK: - Private

    private func setPhase(_ new: Phase) {
        guard new != phase else { return }
        phase = new
        onPhase?(new)
    }

    private func stateChanged(_ state: ConversationState) {
        switch state {
        case .active:
            attachMeters()
            if let context = initialContext, let conversation {
                initialContext = nil
                Task { try? await conversation.updateContext(context) }
            }
            if phase == .connecting { setPhase(.listening(muted: conversation?.isMuted ?? false)) }
        case .ended, .error:
            guard !endedByUser, phase != .ended else { return }
            detachMeters()
            setPhase(.ended)
            if case .error(let error) = state {
                onEnded?(String(describing: error))
            } else {
                onEnded?(nil)
            }
        case .idle, .connecting:
            break
        }
    }

    private func attachMeters() {
        if meteredAgentTrack == nil, let track = conversation?.agentAudioTrack {
            track.add(audioRenderer: agentMeter)
            meteredAgentTrack = track
        }
        if meteredInputTrack == nil, let track = conversation?.inputTrack {
            track.add(audioRenderer: userMeter)
            meteredInputTrack = track
        }
    }

    private func detachMeters() {
        meteredAgentTrack?.remove(audioRenderer: agentMeter)
        meteredInputTrack?.remove(audioRenderer: userMeter)
        meteredAgentTrack = nil
        meteredInputTrack = nil
        userMeter.reset()
        agentMeter.reset()
    }
}

/// Loudness of an audio track, 0…1 on a speech-friendly dB scale. Rendered on LiveKit's audio thread.
nonisolated final class LevelMeter: AudioRenderer, @unchecked Sendable {
    private let state = OSAllocatedUnfairLock(initialState: Float(0))

    var level: Float { state.withLock { $0 } }

    func reset() { state.withLock { $0 = 0 } }

    func render(pcmBuffer: AVAudioPCMBuffer) {
        let frames = Int(pcmBuffer.frameLength)
        guard frames > 0 else { return }
        var sum: Float = 0
        if let samples = pcmBuffer.floatChannelData?[0] {
            for i in 0..<frames { sum += samples[i] * samples[i] }
        } else if let samples = pcmBuffer.int16ChannelData?[0] {
            for i in 0..<frames {
                let s = Float(samples[i]) / Float(Int16.max)
                sum += s * s
            }
        } else {
            return
        }
        let rms = (sum / Float(frames)).squareRoot()
        // -55 dB … -15 dB → 0 … 1
        let db = 20 * log10(max(rms, 1e-6))
        let level = min(1, max(0, (db + 55) / 40))
        state.withLock { $0 = max(level, $0 * 0.85) }
    }
}
