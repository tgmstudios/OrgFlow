import AVFoundation

/// A progressive transcript: `finalized` text will not change; `volatile` is the current best guess for the tail.
nonisolated struct TranscriptUpdate: Sendable, Equatable {
    var finalized: String
    var volatile: String

    var combined: String { finalized + volatile }
}

/// Transcription is separate from capture and rendering. Capture pushes buffers in; updates stream out.
nonisolated protocol SpeechTranscriptionProviding: AnyObject, Sendable {
    /// Prepares models/assets and starts a session for audio in `format`. Throws if unavailable.
    func start(inputFormat: AVAudioFormat) async throws -> AsyncStream<TranscriptUpdate>
    /// Called from the audio processing queue (never the real-time thread).
    func append(_ buffer: AVAudioPCMBuffer)
    /// Finalizes any pending audio; the update stream finishes afterwards.
    func finish() async
    /// Abandons the session without finalizing.
    func cancel()
}
