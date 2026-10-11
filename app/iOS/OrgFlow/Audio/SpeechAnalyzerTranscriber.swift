import AVFoundation
import Speech

/// On-device transcription with `SpeechAnalyzer` + `SpeechTranscriber`, fed by the shared capture engine.
nonisolated final class SpeechAnalyzerTranscriber: SpeechTranscriptionProviding, @unchecked Sendable {
    enum TranscriberError: LocalizedError {
        case unsupportedLocale
        var errorDescription: String? { "Speech transcription isn't available for this language." }
    }

    private struct Session {
        var converter: AnalyzerInputConverter
        var input: AsyncStream<AnalyzerInput>.Continuation
    }

    private let locale: Locale
    private let lock = NSLock()
    private var session: Session?
    private var analyzer: SpeechAnalyzer?
    private var resultsTask: Task<Void, Never>?

    private init(locale: Locale) {
        self.locale = locale
    }

    /// Returns nil when the current locale has no on-device transcriber.
    static func makeIfSupported(locale: Locale = .current) async -> SpeechAnalyzerTranscriber? {
        guard SpeechTranscriber.isAvailable,
              let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { return nil }
        return SpeechAnalyzerTranscriber(locale: supported)
    }

    func start(inputFormat: AVAudioFormat) async throws -> AsyncStream<TranscriptUpdate> {
        cancel()
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
        // The analyzer runs in its own preferred format; the converter resamples microphone buffers into it.
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber], considering: inputFormat) else {
            throw TranscriberError.unsupportedLocale
        }
        let converter = AnalyzerInputConverter(analyzerFormat: analyzerFormat)
        let (inputSequence, inputContinuation) = AsyncStream.makeStream(of: AnalyzerInput.self)
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        try await analyzer.prepareToAnalyze(in: analyzerFormat)
        try await analyzer.start(inputSequence: inputSequence)
        self.analyzer = analyzer

        let (updates, updatesContinuation) = AsyncStream.makeStream(of: TranscriptUpdate.self)
        resultsTask = Task {
            var finalized = ""
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)
                    if result.isFinal {
                        finalized += text
                        updatesContinuation.yield(TranscriptUpdate(finalized: finalized, volatile: ""))
                    } else {
                        updatesContinuation.yield(TranscriptUpdate(finalized: finalized, volatile: text))
                    }
                }
            } catch {
                // Results end with an error on cancellation; finalized text has already been delivered.
            }
            updatesContinuation.finish()
        }

        lock.withLock { session = Session(converter: converter, input: inputContinuation) }
        return updates
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.withLock {
            guard let session else { return }
            guard let inputs = try? session.converter.convert(buffer, at: nil) else { return }
            for input in inputs { session.input.yield(input) }
        }
    }

    func finish() async {
        let active = lock.withLock { () -> Session? in
            defer { session = nil }
            return session
        }
        if let active {
            if let tail = try? active.converter.flush() {
                for input in tail { active.input.yield(input) }
            }
            active.input.finish()
        }
        try? await analyzer?.finalizeAndFinishThroughEndOfInput()
        await resultsTask?.value
        analyzer = nil
        resultsTask = nil
    }

    func cancel() {
        let active = lock.withLock { () -> Session? in
            defer { session = nil }
            return session
        }
        active?.input.finish()
        if let analyzer {
            Task { await analyzer.cancelAndFinishNow() }
        }
        analyzer = nil
        resultsTask?.cancel()
        resultsTask = nil
    }
}
