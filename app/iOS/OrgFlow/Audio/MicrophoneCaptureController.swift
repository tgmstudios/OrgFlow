import AVFoundation
import Synchronization

/// Owns the single `AVAudioEngine` used for voice. A realtime-safe sink node (C, see RealtimeSampleRing.m)
/// copies input samples into a lock-free ring on the I/O thread; a serial processing queue drains it ~60×/s
/// to extract visual features and feed transcription.
nonisolated final class MicrophoneCaptureController: @unchecked Sendable {
    enum Event: Sendable {
        case speechDetected(Bool)
        case interrupted
        case failed(String)
    }

    enum CaptureError: LocalizedError {
        case permissionDenied
        case noInput

        var errorDescription: String? {
            switch self {
            case .permissionDenied: "Microphone permission was denied."
            case .noInput: "No microphone input is available."
            }
        }
    }

    /// Delivered on the main queue.
    var onEvent: (@MainActor @Sendable (Event) -> Void)?

    private let engine = AVAudioEngine()
    private let queue = DispatchQueue(label: "continuity.audio.processing", qos: .userInteractive)
    private let ring = RealtimeSampleRing(capacity: 48_000 * 2)
    private var sinkNode: AVAudioSinkNode?
    private let latest = Mutex(AudioFeatureSnapshot.silent)
    /// All session (de)activation runs here: off the main thread, and strictly ordered so a stop's
    /// deactivation can never land after the next start's activation.
    private static let sessionQueue = DispatchQueue(label: "continuity.audio.session", qos: .userInitiated)

    // Accessed only on `queue`.
    private var timer: DispatchSourceTimer?
    private var extractor: AudioFeatureExtractor?
    private var scratch = [Float](repeating: 0, count: 48_000 * 2)
    private var lastTick: UInt64 = 0
    private var lastSpeech = false
    private var sink: (any SpeechTranscriptionProviding)?
    private var sinkFormat: AVAudioFormat?

    // Accessed only on the main thread.
    private(set) var isRunning = false
    private var observers: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        // The system deactivated our session (call, Siri, another app's recording): treat as an interruption.
        observers.append(center.addObserver(forName: AVAudioSession.didBecomeInactiveNotification, object: session, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.handleInterruption() }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.handleConfigurationChange() }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
            switch reason {
            case .newDeviceAvailable, .oldDeviceUnavailable, .override, .routeConfigurationChange:
                MainActor.assumeIsolated { self?.handleConfigurationChange() }
            default: break
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.handleInterruption() }
        })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    /// Latest smoothed features; safe to call from the render loop on any thread.
    func currentFeatures() -> AudioFeatureSnapshot {
        latest.withLock { $0 }
    }

    static var permissionGranted: Bool {
        AVAudioApplication.shared.recordPermission == .granted
    }

    static var permissionDenied: Bool {
        AVAudioApplication.shared.recordPermission == .denied
    }

    static func requestPermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return true
        case .denied: return false
        default: return await AVAudioApplication.requestRecordPermission()
        }
    }

    /// The mono float format that transcription buffers will arrive in.
    @MainActor
    func prepareSessionAndFormat() async throws -> AVAudioFormat {
        try await Self.onSessionQueue { session in
            try session.setCategory(.record, mode: .default, options: [.allowBluetoothHFP])
            try? session.setPreferredIOBufferDuration(0.01)
            try session.setActive(true)
        }
        let inputFormat = engine.inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else { throw CaptureError.noInput }
        return AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: inputFormat.sampleRate, channels: 1, interleaved: false)!
    }

    /// Starts capture. Call `prepareSessionAndFormat()` first. `transcriber` may be nil (visualization only).
    @MainActor
    func start(transcriber: (any SpeechTranscriptionProviding)?) throws {
        guard !isRunning else { return }
        try installSinkAndStart()
        queue.sync {
            self.sink = transcriber
        }
        isRunning = true
    }

    /// Attaches (or detaches) the transcription consumer while capture is running.
    func attachTranscriber(_ transcriber: (any SpeechTranscriptionProviding)?) {
        queue.sync {
            self.sink = transcriber
        }
    }

    /// Idempotent: removes the tap, stops the engine, deactivates the session and returns features to silence.
    @MainActor
    func stop() {
        guard isRunning else { return }
        isRunning = false
        engine.stop()
        detachSink()
        queue.sync {
            self.timer?.cancel()
            self.timer = nil
            self.sink = nil
            self.sinkFormat = nil
            self.lastSpeech = false
            self.ring.drain()
            self.extractor?.reset()
        }
        latest.withLock { $0 = .silent }
        Self.sessionQueue.async {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    private static func onSessionQueue(_ work: @escaping @Sendable (AVAudioSession) throws -> Void) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            sessionQueue.async {
                do {
                    try work(AVAudioSession.sharedInstance())
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    // MARK: - Engine

    @MainActor
    private func installSinkAndStart() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw CaptureError.noInput }

        detachSink()
        let sink = ring.makeSinkNode()
        engine.attach(sink)
        sinkNode = sink
        do {
            try engine.connectNode(input, to: sink, format: format)
        } catch {
            detachSink()
            throw error
        }

        let sampleRate = format.sampleRate
        queue.sync {
            if self.extractor?.sampleRate != sampleRate {
                self.extractor = AudioFeatureExtractor(sampleRate: sampleRate)
            }
            self.sinkFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)
            self.ring.drain()
            self.startTimer()
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            detachSink()
            queue.sync { self.timer?.cancel(); self.timer = nil }
            throw error
        }
    }

    @MainActor
    private func detachSink() {
        guard let sinkNode else { return }
        engine.disconnectNodeInput(sinkNode)
        engine.detach(sinkNode)
        self.sinkNode = nil
    }

    /// Runs on `queue`.
    private func startTimer() {
        timer?.cancel()
        let t = DispatchSource.makeTimerSource(flags: .strict, queue: queue)
        t.schedule(deadline: .now(), repeating: .milliseconds(16), leeway: .milliseconds(2))
        lastTick = DispatchTime.now().uptimeNanoseconds
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    /// Runs on `queue`.
    private func tick() {
        let now = DispatchTime.now().uptimeNanoseconds
        let dt = min(0.1, Double(now - lastTick) / 1e9)
        lastTick = now
        guard let extractor else { return }

        let n = scratch.withUnsafeMutableBufferPointer { ring.read(into: $0.baseAddress!, maxCount: $0.count) }
        let snapshot = scratch.withUnsafeBufferPointer { buf in
            extractor.process(UnsafeBufferPointer(rebasing: buf[0..<n]), dt: dt)
        }
        latest.withLock { $0 = snapshot }

        if n > 0, let sink, let sinkFormat, let pcm = AVAudioPCMBuffer(pcmFormat: sinkFormat, frameCapacity: AVAudioFrameCount(n)) {
            pcm.frameLength = AVAudioFrameCount(n)
            scratch.withUnsafeBufferPointer { buf in
                pcm.floatChannelData![0].update(from: buf.baseAddress!, count: n)
            }
            sink.append(pcm)
        }

        if snapshot.isSpeech != lastSpeech {
            lastSpeech = snapshot.isSpeech
            let speech = lastSpeech
            DispatchQueue.main.async { [weak self] in
                self?.onEvent?(.speechDetected(speech))
            }
        }
    }

    // MARK: - System events

    @MainActor
    private func handleInterruption() {
        guard isRunning else { return }
        stop()
        onEvent?(.interrupted)
    }

    /// Route or hardware format changed (e.g. AirPods connected): rebuild the sink at the new format.
    @MainActor
    private func handleConfigurationChange() {
        guard isRunning else { return }
        engine.stop()
        do {
            try installSinkAndStart()
        } catch {
            stop()
            onEvent?(.failed(error.localizedDescription))
        }
    }
}
