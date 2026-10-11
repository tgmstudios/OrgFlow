#include <metal_stdlib>
using namespace metal;

// The Continuity Knot: one continuous thread of clear glass tied into an endless trefoil.
// The object flows calmly; the voice travels *through* it as light, like an optical fiber.
// Must mirror `KnotUniforms` in LivingThreadRenderer.swift (order and types).
struct KnotUniforms {
    float4x4 viewProjection;
    float4x4 model;
    float4 cameraPosition;  // xyz
    float2 viewport;        // drawable size in pixels
    float phase;            // integrated idle motion
    float knotDepth;        // trefoil lobe depth
    float tubeRadius;
    float innerGlow;        // steady light filling the glass (answering)
    float squash;           // touch press, 0…1
    float segments;
    float sides;
    float packetCount;
    float refraction;       // strength of the refracted offset, in pixels
    float hasBackdrop;
    float shape0;           // four consecutive forms (see shapeCurve); the thread flows along a
    float shape1;           // Catmull-Rom spline through them, between shape1 and shape2
    float shape2;
    float shape3;
    float shapeFrac;        // 0…1 position between shape1 and shape2
    float fill;             // 0…1, builds while someone talks: saturation and opacity of the glass
    float floorY;           // glossy floor just beneath the form's lowest point
    float homeBlend;        // 0…1 eased: blends the flowing form straight back into the trefoil
    float voiceCount;       // samples in the voice history (buffer 3)
    float voiceOffset;      // 0…1 fraction of a sample the history has advanced since the newest
    float voiceLevel;       // mean voice light currently in the thread
};

/// Voice history, newest first: x = brightness (how loud), y = hue (how high).
typedef float2 VoiceSample;

/// A packet of light traveling inside the thread: x = position along the loop (0…1),
/// y = intensity, z = hue (0 teal → 0.5 iris → 1 apricot), w = half-length along the loop.
typedef float4 LightPacket;

struct KnotVertex {
    float4 position [[position]];
    float3 worldPosition;
    float3 normal;
    float t;                // 0…1 along the thread
};


constant float kTau = 6.28318530718;
constant int kMaxPackets = 24;

/// The thread's forms. 0: trefoil knot (rest). While someone talks it loosens (1) and keeps
/// finding new forms (2–4); when they stop it ties itself back into the trefoil.
/// All forms are sized to the same footprint and checked so strands never touch.
static float3 shapeCurve(int shape, float t, float depth) {
    float a = t * kTau;
    switch (shape) {
    case 1: {   // Loosened: the same trefoil letting go — lobes relax outward and lift
        float r = 1.22 + 0.26 * cos(3.0 * a);
        return float3(r * cos(2.0 * a), r * sin(2.0 * a), -0.58 * sin(3.0 * a));
    }
    case 2: {   // Infinity: a figure-eight leaning through space; the crossing is well separated in depth
        return float3(1.55 * sin(a), 0.68 * sin(2.0 * a), 0.72 * cos(a));
    }
    case 3: {   // Cinquefoil (2,5): five lobes, generous depth so every crossing breathes
        float r = 1.08 + 0.26 * cos(5.0 * a);
        return float3(r * cos(2.0 * a), r * sin(2.0 * a), -0.5 * sin(5.0 * a));
    }
    case 4: {   // Coil: thread wound around a ring like a spring
        float r = 1.12 + 0.3 * cos(13.0 * a);
        return float3(r * cos(a), r * sin(a), 0.3 * sin(13.0 * a));
    }
    default: {  // Trefoil (2,3)
        float r = 1.0 + depth * cos(3.0 * a);
        return float3(r * cos(2.0 * a), r * sin(2.0 * a), -depth * sin(3.0 * a) * 1.1);
    }
    }
}

/// Tube thickness per form: denser forms use a finer thread.
static float shapeRadius(int shape) {
    switch (shape) {
    case 1: return 0.92;
    case 2: return 0.95;
    case 3: return 0.72;
    case 4: return 0.34;
    default: return 1.0;
    }
}

static float3 knotCurve(constant KnotUniforms &u, float t) {
    float breathe = 1.0 + 0.012 * sin(u.phase * 0.9);
    float3 p0 = shapeCurve(int(u.shape0), t, u.knotDepth);
    float3 p1 = shapeCurve(int(u.shape1), t, u.knotDepth);
    float3 p2 = shapeCurve(int(u.shape2), t, u.knotDepth);
    float3 p3 = shapeCurve(int(u.shape3), t, u.knotDepth);
    float f = u.shapeFrac;
    float3 p = 0.5 * (2.0 * p1 + (p2 - p0) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f
                      + (3.0 * p1 - p0 - 3.0 * p2 + p3) * f * f * f);
    p = mix(p, shapeCurve(0, t, u.knotDepth), u.homeBlend);
    return p * breathe;
}

/// The voice at position t: it enters at t = 0 and travels both ways around the loop at a steady
/// speed, so the two arms meet opposite the entry point with the oldest light.
static VoiceSample voiceAt(float t, constant KnotUniforms &u, constant VoiceSample *voice) {
    int count = int(u.voiceCount);
    if (count < 2) return VoiceSample(0);
    float d = min(t, 1.0 - t) * 2.0;
    float x = max(d * float(count - 1) - u.voiceOffset, 0.0);
    int i = min(int(x), count - 1);
    int j = min(i + 1, count - 1);
    return mix(voice[i], voice[j], x - float(i));
}

static KnotVertex tubeVertex(uint vid, constant KnotUniforms &u, constant VoiceSample *voice, float radiusScale) {
    uint sides = uint(u.sides);
    uint seg = vid / sides;
    uint side = vid % sides;
    float t = float(seg) / u.segments;
    float around = float(side) / float(sides) * kTau;

    float eps = 0.5 / u.segments;
    float3 c = knotCurve(u, t);
    float3 tangent = normalize(knotCurve(u, t + eps) - knotCurve(u, t - eps));
    float3 up = abs(tangent.z) > 0.95 ? float3(1, 0, 0) : float3(0, 0, 1);
    float3 n = normalize(cross(tangent, up));
    float3 b = cross(tangent, n);
    float3 dir = cos(around) * n + sin(around) * b;

    float thickness = mix(shapeRadius(int(u.shape1)), shapeRadius(int(u.shape2)), smoothstep(0.0, 1.0, u.shapeFrac));
    thickness = mix(thickness, shapeRadius(0), u.homeBlend);
    // Where a loud moment is passing, the thread swells a little, as if the light pushes through it.
    float swell = 1.0 + 0.08 * saturate(voiceAt(t, u, voice).x);
    float3 local = c + dir * u.tubeRadius * thickness * radiusScale * swell;
    // Press: a soft squash toward the viewer's plane.
    local *= float3(1.0 + u.squash * 0.04, 1.0 + u.squash * 0.04, 1.0 - u.squash * 0.14);

    float4 world = u.model * float4(local, 1.0);
    float3 normal = normalize((u.model * float4(dir, 0.0)).xyz);
    KnotVertex out;
    out.position = u.viewProjection * world;
    out.worldPosition = world.xyz;
    out.normal = normal;
    out.t = t;
    return out;
}

vertex KnotVertex knotVertex(uint vid [[vertex_id]], constant KnotUniforms &u [[buffer(1)]],
                             constant VoiceSample *voice [[buffer(3)]]) {
    return tubeVertex(vid, u, voice, 1.0);
}

/// A wider, invisible shell around the thread that carries the light's glow out onto the page.
vertex KnotVertex haloVertex(uint vid [[vertex_id]], constant KnotUniforms &u [[buffer(1)]],
                             constant VoiceSample *voice [[buffer(3)]]) {
    return tubeVertex(vid, u, voice, 2.6);
}

static float3 lightColor(float hue) {
    const float3 teal    = float3(0.310, 0.760, 0.730);
    const float3 iris    = float3(0.640, 0.560, 0.980);
    const float3 apricot = float3(1.000, 0.640, 0.470);
    return hue < 0.5 ? mix(teal, iris, hue * 2.0) : mix(iris, apricot, (hue - 0.5) * 2.0);
}

/// Continuous color loop around the thread: teal → iris → apricot → teal, no seam.
static float3 loopColor(float x) {
    float f = fract(x) * 3.0;
    if (f < 1.0) return mix(lightColor(0.0), lightColor(0.5), smoothstep(0.0, 1.0, f));
    if (f < 2.0) return mix(lightColor(0.5), lightColor(1.0), smoothstep(0.0, 1.0, f - 1.0));
    return mix(lightColor(1.0), lightColor(0.0), smoothstep(0.0, 1.0, f - 2.0));
}

/// Thin-film style iridescence: hue drifts with viewing angle.
static float3 iridescence(float cosTheta, float shift) {
    return 0.5 + 0.5 * cos(kTau * (cosTheta * 1.3 + shift + float3(0.0, 0.33, 0.67)));
}

/// Light carried inside the thread at position t.
static float3 packetLight(float t, constant LightPacket *packets, int count) {
    float3 light = float3(0);
    for (int i = 0; i < min(count, kMaxPackets); i++) {
        LightPacket p = packets[i];
        float d = abs(t - p.x);
        d = min(d, 1.0 - d);
        float g = exp(-pow(d / max(p.w, 0.002), 2.0));
        light += lightColor(p.z) * g * p.y;
    }
    return light;
}

/// Voice light carried by the fiber at t: brightness from loudness, color from pitch.
static float3 voiceLight(float t, constant KnotUniforms &u, constant VoiceSample *voice) {
    VoiceSample s = voiceAt(t, u, voice);
    return lightColor(saturate(s.y)) * s.x * 1.15;
}

/// Studio environment for reflections: a bright overhead softbox, a side strip light, a fine
/// darker horizon line (what makes glass read as glass), and a warm, luminous porcelain floor.
static float3 environment(float3 r) {
    const float3 porcelain = float3(0.980, 0.976, 0.965);
    const float3 warmFloor = float3(1.000, 0.965, 0.935);
    float3 color = r.y >= 0.0 ? mix(porcelain * 0.94, porcelain, saturate(r.y * 1.5)) : warmFloor;
    color += smoothstep(0.45, 0.95, r.y) * 0.4;                                              // softbox
    color += smoothstep(0.75, 0.98, dot(r, normalize(float3(-0.85, 0.25, 0.45)))) * 0.25;   // strip
    color *= 1.0 - 0.16 * exp(-pow((r.y + 0.02) / 0.06, 2.0));                              // horizon
    return color;
}

static float3 shadeGlass(KnotVertex in, constant KnotUniforms &u, constant LightPacket *packets,
                         constant VoiceSample *voice, texture2d<float> backdrop) {
    constexpr sampler linearSampler(filter::linear, address::clamp_to_edge);
    const float3 ink = float3(0.125, 0.180, 0.208);

    float3 n = normalize(in.normal);
    float3 v = normalize(u.cameraPosition.xyz - in.worldPosition);
    if (dot(n, v) < 0.0) n = -n;
    float cosTheta = saturate(dot(n, v));
    float fresnel = pow(1.0 - cosTheta, 4.0);

    // Refraction: the page behind is bent by the tube, most strongly toward its edges,
    // with a little dispersion so the edges split into color like real glass.
    float2 screenUV = in.position.xy / u.viewport;
    float2 bend = -n.xy * float2(1.0, -1.0) * (u.refraction / u.viewport) * (0.35 + 0.65 * (1.0 - cosTheta));
    float3 behind;
    if (u.hasBackdrop > 0.5) {
        behind.r = backdrop.sample(linearSampler, screenUV + bend * 1.00).r;
        behind.g = backdrop.sample(linearSampler, screenUV + bend * 1.10).g;
        behind.b = backdrop.sample(linearSampler, screenUV + bend * 1.22).b;
    } else {
        behind = float3(0.980, 0.976, 0.965);
    }
    // Clear glass: the page shows through, magnified and brighter at the thick center; toward the
    // silhouette, internal reflection darkens it into the cool edge bands that make glass legible.
    float3 body = behind * float3(0.955, 0.985, 0.980) * (0.96 + 0.06 * cosTheta);
    // Pearlescent thread color in the glass; as someone keeps talking it fills in, more
    // saturated and more opaque.
    float3 pearl = loopColor(in.t * 2.0 + u.phase * 0.02);
    float tint = 0.34 + 0.46 * u.fill;
    body *= mix(float3(1.0), mix(float3(1.0), pearl, 0.7), tint);
    body = mix(body, pearl * (0.92 - 0.1 * u.fill), u.fill * (0.25 + 0.45 * pow(cosTheta, 0.8)));
    body += iridescence(cosTheta, in.t * 2.0 + u.phase * 0.04) * pearl * fresnel * 0.35;
    float facingDown = saturate(-n.y);
    float edgeBand = smoothstep(0.62, 0.08, cosTheta) * (1.0 - 0.6 * facingDown);
    body = mix(body, float3(0.30, 0.40, 0.43), edgeBand * (0.30 - 0.12 * u.fill));

    // Reflections and highlights.
    float3 r = reflect(-v, n);
    float3 reflection = environment(r) * (0.02 + 0.38 * fresnel);
    float3 keyDir = normalize(float3(-0.45, 0.8, 0.5));
    float3 rimDir = normalize(float3(0.7, 0.2, -0.3));
    float specKey = pow(saturate(dot(n, normalize(keyDir + v))), 220.0) * 1.4;
    float specSoft = pow(saturate(dot(n, normalize(keyDir + v))), 28.0) * 0.10;
    float specRim = pow(saturate(dot(n, normalize(rimDir + v))), 60.0) * 0.35;

    float3 color = body * (1.0 - 0.38 * fresnel) + reflection + (specKey + specSoft + specRim);
    // Light bouncing up from the porcelain floor brightens the undersides.
    color += float3(1.0, 0.96, 0.92) * facingDown * 0.07;

    // Light inside the thread. On a light page it reads as saturated color in the core of the glass,
    // with a brighter scatter where it meets the rim.
    float3 carried = packetLight(in.t, packets, int(u.packetCount)) + voiceLight(in.t, u, voice);
    float3 steady = loopColor(in.t * 2.0 + u.phase * 0.02) * u.innerGlow;
    float3 inner = carried + steady;
    float amount = saturate(max(inner.r, max(inner.g, inner.b)));
    float3 hue = inner / max(amount, 1e-3);
    float core = pow(cosTheta, 1.2);
    color = mix(color, hue * 0.92, amount * (0.25 + 0.6 * core));
    color += hue * amount * fresnel * 0.5;

    // A fine dark contour at the silhouette gives the glass definition on a light page.
    color = mix(color, ink, pow(1.0 - cosTheta, 7.0) * 0.40 * (1.0 - 0.5 * facingDown));
    return saturate(color);
}

fragment float4 knotFragment(KnotVertex in [[stage_in]],
                             constant KnotUniforms &u [[buffer(0)]],
                             constant LightPacket *packets [[buffer(2)]],
                             constant VoiceSample *voice [[buffer(3)]],
                             texture2d<float> backdrop [[texture(0)]]) {
    return float4(shadeGlass(in, u, packets, voice, backdrop), 1.0);
}


fragment float4 haloFragment(KnotVertex in [[stage_in]],
                             constant KnotUniforms &u [[buffer(0)]],
                             constant LightPacket *packets [[buffer(2)]],
                             constant VoiceSample *voice [[buffer(3)]]) {
    float3 n = normalize(in.normal);
    float3 v = normalize(u.cameraPosition.xyz - in.worldPosition);
    float facing = pow(abs(dot(n, v)), 2.5);
    float3 inner = packetLight(in.t, packets, int(u.packetCount)) + voiceLight(in.t, u, voice)
                 + loopColor(in.t * 2.0 + u.phase * 0.02) * u.innerGlow;
    float amount = saturate(max(inner.r, max(inner.g, inner.b)));
    float3 hue = inner / max(amount, 1e-3);
    float a = amount * facing * 0.32;
    return float4(hue * a, a);
}

// MARK: - Glass shadow

struct ShadowVertex {
    float4 position [[position]];
    float2 local;
};

vertex ShadowVertex shadowVertex(uint vid [[vertex_id]], constant KnotUniforms &u [[buffer(1)]]) {
    float2 corners[4] = { float2(-1, -1), float2(1, -1), float2(-1, 1), float2(1, 1) };
    float2 c = corners[vid];
    float3 world = float3(c.x * 1.9, u.floorY, c.y * 1.9 * 1.5);
    ShadowVertex out;
    out.position = u.viewProjection * float4(world, 1.0);
    out.local = c;
    return out;
}

fragment float4 shadowFragment(ShadowVertex in [[stage_in]],
                               constant KnotUniforms &u [[buffer(0)]],
                               constant LightPacket *packets [[buffer(2)]]) {
    const float3 ink = float3(0.125, 0.180, 0.208);
    float2 q = in.local;
    float d = length(q);

    // A soft pool of the thread's colors on the floor: teal, iris and apricot blending across it.
    float3 pool = loopColor(q.x * 0.32 + 0.45 + u.phase * 0.01);
    float3 carried = float3(0);
    for (int i = 0; i < min(int(u.packetCount), kMaxPackets); i++) {
        carried += lightColor(packets[i].z) * packets[i].y;
    }
    float strength = 0.2 + 0.22 * u.fill + 0.35 * u.innerGlow + 0.06 * min(dot(carried, float3(0.33)), 2.0)
                   + 0.45 * u.voiceLevel;
    float a = exp(-d * d * 3.2) * strength;
    float3 color = saturate(pool + carried * 0.05) * a;

    // The faintest contact shade directly beneath.
    float shade = exp(-d * d * 14.0) * (0.035 - u.squash * 0.01);
    return float4(color + ink * shade, saturate(a + shade));
}
