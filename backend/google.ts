import { randomBytes, createHash } from "node:crypto";

type Item = Record<string, any>;
export type GoogleDependencies = {
  upsertFile: (file: Item) => Promise<void>;
};
type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};
type PendingConnection = {
  verifier: string;
  expiresAt: number;
  returnTo?: string;
};
const scopes = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const configured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const cookie = (request: Request, name: string) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
const secureCookie = () =>
  (process.env.GOOGLE_REDIRECT_URI || "").startsWith("https:")
    ? "; Secure"
    : "";
const expiryCookie = () =>
  "Path=/; HttpOnly; SameSite=Lax; Max-Age=28800" + secureCookie();
const base64 = (data: string) =>
  Buffer.from(data, "base64url").toString("utf8");
function messageText(payload: Item): string {
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return base64(payload.body.data).slice(0, 12000);
  return (payload.parts || [])
    .map(messageText)
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
}

export function createGoogleHandler(dependencies: GoogleDependencies) {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, PendingConnection>();
  const getSession = (request: Request) =>
    sessions.get(cookie(request, "orgflow_google") || "");
  async function access(request: Request) {
    const session = getSession(request);
    if (!session) throw new Error("Connect Google first.");
    if (session.expiresAt < Date.now() + 30000) {
      if (!session.refreshToken)
        throw new Error("Google session expired. Reconnect Google.");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Google session expired. Reconnect Google.");
      const data = (await response.json()) as Item;
      session.accessToken = data.access_token;
      session.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    }
    return session.accessToken;
  }
  async function google(request: Request, url: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await access(request)}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Google denied access. Check consent and selected scopes."
          : "Google request failed. Reconnect or retry.",
      );
    return response;
  }
  async function driveFiles(request: Request) {
    const files: Item[] = [];
    let pageToken = "";
    for (let i = 0; i < 10; i++) {
      const query = new URLSearchParams({
        pageSize: "100",
        q: "trashed = false",
        fields:
          "nextPageToken,files(id,name,mimeType,parents,webViewLink,modifiedTime)",
        ...(pageToken ? { pageToken } : {}),
      });
      const result = (await (
        await google(
          request,
          `https://www.googleapis.com/drive/v3/files?${query}`,
        )
      ).json()) as Item;
      files.push(...(result.files || []));
      pageToken = result.nextPageToken || "";
      if (!pageToken) break;
    }
    return { files, limited: Boolean(pageToken) };
  }
  function returnTo(request: Request, value: string | null): string | undefined {
    if (!value?.startsWith("/") || value.startsWith("//")) return undefined;
    const current = new URL(request.url);
    const candidate = new URL(value, current);
    if (candidate.origin !== current.origin) return undefined;
    return candidate.pathname + candidate.search + candidate.hash;
  }
  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (
      !path.startsWith("/auth/google/") &&
      !path.startsWith("/api/integrations/google") &&
      !path.startsWith("/api/sources/google")
    )
      return null;
    try {
      if (path === "/api/integrations/google" && request.method === "GET")
        return json({
          configured: configured(),
          connected: Boolean(getSession(request)),
          providers: ["Google Drive", "Gmail"],
          sessionStorage: "memory",
          calendarConnected: false,
        });
      if (path === "/auth/google/start" && request.method === "GET") {
        if (!configured())
          return json(
            {
              error:
                "Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.",
            },
            503,
          );
        for (const [key, value] of pending)
          if (value.expiresAt < Date.now()) pending.delete(key);
        if (pending.size > 100)
          return json(
            { error: "Too many pending connections. Try again shortly." },
            429,
          );
        const state = randomBytes(32).toString("hex");
        const verifier = randomBytes(48).toString("base64url");
        pending.set(state, {
          verifier,
          expiresAt: Date.now() + 600000,
          returnTo: returnTo(request, url.searchParams.get("returnTo")),
        });
        const query = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          redirect_uri:
            process.env.GOOGLE_REDIRECT_URI ||
            "http://localhost:3003/auth/google/callback",
          response_type: "code",
          scope: scopes.join(" "),
          access_type: "offline",
          prompt: "consent",
          state,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
        });
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
            "Set-Cookie": `orgflow_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureCookie()}`,
          },
        });
      }
      if (path === "/auth/google/callback" && request.method === "GET") {
        const state = url.searchParams.get("state") || "";
        const entry = pending.get(state);
        if (
          !entry ||
          entry.expiresAt < Date.now() ||
          cookie(request, "orgflow_oauth_state") !== state
        )
          return json(
            {
              error:
                "Invalid or expired connection state. Start Google connection again.",
            },
            400,
          );
        pending.delete(state);
        if (url.searchParams.has("error"))
          return json(
            {
              error:
                "Google connection was declined. You can retry from Connections.",
            },
            400,
          );
        const code = url.searchParams.get("code");
        if (!code) return json({ error: "Missing authorization code." }, 400);
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri:
              process.env.GOOGLE_REDIRECT_URI ||
              "http://localhost:3003/auth/google/callback",
            grant_type: "authorization_code",
            code_verifier: entry.verifier,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          return json(
            {
              error:
                "Google token exchange failed. Check the callback URI and reconnect.",
            },
            502,
          );
        const data = (await response.json()) as Item;
        if (typeof data.access_token !== "string")
          return json({ error: "Google did not return an access token." }, 502);
        const sessionId = randomBytes(32).toString("hex");
        if (sessions.size >= 100)
          sessions.delete(sessions.keys().next().value!);
        sessions.set(sessionId, {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
        });
        const headers = new Headers({
          Location:
            entry.returnTo ||
            process.env.FRONTEND_REDIRECT_URL ||
            process.env.FRONTEND_ORIGIN ||
            "http://localhost:3002/",
        });
        headers.append(
          "Set-Cookie",
          `orgflow_google=${sessionId}; ${expiryCookie()}`,
        );
        headers.append(
          "Set-Cookie",
          "orgflow_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        );
        return new Response(null, { status: 302, headers });
      }
      if (
        path === "/api/integrations/google/disconnect" &&
        request.method === "POST"
      ) {
        const id = cookie(request, "orgflow_google") || "";
        sessions.delete(id);
        return new Response(JSON.stringify({ connected: false }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie":
              "orgflow_google=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
          },
        });
      }
      if (
        path === "/api/integrations/google/sync" &&
        request.method === "POST"
      ) {
        const { files, limited } = await driveFiles(request);
        const byId = new Map(files.map((f) => [f.id, f]));
        function filePath(file: Item, visited = new Set<string>()): string {
          if (visited.has(file.id) || visited.size > 30) return file.name;
          visited.add(file.id);
          const parent = byId.get(file.parents?.[0]);
          return parent
            ? `${filePath(parent, visited)}/${file.name}`
            : file.name;
        }
        let count = 0;
        for (const file of files) {
          if (file.mimeType === "application/vnd.google-apps.folder") continue;
          const parent = byId.get(file.parents?.[0]);
          const originalPath = parent ? "/" + filePath(parent) : "/";
          await dependencies.upsertFile({
            id: `google-${file.id}`,
            name: file.name,
            provider: "Google Drive",
            providerId: file.id,
            originalPath,
            orgflowPath: `/Google Drive${originalPath}`,
            url:
              file.webViewLink ||
              `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
            updatedAt: file.modifiedTime || new Date().toISOString(),
            type: file.mimeType,
            synthetic: false,
          });
          count++;
        }
        return json({
          indexed: count,
          limited,
          notice:
            "Indexed metadata only. Original files remain in Google Drive.",
        });
      }
      if (path === "/api/sources/google" && request.method === "GET") {
        const provider = url.searchParams.get("provider") || "drive";
        if (provider === "drive") {
          const { files, limited } = await driveFiles(request);
          return json({
            sources: files
              .filter(
                (f) => f.mimeType !== "application/vnd.google-apps.folder",
              )
              .map((f) => ({
                id: f.id,
                title: f.name,
                url: f.webViewLink,
                provider: "drive",
                mimeType: f.mimeType,
              })),
            limited,
          });
        }
        if (provider !== "gmail")
          return json({ error: "Provider must be drive or gmail." }, 400);
        const query = new URLSearchParams({
          maxResults: "20",
          q: (url.searchParams.get("q") || "").slice(0, 300),
        });
        const data = (await (
          await google(
            request,
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`,
          )
        ).json()) as Item;
        const messages: Item[] = [];
        for (const item of data.messages || []) {
          const result = (await (
            await google(
              request,
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=Subject`,
            )
          ).json()) as Item;
          messages.push({
            id: item.id,
            title:
              result.payload?.headers?.find(
                (h: Item) => h.name.toLowerCase() === "subject",
              )?.value || "Untitled email",
            provider: "gmail",
            url: `https://mail.google.com/mail/u/0/#all/${item.id}`,
          });
        }
        return json({
          sources: messages,
          limited: Boolean(data.nextPageToken),
        });
      }
      const match = path.match(
        /^\/api\/sources\/google\/(drive|gmail)\/([^/]+)$/,
      );
      if (match && request.method === "GET") {
        const id = decodeURIComponent(match[2]!);
        if (!/^[\w-]{1,200}$/.test(id))
          return json({ error: "Invalid source ID." }, 400);
        if (match[1] === "gmail") {
          const data = (await (
            await google(
              request,
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
            )
          ).json()) as Item;
          const title =
            data.payload?.headers?.find(
              (h: Item) => h.name.toLowerCase() === "subject",
            )?.value || "Untitled email";
          const text = messageText(data.payload || {});
          if (!text)
            return json(
              { error: "This email has no supported plain-text body." },
              422,
            );
          return json({
            id: `gmail-${id}`,
            title,
            text,
            url: `https://mail.google.com/mail/u/0/#all/${id}`,
          });
        }
        const data = (await (
          await google(
            request,
            `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,webViewLink`,
          )
        ).json()) as Item;
        const googleDoc =
          data.mimeType === "application/vnd.google-apps.document";
        if (
          !googleDoc &&
          !["text/plain", "text/markdown", "text/csv"].includes(data.mimeType)
        )
          return json(
            {
              error:
                "Capture currently supports Google Docs and plain-text/Markdown/CSV files. Use a text upload for other formats.",
            },
            422,
          );
        const source = await google(
          request,
          googleDoc
            ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        );
        const reader = source.body?.getReader();
        let text = "";
        if (reader) {
          const decoder = new TextDecoder();
          try {
            while (text.length < 12000) {
              const part = await reader.read();
              if (part.done) break;
              text += decoder.decode(part.value, { stream: true });
            }
          } finally {
            await reader.cancel();
          }
        }
        return json({
          id: `drive-${id}`,
          title: data.name,
          text: text.slice(0, 12000),
          url: data.webViewLink,
        });
      }
      return json({ error: "Google endpoint not found." }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error &&
            /^(Connect Google|Google |Capture )/.test(error.message)
              ? error.message
              : "Google connection request failed. Please retry.",
        },
        getSession(request) ? 502 : 401,
      );
    }
  };
}
