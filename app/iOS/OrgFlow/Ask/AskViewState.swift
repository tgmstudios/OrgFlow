import Foundation

/// Explicit interaction state for the Ask screen.
enum AskViewState: Equatable {
    case idle
    case typing
    /// Capture is running. `speechDetected` flips when the signal exceeds the calibrated noise floor.
    case listening(speechDetected: Bool)
    /// Capture has stopped and the transcriber is finalizing the tail of the utterance.
    case transcribing
    /// A live spoken interview with OrgFlow's voice agent (Capture and Handoff).
    case interviewing(InterviewPhase)
    case thinking
    case responding
    case error(AskError)

    var isCapturing: Bool {
        if case .listening = self { return true }
        return false
    }

    var isInterviewing: Bool {
        if case .interviewing = self { return true }
        return false
    }
}

enum InterviewPhase: Equatable {
    case connecting
    case listening(muted: Bool)
    case agentSpeaking
}

/// How Capture and Handoff take voice: a live interview with OrgFlow (default), or on-device dictation.
enum VoiceStyle: Int, CaseIterable {
    case conversation
    case dictation

    var title: String {
        switch self {
        case .conversation: "Talk with OneFlow"
        case .dictation: "Dictate"
        }
    }

    private static let key = "orgflow.voiceStyle"
    static var saved: VoiceStyle {
        get { VoiceStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .conversation }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }
}

enum AskError: Equatable {
    case permissionDenied
    case interrupted
    case captureFailed(String)
    case agentUnavailable(String)
    case signInRequired
    case planRequired(String)

    var title: String {
        switch self {
        case .permissionDenied: "Microphone access is off"
        case .interrupted: "Listening was interrupted"
        case .captureFailed: "Couldn't start the microphone"
        case .agentUnavailable: "Couldn't reach your knowledge"
        case .signInRequired: "Sign in to OneFlow"
        case .planRequired: "Your plan doesn't include this"
        }
    }

    var message: String {
        switch self {
        case .permissionDenied: "Allow microphone access in Settings to ask by voice. You can still type."
        case .interrupted: "Another app or call took the microphone. Your words so far are kept."
        case .captureFailed(let detail): detail
        case .agentUnavailable(let detail): detail
        case .signInRequired: "Your question is saved. Sign in and it will be asked right away."
        case .planRequired(let detail): detail
        }
    }

    var recoveryTitle: String {
        switch self {
        case .permissionDenied: "Open Settings"
        case .interrupted, .captureFailed: "Try again"
        case .agentUnavailable: "Retry"
        case .signInRequired: "Sign in"
        case .planRequired: "See plans"
        }
    }
}

/// What the screen is doing with what you say: answering from knowledge, or capturing it.
enum AskMode: Int, CaseIterable, Codable {
    /// Ask: questions answered from approved knowledge.
    case ask
    /// Capture: narrate how a process works; OrgFlow drafts a playbook for approval.
    case capture
    /// Transfer: narrate your role before leaving; OrgFlow drafts a handoff and onboarding guide.
    case handoff

    var title: String {
        switch self {
        case .ask: "Ask"
        case .capture: "Capture"
        case .handoff: "Handoff"
        }
    }
}

/// One prompt and its grounded answer (or, for Capture and Handoff, the narration and its draft).
struct ConversationEntry: Identifiable, Equatable, Codable {
    enum Status: Equatable, Codable {
        case thinking
        case streaming
        case complete
        case failed(String)
    }

    let id: UUID
    let prompt: String
    var mode: AskMode = .ask
    /// The draft article this narration produced or revised (Capture and Handoff).
    var draftArticleID: String?
    /// The narration is a transcript of a live interview with OrgFlow's voice agent.
    var fromInterview: Bool?
    var answer: String = ""
    var citations: [Citation] = []
    var status: Status = .thinking
}
