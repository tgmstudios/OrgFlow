import type { Store, Entity } from "./store";
import { openapi } from "./openapi";
import { createAgentHandler } from "./agent";
import { uploads } from "./uploads";
import { createGoogleHandler } from "./google";
import { storeVault } from "./vault";
import { changedSources } from "./health";
import { elevenLabsVoice } from "./elevenlabs";
import { createOperations } from "./operations";
import { installShowcase } from "../demo-content/scripts/install_orgflow_showcase";
import { DEFAULT_ORG, runInOrg, scopedStore } from "./workspace";
import { createAuth, AuthError } from "./auth";
import {
  EVENT_ASK,
  EVENT_DRAFT,
  EVENT_GOOGLE_IMPORT,
  BillingUnavailable,
  clearSessionCookies,
  entitlementGate,
  hostedUrl,
  meter,
  sessionCookies,
} from "./monetization";
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function nonempty(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new ApiError(400, `${field} must be a nonempty string (max ${max})`);
  return v.trim();
}
export function document(v: unknown): unknown {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    (v as any).type !== "doc" ||
    !Array.isArray((v as any).content)
  )
    throw new ApiError(
      400,
      "content must be a Tiptap document with a content array",
    );
  return v;
}
export async function bootstrap(store: Store) {
  const [categories, articles, files, events, people, runs, candidates, sources] = await Promise.all(
    ["categories", "articles", "files", "events", "people", "runs", "candidates", "sources"].map((k) => store.list(k)),
  );
  const index = new Map((sources ?? []).map((s) => [s.id, s]));
  return {
    categories,
    // Flag articles whose cited documents changed in the index after they were captured.
    articles: (articles ?? []).map((a) => {
      const changed = changedSources(a, index);
      return changed.length ? { ...a, sourceChanges: changed } : a;
    }),
    files,
    events,
    people,
    runs,
    candidates: (candidates ?? []).filter((c) => c.status !== "dismissed"),
    sources,
    integrations: [
      "Google Drive",
      "Gmail",
      "SharePoint",
      "OneDrive",
      "Calendar",
    ].map((name) => ({
      id: name.toLowerCase().replaceAll(" ", "-"),
      name,
      status: "disconnected",
    })),
    meta: {
      demo: true,
      demoLabel:
        "Synthetic demonstration data; provider links are placeholders.",
      storage: store.mode,
      authentication: "required",
      voice: "browser-dependent",
    },
  };
}
export function createApp(
  baseStore: Store,
  options: { requireAuth?: boolean } = {},
) {
  const requireAuth = options.requireAuth ?? true;
  // Workspace data is scoped to the signed-in user's organization (see workspace.ts).
  const store = scopedStore(baseStore);
  const auth = createAuth(store, {
    sessionCookies: (req, user) => sessionCookies(req, user.id),
    clearCookies: clearSessionCookies,
    refreshWhenMissing: "mai_pricing_url",
  });
  const google = createGoogleHandler({
    vault: storeVault(baseStore),
    saveSource: (source) => operations.saveSource(source),
    upsertFile: async (file) => {
      const current = await store.get("files", file.id);
      await store.put("files", {
        ...file,
        id: file.id,
        orgflowPath: current?.orgflowPath ?? file.orgflowPath,
      });
    },
  });
  const agent = createAgentHandler({
    bootstrap: async () => ({ ...(await bootstrap(store)), demo: false }),
    search: (query) => operations.search(query),
    saveDraft: async (input) => {
      const current = input.id ? await store.get("articles", input.id) : null;
      if (input.id && !current) throw new Error("Article not found");
      const categoryId =
        input.categoryId ??
        current?.categoryId ??
        (await store.list("categories"))[0]?.id;
      if (
        typeof categoryId !== "string" ||
        !(await store.get("categories", categoryId))
      )
        throw new Error("Unknown category");
      const value = {
        ...current,
        id: current?.id ?? crypto.randomUUID(),
        title: nonempty(input.title, "title"),
        categoryId,
        content: document(input.content),
        sources: input.sources ?? current?.sources ?? [],
        evidence: input.evidence ?? current?.evidence ?? [],
        conflicts: input.conflicts ?? current?.conflicts ?? [],
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      await store.put("articles", value);
      return value;
    },
  });
  const operations = createOperations({
    store,
    agent: (req) => agent(req),
    currentUser: (req) => auth.currentUser(req),
  });
  const handle = async (req: Request): Promise<Response> => {
    const path = new URL(req.url).pathname;
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status });
    try {
      const requestUrl = new URL(req.url);
      const host = requestUrl.hostname;
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(host) &&
        !process.env.HOST
      )
        throw new ApiError(403, "Unrecognized host");
      const origin = req.headers.get("origin");
      const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3002";
      const allowed = [
        requestUrl.origin,
        frontendOrigin,
        new URL(frontendOrigin).origin,
        "http://127.0.0.1:3002",
      ];
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        origin &&
        !allowed.includes(origin)
      )
        throw new ApiError(403, "Origin is not allowed");
      const authResponse = await auth.handle(req, path);
      if (authResponse) return authResponse;
      const open =
        path === "/health" ||
        path === "/openapi.json" ||
        path === "/docs" ||
        path === "/swagger" ||
        path.startsWith("/docs/assets/") ||
        path === "/auth/google/callback";
      if (requireAuth && !open && !(await auth.currentUser(req)))
        throw new ApiError(401, "Sign in required");
      // Opt-in demonstration import, only for an explicitly named isolated
      // organization, never the shared demo or real customer workspaces.
      if (path === "/api/showcase/install" && req.method === "POST") {
        const signedIn = requireAuth ? await auth.currentUser(req) : null;
        if (!signedIn || signedIn.role !== "admin" || signedIn.orgId === DEFAULT_ORG)
          throw new ApiError(403, "Only a private showcase organization's admin may import demo data.");
        const input = (await req.json().catch(() => null)) as { confirmation?: string } | null;
        if (input?.confirmation !== "INSTALL_FICTIONAL_SHOWCASE")
          throw new ApiError(400, "Explicit confirmation is required.");
        try {
          const result = await installShowcase(baseStore, signedIn.orgId, { apply:true });
          return json(result);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Organization must have exact name"))
            throw new ApiError(403, "This is not a permitted showcase organization.");
          throw error;
        }
      }
      const googleEvent =
        (req.method === "POST" &&
          ["/api/integrations/google/sync", "/api/integrations/google/index"].includes(path)) ||
        (req.method === "GET" &&
          /^\/api\/sources\/google\/[^/]+\/[^/]+$/.test(path))
          ? EVENT_GOOGLE_IMPORT
          : null;
      const billedUser = requireAuth ? await auth.currentUser(req) : null;
      if (googleEvent && billedUser) {
        const denied = await entitlementGate(billedUser.id, googleEvent);
        if (denied) return denied;
      }
      const googleResponse = await google(req);
      if (googleResponse) {
        if (googleEvent && billedUser && googleResponse.ok)
          await meter(billedUser.id, googleEvent);
        return googleResponse;
      }
      if (path.startsWith("/api/uploads")) {
        const response = await uploads(req);
        if (response) return response;
      }
      const voiceResponse = await elevenLabsVoice(req);
      if (voiceResponse) return voiceResponse;
      if (path === "/api/agent") {
        const user = requireAuth ? await auth.currentUser(req) : null;
        const mode = user
          ? ((await req.clone().json().catch(() => null)) as any)?.mode
          : null;
        const event =
          mode === "ask" ? EVENT_ASK : mode === "draft" ? EVENT_DRAFT : null;
        if (user && event) {
          const denied = await entitlementGate(user.id, event);
          if (denied) return denied;
        }
        const response = await agent(req);
        if (user && event && response.ok) await meter(user.id, event);
        return response;
      }
      const operationResponse = await operations.handle(
        req,
        path,
        requireAuth ? await auth.currentUser(req) : null,
      );
      if (operationResponse) return operationResponse;
      if (req.method === "GET" && path === "/health")
        return json({ status: "ok", storage: store.mode });
      if (req.method === "GET" && path === "/openapi.json")
        return json(openapi);
      if (req.method === "GET" && ["/docs", "/swagger"].includes(path))
        return new Response(
          `<!doctype html><html><head><title>OrgFlow API</title><link rel="stylesheet" href="/docs/assets/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/docs/assets/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui'});</script></body></html>`,
          { headers: { "content-type": "text/html" } },
        );
      if (req.method === "GET" && path.startsWith("/docs/assets/")) {
        const name = path.slice(13);
        if (!["swagger-ui.css", "swagger-ui-bundle.js"].includes(name))
          throw new ApiError(404, "Not found");
        return new Response(
          Bun.file(
            new URL(`./node_modules/swagger-ui-dist/${name}`, import.meta.url),
          ),
        );
      }
      if (req.method === "GET" && path === "/api/billing/session") {
        const user = await auth.currentUser(req);
        if (!user) throw new ApiError(401, "Sign in required");
        const surface = new URL(req.url).searchParams.get("surface");
        if (surface !== "pricing" && surface !== "portal")
          throw new ApiError(400, "surface must be pricing or portal");
        try {
          return json({ url: await hostedUrl(surface, user.id) });
        } catch (error) {
          if (error instanceof BillingUnavailable)
            throw new ApiError(503, error.message);
          throw error;
        }
      }
      if (req.method === "GET" && path === "/api/bootstrap") {
        const value = await bootstrap(store);
        const statusResponse = await google(
          new Request(new URL("/api/integrations/google", req.url).toString(), {
            headers: req.headers,
          }),
        );
        const status = (await statusResponse!.json()) as { connected: boolean };
        value.integrations = value.integrations.map((item) =>
          ["Google Drive", "Gmail"].includes(item.name)
            ? {
                ...item,
                status: status.connected ? "connected" : "disconnected",
              }
            : item,
        );
        return json(value);
      }
      if (!["POST", "PATCH"].includes(req.method))
        throw new ApiError(404, "Not found");
      const raw = await req.text();
      if (raw.length > 1_000_000)
        throw new ApiError(413, "Request exceeds 1 MB");
      let body: any;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        throw new ApiError(400, "Invalid JSON");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new ApiError(400, "Expected JSON object");
      if (req.method === "POST" && path === "/api/categories") {
        const v = {
          id: crypto.randomUUID(),
          name: nonempty(body.name, "name"),
        };
        await store.put("categories", v);
        return json(v, 201);
      }
      if (req.method === "POST" && path === "/api/articles") {
        const categoryId = nonempty(body.categoryId, "categoryId");
        if (!(await store.get("categories", categoryId)))
          throw new ApiError(400, "Unknown category");
        const v = {
          id: crypto.randomUUID(),
          title: nonempty(body.title, "title"),
          categoryId,
          content: document(body.content),
          status: "draft",
          updatedAt: new Date().toISOString(),
        };
        await store.put("articles", v);
        return json(v, 201);
      }
      const match = path.match(
        /^\/api\/(categories|articles|files)\/([^/]+)(\/publish)?$/,
      );
      if (!match) throw new ApiError(404, "Not found");
      const [, kind, id, publish] = match as [
        string,
        string,
        string,
        string | undefined,
      ];
      const current = await store.get(kind, id);
      if (!current) throw new ApiError(404, "Not found");
      let v: Entity = { ...current };
      if (req.method === "PATCH" && !publish) {
        if (kind === "categories") v.name = nonempty(body.name, "name");
        if (kind === "files")
          v.orgflowPath = nonempty(body.orgflowPath, "orgflowPath", 1000);
        if (kind === "articles") {
          if (body.title !== undefined) v.title = nonempty(body.title, "title");
          if (body.content !== undefined) v.content = document(body.content);
          if (body.ownerId !== undefined)
            v.ownerId = body.ownerId === null ? undefined : nonempty(body.ownerId, "ownerId");
          if (body.reviewDueAt !== undefined)
            v.reviewDueAt = body.reviewDueAt === null ? undefined : nonempty(body.reviewDueAt, "reviewDueAt", 40);
          if (body.categoryId !== undefined) {
            v.categoryId = nonempty(body.categoryId, "categoryId");
            if (!(await store.get("categories", v.categoryId as string)))
              throw new ApiError(400, "Unknown category");
          }
          v.status = "draft";
          v.updatedAt = new Date().toISOString();
        }
      } else if (req.method === "POST" && kind === "articles" && publish) {
        const publisher = requireAuth ? await auth.currentUser(req) : null;
        v = {
          ...v,
          status: "published",
          publishedContent: v.content,
          publishedSources: v.sources,
          publishedTitle: v.title,
          publishedCategoryId: v.categoryId,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // Approval record, and when the owner should next confirm it is still accurate.
          publishedBy: publisher ? { id: publisher.id, name: publisher.name } : null,
          reviewDueAt: operations.reviewDueAt(),
        };
        await operations.audit(publisher, "article.publish", { articleId: v.id });
      } else throw new ApiError(404, "Not found");
      await store.put(kind, v);
      return json(v);
    } catch (e) {
      if (e instanceof ApiError || e instanceof AuthError)
        return json({ error: e.message }, e.status);
      console.error("API request failed");
      return json({ error: "Internal server error" }, 500);
    }
  };
  return async (req: Request): Promise<Response> => {
    // Everything after this point reads and writes the signed-in user's organization.
    const user = requireAuth ? await auth.currentUser(req).catch(() => null) : null;
    return runInOrg(user?.orgId ?? DEFAULT_ORG, () => handle(req));
  };
}
