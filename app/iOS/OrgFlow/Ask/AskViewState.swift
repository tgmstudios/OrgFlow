import Foundation

/// Explicit interaction state for the Ask screen.
enum AskViewState: Equatable {
    case idle
    case typing
    /// Capture is running. `speechDetected` flips when the signal exceeds the calibrated noise floor.
    case listening(speechDetected: Bool)
    /// Capture has stopped and the transcriber is finalizing the tail of the utterance.
    case transcribing
    case thinking
    case responding
    case error(AskError)

    var isCapturing: Bool {
        if case .listening = self { return true }
        return false
    }
}

enum AskError: Equatable {
    case permissionDenied
    case interrupted
    case captureFailed(String)
    case agentUnavailable(String)
    case signInRequired

    var title: String {
        switch self {
        case .permissionDenied: "Microphone access is off"
        case .interrupted: "Listening was interrupted"
        case .captureFailed: "Couldn't start the microphone"
        case .agentUnavailable: "Couldn't reach your knowledge"
        case .signInRequired: "Sign in to OrgFlow"
        }
    }

    var message: String {
        switch self {
        case .permissionDenied: "Allow microphone access in Settings to ask by voice. You can still type."
        case .interrupted: "Another app or call took the microphone. Your words so far are kept."
        case .captureFailed(let detail): detail
        case .agentUnavailable(let detail): detail
        case .signInRequired: "Your question is saved. Sign in and it will be asked right away."
        }
    }

    var recoveryTitle: String {
        switch self {
        case .permissionDenied: "Open Settings"
        case .interrupted, .captureFailed: "Try again"
        case .agentUnavailable: "Retry"
        case .signInRequired: "Sign in"
        }
    }
}

/// One prompt and its grounded answer.
struct ConversationEntry: Identifiable, Equatable {
    enum Status: Equatable {
        case thinking
        case streaming
        case complete
        case failed(String)
    }

    let id: UUID
    let prompt: String
    var answer: String = ""
    var citations: [Citation] = []
    var status: Status = .thinking
}
