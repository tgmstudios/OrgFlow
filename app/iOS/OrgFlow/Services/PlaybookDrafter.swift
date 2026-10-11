import Foundation
import FoundationModels

/// Turns spoken narration into a draft article for human approval: a process playbook (Capture) or a
/// role handoff and onboarding guide (Handoff). Drafts are saved as drafts; nothing is published here.
///
/// By default the OrgFlow backend writes the draft (Luminal, `/api/agent` in `draft` mode), which can
/// cite the workspace's existing knowledge. With "Draft on this iPhone" on, Apple's on-device
/// Foundation Model structures the narration instead and only the finished draft is uploaded.
nonisolated enum PlaybookDrafter {
    nonisolated struct Result: Sendable {
        let message: String
        let article: Article
        let onDevice: Bool
    }

    /// One turn of a capture session. The first user turn is the framed narration; later user turns add
    /// detail; assistant turns are the drafter's replies.
    nonisolated struct Turn: Sendable, Codable, Equatable {
        let role: String
        let content: String
    }

    private static let onDeviceKey = "orgflow.draftOnDevice"

    /// User setting, off by default.
    static var prefersOnDevice: Bool {
        get { UserDefaults.standard.bool(forKey: onDeviceKey) }
        set { UserDefaults.standard.set(newValue, forKey: onDeviceKey) }
    }

    static var isOnDeviceAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability { true } else { false }
    }

    /// Frames a narration for the drafter. `isFirst` is false for follow-up detail on the same draft.
    static func frame(_ narration: String, mode: AskMode, isFirst: Bool, interview: Bool = false) -> String {
        if interview {
            let kind = mode == .handoff ? "a role handoff guide (with a first-30-days onboarding checklist for my successor)" : "a step-by-step process playbook (SOP)"
            return """
                \(isFirst ? "Draft" : "Revise the same draft into") \(kind) from this reviewed voice interview between \
                OneFlow (the interviewer) and me. Facts come only from what I said; the interviewer's questions are context. \
                Preserve clear facts, label uncertain details for review, and add open questions where information is missing.

                \(narration)
                """
        }
        guard isFirst else {
            return "More detail to add to the same draft (dictated by voice; ignore filler words and fix obvious transcription errors):\n\n\(narration)"
        }
        let request = switch mode {
        case .handoff:
            """
            I'm handing off my role. Draft a role handoff guide from what I describe below: what the role owns, \
            recurring tasks and when they happen, key relationships and who to contact (roles, not private details), \
            where documents and tools live, work in progress, and a first-30-days onboarding checklist for my successor.
            """
        default:
            """
            Draft a process playbook (a step-by-step SOP) from how I describe this work below: its purpose, when it \
            happens, who is involved, the steps in order, and what good looks like.
            """
        }
        return """
            \(request) It was dictated by voice, so ignore filler words and fix obvious transcription errors. \
            Keep my specifics, don't invent facts, and list anything missing as review questions.

            \(narration)
            """
    }

    static func draft(turns: [Turn], mode: AskMode, articleID: String?, api: OrgFlowAPI = .shared) async throws -> Result {
        if prefersOnDevice, isOnDeviceAvailable {
            return try await draftOnDevice(turns: turns, mode: mode, articleID: articleID, api: api)
        }
        let response = try await api.draftArticle(messages: turns.suffix(24).map { ($0.role, $0.content) }, articleID: articleID)
        return Result(message: response.message, article: response.draft, onDevice: false)
    }

    // MARK: - On device

    @Generable
    struct Draft {
        @Guide(description: "A short, specific title for the article, e.g. 'Donor thank-you process' or 'Development coordinator handoff'")
        var title: String
        @Guide(description: "The best matching category name from the list given, copied exactly")
        var category: String
        @Guide(description: "One or two sentences to the person who dictated this: what was drafted and what still needs their input")
        var summary: String
        @Guide(description: "The article's sections in reading order", .count(3...8))
        var sections: [Section]
    }

    @Generable
    struct Section {
        var heading: String
        @Guide(description: "Short paragraphs; empty when the section is a list of steps")
        var paragraphs: [String]
        @Guide(description: "Ordered steps or checklist items; empty when the section is prose")
        var steps: [String]
    }

    private static func draftOnDevice(turns: [Turn], mode: AskMode, articleID: String?, api: OrgFlowAPI) async throws -> Result {
        let workspace = try await api.workspace()
        let existing = articleID.flatMap { workspace.article($0) }
        let structure = switch mode {
        case .handoff:
            "Sections: Role overview, Recurring responsibilities (with timing), Key relationships, Where things live, Work in progress, First 30 days (checklist), Review questions."
        default:
            "Sections: Purpose, When this happens, Who is involved, Steps (in order), Review questions."
        }
        let session = LanguageModelSession(instructions: """
            You turn a staff member's spoken narration into a clear draft article for a nonprofit's knowledge base. \
            Use only what they said: never invent names, amounts, dates or facts. Write plainly and concisely. \
            Put gaps, ambiguities and anything to confirm in a final 'Review questions' section. \(structure)
            """)
        let narration = turns.filter { $0.role == "user" }.map(\.content).joined(separator: "\n\n")
        var prompt = "Categories: \(workspace.categories.map(\.name).joined(separator: "; "))\n\n"
        if let existing, let content = existing.content {
            prompt += "Current draft, to revise with the new detail:\n\(existing.title)\n\(String(content.plainText.prefix(4000)))\n\n"
        }
        prompt += String(narration.suffix(8000))

        let draft = try await session.respond(to: prompt, generating: Draft.self).content
        let content = document(for: draft)
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let article: Article
        if let existing {
            article = try await api.updateArticle(id: existing.id, title: title, content: content)
        } else {
            let category = matchCategory(draft.category, mode: mode, in: workspace.categories)
            guard let category else { throw OrgFlowAPIError.server(status: 0, message: "Create a category on orgflow.dev before capturing.") }
            article = try await api.createArticle(title: title, categoryID: category.id, content: content)
        }
        return Result(message: draft.summary, article: article, onDevice: true)
    }

    private static func document(for draft: Draft) -> RichTextNode {
        var nodes: [RichTextNode] = []
        for section in draft.sections {
            nodes.append(.heading(section.heading))
            nodes += section.paragraphs.filter { !$0.isEmpty }.map(RichTextNode.paragraph)
            let steps = section.steps.filter { !$0.isEmpty }
            if !steps.isEmpty { nodes.append(.orderedList(steps)) }
        }
        nodes.append(.paragraph("Drafted on device from a spoken narration. Review before publishing."))
        return .doc(nodes)
    }

    private static func matchCategory(_ name: String, mode: AskMode, in categories: [WorkspaceCategory]) -> WorkspaceCategory? {
        let wanted = name.lowercased().trimmingCharacters(in: .whitespaces)
        if let exact = categories.first(where: { $0.name.lowercased() == wanted }) { return exact }
        if let partial = categories.first(where: { $0.name.lowercased().contains(wanted) || wanted.contains($0.name.lowercased()) }) { return partial }
        if mode == .handoff, let people = categories.first(where: { $0.name.lowercased().contains("onboard") || $0.name.lowercased().contains("people") }) {
            return people
        }
        return categories.first
    }
}
