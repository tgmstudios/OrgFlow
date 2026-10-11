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
    let publishedBy: PersonReference?
    /// ISO 8601. A published article is due for review once this has passed.
    let reviewDueAt: String?
    let reviewedAt: String?
    let ownerId: String?

    var isDraft: Bool { status == "draft" }
    var hasPublishedVersion: Bool { publishedContent != nil }
    var isSample: Bool { synthetic == true }
    var displayTitle: String { publishedTitle ?? title }

    var reviewDueDate: Date? { OrgFlowDates.parse(reviewDueAt) }
    var publishedDate: Date? { OrgFlowDates.parse(publishedAt) }
    var reviewedDate: Date? { OrgFlowDates.parse(reviewedAt) }

    /// Published knowledge whose periodic review date has passed.
    var isDueForReview: Bool {
        guard hasPublishedVersion || !isDraft, let due = reviewDueDate else { return false }
        return due < Date()
    }
}

/// `{id, name}` — who approved, started, or completed something.
nonisolated struct PersonReference: Codable, Sendable, Hashable {
    let id: String
    let name: String
}

nonisolated struct Person: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let role: String?
    let email: String?
    /// "active", "leaving", or "left".
    let status: String?
    let leaveDate: String?
    let successorId: String?
    let handoffArticleId: String?
}

nonisolated struct ChecklistStep: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let text: String
    var done: Bool
    let doneAt: String?
    let doneBy: PersonReference?
    let note: String?

    var doneDate: Date? { OrgFlowDates.parse(doneAt) }
}

nonisolated struct ChecklistRun: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let articleId: String?
    let title: String
    let assigneeId: String?
    let dueAt: String?
    let startedBy: PersonReference?
    let startedAt: String?
    /// "active" or "completed".
    var status: String
    var completedAt: String?
    var steps: [ChecklistStep]

    var isCompleted: Bool { status == "completed" }
    var completedCount: Int { steps.filter(\.done).count }
    var startedDate: Date? { OrgFlowDates.parse(startedAt) }
    var completedDate: Date? { OrgFlowDates.parse(completedAt) }
}

nonisolated struct CandidateEvidence: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let title: String
    let provider: String?
    let url: String?
    let from: String?
    let updatedAt: String?
}

/// A recurring workflow the backend found in indexed email and documents, offered as a playbook to draft.
nonisolated struct PlaybookCandidate: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let title: String
    let summary: String?
    let frequency: String?
    let evidence: [CandidateEvidence]
    /// "suggested", "drafted", or "dismissed".
    let status: String
    let articleId: String?
    let createdAt: String?

    var isSuggested: Bool { status == "suggested" }
}

nonisolated struct IndexedSource: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let title: String
    let provider: String?
    let url: String?
    let from: String?
    let updatedAt: String?
    let indexedAt: String?
    let chunkCount: Int?
    let preview: String?
}

nonisolated struct OrganizationMember: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let role: String?
}

/// `GET /api/org`. `inviteCode` is only present for admins.
nonisolated struct OrganizationInfo: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let role: String?
    let inviteCode: String?
    let members: [OrganizationMember]
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
    var people: [Person]
    var runs: [ChecklistRun]
    var candidates: [PlaybookCandidate]
    var sources: [IndexedSource]

    private enum CodingKeys: String, CodingKey { case categories, articles, files, events, people, runs, candidates, sources }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        categories = try container.decode([WorkspaceCategory].self, forKey: .categories)
        articles = try container.decode([Article].self, forKey: .articles)
        files = try container.decode([WorkspaceFile].self, forKey: .files)
        events = try container.decode([WorkspaceEvent].self, forKey: .events)
        people = try container.decodeIfPresent([Person].self, forKey: .people) ?? []
        runs = try container.decodeIfPresent([ChecklistRun].self, forKey: .runs) ?? []
        candidates = try container.decodeIfPresent([PlaybookCandidate].self, forKey: .candidates) ?? []
        sources = try container.decodeIfPresent([IndexedSource].self, forKey: .sources) ?? []
    }

    var suggestedCandidates: [PlaybookCandidate] { candidates.filter(\.isSuggested) }
    func person(_ id: String?) -> Person? { id.flatMap { id in people.first { $0.id == id } } }

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
