import Accelerate

/// Turns raw microphone samples into a smoothed, noise-gated `AudioFeatureSnapshot`.
/// Not thread-safe: owned by the capture controller's processing queue. All buffers are preallocated.
nonisolated final class AudioFeatureExtractor {
    let sampleRate: Double

    private let fftSize = 1024
    private let log2n: vDSP_Length = 10
    private let fftSetup: FFTSetup
    private var hann: [Float]
    private var history: [Float]
    private var windowed: [Float]
    private var real: [Float]
    private var imag: [Float]
    private var power: [Float]
    private var levelsDB: [Float]
    private var previousLevelsDB: [Float]

    private let bandRanges: [Range<Int>]
    private let lowRange: Range<Int>
    private let midRange: Range<Int>
    private let highRange: Range<Int>

    // Adaptive calibration
    private var noiseFloorDB: Float = -60
    private var bandFloorDB: [Float]
    private var speechHold: Double = 0

    // Smoothed output
    private var state = AudioFeatureSnapshot()

    private let attack: Double = 0.055
    private let release: Double = 0.24

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
        hann = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&hann, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))
        history = [Float](repeating: 0, count: fftSize)
        windowed = [Float](repeating: 0, count: fftSize)
        real = [Float](repeating: 0, count: fftSize / 2)
        imag = [Float](repeating: 0, count: fftSize / 2)
        power = [Float](repeating: 0, count: fftSize / 2)
        levelsDB = [Float](repeating: -100, count: fftSize / 2)
        previousLevelsDB = [Float](repeating: -100, count: fftSize / 2)

        let binHz = sampleRate / Double(fftSize)
        let maxBin = fftSize / 2
        func bin(_ hz: Double) -> Int { min(maxBin, max(1, Int((hz / binHz).rounded()))) }
        func range(_ lo: Double, _ hi: Double) -> Range<Int> {
            let a = bin(lo), b = max(bin(hi), a + 1)
            return a..<min(b, maxBin)
        }
        lowRange = range(70, 300)
        midRange = range(300, 2000)
        highRange = range(2000, min(8000, sampleRate / 2 - binHz))

        let lo = 80.0, hi = min(8000, sampleRate / 2 - binHz)
        var ranges: [Range<Int>] = []
        for i in 0..<AudioFeatureSnapshot.bandCount {
            let f0 = lo * pow(hi / lo, Double(i) / Double(AudioFeatureSnapshot.bandCount))
            let f1 = lo * pow(hi / lo, Double(i + 1) / Double(AudioFeatureSnapshot.bandCount))
            ranges.append(range(f0, f1))
        }
        bandRanges = ranges
        bandFloorDB = [Float](repeating: -80, count: AudioFeatureSnapshot.bandCount)
        state.bands.reserveCapacity(AudioFeatureSnapshot.bandCount)
    }

    deinit {
        vDSP_destroy_fftsetup(fftSetup)
    }

    func reset() {
        vDSP.fill(&history, with: 0)
        vDSP.fill(&previousLevelsDB, with: -100)
        state = AudioFeatureSnapshot()
        speechHold = 0
    }

    /// Feed newly captured samples. `dt` is the wall time since the previous call.
    func process(_ samples: UnsafeBufferPointer<Float>, dt: Double) -> AudioFeatureSnapshot {
        guard let base = samples.baseAddress, samples.count > 0 else { return decay(dt: dt) }
        let count = samples.count

        // Slide the analysis window.
        if count >= fftSize {
            history.withUnsafeMutableBufferPointer { h in
                h.baseAddress!.update(from: base + (count - fftSize), count: fftSize)
            }
        } else {
            history.withUnsafeMutableBufferPointer { h in
                let p = h.baseAddress!
                memmove(p, p + count, (fftSize - count) * MemoryLayout<Float>.stride)
                (p + fftSize - count).update(from: base, count: count)
            }
        }

        // Time-domain level over the fresh samples.
        var rms: Float = 0
        var peak: Float = 0
        vDSP_rmsqv(base, 1, &rms, vDSP_Length(count))
        vDSP_maxmgv(base, 1, &peak, vDSP_Length(count))
        let rmsDB = 20 * log10(max(rms, 1e-7))

        // Noise floor: drops quickly, rises slowly (~8 s), so steady room tone is learned but speech is not.
        if rmsDB < noiseFloorDB {
            noiseFloorDB += (rmsDB - noiseFloorDB) * 0.25
        } else {
            noiseFloorDB += (rmsDB - noiseFloorDB) * Float(min(1, dt / 8))
        }
        noiseFloorDB = min(max(noiseFloorDB, -85), -38)
        let gateLevel = clamp((rmsDB - (noiseFloorDB + 7)) / 32)

        spectrum()

        // Band energies in dB relative to their own learned floors.
        var bandValues = [Float](repeating: 0, count: AudioFeatureSnapshot.bandCount)
        for (i, r) in bandRanges.enumerated() {
            let db = meanDB(r)
            if db < bandFloorDB[i] {
                bandFloorDB[i] += (db - bandFloorDB[i]) * 0.25
            } else {
                bandFloorDB[i] += (db - bandFloorDB[i]) * Float(min(1, dt / 8))
            }
            bandValues[i] = clamp((db - bandFloorDB[i] - 6) / 34)
        }
        let gate = smoothstep(gateLevel, edge0: 0, edge1: 0.25)
        let low = clamp((meanDB(lowRange) + 62) / 46) * gate
        let mid = clamp((meanDB(midRange) + 66) / 46) * gate
        let high = clamp((meanDB(highRange) + 74) / 46) * gate

        // Spectral flux on dB levels -> onset.
        var flux: Float = 0
        let fluxRange = lowRange.lowerBound..<highRange.upperBound
        for k in fluxRange {
            flux += max(0, levelsDB[k] - previousLevelsDB[k])
        }
        flux /= Float(max(1, fluxRange.count))
        swap(&levelsDB, &previousLevelsDB)
        let onset = clamp((flux - 1.5) / 6) * gate

        // Spectral centroid (power-weighted), normalized against 4 kHz.
        var weighted: Float = 0
        var total: Float = 0
        for k in fluxRange {
            weighted += Float(k) * power[k]
            total += power[k]
        }
        let binHz = Float(sampleRate) / Float(fftSize)
        let centroid = total > 0 ? clamp((weighted / total) * binHz / 4000) : 0

        // Speech detection with hysteresis and a short hold so pauses settle gracefully.
        if gateLevel > 0.14 { speechHold = 0.35 } else { speechHold = max(0, speechHold - dt) }
        let isSpeech = speechHold > 0

        smooth(&state.rms, toward: clamp(rms * 4) * gate, dt: dt)
        smooth(&state.peak, toward: clamp(peak) * gate, dt: dt)
        smooth(&state.loudness, toward: gateLevel, dt: dt)
        smooth(&state.low, toward: low, dt: dt)
        smooth(&state.mid, toward: mid, dt: dt)
        smooth(&state.high, toward: high, dt: dt)
        smooth(&state.centroid, toward: centroid, dt: dt)
        smooth(&state.onset, toward: onset, dt: dt, attack: 0.02, release: 0.15)
        for i in 0..<AudioFeatureSnapshot.bandCount {
            smooth(&state.bands[i], toward: bandValues[i] * gate, dt: dt)
        }
        state.isSpeech = isSpeech
        return state
    }

    /// Advance smoothing with no new audio (keeps release continuous when the tap stalls).
    func decay(dt: Double) -> AudioFeatureSnapshot {
        smooth(&state.rms, toward: 0, dt: dt)
        smooth(&state.peak, toward: 0, dt: dt)
        smooth(&state.loudness, toward: 0, dt: dt)
        smooth(&state.low, toward: 0, dt: dt)
        smooth(&state.mid, toward: 0, dt: dt)
        smooth(&state.high, toward: 0, dt: dt)
        smooth(&state.onset, toward: 0, dt: dt, attack: 0.02, release: 0.15)
        for i in 0..<AudioFeatureSnapshot.bandCount {
            smooth(&state.bands[i], toward: 0, dt: dt)
        }
        speechHold = max(0, speechHold - dt)
        state.isSpeech = speechHold > 0
        return state
    }

    // MARK: - DSP

    private func spectrum() {
        vDSP.multiply(history, hann, result: &windowed)
        let half = fftSize / 2
        real.withUnsafeMutableBufferPointer { re in
            imag.withUnsafeMutableBufferPointer { im in
                var split = DSPSplitComplex(realp: re.baseAddress!, imagp: im.baseAddress!)
                windowed.withUnsafeBufferPointer { w in
                    w.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) { c in
                        vDSP_ctoz(c, 2, &split, 1, vDSP_Length(half))
                    }
                }
                vDSP_fft_zrip(fftSetup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                im[0] = 0 // DC/Nyquist packing; Nyquist is unused.
                power.withUnsafeMutableBufferPointer { p in
                    vDSP_zvmags(&split, 1, p.baseAddress!, 1, vDSP_Length(half))
                }
            }
        }
        // Scale so a full-scale sine reads ~0 dB: amplitude = |X| * 2 / N (zrip ×2, Hann gain ×0.5 cancel).
        var scale = Float(2.0 / Double(fftSize))
        scale *= scale
        vDSP.multiply(scale, power, result: &power)
        for k in 0..<half {
            levelsDB[k] = 10 * log10(max(power[k], 1e-12))
        }
    }

    private func meanDB(_ range: Range<Int>) -> Float {
        guard !range.isEmpty else { return -100 }
        var sum: Float = 0
        for k in range { sum += power[k] }
        return 10 * log10(max(sum / Float(range.count), 1e-12))
    }

    private func smooth(_ value: inout Float, toward target: Float, dt: Double, attack: Double? = nil, release: Double? = nil) {
        let tau = target > value ? (attack ?? self.attack) : (release ?? self.release)
        let a = Float(1 - exp(-dt / tau))
        value += (target - value) * a
    }

    private func clamp(_ x: Float) -> Float { min(max(x, 0), 1) }

    private func smoothstep(_ x: Float, edge0: Float, edge1: Float) -> Float {
        let t = clamp((x - edge0) / (edge1 - edge0))
        return t * t * (3 - 2 * t)
    }
}
