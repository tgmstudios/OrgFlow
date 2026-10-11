import type { Store, Entity } from "./store";
import { openapi } from "./openapi";
import { createAgentHandler } from "./agent";
import { uploads } from "./uploads";
import { createGoogleHandler } from "./google";
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
  const [categories, articles, files, events] = await Promise.all(
    ["categories", "articles", "files", "events"].map((k) => store.list(k)),
  );
  return {
    categories,
    articles,
    files,
    events,
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
      authentication: "not-configured",
      voice: "browser-dependent",
    },
  };
}
export function createApp(store: Store) {
  const google = createGoogleHandler({
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
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      await store.put("articles", value);
      return value;
    },
  });
  return async (req: Request): Promise<Response> => {
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
      const allowed = [
        requestUrl.origin,
        process.env.FRONTEND_ORIGIN ?? "http://localhost:3002",
        "http://127.0.0.1:3002",
      ];
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        origin &&
        !allowed.includes(origin)
      )
        throw new ApiError(403, "Origin is not allowed");
      const googleResponse = await google(req);
      if (googleResponse) return googleResponse;
      if (path.startsWith("/api/uploads")) {
        const response = await uploads(req);
        if (response) return response;
      }
      if (path === "/api/agent") return agent(req);
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
          if (body.categoryId !== undefined) {
            v.categoryId = nonempty(body.categoryId, "categoryId");
            if (!(await store.get("categories", v.categoryId as string)))
              throw new ApiError(400, "Unknown category");
          }
          v.status = "draft";
          v.updatedAt = new Date().toISOString();
        }
      } else if (req.method === "POST" && kind === "articles" && publish) {
        v = {
          ...v,
          status: "published",
          publishedContent: v.content,
          publishedSources: v.sources,
          publishedTitle: v.title,
          publishedCategoryId: v.categoryId,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else throw new ApiError(404, "Not found");
      await store.put(kind, v);
      return json(v);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      console.error("API request failed");
      return json({ error: "Internal server error" }, 500);
    }
  };
}
