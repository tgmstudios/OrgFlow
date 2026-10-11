import Foundation

/// Grounded answers from the OrgFlow backend's Luminal-backed agent.
///
/// Request: `POST {base}/api/agent` with `{"mode": "ask", "messages": [{"role": "user" | "assistant", "content": String}]}`
/// (1–24 messages, each ≤ 6,000 characters; requires a signed-in session cookie).
/// Response: `{"message": String, "sources": [{"id", "title", "status", "sourceType", "url"?, "provider"?, "orgflowPath"?}]}`.
/// The answer cites sources inline as `[source id]`; those markers become citation chips instead.
/// The backend returns the whole answer at once, so it is revealed progressively on device.
nonisolated struct RemoteKnowledgeAgent: KnowledgeAgentProviding {
    let api: OrgFlowAPI

    init(api: OrgFlowAPI = .shared) {
        self.api = api
    }

    private struct Message: Encodable {
        let role: String
        let content: String
    }

    private struct Request: Encodable {
        let mode = "ask"
        let messages: [Message]
    }

    private struct Source: Decodable {
        let id: String
        let title: String
        let status: String?
        let sourceType: String?
        let url: String?
        let provider: String?
        let orgflowPath: String?
        let synthetic: Bool?
        let selectedDraft: Bool?
    }

    private struct Response: Decodable {
        let message: String
        let sources: [Source]?
    }

    func ask(_ question: String, conversationID: UUID, history: [ConversationTurn]) -> AsyncThrowingStream<AgentEvent, Error> {
        let api = self.api
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let turns = history
                        .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                        .map { Message(role: $0.role.rawValue, content: String($0.text.prefix(6000))) }
                    let messages = Array(turns.suffix(23)) + [Message(role: "user", content: String(question.prefix(6000)))]
                    let data = try await api.send("api/agent", body: Request(messages: messages), timeout: 60)
                    let response = try JSONDecoder().decode(Response.self, from: data)
                    let sources = response.sources ?? []

                    for source in sources {
                        continuation.yield(.source(Self.citation(for: source)))
                    }
                    let answer = Self.removingCitationMarkers(response.message, ids: Set(sources.map(\.id)))
                    for chunk in Self.revealChunks(answer) {
                        try Task.checkCancellation()
                        continuation.yield(.delta(chunk))
                        try await Task.sleep(for: .milliseconds(28))
                    }
                    continuation.yield(.done)
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch let error as OrgFlowAPIError {
                    continuation.finish(throwing: error)
                } catch {
                    continuation.finish(throwing: OrgFlowAPIError.server(status: 0, message: "OrgFlow sent an answer the app couldn't read."))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func citation(for source: Source) -> Citation {
        // Say what kind of evidence this is: approved knowledge, an unapproved draft, sample content, or
        // only a file's location (the agent never reads file contents).
        var labels: [String] = []
        if source.synthetic == true { labels.append("Sample") }
        switch source.sourceType {
        case "file metadata":
            labels.append("File location only")
            labels += [source.provider, source.orgflowPath].compactMap { $0?.isEmpty == false ? $0 : nil }
        default:
            if source.selectedDraft == true || source.status == "draft" {
                labels.append("Unapproved draft")
            } else if let status = source.status {
                labels.append(status == "published snapshot" ? "Approved" : status.prefix(1).uppercased() + status.dropFirst())
            }
        }
        let snippet = labels.isEmpty ? nil : labels.joined(separator: " · ")
        return Citation(id: source.id, title: source.title, snippet: snippet, url: source.url.flatMap(URL.init(string:)))
    }

    /// Drops inline `[id]` / `[id, id]` markers that name known sources; other brackets are left alone.
    private static func removingCitationMarkers(_ text: String, ids: Set<String>) -> String {
        guard !ids.isEmpty else { return text }
        let pattern = /\s?\[([^\]\n]{1,400})\]/
        return text.replacing(pattern) { match in
            let parts = match.output.1.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            return parts.allSatisfy(ids.contains) ? "" : String(match.output.0)
        }
    }

    /// Word-sized pieces (keeping whitespace and newlines) so markdown renders as it streams in.
    private static func revealChunks(_ text: String) -> [String] {
        var chunks: [String] = []
        var current = ""
        for character in text {
            current.append(character)
            if character.isWhitespace, current.count >= 3 {
                chunks.append(current)
                current = ""
            }
        }
        if !current.isEmpty { chunks.append(current) }
        return chunks
    }
}
