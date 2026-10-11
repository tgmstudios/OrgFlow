import Foundation
import FoundationModels

/// Writes the landing suggestions on device with Apple's Foundation Models, grounded in the titles
/// of what the workspace actually holds, so every capsule is a question OrgFlow can answer.
/// Workspace content never leaves the device for this; without the model it falls back to the titles.
nonisolated enum SuggestionGenerator {
    @Generable
    struct Ideas {
        @Guide(description: "Three short questions a staff member would ask, each answerable from one of the listed articles", .count(3))
        var ideas: [Idea]
    }

    @Generable
    struct Idea {
        @Guide(description: "A natural question or request in plain words, at most 6 words, no ending punctuation")
        var text: String
        var topic: Topic
    }

    @Generable
    enum Topic {
        case people, process, donors, handoff, documents, schedule, policy

        var symbol: String {
            switch self {
            case .people: "person.badge.plus"
            case .process: "arrow.triangle.branch"
            case .donors: "heart.text.square"
            case .handoff: "arrow.left.arrow.right"
            case .documents: "doc.text.magnifyingglass"
            case .schedule: "calendar"
            case .policy: "checkmark.seal"
            }
        }
    }

    static func suggestions(for workspace: WorkspaceSummary) async -> [Suggestion]? {
        let articles = Array(workspace.articles.prefix(16))
        guard !articles.isEmpty else { return nil }
        if case .available = SystemLanguageModel.default.availability,
           let generated = try? await generate(articles: articles, categories: workspace.categories) {
            return generated
        }
        return articles.prefix(3).map { Suggestion(symbol: "doc.text.magnifyingglass", text: $0) }
    }

    private static func generate(articles: [String], categories: [String]) async throws -> [Suggestion] {
        let session = LanguageModelSession(instructions: """
            You write suggestion chips for an organization's knowledge assistant. Each chip is a short, \
            friendly question a staff member would tap. Only suggest questions the listed articles answer. \
            Do not invent names, numbers or facts. Vary the topics.
            """)
        let prompt = """
            Categories: \(categories.joined(separator: "; "))
            Articles: \(articles.joined(separator: "; "))
            """
        let response = try await session.respond(to: prompt, generating: Ideas.self, options: GenerationOptions(temperature: 0.6))
        let ideas = response.content.ideas
            .map { (text: $0.text.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters)), topic: $0.topic) }
            .filter { !$0.text.isEmpty && $0.text.count <= 48 }
        guard ideas.count >= 2 else { throw CancellationError() }
        return ideas.map { Suggestion(symbol: $0.topic.symbol, text: $0.text) }
    }
}
