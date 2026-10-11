import Foundation

nonisolated struct Citation: Sendable, Hashable, Identifiable, Codable {
    let id: String
    let title: String
    let snippet: String?
    let url: URL?
}

nonisolated enum AgentEvent: Sendable {
    case delta(String)
    case source(Citation)
    case done
}

nonisolated struct ConversationTurn: Sendable, Encodable {
    enum Role: String, Sendable, Encodable { case user, assistant }
    let role: Role
    let text: String
}

/// Backend abstraction for grounded answers. Implementations stream events as they arrive.
nonisolated protocol KnowledgeAgentProviding: Sendable {
    func ask(_ question: String, conversationID: UUID, history: [ConversationTurn]) -> AsyncThrowingStream<AgentEvent, Error>
}
