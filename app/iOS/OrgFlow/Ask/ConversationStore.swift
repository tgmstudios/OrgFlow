import Foundation

/// A finished conversation kept for the history menu.
struct SavedConversation: Codable, Identifiable, Equatable {
    let id: UUID
    var updatedAt: Date
    var mode: AskMode
    var entries: [ConversationEntry]

    var title: String { entries.first?.prompt ?? "Conversation" }
}

/// Recent conversations on this device, newest first, in Application Support.
enum ConversationStore {
    private static let limit = 20

    private static var fileURL: URL {
        URL.applicationSupportDirectory.appending(path: "conversations.json")
    }

    static func load() -> [SavedConversation] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([SavedConversation].self, from: data)) ?? []
    }

    static func save(_ conversations: [SavedConversation]) {
        guard let data = try? JSONEncoder().encode(Array(conversations.prefix(limit))) else { return }
        let url = fileURL
        Task.detached(priority: .utility) {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }
}
