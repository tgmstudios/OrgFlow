import UIKit

/// The knowledge map's data: one cluster per person around the organization, plus "Unassigned"
/// when anything has no known owner. Membership is the recorded owner only (`article.ownerId`,
/// `source.ownerId`); nothing is inferred.
nonisolated struct KnowledgeMapData: Sendable {
    static let unassigned = "unassigned"

    enum Tone: Sendable, Hashable, CaseIterable {
        case teal, iris, apricot, muted
    }

    struct Item: Sendable, Hashable {
        enum Kind: Sendable, Hashable { case article, source }
        let key: String
        let kind: Kind
        let id: String
        let title: String
        let detail: String
        let url: URL?
        /// Cluster id: a person's id, or `KnowledgeMapData.unassigned`.
        var ownerID: String
        /// A published playbook returns to draft on any change, including its owner.
        var published: Bool
        let isEmail: Bool
    }

    struct Cluster: Sendable, Hashable {
        let id: String
        let name: String
        let person: Person?
        let tone: Tone

        var isUnassigned: Bool { person == nil }
    }

    private(set) var items: [Item]
    private(set) var clusters: [Cluster]
    let people: [Person]

    init(workspace: Workspace) {
        people = workspace.people
        let known = Set(workspace.people.map(\.id))
        func owner(_ id: String?) -> String { id.flatMap { known.contains($0) ? $0 : nil } ?? Self.unassigned }
        items = workspace.articles.map { article in
            Item(
                key: "article:" + article.id, kind: .article, id: article.id, title: article.title,
                detail: workspace.category(article.categoryId)?.name ?? "Playbook", url: nil,
                ownerID: owner(article.ownerId), published: article.status == "published", isEmail: false
            )
        } + workspace.sources.map { source in
            Item(
                key: "source:" + source.id, kind: .source, id: source.id, title: source.title,
                detail: [source.provider, source.from].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                url: source.url.flatMap { URL(string: $0) }.flatMap { $0.scheme == "https" ? $0 : nil },
                ownerID: owner(source.ownerId), published: false,
                isEmail: (source.provider ?? "").localizedCaseInsensitiveContains("gmail")
            )
        }
        clusters = []
        rebuildClusters()
    }

    private mutating func rebuildClusters() {
        let tones: [Tone] = [.teal, .iris, .apricot]
        var list = people.enumerated().map { index, person in
            Cluster(id: person.id, name: person.name, person: person, tone: tones[index % tones.count])
        }
        if items.contains(where: { $0.ownerID == Self.unassigned }) {
            list.append(Cluster(id: Self.unassigned, name: "Unassigned", person: nil, tone: .muted))
        }
        clusters = list
    }

    /// Moves an item locally (optimistic update before or after the API call).
    mutating func setOwner(_ key: String, to clusterID: String, published: Bool? = nil) {
        guard let index = items.firstIndex(where: { $0.key == key }) else { return }
        items[index].ownerID = clusterID
        if let published { items[index].published = published }
        rebuildClusters()
    }

    func members(of clusterID: String) -> [Item] { items.filter { $0.ownerID == clusterID } }
    func item(_ key: String) -> Item? { items.first { $0.key == key } }
    func cluster(_ id: String) -> Cluster? { clusters.first { $0.id == id } }
    func person(_ id: String?) -> Person? { id.flatMap { id in people.first { $0.id == id } } }
    func name(of clusterID: String) -> String { person(clusterID)?.name ?? "Unassigned" }

    var maxMembers: Int { clusters.map { members(of: $0.id).count }.max() ?? 0 }

    /// People who are leaving or have left and still own something.
    var departing: [(cluster: Cluster, count: Int)] {
        clusters.compactMap { cluster in
            guard let person = cluster.person, person.isDeparting else { return nil }
            let count = members(of: cluster.id).count
            return count > 0 ? (cluster, count) : nil
        }
    }
}

extension KnowledgeMapData.Tone {
    var color: UIColor {
        switch self {
        case .teal: ContinuityTheme.Color.teal
        case .iris: ContinuityTheme.Color.iris
        case .apricot: ContinuityTheme.Color.apricot
        case .muted: ContinuityTheme.Color.secondaryInk
        }
    }

    /// Text and symbols on a pale fill.
    var ink: UIColor {
        switch self {
        case .teal: UIColor(hex: 0x2B7672)
        case .iris: UIColor(hex: 0x7753CE)
        case .apricot: UIColor(hex: 0x9A4B22)
        case .muted: UIColor(hex: 0x66737B)
        }
    }

    var pale: UIColor {
        switch self {
        case .teal: ContinuityTheme.Color.paleTeal
        case .iris: ContinuityTheme.Color.paleLavender
        case .apricot: UIColor(hex: 0xFCEBE1)
        case .muted: UIColor(hex: 0xEEF1F0)
        }
    }
}

extension KnowledgeMapData.Item {
    var symbol: String {
        switch kind {
        case .article: "book.closed.fill"
        case .source: isEmail ? "envelope.fill" : "doc.text.fill"
        }
    }
}

/// Positions for the cluster view: people on an ellipse around the organization, each person's items
/// fanned outward from the center. A port of the web layout (`frontend/cluster-view.tsx`), stretched
/// vertically for a portrait screen.
enum KnowledgeMapLayout {
    static let rootKey = "root"

    /// Radius of a cluster's fan of items.
    static func fanRadius(count: Int) -> CGFloat { 112 + CGFloat(max(0, count - 4)) * 10 }

    static func radii(clusterCount n: Int, maxMembers k: Int) -> (x: CGFloat, y: CGFloat) {
        let fan = fanRadius(count: k)
        return (80 + fan * 0.3 + CGFloat(max(0, n - 4)) * 30, 150 + fan * 0.75 + CGFloat(max(0, n - 3)) * 30)
    }

    /// Centers for the root, every cluster and every item. `pinned` overrides cluster positions
    /// (a cluster that was dragged and dropped on empty space, or one being dragged right now).
    /// `sizes` are the nodes' sizes: people are then nudged off the organization and each other,
    /// and items apart so no pill covers another node.
    static func positions(for data: KnowledgeMapData, center: CGPoint, pinned: [String: CGPoint], bounds: CGRect?, sizes: [String: CGSize] = [:]) -> [String: CGPoint] {
        var result: [String: CGPoint] = [rootKey: center]
        let n = data.clusters.count
        let radii = radii(clusterCount: n, maxMembers: data.maxMembers)
        // Two clusters sit above and below the organization; more go around it.
        let start = -CGFloat.pi / 2 + (n == 2 ? 0 : .pi / CGFloat(max(n, 1)))
        for (i, cluster) in data.clusters.enumerated() {
            let angle = start + CGFloat(i) / CGFloat(max(n, 1)) * .pi * 2
            var at = pinned[cluster.id] ?? CGPoint(x: center.x + radii.x * cos(angle), y: center.y + radii.y * sin(angle))
            if let bounds { at = clamp(at, to: bounds, size: sizes[cluster.id] ?? CGSize(width: 200, height: 56)) }
            result[cluster.id] = at
        }
        if !sizes.isEmpty {
            let free = data.clusters.map(\.id).filter { pinned[$0] == nil }
            let anchors = Dictionary(uniqueKeysWithValues: free.map { ($0, center) })
            separate(&result, movable: free, fixed: [rootKey] + data.clusters.map(\.id).filter { pinned[$0] != nil }, anchors: anchors, sizes: sizes, bounds: bounds, gap: CGSize(width: 14, height: 14))
        }
        for cluster in data.clusters {
            guard let at = result[cluster.id] else { continue }
            let members = data.members(of: cluster.id)
            let k = members.count
            let out = atan2(at.y - center.y, at.x - center.x)
            let spread = min(.pi * 1.6, CGFloat(k) * 0.8)
            let r = fanRadius(count: k)
            for (j, item) in members.enumerated() {
                let a = k == 1 ? out : out - spread / 2 + spread * (CGFloat(j) + 0.5) / CGFloat(k)
                result[item.key] = CGPoint(x: at.x + r * 0.6 * cos(a), y: at.y + r * 0.95 * sin(a))
            }
        }
        if !sizes.isEmpty {
            let items = data.items.map(\.key)
            var anchors: [String: CGPoint] = [:]
            for item in data.items { anchors[item.key] = result[item.ownerID] }
            separate(&result, movable: items, fixed: [rootKey] + data.clusters.map(\.id), anchors: anchors, sizes: sizes, bounds: bounds, gap: CGSize(width: 10, height: 8))
        }
        return result
    }

    /// Pushes overlapping `movable` nodes apart (mostly vertically, since cards are wide) and off
    /// the `fixed` ones. Ties break away from each node's anchor (its person, or the center).
    private static func separate(_ positions: inout [String: CGPoint], movable: [String], fixed: [String], anchors: [String: CGPoint], sizes: [String: CGSize], bounds: CGRect?, gap: CGSize) {
        let movable = movable.filter { positions[$0] != nil }
        func size(_ key: String) -> CGSize {
            let s = sizes[key] ?? CGSize(width: 170, height: 34)
            return CGSize(width: s.width + gap.width, height: s.height + gap.height)
        }
        /// How far `a` must move away from `b` (nil when they don't overlap).
        func push(_ a: String, from b: String) -> CGVector? {
            guard let pa = positions[a], let pb = positions[b] else { return nil }
            let sa = size(a), sb = size(b)
            let dx = (sa.width + sb.width) / 2 - abs(pa.x - pb.x)
            let dy = (sa.height + sb.height) / 2 - abs(pa.y - pb.y)
            guard dx > 0, dy > 0 else { return nil }
            func sign(_ v: CGFloat, _ fallback: CGFloat) -> CGFloat { abs(v) < 0.5 ? (fallback >= 0 ? 1 : -1) : (v > 0 ? 1 : -1) }
            let away = anchors[a].map { CGPoint(x: pa.x - $0.x, y: pa.y - $0.y) } ?? .zero
            if dy <= dx * 1.6 {
                return CGVector(dx: 0, dy: dy * sign(pa.y - pb.y, away.y))
            }
            return CGVector(dx: dx * sign(pa.x - pb.x, away.x), dy: 0)
        }
        for _ in 0..<40 {
            var moved = false
            for (index, a) in movable.enumerated() {
                for b in fixed where b != a {
                    if let v = push(a, from: b) {
                        positions[a]!.x += v.dx
                        positions[a]!.y += v.dy
                        moved = true
                    }
                }
                for b in movable[(index + 1)...] {
                    if let v = push(a, from: b) {
                        positions[a]!.x += v.dx / 2
                        positions[a]!.y += v.dy / 2
                        positions[b]!.x -= v.dx / 2
                        positions[b]!.y -= v.dy / 2
                        moved = true
                    }
                }
            }
            if let bounds {
                for key in movable { positions[key] = clamp(positions[key]!, to: bounds, size: sizes[key] ?? .zero) }
            }
            if !moved { break }
        }
    }

    /// Keeps a node of `size` centered at `p` fully inside `rect`.
    static func clamp(_ p: CGPoint, to rect: CGRect, size: CGSize) -> CGPoint {
        clamp(p, to: rect.insetBy(dx: min(rect.width / 2, size.width / 2 + 8), dy: min(rect.height / 2, size.height / 2 + 8)))
    }

    static func clamp(_ p: CGPoint, to rect: CGRect) -> CGPoint {
        CGPoint(x: min(rect.maxX, max(rect.minX, p.x)), y: min(rect.maxY, max(rect.minY, p.y)))
    }

    /// Quadratic curve with the control point pushed sideways, like the web's `curve()`.
    static func curve(from a: CGPoint, to b: CGPoint, bend: CGFloat) -> UIBezierPath {
        let path = UIBezierPath()
        path.move(to: a)
        let mid = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        path.addQuadCurve(to: b, controlPoint: CGPoint(x: mid.x - (b.y - a.y) * bend, y: mid.y + (b.x - a.x) * bend))
        return path
    }
}
