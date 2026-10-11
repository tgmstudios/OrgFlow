import Foundation

nonisolated struct OrgFlowUser: Sendable, Decodable, Equatable {
    let id: String
    let email: String
    let name: String
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

    var errorDescription: String? {
        switch self {
        case .signInRequired: "Sign in to OrgFlow to ask your organization's knowledge."
        case .unavailable: "Couldn't reach OrgFlow. Check your connection and try again."
        case .server(_, let message): message
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

    private struct ErrorBody: Decodable { let error: String }

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
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
                ?? "OrgFlow returned an error (\(http.statusCode))."
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

    func signUp(name: String, email: String, password: String) async throws -> OrgFlowUser {
        struct Body: Encodable { let name, email, password: String }
        return try decodeUser(await send("api/auth/signup", body: Body(name: name, email: email, password: password)))
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

    func workspaceSummary() async throws -> WorkspaceSummary {
        struct Named: Decodable {
            let name: String?
            let title: String?
            let publishedTitle: String?
        }
        struct Bootstrap: Decodable {
            let categories: [Named]
            let articles: [Named]
            let files: [Named]
        }
        let bootstrap = try JSONDecoder().decode(Bootstrap.self, from: await get("api/bootstrap"))
        return WorkspaceSummary(
            categories: bootstrap.categories.compactMap(\.name),
            articles: bootstrap.articles.compactMap { $0.publishedTitle ?? $0.title },
            files: bootstrap.files.compactMap { $0.name ?? $0.title }
        )
    }
}
