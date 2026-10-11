import Foundation

nonisolated struct OrgFlowUser: Sendable, Decodable, Equatable {
    let id: String
    let email: String
    let name: String
    /// Organization the account belongs to ("default" is the shared demo workspace).
    let orgId: String?
    /// "admin" or "member".
    let role: String?
}

/// Workspace content used to ground on-device suggestions. Only titles are read.
nonisolated struct WorkspaceSummary: Sendable {
    var categories: [String]
    var articles: [String]
    var files: [String]
}

nonisolated enum OrgFlowAPIError: LocalizedError, Equatable {
    case signInRequired
    case unavailable
    case server(status: Int, message: String)
    /// The account's plan doesn't include this action (billing entitlement denied).
    case planRequired(message: String)

    var errorDescription: String? {
        switch self {
        case .signInRequired: "Sign in to OrgFlow to ask your organization's knowledge."
        case .unavailable: "Couldn't reach OrgFlow. Check your connection and try again."
        case .server(_, let message): message
        case .planRequired(let message): message
        }
    }
}

/// HTTP client for the OrgFlow backend (`backend/app.ts`). Authentication is the backend's
/// `orgflow_session` cookie, kept by the shared cookie storage across launches.
nonisolated struct OrgFlowAPI: Sendable {
    let baseURL: URL
    let session: URLSession

    static let shared: OrgFlowAPI = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "OrgFlowBaseURL") as? String
        let url = configured.flatMap { URL(string: $0) } ?? URL(string: "https://orgflow.dev")!
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = .shared
        configuration.httpShouldSetCookies = true
        configuration.httpCookieAcceptPolicy = .always
        return OrgFlowAPI(baseURL: url, session: URLSession(configuration: configuration))
    }()

    // MARK: Requests

    private struct ErrorBody: Decodable {
        let error: String?
        let message: String?
        let decision: String?
    }

    func send<Body: Encodable>(_ path: String, method: String = "POST", body: Body?, timeout: TimeInterval = 30) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw OrgFlowAPIError.unavailable
        }
        guard let http = response as? HTTPURLResponse else { throw OrgFlowAPIError.unavailable }
        if http.statusCode == 401 { throw OrgFlowAPIError.signInRequired }
        guard (200..<300).contains(http.statusCode) else {
            let body = try? JSONDecoder().decode(ErrorBody.self, from: data)
            if http.statusCode == 403, body?.decision == "DENY" {
                throw OrgFlowAPIError.planRequired(message: body?.message ?? "Your plan does not include this action. Choose a plan to continue.")
            }
            let message = body?.error ?? body?.message ?? "OrgFlow returned an error (\(http.statusCode))."
            throw OrgFlowAPIError.server(status: http.statusCode, message: message)
        }
        return data
    }

    func get(_ path: String) async throws -> Data {
        try await send(path, method: "GET", body: Optional<String>.none)
    }

    // MARK: Accounts

    private struct UserEnvelope: Decodable { let user: OrgFlowUser? }

    func currentUser() async throws -> OrgFlowUser? {
        try JSONDecoder().decode(UserEnvelope.self, from: await get("api/auth/me")).user
    }

    func signIn(email: String, password: String) async throws -> OrgFlowUser {
        struct Body: Encodable { let email, password: String }
        return try decodeUser(await send("api/auth/login", body: Body(email: email, password: password)))
    }

    /// With neither `organization` nor `inviteCode` the account joins the shared demo workspace.
    func signUp(name: String, email: String, password: String, organization: String? = nil, inviteCode: String? = nil) async throws -> OrgFlowUser {
        struct Body: Encodable { let name, email, password: String; let organization, inviteCode: String? }
        let body = Body(name: name, email: email, password: password, organization: organization, inviteCode: inviteCode)
        return try decodeUser(await send("api/auth/signup", body: body))
    }

    func organization() async throws -> OrganizationInfo {
        try JSONDecoder().decode(OrganizationInfo.self, from: await get("api/org"))
    }

    func signOut() async {
        struct Empty: Encodable {}
        _ = try? await send("api/auth/logout", body: Empty())
    }

    private func decodeUser(_ data: Data) throws -> OrgFlowUser {
        guard let user = try JSONDecoder().decode(UserEnvelope.self, from: data).user else { throw OrgFlowAPIError.unavailable }
        return user
    }

    // MARK: Workspace

    func workspace() async throws -> Workspace {
        try JSONDecoder().decode(Workspace.self, from: await get("api/bootstrap"))
    }

    func workspaceSummary() async throws -> WorkspaceSummary {
        try await workspace().summary
    }

    /// Saves a new draft article. Drafts are never visible to Ask until a person publishes them.
    func createArticle(title: String, categoryID: String, content: RichTextNode) async throws -> Article {
        struct Body: Encodable { let title: String; let categoryId: String; let content: RichTextNode }
        return try JSONDecoder().decode(Article.self, from: await send("api/articles", body: Body(title: title, categoryId: categoryID, content: content)))
    }

    /// Edits a draft (or turns a published article back into a draft with pending changes).
    func updateArticle(id: String, title: String? = nil, content: RichTextNode? = nil, categoryID: String? = nil) async throws -> Article {
        struct Body: Encodable { let title: String?; let content: RichTextNode?; let categoryId: String? }
        return try JSONDecoder().decode(Article.self, from: await send("api/articles/\(id)", method: "PATCH", body: Body(title: title, content: content, categoryId: categoryID)))
    }

    /// Human approval: publishes the current draft so Ask can use it.
    func publishArticle(id: String) async throws -> Article {
        struct Empty: Encodable {}
        return try JSONDecoder().decode(Article.self, from: await send("api/articles/\(id)/publish", body: Empty()))
    }

    /// Asks the backend agent to write (and save) a draft article from an interview or narration.
    /// `articleID` revises an existing article's draft instead of creating a new one.
    func draftArticle(messages: [(role: String, content: String)], articleID: String? = nil) async throws -> (message: String, draft: Article) {
        struct Message: Encodable { let role: String; let content: String }
        struct Body: Encodable { let mode = "draft"; let messages: [Message]; let articleId: String? }
        struct Response: Decodable { let message: String; let draft: Article }
        let body = Body(messages: messages.map { Message(role: $0.role, content: String($0.content.prefix(6000))) }, articleId: articleID)
        let response = try JSONDecoder().decode(Response.self, from: await send("api/agent", body: body, timeout: 90))
        return (response.message, response.draft)
    }

    /// Approval renewal: the owner confirms a published playbook is still accurate.
    func markReviewed(articleID: String) async throws -> Article {
        struct Empty: Encodable {}
        return try JSONDecoder().decode(Article.self, from: await send("api/articles/\(articleID)/review", body: Empty()))
    }

    // MARK: Candidates

    /// Drafts a playbook (saved as a draft article) from a suggested candidate's evidence.
    func draftCandidate(id: String) async throws -> (message: String, draft: Article) {
        struct Response: Decodable { let message: String; let draft: Article }
        struct Empty: Encodable {}
        let response = try JSONDecoder().decode(Response.self, from: await send("api/candidates/\(id)/draft", body: Empty(), timeout: 90))
        return (response.message, response.draft)
    }

    func dismissCandidate(id: String) async throws {
        struct Empty: Encodable {}
        _ = try await send("api/candidates/\(id)/dismiss", body: Empty())
    }

    // MARK: Checklist runs

    func startRun(articleID: String, title: String? = nil, assigneeID: String? = nil) async throws -> ChecklistRun {
        struct Body: Encodable { let title: String?; let assigneeId: String? }
        return try JSONDecoder().decode(ChecklistRun.self, from: await send("api/articles/\(articleID)/runs", body: Body(title: title, assigneeId: assigneeID)))
    }

    func setStep(runID: String, stepID: String, done: Bool) async throws -> ChecklistRun {
        struct Body: Encodable { let done: Bool }
        return try JSONDecoder().decode(ChecklistRun.self, from: await send("api/runs/\(runID)/steps/\(stepID)", method: "PATCH", body: Body(done: done)))
    }

    func deleteRun(id: String) async throws {
        _ = try await send("api/runs/\(id)", method: "DELETE", body: Optional<String>.none)
    }

    // MARK: Ownership and Transfer

    /// `{"ownerId": …}` with an explicit `null` for Unassigned.
    private struct OwnerBody: Encodable {
        let ownerId: String?
        private enum CodingKeys: String, CodingKey { case ownerId }
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(ownerId, forKey: .ownerId)
        }
    }

    /// Records who owns a playbook (`nil` for Unassigned). The backend returns any published
    /// playbook to draft on every PATCH, owner changes included, so it needs re-approval.
    func setArticleOwner(id: String, ownerID: String?) async throws -> Article {
        try JSONDecoder().decode(Article.self, from: await send("api/articles/\(id)", method: "PATCH", body: OwnerBody(ownerId: ownerID)))
    }

    /// Records who owns an indexed source (`nil` for Unassigned).
    func setSourceOwner(id: String, ownerID: String?) async throws -> IndexedSource {
        try JSONDecoder().decode(IndexedSource.self, from: await send("api/sources/\(id)", method: "PATCH", body: OwnerBody(ownerId: ownerID)))
    }

    func knowledgeHealth() async throws -> KnowledgeHealth {
        try JSONDecoder().decode(KnowledgeHealth.self, from: await get("api/insights/health"))
    }

    /// A gap-driven question plan for a live voice interview with this person.
    func interviewPlan(personID: String) async throws -> InterviewPlan {
        struct Empty: Encodable {}
        return try JSONDecoder().decode(InterviewPlan.self, from: await send("api/people/\(personID)/interview", body: Empty()))
    }

    /// Facts-only handoff guide built from OrgFlow's records (no AI). Saved as a draft for review;
    /// regenerating replaces the previous one. An active person is marked as leaving.
    func handoffOutline(personID: String) async throws -> (draft: Article, person: Person) {
        struct Body: Encodable { let mode = "outline" }
        struct Response: Decodable { let draft: Article; let person: Person }
        let response = try JSONDecoder().decode(Response.self, from: await send("api/people/\(personID)/handoff", body: Body()))
        return (response.draft, response.person)
    }

    // MARK: Voice

    /// Short-lived WebRTC token for OrgFlow's private ElevenLabs interview agent.
    func voiceSessionToken() async throws -> String {
        struct Token: Decodable { let conversationToken: String }
        return try JSONDecoder().decode(Token.self, from: await get("api/voice/session-token")).conversationToken
    }

    // MARK: Billing

    /// The hosted pricing page minted at sign-in (cookie `mai_pricing_url`), else the web app.
    var pricingURL: URL {
        let cookie = session.configuration.httpCookieStorage?.cookies(for: baseURL)?.first { $0.name == "mai_pricing_url" }
        if let value = cookie?.value.removingPercentEncoding, let url = URL(string: value), url.scheme == "https" { return url }
        return baseURL.appending(path: "a/")
    }
}
