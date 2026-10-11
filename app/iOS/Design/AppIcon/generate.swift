// Renders the OrgFlow app icon: the resting Continuity Knot (trefoil) in its hero pose, shaded like
// LivingThreadShaders.metal's clear glass. Writes a vector SVG and 1024 px PNGs (light, dark, tinted).
//
//   swift app/iOS/Design/AppIcon/generate.swift <output directory>
//
// The tube is drawn as thin quads (segments along the knot × strips around the tube) sorted far to
// near, so crossings and the tube's own roundness overlap correctly in both the SVG and the PNG.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

typealias V3 = SIMD3<Double>

let size = 1024.0
let segments = 520
let strips = 30
let tubeRadius = 0.21

// MARK: Geometry (mirrors shapeCurve(0) and the trefoil hero pose in LivingThreadRenderer)

func trefoil(_ t: Double) -> V3 {
    let a = t * 2 * .pi
    let r = 1 + 0.44 * cos(3 * a)
    return V3(r * cos(2 * a), r * sin(2 * a), -0.44 * sin(3 * a) * 1.1)
}

func pose(_ p: V3) -> V3 {
    let roll = Double.pi / 2, pitch = -0.38
    let z = V3(p.x * cos(roll) - p.y * sin(roll), p.x * sin(roll) + p.y * cos(roll), p.z)
    return V3(z.x, z.y * cos(pitch) - z.z * sin(pitch), z.y * sin(pitch) + z.z * cos(pitch))
}

let cameraDistance = 9.4
func perspective(_ z: Double) -> Double { cameraDistance / (cameraDistance - z) }

// MARK: Shading (mirrors shadeGlass)

let teal = V3(0.310, 0.760, 0.730), iris = V3(0.640, 0.560, 0.980), apricot = V3(1.000, 0.640, 0.470)
func mix(_ a: V3, _ b: V3, _ f: Double) -> V3 { a + (b - a) * f }
func smoothstep(_ e0: Double, _ e1: Double, _ x: Double) -> Double {
    let t = min(1, max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
}
func lightColor(_ h: Double) -> V3 { h < 0.5 ? mix(teal, iris, h * 2) : mix(iris, apricot, (h - 0.5) * 2) }
func loopColor(_ x: Double) -> V3 {
    let f = (x - floor(x)) * 3
    if f < 1 { return mix(lightColor(0), lightColor(0.5), smoothstep(0, 1, f)) }
    if f < 2 { return mix(lightColor(0.5), lightColor(1), smoothstep(0, 1, f - 1)) }
    return mix(lightColor(1), lightColor(0), smoothstep(0, 1, f - 2))
}
func normalize(_ v: V3) -> V3 { v / (v * v).sum().squareRoot() }
func dot(_ a: V3, _ b: V3) -> Double { (a * b).sum() }
func clamp(_ v: V3) -> V3 { V3(min(1, max(0, v.x)), min(1, max(0, v.y)), min(1, max(0, v.z))) }

struct Style {
    var background: V3      // the page seen through the glass
    var fill: Double        // how saturated / opaque the glass is
    var grayscale: Bool
}

func shade(t: Double, normal n: V3, style: Style) -> V3 {
    let v = V3(0, 0, 1)
    let cosTheta = max(0, dot(n, v))
    let fresnel = pow(1 - cosTheta, 4)
    let pearl = loopColor(t * 2)
    var body = style.background * V3(0.955, 0.985, 0.980) * (0.96 + 0.06 * cosTheta)
    let tint = 0.34 + 0.46 * style.fill
    body *= mix(V3(1, 1, 1), mix(V3(1, 1, 1), pearl, 0.7), tint)
    body = mix(body, pearl * (0.92 - 0.1 * style.fill), style.fill * (0.25 + 0.45 * pow(cosTheta, 0.8)))
    let irid = V3(0.5, 0.5, 0.5) + 0.5 * V3(cos(2 * .pi * (cosTheta * 1.3 + t * 2)), cos(2 * .pi * (cosTheta * 1.3 + t * 2 + 0.33)), cos(2 * .pi * (cosTheta * 1.3 + t * 2 + 0.67)))
    body += irid * pearl * fresnel * 0.35
    let facingDown = max(0, -n.y)
    let edgeBand = smoothstep(0.62, 0.08, cosTheta) * (1 - 0.6 * facingDown)
    body = mix(body, V3(0.30, 0.40, 0.43), edgeBand * (0.30 - 0.12 * style.fill))

    // Studio reflection: overhead softbox, warm floor.
    let r = n * (2 * dot(n, v)) - v
    var env = r.y >= 0 ? mix(V3(0.92, 0.917, 0.907), V3(0.98, 0.976, 0.965), min(1, r.y * 1.5)) : V3(1.0, 0.965, 0.935)
    env += V3(1, 1, 1) * smoothstep(0.45, 0.95, r.y) * 0.4
    let reflection = env * (0.02 + 0.38 * fresnel)
    let key = normalize(V3(-0.45, 0.8, 0.5))
    let h = normalize(key + v)
    let spec = pow(max(0, dot(n, h)), 90) * 1.2 + pow(max(0, dot(n, h)), 20) * 0.10
    let rim = pow(max(0, dot(n, normalize(normalize(V3(0.7, 0.2, -0.3)) + v))), 40) * 0.3

    var color = body * (1 - 0.38 * fresnel) + reflection + V3(1, 1, 1) * (spec + rim)
    color += V3(1.0, 0.96, 0.92) * facingDown * 0.07
    let ink = V3(0.125, 0.180, 0.208)
    color = mix(color, ink, pow(1 - cosTheta, 7) * 0.40 * (1 - 0.5 * facingDown))
    color = clamp(color)
    if style.grayscale {
        let l = dot(color, V3(0.299, 0.587, 0.114))
        return V3(l, l, l)
    }
    return color
}

// MARK: Tessellation

struct Quad {
    var points: [CGPoint]
    var color: V3
    var depth: Double
}

func quads(style: Style) -> [Quad] {
    let scale = size * 0.215
    let center = CGPoint(x: size / 2, y: size * 0.47)
    // Per sample: screen center, screen perpendicular, radius in px, depth, view-space perpendicular.
    struct Sample { var c: CGPoint; var perp: (Double, Double); var r: Double; var z: Double }
    var samples: [Sample] = []
    for i in 0...segments {
        let t = Double(i) / Double(segments)
        let eps = 0.5 / Double(segments)
        let p = pose(trefoil(t))
        let a = pose(trefoil(t - eps)), b = pose(trefoil(t + eps))
        let k = perspective(p.z)
        let ta = (b.x * perspective(b.z) - a.x * perspective(a.z), b.y * perspective(b.z) - a.y * perspective(a.z))
        let len = (ta.0 * ta.0 + ta.1 * ta.1).squareRoot()
        let perp = (-ta.1 / len, ta.0 / len)
        samples.append(Sample(c: CGPoint(x: center.x + p.x * k * scale, y: center.y - p.y * k * scale), perp: perp, r: tubeRadius * k * scale, z: p.z))
    }
    func point(_ s: Sample, _ phi: Double) -> CGPoint {
        CGPoint(x: s.c.x + s.perp.0 * s.r * sin(phi), y: s.c.y - s.perp.1 * s.r * sin(phi))
    }
    var result: [Quad] = []
    for i in 0..<segments {
        let s0 = samples[i], s1 = samples[i + 1]
        let t = (Double(i) + 0.5) / Double(segments)
        for j in 0..<strips {
            let phi0 = -Double.pi / 2 + Double.pi * Double(j) / Double(strips)
            let phi1 = -Double.pi / 2 + Double.pi * Double(j + 1) / Double(strips)
            let mid = (phi0 + phi1) / 2
            let perp = ((s0.perp.0 + s1.perp.0) / 2, (s0.perp.1 + s1.perp.1) / 2)
            let normal = normalize(V3(perp.0 * sin(mid), perp.1 * sin(mid), cos(mid)))
            let depth = (s0.z + s1.z) / 2 + tubeRadius * cos(mid)
            result.append(Quad(points: [point(s0, phi0), point(s1, phi0), point(s1, phi1), point(s0, phi1)],
                               color: shade(t: t, normal: normal, style: style), depth: depth))
        }
    }
    return result.sorted { $0.depth < $1.depth }
}

// MARK: Output

struct Variant {
    var name: String
    var style: Style
    var top: V3, bottom: V3          // background gradient
    var pool: Double                 // strength of the colored light pool beneath
}

let canvas = V3(0.980, 0.976, 0.965)
let variants = [
    Variant(name: "AppIcon", style: Style(background: canvas, fill: 0.5, grayscale: false),
            top: V3(0.988, 0.985, 0.976), bottom: V3(0.945, 0.937, 0.975), pool: 0.32),
    Variant(name: "AppIcon-Dark", style: Style(background: V3(0.30, 0.34, 0.38), fill: 0.85, grayscale: false),
            top: V3(0.105, 0.135, 0.160), bottom: V3(0.060, 0.075, 0.095), pool: 0.45),
    Variant(name: "AppIcon-Tinted", style: Style(background: V3(0.55, 0.55, 0.55), fill: 0.3, grayscale: true),
            top: V3(0, 0, 0), bottom: V3(0, 0, 0), pool: 0),
]

func hex(_ c: V3) -> String {
    String(format: "#%02X%02X%02X", Int((c.x * 255).rounded()), Int((c.y * 255).rounded()), Int((c.z * 255).rounded()))
}

func svg(_ variant: Variant, _ quads: [Quad]) -> String {
    let poolColor = loopColor(0.45)
    var out = """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \(Int(size)) \(Int(size))" width="\(Int(size))" height="\(Int(size))">
    <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="\(hex(variant.top))"/><stop offset="1" stop-color="\(hex(variant.bottom))"/></linearGradient>
    <radialGradient id="pool"><stop offset="0" stop-color="\(hex(poolColor))" stop-opacity="\(variant.pool)"/><stop offset="1" stop-color="\(hex(poolColor))" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="\(Int(size))" height="\(Int(size))" fill="url(#bg)"/>
    <ellipse cx="\(Int(size / 2))" cy="\(Int(size * 0.80))" rx="\(Int(size * 0.36))" ry="\(Int(size * 0.075))" fill="url(#pool)"/>
    <g stroke-width="0.7" stroke-linejoin="round">

    """
    for quad in quads {
        let c = hex(quad.color)
        let d = quad.points.map { String(format: "%.1f %.1f", $0.x, $0.y) }.joined(separator: " L")
        out += "<path d=\"M\(d)Z\" fill=\"\(c)\" stroke=\"\(c)\"/>\n"
    }
    return out + "</g>\n</svg>\n"
}

func png(_ variant: Variant, _ quads: [Quad], to url: URL) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    // Supersampled 3×, then reduced, so the seams between neighboring quads disappear.
    let supersample = 3.0
    let context = CGContext(data: nil, width: Int(size * supersample), height: Int(size * supersample), bitsPerComponent: 8, bytesPerRow: 0, space: space,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    // Flip to SVG coordinates (y down).
    context.scaleBy(x: supersample, y: supersample)
    context.translateBy(x: 0, y: size)
    context.scaleBy(x: 1, y: -1)
    func cg(_ c: V3, _ a: Double = 1) -> CGColor { CGColor(colorSpace: space, components: [c.x, c.y, c.z, a])! }

    let background = CGGradient(colorsSpace: space, colors: [cg(variant.top), cg(variant.bottom)] as CFArray, locations: [0, 1])!
    context.drawLinearGradient(background, start: .zero, end: CGPoint(x: 0, y: size), options: [])

    if variant.pool > 0 {
        let poolColor = loopColor(0.45)
        let pool = CGGradient(colorsSpace: space, colors: [cg(poolColor, variant.pool), cg(poolColor, 0)] as CFArray, locations: [0, 1])!
        context.saveGState()
        context.translateBy(x: size / 2, y: size * 0.80)
        context.scaleBy(x: 1, y: 0.075 / 0.36)
        context.drawRadialGradient(pool, startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: size * 0.36, options: [])
        context.restoreGState()
    }

    context.setLineWidth(0.45)
    context.setLineJoin(.round)
    for quad in quads {
        context.beginPath()
        context.addLines(between: quad.points)
        context.closePath()
        context.setFillColor(cg(quad.color))
        context.setStrokeColor(cg(quad.color))
        context.drawPath(using: .fillStroke)
    }
    let large = context.makeImage()!
    let reduced = CGContext(data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8, bytesPerRow: 0, space: space,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    reduced.interpolationQuality = .high
    reduced.draw(large, in: CGRect(x: 0, y: 0, width: size, height: size))
    let image = reduced.makeImage()!
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationFinalize(destination)
}

let output = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
for variant in variants {
    let tessellated = quads(style: variant.style)
    try! svg(variant, tessellated).write(to: output.appending(path: "\(variant.name).svg"), atomically: true, encoding: .utf8)
    png(variant, tessellated, to: output.appending(path: "\(variant.name).png"))
    print("wrote \(variant.name)")
}
