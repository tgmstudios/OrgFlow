import Foundation

/// The Living Thread's expressive modes. Reusable across the product (ask, capture, handoff…).
enum LivingThreadMode: Equatable {
    case idle
    /// Quieter, lower motion while the user types.
    case quiet
    case listening
    case thinking
    case responding
    /// Strands gather into one line, e.g. when a playbook is generated.
    case converging
}

/// Interpolated shape parameters. Every value moves on a critically damped spring and phases are
/// integrated (`phase += speed·dt`), so a mode change never makes the drawing jump.
nonisolated struct LivingThreadMotionModel {
    struct Parameters {
        var speed: Double
        var slowSpeed: Double
        var spread: Double
        var amplitude: Double
        var coherence: Double
        var structure: Double
        var glow: Double
        var audioGain: Double
    }

    private struct Spring {
        var value: Double
        var velocity: Double = 0
        mutating func step(toward target: Double, omega: Double, dt: Double) {
            // Semi-implicit critically damped spring.
            let accel = omega * omega * (target - value) - 2 * omega * velocity
            velocity += accel * dt
            value += velocity * dt
        }
        var isSettled: Bool { abs(velocity) < 0.0005 }
    }

    private var speed = Spring(value: 0.55)
    private var slowSpeed = Spring(value: 0.22)
    private var spread = Spring(value: 1)
    private var amplitude = Spring(value: 0.3)
    private var coherence = Spring(value: 0.15)
    private var structure = Spring(value: 0)
    private var glow = Spring(value: 0.6)
    private var audioGain = Spring(value: 0)
    private var condensationSpring = Spring(value: 0)

    private(set) var phase: Double = 0
    private(set) var slowPhase: Double = 0

    var mode: LivingThreadMode = .idle
    var condensation: Double = 0

    var current: Parameters {
        Parameters(speed: speed.value, slowSpeed: slowSpeed.value, spread: spread.value, amplitude: amplitude.value,
                   coherence: coherence.value, structure: structure.value, glow: glow.value, audioGain: audioGain.value)
    }

    var condensationValue: Double { condensationSpring.value }

    var isSettled: Bool {
        [speed, spread, amplitude, coherence, structure, glow, audioGain, condensationSpring].allSatisfy(\.isSettled)
    }

    static func target(for mode: LivingThreadMode) -> Parameters {
        switch mode {
        case .idle:
            Parameters(speed: 0.55, slowSpeed: 0.22, spread: 1.0, amplitude: 0.30, coherence: 0.15, structure: 0, glow: 0.6, audioGain: 0)
        case .quiet:
            Parameters(speed: 0.32, slowSpeed: 0.14, spread: 0.75, amplitude: 0.22, coherence: 0.3, structure: 0, glow: 0.4, audioGain: 0)
        case .listening:
            Parameters(speed: 0.85, slowSpeed: 0.3, spread: 1.1, amplitude: 0.30, coherence: 0.1, structure: 0, glow: 0.85, audioGain: 1)
        case .thinking:
            Parameters(speed: 0.6, slowSpeed: 0.5, spread: 0.7, amplitude: 0.26, coherence: 0.45, structure: 1, glow: 0.7, audioGain: 0)
        case .responding:
            Parameters(speed: 0.3, slowSpeed: 0.12, spread: 0.3, amplitude: 0.24, coherence: 0.85, structure: 0, glow: 0.55, audioGain: 0)
        case .converging:
            Parameters(speed: 0.25, slowSpeed: 0.1, spread: 0.04, amplitude: 0.2, coherence: 1, structure: 0, glow: 0.7, audioGain: 0)
        }
    }

    mutating func step(dt: Double) {
        let t = Self.target(for: mode)
        let omega = 3.2
        speed.step(toward: t.speed, omega: omega, dt: dt)
        slowSpeed.step(toward: t.slowSpeed, omega: omega, dt: dt)
        spread.step(toward: t.spread, omega: omega, dt: dt)
        amplitude.step(toward: t.amplitude, omega: omega, dt: dt)
        coherence.step(toward: t.coherence, omega: omega, dt: dt)
        structure.step(toward: t.structure, omega: omega, dt: dt)
        glow.step(toward: t.glow, omega: omega, dt: dt)
        audioGain.step(toward: t.audioGain, omega: 6, dt: dt)
        condensationSpring.step(toward: condensation, omega: 5, dt: dt)
        phase = (phase + speed.value * dt).truncatingRemainder(dividingBy: 2 * .pi * 1000)
        slowPhase = (slowPhase + slowSpeed.value * dt).truncatingRemainder(dividingBy: 2 * .pi * 1000)
    }
}
