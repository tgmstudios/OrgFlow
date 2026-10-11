import Foundation

/// A JSON value, for the open-ended `attrs` of rich-text nodes.
nonisolated enum JSONValue: Codable, Sendable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    var string: String? { if case .string(let value) = self { value } else { nil } }
    var int: Int? { if case .number(let value) = self { Int(value) } else { nil } }
    var bool: Bool? { if case .bool(let value) = self { value } else { nil } }
}

/// A Tiptap (ProseMirror) rich-text node, the backend's article format.
/// Node types: doc, paragraph, text, heading (attrs.level), bulletList, orderedList, listItem,
/// taskList, taskItem (attrs.checked), blockquote, hardBreak, horizontalRule, codeBlock.
/// Marks: bold, italic, strike, code, underline, link (attrs.href).
nonisolated struct RichTextNode: Codable, Sendable, Hashable {
    nonisolated struct Mark: Codable, Sendable, Hashable {
        var type: String
        var attrs: [String: JSONValue]?
    }

    var type: String
    var attrs: [String: JSONValue]?
    var content: [RichTextNode]?
    var text: String?
    var marks: [Mark]?

    init(type: String, attrs: [String: JSONValue]? = nil, content: [RichTextNode]? = nil, text: String? = nil, marks: [Mark]? = nil) {
        self.type = type
        self.attrs = attrs
        self.content = content
        self.text = text
        self.marks = marks
    }

    static func doc(_ content: [RichTextNode]) -> RichTextNode { RichTextNode(type: "doc", content: content) }
    static func paragraph(_ text: String) -> RichTextNode {
        RichTextNode(type: "paragraph", content: text.isEmpty ? nil : [RichTextNode(type: "text", text: text)])
    }
    static func heading(_ text: String, level: Int = 2) -> RichTextNode {
        RichTextNode(type: "heading", attrs: ["level": .number(Double(level))], content: [RichTextNode(type: "text", text: text)])
    }
    static func orderedList(_ items: [String]) -> RichTextNode {
        RichTextNode(type: "orderedList", content: items.map { RichTextNode(type: "listItem", content: [.paragraph($0)]) })
    }
    static func bulletList(_ items: [String]) -> RichTextNode {
        RichTextNode(type: "bulletList", content: items.map { RichTextNode(type: "listItem", content: [.paragraph($0)]) })
    }

    /// All text in reading order, blocks separated by newlines.
    var plainText: String {
        if let text { return text }
        let parts = (content ?? []).map(\.plainText)
        let block = ["paragraph", "heading", "listItem", "taskItem", "codeBlock", "blockquote"].contains(type)
        return parts.joined(separator: block ? "" : "\n")
    }
}

nonisolated struct WorkspaceCategory: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
}

nonisolated struct ArticleSource: Codable, Sendable, Hashable {
    let id: String
    let title: String
    let status: String?
    let url: String?
}

nonisolated struct Article: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let title: String
    let categoryId: String
    let content: RichTextNode?
    /// "draft" or "published". A published article that was edited afterwards is a draft again
    /// while still serving its published snapshot.
    let status: String
    let updatedAt: String?
    let publishedTitle: String?
    let publishedContent: RichTextNode?
    let publishedAt: String?
    let sources: [ArticleSource]?
    let synthetic: Bool?

    var isDraft: Bool { status == "draft" }
    var hasPublishedVersion: Bool { publishedContent != nil }
    var isSample: Bool { synthetic == true }
    var displayTitle: String { publishedTitle ?? title }
}

nonisolated struct WorkspaceFile: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let provider: String?
    let orgflowPath: String?
    let url: String?
    let updatedAt: String?
    let synthetic: Bool?
}

nonisolated struct WorkspaceEvent: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let title: String
    /// ISO 8601.
    let start: String
    /// "meeting" or "deadline".
    let kind: String?
    let synthetic: Bool?

    var startDate: Date? {
        (try? Date(start, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(start, strategy: .iso8601))
    }
}

/// Everything `/api/bootstrap` returns that the app uses.
nonisolated struct Workspace: Decodable, Sendable {
    var categories: [WorkspaceCategory]
    var articles: [Article]
    var files: [WorkspaceFile]
    var events: [WorkspaceEvent]

    func category(_ id: String) -> WorkspaceCategory? { categories.first { $0.id == id } }
    func article(_ id: String) -> Article? { articles.first { $0.id == id } }

    var summary: WorkspaceSummary {
        WorkspaceSummary(
            categories: categories.map(\.name),
            articles: articles.filter { $0.hasPublishedVersion || !$0.isDraft }.map(\.displayTitle),
            files: files.map(\.name)
        )
    }
}
