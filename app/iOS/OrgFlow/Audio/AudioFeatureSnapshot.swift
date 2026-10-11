import Foundation

/// Compact, render-ready description of the microphone signal. All values are normalized to 0…1.
nonisolated struct AudioFeatureSnapshot: Sendable, Equatable {
    static let bandCount = 12

    var rms: Float = 0
    var peak: Float = 0
    /// Attack/release smoothed, noise-gated loudness. This is the main "energy" input.
    var loudness: Float = 0
    var low: Float = 0
    var mid: Float = 0
    var high: Float = 0
    /// Normalized spectral centroid (0 = dark, 1 = bright).
    var centroid: Float = 0
    /// Positive spectral flux; spikes on syllable onsets.
    var onset: Float = 0
    var bands: [Float] = Array(repeating: 0, count: AudioFeatureSnapshot.bandCount)
    var isSpeech: Bool = false

    static let silent = AudioFeatureSnapshot()
}
