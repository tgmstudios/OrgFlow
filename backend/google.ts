import { randomBytes, createHash } from "node:crypto";
import type { SessionVault } from "./vault";
import { PDF_MIME, WORD_MIME, MAX_DOCUMENT_BYTES, extractDocumentText } from "./document-text";

type Item = Record<string, any>;
export type GoogleDependencies = {
  /** Encrypted persistence so connections survive restarts. Defaults to memory only. */
  vault?: SessionVault;
  upsertFile: (file: Item) => Promise<void>;
  /** Stores one indexed source's text (replacing any earlier index of it). */
  /** The OneFlow account and organization that initiated this OAuth flow. */
  getAccount?: (request: Request) => Promise<{ userId: string; orgId: string } | null>;
  saveSource?: (source: {
    id: string;
    title: string;
    provider: "Google Drive" | "Gmail";
    url: string;
    from?: string;
    updatedAt: string;
    text: string;
  }) => Promise<void>;
};

const textTypes = ["text/plain", "text/markdown", "text/csv"];
const googleDocType = "application/vnd.google-apps.document";
const indexableMimeTypes = new Set([...textTypes, googleDocType, PDF_MIME, WORD_MIME]);
/** Runs `work` over `items` with at most `limit` in flight; failed items are skipped. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++]!;
        try {
          results.push(await work(item));
        } catch {}
      }
    }),
  );
  return results;
}
type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  account?: { userId: string; orgId: string };
  googleEmail?: string;
};
type PendingConnection = {
  verifier: string;
  expiresAt: number;
  returnTo?: string;
  account?: { userId: string; orgId: string };
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
  "Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" + secureCookie();
const SESSION_MS = 30 * 86400000;
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
  const sessionId = (request: Request) => cookie(request, "orgflow_google") || "";
  /** Memory first, then the encrypted vault (after a restart). */
  async function getSession(request: Request): Promise<Session | undefined> {
    const id = sessionId(request);
    if (!id) return undefined;
    const cached = sessions.get(id);
    const stored = cached ?? await dependencies.vault?.get<Session>(id);
    if (!stored) return undefined;
    if (dependencies.getAccount) {
      const signedIn = await dependencies.getAccount(request);
      // A browser may retain orgflow_google after a OneFlow sign-out or account switch.
      // Never return a Google token to a different user or organization.
      if (!signedIn || !stored.account ||
          stored.account.userId !== signedIn.userId ||
          stored.account.orgId !== signedIn.orgId) return undefined;
    }
    if (!cached) sessions.set(id, stored);
    return stored;
  }
  async function access(request: Request) {
    const session = await getSession(request);
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
      await dependencies.vault?.put(sessionId(request), session, Date.now() + SESSION_MS);
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
  async function driveText(request: Request, file: Item, limit = 12000) {
    const source = await google(
      request,
      file.mimeType === googleDocType
        ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`
        : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    );
    const reader = source.body?.getReader();
    const binary = file.mimeType === PDF_MIME || file.mimeType === WORD_MIME;
    let text = "";
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      const decoder = new TextDecoder();
      try {
        while (binary || text.length < limit) {
          const part = await reader.read();
          if (part.done) break;
          totalBytes += part.value.length;
          if (totalBytes > MAX_DOCUMENT_BYTES)
            throw new Error("Document exceeds 4 MB extraction limit");
          if (binary) chunks.push(part.value);
          else text += decoder.decode(part.value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    if (binary) {
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return (await extractDocumentText(file.mimeType, bytes)).slice(0, limit);
    }
    return text.slice(0, limit);
  }
  async function gmailMessage(request: Request, id: string) {
    const data = (await (
      await google(
        request,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
      )
    ).json()) as Item;
    const header = (name: string) =>
      data.payload?.headers?.find((h: Item) => h.name.toLowerCase() === name)?.value as
        | string
        | undefined;
    return {
      id: data.id as string,
      title: header("subject") || "Untitled email",
      from: header("from"),
      date: header("date"),
      text: messageText(data.payload || {}),
      url: `https://mail.google.com/mail/u/0/#all/${data.id}`,
    };
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
          connected: Boolean(await getSession(request)),
          connectedEmail: (await getSession(request))?.googleEmail ?? null,
          providers: ["Google Drive", "Gmail"],
          sessionStorage: dependencies.vault ? "encrypted-database" : "memory",
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
        const account = await dependencies.getAccount?.(request);
        if (dependencies.getAccount && !account)
          return json({ error: "Sign in to OneFlow before connecting Google." }, 401);
        pending.set(state, {
          verifier,
          expiresAt: Date.now() + 600000,
          ...(account ? { account } : {}),
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
        if (dependencies.getAccount) {
          const signedIn = await dependencies.getAccount(request);
          if (!signedIn || !entry.account ||
              signedIn.userId !== entry.account.userId ||
              signedIn.orgId !== entry.account.orgId)
            return json({ error: "Your OneFlow sign-in changed during Google connection. Sign in and retry." }, 403);
        }
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
        // Gmail's profile endpoint is available through the existing gmail.readonly
        // scope. This verifies which Google identity was selected without collecting
        // any mailbox content. If Google does not return it, the connection still works.
        let googleEmail: string | undefined;
        try {
          const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
            headers: { Authorization: `Bearer ${data.access_token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (profile.ok) {
            const metadata = (await profile.json()) as { emailAddress?: unknown };
            if (typeof metadata.emailAddress === "string")
              googleEmail = metadata.emailAddress.slice(0, 254);
          }
        } catch {}
        const created: Session = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
          ...(entry.account ? { account: entry.account } : {}),
          ...(googleEmail ? { googleEmail } : {}),
        };
        sessions.set(sessionId, created);
        await dependencies.vault?.put(sessionId, created, Date.now() + SESSION_MS);
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
        const id = sessionId(request);
        const existing = await getSession(request);
        if (existing) {
          sessions.delete(id);
          if (id) await dependencies.vault?.delete(id);
        }
        const revoke = existing?.refreshToken || existing?.accessToken;
        if (revoke)
          await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            body: new URLSearchParams({ token: revoke }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => {});
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
      if (
        path === "/api/integrations/google/index" &&
        request.method === "POST"
      ) {
        // Reads the text of recent Google Docs and emails into the organization's search index so
        // Ask can answer from them and Discover can find recurring work. Requires explicit consent.
        const body = (await request.json().catch(() => ({}))) as Item;
        if (body.consent !== true)
          return json(
            { error: "Confirm consent to index Drive and Gmail text first." },
            400,
          );
        if (!dependencies.saveSource)
          return json({ error: "Indexing is not available." }, 503);
        const save = dependencies.saveSource;
        const includeDrive = body.drive !== false;
        const includeGmail = body.gmail !== false;
        let drive = 0, gmail = 0;
        if (includeDrive) {
          const { files } = await driveFiles(request);
          const readable = files
            .filter((f) => indexableMimeTypes.has(f.mimeType))
            .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))
            .slice(0, Math.min(Number(body.maxDocuments) || 40, 80));
          drive = (
            await pool(readable, 6, async (file) => {
              const text = await driveText(request, file, 30000);
              if (!text.trim()) return 0;
              await save({
                id: `drive-${file.id}`,
                title: file.name,
                provider: "Google Drive",
                url:
                  file.webViewLink ||
                  `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
                updatedAt: file.modifiedTime || new Date().toISOString(),
                text,
              });
              return 1;
            })
          ).reduce<number>((a, b) => a + b, 0);
        }
        if (includeGmail) {
          const query = new URLSearchParams({
            maxResults: String(Math.min(Number(body.maxEmails) || 60, 150)),
            q: String(
              body.gmailQuery ||
                "newer_than:365d -category:promotions -category:social -category:forums -in:chats",
            ).slice(0, 300),
          });
          const list = (await (
            await google(
              request,
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`,
            )
          ).json()) as Item;
          gmail = (
            await pool((list.messages || []) as Item[], 6, async (item) => {
              const message = await gmailMessage(request, item.id);
              if (!message.text.trim()) return 0;
              const date = message.date ? new Date(message.date) : null;
              await save({
                id: `gmail-${message.id}`,
                title: message.title,
                provider: "Gmail",
                url: message.url,
                from: message.from,
                updatedAt:
                  date && !Number.isNaN(date.getTime())
                    ? date.toISOString()
                    : new Date().toISOString(),
                text: message.text,
              });
              return 1;
            })
          ).reduce<number>((a, b) => a + b, 0);
        }
        return json({
          indexed: { drive, gmail },
          notice:
            "Indexed text stays in OneFlow and is used to answer questions and suggest playbooks. Remove it any time.",
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
          const message = await gmailMessage(request, id);
          if (!message.text)
            return json(
              { error: "This email has no supported plain-text body." },
              422,
            );
          return json({
            id: `gmail-${id}`,
            title: message.title,
            text: message.text,
            url: message.url,
          });
        }
        const data = (await (
          await google(
            request,
            `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,webViewLink`,
          )
        ).json()) as Item;
        if (!indexableMimeTypes.has(data.mimeType))
          return json(
            { error: "Only Google Docs, searchable PDFs, Word documents and plain-text files can be read." },
            422,
          );
        return json({
          id: `drive-${id}`,
          title: data.name,
          text: await driveText(request, data),
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
        (await getSession(request)) ? 502 : 401,
      );
    }
  };
}
