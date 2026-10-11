import MetalKit
import QuartzCore
import simd

/// Mirrors `KnotUniforms` in LivingThreadShaders.metal.
nonisolated struct KnotUniforms {
    var viewProjection = matrix_identity_float4x4
    var model = matrix_identity_float4x4
    var cameraPosition = SIMD4<Float>.zero
    var viewport = SIMD2<Float>.zero
    var phase: Float = 0
    var knotDepth: Float = 0
    var tubeRadius: Float = 0
    var innerGlow: Float = 0
    var squash: Float = 0
    var segments: Float = 0
    var sides: Float = 0
    var packetCount: Float = 0
    var refraction: Float = 0
    var hasBackdrop: Float = 0
    var shape0: Float = 0
    var shape1: Float = 0
    var shape2: Float = 0
    var shape3: Float = 0
    var shapeFrac: Float = 0
    var fill: Float = 0
    var floorY: Float = 0
    var homeBlend: Float = 0
    var voiceCount: Float = 0
    var voiceOffset: Float = 0
    var voiceLevel: Float = 0
}

/// Renders the Continuity Knot in clear glass. The object itself flows calmly; the voice travels
/// through it as light, like a fiber: louder speech is brighter, higher speech is warmer.
final class LivingThreadRenderer: NSObject, MTKViewDelegate {
    static let sampleCount = 4
    static let depthFormat: MTLPixelFormat = .depth32Float
    private static let maxPackets = 24
    /// Voice history carried by the thread, newest first. It enters at t = 0 and travels both ways
    /// around the loop, so the whole thread shows the last few seconds of speech.
    private static let voiceSamples = 120
    private static let voiceRate = 40.0

    /// One packet of light inside the thread.
    private struct Packet {
        var t: Double           // position along the loop, 0…1
        var velocity: Double    // loops per second (signed)
        var intensity: Double
        var hue: Double         // 0 teal → 0.5 iris → 1 apricot
        var width: Double       // half-length along the loop
        var lifetime: Double    // travel time remaining before it stops and fades (0 = free-running)
        var fade: Double        // fade time constant, seconds
    }

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let knotPipeline: MTLRenderPipelineState
    private let shadowPipeline: MTLRenderPipelineState
    private let haloPipeline: MTLRenderPipelineState
    private let depthState: MTLDepthStencilState
    private let shadowDepthState: MTLDepthStencilState
    private let indexBuffer: MTLBuffer
    private let indexCount: Int
    private let placeholderBackdrop: MTLTexture
    private var backdrop: MTLTexture?
    private let segments = 640
    private let sides = 40

    var motion = LivingThreadMotionModel()
    var audioSource: (() -> AudioFeatureSnapshot)?
    /// Called when the knot changes between visibly moving and settled, to adapt the frame rate.
    var onActivityChange: ((Bool) -> Void)?

    // Touch physics (radians). Drag offsets spring back to rest after release, carrying velocity.
    private var yawOffset: Double = 0
    private var pitchOffset: Double = 0
    private var yawVelocity: Double = 0
    private var pitchVelocity: Double = 0
    private var isDragging = false
    private var squash: Double = 0
    private var squashVelocity: Double = 0
    private var squashTarget: Double = 0

    // Light
    private var packets: [Packet] = []
    private var innerGlow: Double = 0
    private var voice = [SIMD2<Float>](repeating: .zero, count: LivingThreadRenderer.voiceSamples)
    private var voiceClock: Double = 0
    private var voiceHue: Double = 0.3
    private var voiceLevel: Double = 0
    private var sinceIdleSpark: Double = 0
    private var sinceGathering: Double = 10
    private var lastTimestamp: CFTimeInterval?
    private var wasActive = true

    // Form: the knot unravels when someone starts talking and finds new shapes as they keep going.
    /// Hero pose per form (radians): pitch leans it back, yaw turns it, roll orients its lobes.
    private static let poses: [(pitch: Double, yaw: Double, roll: Double)] = [
        (-0.38, 0, .pi / 2),        // trefoil: a lobe straight up
        (-0.62, 0, .pi / 2),        // loosened: seen from higher so the lifted lobes read
        (-0.22, 0.38, 0),           // infinity: horizontal, turned to show the crossing's depth
        (-0.34, 0, .pi / 2),        // cinquefoil: a lobe straight up
        (-0.95, 0, 0),              // coil: three-quarter view from above
    ]
    private static let restShape = 0
    private static let unravelledShape = 1
    private static let speakingShapes = [2, 3, 4]
    /// Position along the sequence of forms (a spline through them, so the thread never stops moving).
    private var formPosition: Double = 0
    /// Forms per second; eases in and out so the flow never jumps in speed.
    private var formRate: Double = 0
    /// 0 follows the flow, 1 is back at the trefoil. Stopping blends straight home in one motion.
    private var homeBlend: Double = 0
    /// True from the first word until the thread has settled back into the trefoil.
    private var flowing = false
    /// Builds with sustained speech; drives the glass's saturation and opacity.
    private var fill: Double = 0
    private var floorY: Double = 0

    init?(device: MTLDevice, colorFormat: MTLPixelFormat) {
        guard let queue = device.makeCommandQueue(),
              let library = device.makeDefaultLibrary() else { return nil }

        func pipeline(vertex: String, fragment: String, blended: Bool) -> MTLRenderPipelineState? {
            let descriptor = MTLRenderPipelineDescriptor()
            descriptor.vertexFunction = library.makeFunction(name: vertex)
            descriptor.fragmentFunction = library.makeFunction(name: fragment)
            descriptor.rasterSampleCount = Self.sampleCount
            descriptor.depthAttachmentPixelFormat = Self.depthFormat
            let attachment = descriptor.colorAttachments[0]!
            attachment.pixelFormat = colorFormat
            if blended {
                attachment.isBlendingEnabled = true
                attachment.sourceRGBBlendFactor = .one
                attachment.sourceAlphaBlendFactor = .one
                attachment.destinationRGBBlendFactor = .oneMinusSourceAlpha
                attachment.destinationAlphaBlendFactor = .oneMinusSourceAlpha
            }
            return try? device.makeRenderPipelineState(descriptor: descriptor)
        }

        guard let knot = pipeline(vertex: "knotVertex", fragment: "knotFragment", blended: false),
              let shadow = pipeline(vertex: "shadowVertex", fragment: "shadowFragment", blended: true),
              let halo = pipeline(vertex: "haloVertex", fragment: "haloFragment", blended: true) else { return nil }

        let depth = MTLDepthStencilDescriptor()
        depth.depthCompareFunction = .less
        depth.isDepthWriteEnabled = true
        let shadowDepth = MTLDepthStencilDescriptor()
        shadowDepth.depthCompareFunction = .always
        shadowDepth.isDepthWriteEnabled = false
        guard let depthState = device.makeDepthStencilState(descriptor: depth),
              let shadowDepthState = device.makeDepthStencilState(descriptor: shadowDepth) else { return nil }

        // Indexed grid along the loop: vertex = segment * sides + side, with segments + 1 rows so the
        // closing row (t = 1) duplicates t = 0 and per-vertex t never sweeps backwards across a quad.
        var indices: [UInt32] = []
        indices.reserveCapacity(segments * sides * 6)
        for s in 0..<segments {
            let s1 = s + 1
            for j in 0..<sides {
                let j1 = (j + 1) % sides
                let a = UInt32(s * sides + j), b = UInt32(s * sides + j1)
                let c = UInt32(s1 * sides + j), d = UInt32(s1 * sides + j1)
                indices += [a, c, b, b, c, d]
            }
        }
        guard let buffer = device.makeBuffer(bytes: indices, length: indices.count * MemoryLayout<UInt32>.stride) else { return nil }

        let placeholder = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: 1, height: 1, mipmapped: false)
        guard let placeholderTexture = device.makeTexture(descriptor: placeholder) else { return nil }

        self.device = device
        commandQueue = queue
        knotPipeline = knot
        shadowPipeline = shadow
        haloPipeline = halo
        self.depthState = depthState
        self.shadowDepthState = shadowDepthState
        indexBuffer = buffer
        indexCount = indices.count
        placeholderBackdrop = placeholderTexture
        super.init()
    }

    // MARK: - Backdrop

    /// The page content behind the knot (same frame as the view), used for refraction.
    func setBackdrop(_ image: CGImage?) {
        guard let image else {
            backdrop = nil
            return
        }
        let loader = MTKTextureLoader(device: device)
        backdrop = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .textureUsage: MTLTextureUsage.shaderRead.rawValue])
    }

    // MARK: - Interaction

    /// A soft release of light, e.g. after sending a prompt: three packets leave the entry point.
    func pulse() {
        for i in 0..<3 {
            spawn(Packet(t: 1 - Double(i) * 0.03, velocity: 0.22, intensity: 0.9, hue: 0.35 + Double(i) * 0.15, width: 0.03, lifetime: 0, fade: 2.6))
        }
    }

    /// A tap releases a packet of light somewhere along the thread.
    func releaseLight() {
        spawn(Packet(t: .random(in: 0..<1), velocity: 0.2, intensity: 1.0, hue: .random(in: 0...1), width: 0.035, lifetime: 0, fade: 2.8))
    }

    func setPressed(_ pressed: Bool) {
        squashTarget = pressed ? 1 : 0
    }

    func beginDrag() {
        isDragging = true
        yawVelocity = 0
        pitchVelocity = 0
    }

    /// Translation deltas in points; `scale` converts points to radians.
    func drag(dx: Double, dy: Double, scale: Double) {
        yawOffset += dx * scale
        pitchOffset = max(-1.2, min(1.2, pitchOffset + dy * scale))
    }

    func endDrag(velocityX: Double, velocityY: Double, scale: Double) {
        isDragging = false
        yawVelocity = velocityX * scale
        pitchVelocity = velocityY * scale
    }

    // MARK: - Frame

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        let now = CACurrentMediaTime()
        let dt = min(1.0 / 20, now - (lastTimestamp ?? now - 1.0 / 60))
        lastTimestamp = now
        motion.step(dt: dt)
        stepPhysics(dt: dt)

        let audio = audioSource?() ?? .silent
        stepLight(dt: dt, audio: audio)
        stepForm(dt: dt, audio: audio)

        var u = KnotUniforms()
        u.phase = Float(motion.phase * 2)
        u.knotDepth = 0.44
        u.tubeRadius = 0.21
        u.innerGlow = Float(innerGlow)
        u.squash = Float(squash)
        u.segments = Float(segments)
        u.sides = Float(sides)
        u.viewport = SIMD2(Float(view.drawableSize.width), Float(view.drawableSize.height))
        u.refraction = 26 * Float(view.contentScaleFactor)
        u.hasBackdrop = backdrop == nil ? 0 : 1
        let base = Int(formPosition.rounded(.down))
        let frac = formPosition - Double(base)
        let controls = (shape(at: base - 1), shape(at: base), shape(at: base + 1), shape(at: base + 2))
        let home = Self.smootherstep(homeBlend)
        u.shape0 = Float(controls.0)
        u.shape1 = Float(controls.1)
        u.shape2 = Float(controls.2)
        u.shape3 = Float(controls.3)
        u.shapeFrac = Float(frac)
        u.fill = Float(fill)
        u.homeBlend = Float(home)
        u.voiceCount = Float(voice.count)
        u.voiceOffset = Float(voiceClock * Self.voiceRate)
        u.voiceLevel = Float(voiceLevel)

        var packetData = packets.prefix(Self.maxPackets).map {
            SIMD4<Float>(Float($0.t), Float($0.intensity), Float($0.hue), Float($0.width))
        }
        u.packetCount = Float(packetData.count)
        if packetData.isEmpty { packetData = [.zero] }

        // Camera: fit the knot (plus its shadow) to the view height, or width if narrower.
        let size = view.drawableSize
        let aspect = Float(max(size.width, 1) / max(size.height, 1))
        let fovY: Float = 24 * .pi / 180
        let extent: Float = 2.0
        let distance = max(extent / tan(fovY / 2), (extent + 0.3) / (tan(fovY / 2) * aspect))
        let eye = SIMD3<Float>(0, -0.18, distance)
        u.viewProjection = Self.perspective(fovY: fovY, aspect: aspect, near: 0.1, far: distance + 10) * Self.translation(-eye)
        u.cameraPosition = SIMD4(eye, 1)

        // Each form glides into its own hero pose as it morphs, then sways gently around it.
        let p = [controls.0, controls.1, controls.2, controls.3].map { Self.poses[$0] }
        let flowPitch = Self.catmullRom(p[0].pitch, p[1].pitch, p[2].pitch, p[3].pitch, frac)
        let flowYaw = Self.catmullRom(p[0].yaw, p[1].yaw, p[2].yaw, p[3].yaw, frac)
        let flowRoll = Self.catmullRom(p[0].roll, p[1].roll, p[2].roll, p[3].roll, frac)
        let rest = Self.poses[Self.restShape]
        let pitch = flowPitch + (rest.pitch - flowPitch) * home
        let yaw = flowYaw + (rest.yaw - flowYaw) * home
        let roll = flowRoll + (rest.roll - flowRoll) * home
        let sway = 0.18 * sin(motion.slowPhase * 0.8)
        let bob = 0.05 * sin(motion.slowPhase * 0.55 + 1.3)
        u.model = Self.rotationX(Float(pitch + bob + pitchOffset)) * Self.rotationY(Float(yaw + sway + yawOffset)) * Self.rotationZ(Float(roll))

        // The floor sits just beneath the form's current lowest point, so the light pool meets it.
        let lowest = Self.lowestPoint(model: u.model, controls: controls, frac: Float(frac), home: Float(home), tube: u.tubeRadius)
        floorY = floorY == 0 ? Double(lowest) - 0.08 : floorY + (Double(lowest) - 0.08 - floorY) * (1 - exp(-dt / 0.25))
        u.floorY = Float(floorY)

        let active = !motion.isSettled || !packets.isEmpty || flowing || voiceLevel > 0.005 || fill > 0.01 || isDragging || abs(yawVelocity) > 0.001
            || abs(yawOffset) > 0.001 || squash > 0.001 || innerGlow > 0.05
            || (motion.mode != .idle && motion.mode != .quiet)
        if active != wasActive {
            wasActive = active
            onActivityChange?(active)
        }

        guard let pass = view.currentRenderPassDescriptor,
              let drawable = view.currentDrawable,
              let buffer = commandQueue.makeCommandBuffer(),
              let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }

        let packetLength = packetData.count * MemoryLayout<SIMD4<Float>>.stride
        encoder.setRenderPipelineState(shadowPipeline)
        encoder.setDepthStencilState(shadowDepthState)
        encoder.setVertexBytes(&u, length: MemoryLayout<KnotUniforms>.stride, index: 1)
        encoder.setFragmentBytes(&u, length: MemoryLayout<KnotUniforms>.stride, index: 0)
        encoder.setFragmentBytes(&packetData, length: packetLength, index: 2)
        let voiceLength = voice.count * MemoryLayout<SIMD2<Float>>.stride
        encoder.setVertexBytes(&voice, length: voiceLength, index: 3)
        encoder.setFragmentBytes(&voice, length: voiceLength, index: 3)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)

        // Glow shell behind the glass (no depth): light spilling out onto the page.
        if !packets.isEmpty || innerGlow > 0.01 || voiceLevel > 0.005 {
            encoder.setRenderPipelineState(haloPipeline)
            encoder.setCullMode(.back)
            encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indexBuffer, indexBufferOffset: 0)
        }

        encoder.setRenderPipelineState(knotPipeline)
        encoder.setDepthStencilState(depthState)
        encoder.setCullMode(.none)
        encoder.setFragmentTexture(backdrop ?? placeholderBackdrop, index: 0)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indexBuffer, indexBufferOffset: 0)
        encoder.endEncoding()
        buffer.present(drawable)
        buffer.commit()
    }

    // MARK: - Light

    private func spawn(_ packet: Packet) {
        packets.append(packet)
        if packets.count > Self.maxPackets {
            packets.removeFirst(packets.count - Self.maxPackets)
        }
    }

    /// Voice enters at one point on the thread and travels through it; thinking gathers light
    /// toward a meeting point; answering fills the glass with a steady glow.
    private func stepLight(dt: Double, audio: AudioFeatureSnapshot) {
        let mode = motion.mode
        let listening = mode == .listening
        let loudness = listening ? Double(audio.loudness) : 0
        // The voice enters the thread as light: each frame of speech becomes a band whose brightness is
        // how loud it was and whose color is how high it was, carried along the fiber at a steady speed.
        // Low voices read teal, brighter voices move through iris toward apricot.
        let target = min(1, max(0, Double(audio.centroid) * 1.7 - 0.05))
        voiceHue += (target - voiceHue) * (1 - exp(-dt / 0.12))
        let energy = listening ? min(1.25, loudness * 1.1 + Double(audio.onset) * 0.45) : 0
        voiceClock += dt
        let interval = 1 / Self.voiceRate
        while voiceClock >= interval {
            voiceClock -= interval
            voice.removeLast()
            voice.insert(SIMD2(Float(energy), Float(voiceHue)), at: 0)
        }
        voiceLevel = Double(voice.reduce(0) { $0 + $1.x }) / Double(voice.count)

        if mode == .thinking {
            // Light sets out from across the thread and converges on one point, then on another.
            sinceGathering += dt
            if sinceGathering > 2.3 {
                sinceGathering = 0
                let target = Double.random(in: 0..<1)
                let travel = 1.7
                for offset in [-0.38, -0.21, -0.09, 0.14, 0.27, 0.41] {
                    let start = (target + offset + 1).truncatingRemainder(dividingBy: 1)
                    spawn(Packet(t: start, velocity: -offset / travel, intensity: 0.5, hue: 0.25 + abs(offset),
                                 width: 0.02, lifetime: travel, fade: 0.5))
                }
            }
        } else {
            sinceGathering = 10
        }

        if mode == .idle || mode == .quiet {
            // A rare, faint spark keeps the glass alive at rest.
            sinceIdleSpark += dt
            if sinceIdleSpark > 6 {
                sinceIdleSpark = 0
                spawn(Packet(t: .random(in: 0..<1), velocity: 0.1, intensity: 0.35, hue: .random(in: 0...0.6), width: 0.025, lifetime: 0, fade: 4))
            }
        }

        // Steady inner light: faint warmth with the voice, a full breathing glow while answering.
        let glowTarget: Double = switch mode {
        case .responding: 0.34 + 0.06 * sin(motion.phase * 1.4)
        case .converging: 0.5
        case .thinking: 0.08
        case .listening: 0.04
        case .idle, .quiet: 0
        }
        innerGlow += (glowTarget - innerGlow) * (1 - exp(-dt / 0.35))

        for i in packets.indices {
            packets[i].t = (packets[i].t + packets[i].velocity * dt + 1).truncatingRemainder(dividingBy: 1)
            if packets[i].lifetime > 0 {
                packets[i].lifetime -= dt
                // Gathering light brightens as it nears the meeting point, then stops and fades there.
                packets[i].intensity = min(1.2, packets[i].intensity + dt * 0.25)
                if packets[i].lifetime <= 0 { packets[i].velocity = 0 }
            } else {
                packets[i].intensity *= exp(-dt / packets[i].fade)
            }
        }
        packets.removeAll { $0.intensity < 0.02 }
    }

    /// The sequence of forms while someone talks: trefoil → loosened → infinity → cinquefoil → coil → …
    private func shape(at index: Int) -> Int {
        if index <= 0 { return Self.restShape }
        if index == 1 { return Self.unravelledShape }
        return Self.speakingShapes[(index - 2) % Self.speakingShapes.count]
    }

    /// While someone talks the thread flows through the forms at one steady, unhurried pace — the
    /// voice is carried by the light, not the speed. When they stop it blends straight back into
    /// the trefoil from wherever it is, in a single motion.
    private func stepForm(dt: Double, audio: AudioFeatureSnapshot) {
        if motion.mode == .listening {
            flowing = true
            // Leave the resting knot promptly so the first words visibly loosen it, then settle into
            // the steady pace for the forms that follow.
            let target = formPosition < 1.4 ? 0.5 : 0.14
            formRate += (target - formRate) * (1 - exp(-dt / 0.45))
            homeBlend = max(0, homeBlend - dt / 1.2)
            fill = min(1, fill + Double(audio.loudness) * dt * 0.22)
        } else {
            formRate *= exp(-dt / 0.9)
            if flowing {
                homeBlend = min(1, homeBlend + dt / 1.8)
                if homeBlend >= 1 {
                    flowing = false
                    formPosition = 0
                    formRate = 0
                    homeBlend = 0
                }
            }
            // The fill stays with the thought while it is processed and answered, then ebbs.
            let tau = motion.mode == .thinking || motion.mode == .responding ? 7.0 : 2.5
            fill *= exp(-dt / tau)
        }
        if flowing { formPosition += formRate * dt }
    }

    private func stepPhysics(dt: Double) {
        if !isDragging {
            // Carry release velocity, then spring back to the rest pose (slightly underdamped: it settles like an object).
            let omega = 3.0, zeta = 0.75
            yawVelocity += (-omega * omega * yawOffset - 2 * zeta * omega * yawVelocity) * dt
            yawOffset += yawVelocity * dt
            pitchVelocity += (-omega * omega * pitchOffset - 2 * zeta * omega * pitchVelocity) * dt
            pitchOffset += pitchVelocity * dt
        }

        // Soft, slightly bouncy press.
        let omega = 22.0, zeta = 0.45
        squashVelocity += (omega * omega * (squashTarget - squash) - 2 * zeta * omega * squashVelocity) * dt
        squash += squashVelocity * dt
    }

    // MARK: - Geometry (mirrors shapeCurve in LivingThreadShaders.metal)

    private static func shapeCurve(_ shape: Int, _ t: Float) -> SIMD3<Float> {
        let a = t * 2 * .pi
        switch shape {
        case 1:
            let r = 1.22 + 0.26 * cos(3 * a)
            return SIMD3(r * cos(2 * a), r * sin(2 * a), -0.58 * sin(3 * a))
        case 2:
            return SIMD3(1.55 * sin(a), 0.68 * sin(2 * a), 0.72 * cos(a))
        case 3:
            let r = 1.08 + 0.26 * cos(5 * a)
            return SIMD3(r * cos(2 * a), r * sin(2 * a), -0.5 * sin(5 * a))
        case 4:
            let r = 1.12 + 0.3 * cos(13 * a)
            return SIMD3(r * cos(a), r * sin(a), 0.3 * sin(13 * a))
        default:
            let r = 1 + 0.44 * cos(3 * a)
            return SIMD3(r * cos(2 * a), r * sin(2 * a), -0.44 * sin(3 * a) * 1.1)
        }
    }

    private static func smootherstep(_ x: Double) -> Double {
        let x = min(1, max(0, x))
        return x * x * x * (x * (6 * x - 15) + 10)
    }

    private static func catmullRom<T: FloatingPoint>(_ p0: T, _ p1: T, _ p2: T, _ p3: T, _ f: T) -> T {
        let f2 = f * f, f3 = f2 * f
        let a = 2 * p1
        let b = (p2 - p0) * f
        let c = (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2
        let d = (3 * p1 - p0 - 3 * p2 + p3) * f3
        return (a + b + c + d) / 2
    }

    private static func lowestPoint(model: simd_float4x4, controls: (Int, Int, Int, Int), frac: Float, home: Float, tube: Float) -> Float {
        var lowest = Float.greatestFiniteMagnitude
        for i in 0..<160 {
            let t = Float(i) / 160
            let c0 = shapeCurve(controls.0, t), c1 = shapeCurve(controls.1, t)
            let c2 = shapeCurve(controls.2, t), c3 = shapeCurve(controls.3, t)
            let f = SIMD3<Float>(repeating: frac)
            let flow = 0.5 * (2 * c1 + (c2 - c0) * f + (2 * c0 - 5 * c1 + 4 * c2 - c3) * f * f + (3 * c1 - c0 - 3 * c2 + c3) * f * f * f)
            let p = flow + (shapeCurve(restShape, t) - flow) * home
            lowest = min(lowest, (model * SIMD4(p, 1)).y)
        }
        return lowest - tube
    }

    // MARK: - Matrices

    private static func perspective(fovY: Float, aspect: Float, near: Float, far: Float) -> simd_float4x4 {
        let y = 1 / tan(fovY / 2)
        let x = y / aspect
        let z = far / (near - far)
        return simd_float4x4(columns: (
            SIMD4(x, 0, 0, 0),
            SIMD4(0, y, 0, 0),
            SIMD4(0, 0, z, -1),
            SIMD4(0, 0, z * near, 0)
        ))
    }

    private static func translation(_ t: SIMD3<Float>) -> simd_float4x4 {
        var m = matrix_identity_float4x4
        m.columns.3 = SIMD4(t, 1)
        return m
    }

    private static func rotationX(_ a: Float) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle: a, axis: SIMD3(1, 0, 0)))
    }

    private static func rotationY(_ a: Float) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle: a, axis: SIMD3(0, 1, 0)))
    }

    private static func rotationZ(_ a: Float) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle: a, axis: SIMD3(0, 0, 1)))
    }
}
