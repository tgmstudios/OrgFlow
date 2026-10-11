const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const object = (properties: any, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});
const doc = object(
  {
    type: { type: "string", enum: ["doc"] },
    content: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
  },
  ["type", "content"],
);
const schemas: any = {
  Error: object({ error: string }, ["error"]),
  Category: object({ id: string, name: string }, ["id", "name"]),
  Article: object(
    {
      id: string,
      title: string,
      categoryId: string,
      content: doc,
      sources: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
      publishedSources: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
      status: { type: "string", enum: ["draft", "published"] },
      updatedAt: { type: "string", format: "date-time" },
      publishedContent: doc,
      publishedTitle: string,
      publishedCategoryId: string,
      publishedAt: { type: "string", format: "date-time" },
    },
    ["id", "title", "categoryId", "content", "status", "updatedAt"],
  ),
  File: object(
    {
      id: string,
      name: string,
      provider: string,
      originalPath: string,
      orgflowPath: string,
      url: { type: "string", format: "uri" },
      updatedAt: string,
      type: string,
    },
    [
      "id",
      "name",
      "provider",
      "originalPath",
      "orgflowPath",
      "url",
      "updatedAt",
      "type",
    ],
  ),
  Event: object(
    {
      id: string,
      title: string,
      start: { type: "string", format: "date-time" },
      end: { type: "string", format: "date-time" },
      kind: { type: "string", enum: ["meeting", "deadline"] },
    },
    ["id", "title", "start", "kind"],
  ),
  Integration: object({ id: string, name: string, status: string }, [
    "id",
    "name",
    "status",
  ]),
};
schemas.Bootstrap = object(
  {
    categories: { type: "array", items: ref("Category") },
    articles: { type: "array", items: ref("Article") },
    files: { type: "array", items: ref("File") },
    events: { type: "array", items: ref("Event") },
    integrations: { type: "array", items: ref("Integration") },
    meta: object({
      demo: { type: "boolean" },
      demoLabel: string,
      storage: string,
      authentication: string,
      voice: string,
    }),
  },
  ["categories", "articles", "files", "events", "integrations", "meta"],
);
const response = (schema: any, description = "Success") => ({
  description,
  content: { "application/json": { schema } },
});
function operation(
  summary: string,
  schema: any,
  body?: any,
  id = false,
  created = false,
) {
  return {
    summary,
    ...(id
      ? {
          parameters: [
            { name: "id", in: "path", required: true, schema: string },
          ],
        }
      : {}),
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }
      : {}),
    responses: {
      [created ? "201" : "200"]: response(schema),
      "400": response(ref("Error"), "Invalid request"),
      "404": response(ref("Error"), "Not found"),
      "413": response(ref("Error"), "Request too large"),
      "500": response(ref("Error"), "Internal error"),
    },
  };
}
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "OrgFlow API",
    version: "0.1.0",
    description:
      "Local single-workspace development API. Email/password accounts: sign in via /api/auth/login (HttpOnly session cookie); all /api routes except /api/auth/* require a session. No organization isolation yet: all accounts share one workspace. Seed data is synthetic. Editing a published article creates a draft and preserves publishedContent until explicit publication.",
  },
  servers: [{ url: "/" }],
  components: { schemas },
  paths: {
    "/health": {
      get: operation(
        "Service health",
        object({ status: string, storage: string }),
      ),
    },
    "/api/auth/signup": {
      post: operation(
        "Create account and start session",
        object({ user: object({ id: string, email: string, name: string }) }),
        object({ email: string, password: string, name: string }, ["email", "password"]),
        false,
        true,
      ),
    },
    "/api/auth/login": {
      post: operation(
        "Sign in and start session",
        object({ user: object({ id: string, email: string, name: string }) }),
        object({ email: string, password: string }, ["email", "password"]),
      ),
    },
    "/api/auth/logout": { post: operation("End session", object({ ok: { type: "boolean" } })) },
    "/api/auth/me": { get: operation("Current user (null when signed out)", object({ user: { type: "object", nullable: true } })) },
    "/api/bootstrap": { get: operation("Load workspace", ref("Bootstrap")) },
    "/api/categories": {
      post: operation(
        "Create category",
        ref("Category"),
        object({ name: string }, ["name"]),
        false,
        true,
      ),
    },
    "/api/categories/{id}": {
      patch: operation(
        "Rename category",
        ref("Category"),
        object({ name: string }, ["name"]),
        true,
      ),
    },
    "/api/articles": {
      post: operation(
        "Create draft",
        ref("Article"),
        object({ title: string, categoryId: string, content: doc }, [
          "title",
          "categoryId",
          "content",
        ]),
        false,
        true,
      ),
    },
    "/api/articles/{id}": {
      patch: operation(
        "Autosave draft; preserve published version",
        ref("Article"),
        object({ title: string, categoryId: string, content: doc }),
        true,
      ),
    },
    "/api/articles/{id}/publish": {
      post: operation(
        "Human action: approve and publish draft",
        ref("Article"),
        undefined,
        true,
      ),
    },
    "/api/files/{id}": {
      patch: operation(
        "Reorganize OrgFlow link; original file remains unchanged",
        ref("File"),
        object({ orgflowPath: string }, ["orgflowPath"]),
        true,
      ),
    },
    "/api/agent": {
      post: operation(
        "Chat or interview; may save draft, never publishes",
        object({
          message: string,
          draft: ref("Article"),
          sources: { type: "array", items: { type: "object" } },
        }),
        object(
          {
            mode: { type: "string", enum: ["ask", "draft"] },
            messages: {
              type: "array",
              minItems: 1,
              maxItems: 24,
              items: object(
                {
                  role: { type: "string", enum: ["user", "assistant"] },
                  content: string,
                },
                ["role", "content"],
              ),
            },
            articleId: string,
            categoryId: string,
            sourcesConsent: { type: "boolean" },
            sources: {
              type: "array",
              maxItems: 8,
              items: object(
                { id: string, title: string, text: string, url: string },
                ["id", "title", "text"],
              ),
            },
          },
          ["mode", "messages"],
        ),
      ),
    },
    "/api/uploads": {
      post: {
        summary: "Upload PNG/JPEG/GIF/WebP image (5 MB maximum)",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: object({ file: { type: "string", format: "binary" } }, [
                "file",
              ]),
            },
          },
        },
        responses: {
          "201": response(object({ url: string })),
          "400": response(ref("Error"), "Invalid image"),
          "413": response(ref("Error"), "Too large"),
        },
      },
    },
  },
};

const googleStatus = object({
  configured: { type: "boolean" },
  connected: { type: "boolean" },
  providers: { type: "array", items: string },
  sessionStorage: string,
  calendarConnected: { type: "boolean" },
});
const source = object(
  {
    id: string,
    title: string,
    text: string,
    url: string,
    provider: string,
    mimeType: string,
  },
  ["id", "title"],
);
Object.assign(openapi.paths, {
  "/auth/google/start": {
    get: {
      summary: "Start read-only Google OAuth connection (browser redirect)",
      responses: {
        "302": { description: "Redirect to Google consent" },
        "503": response(ref("Error"), "Google client not configured"),
      },
    },
  },
  "/auth/google/callback": {
    get: {
      summary: "Google OAuth callback with cookie-bound state and PKCE",
      parameters: [
        { name: "state", in: "query", required: true, schema: string },
        { name: "code", in: "query", schema: string },
      ],
      responses: {
        "302": { description: "Connection complete; redirect to frontend" },
        "400": response(ref("Error"), "Invalid or declined connection"),
        "502": response(ref("Error"), "Token exchange failed"),
      },
    },
  },
  "/api/integrations/google": {
    get: operation(
      "Google session status (tokens never returned)",
      googleStatus,
    ),
  },
  "/api/integrations/google/disconnect": {
    post: operation(
      "Forget local Google session",
      object({ connected: { type: "boolean" } }),
    ),
  },
  "/api/integrations/google/sync": {
    post: operation(
      "Index Drive file metadata; preserve OrgFlow link arrangement",
      object({
        indexed: { type: "integer" },
        limited: { type: "boolean" },
        notice: string,
      }),
    ),
  },
  "/api/sources/google": {
    get: {
      ...operation(
        "List Drive files or Gmail subjects for explicit selection",
        object({
          sources: { type: "array", items: source },
          limited: { type: "boolean" },
        }),
      ),
      parameters: [
        {
          name: "provider",
          in: "query",
          schema: { type: "string", enum: ["drive", "gmail"] },
        },
        { name: "q", in: "query", schema: string },
      ],
    },
  },
  "/api/sources/google/{provider}/{id}": {
    get: {
      ...operation(
        "Read a selected Google Doc, text file, or plain-text email (12k character limit)",
        source,
      ),
      parameters: [
        {
          name: "provider",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["drive", "gmail"] },
        },
        { name: "id", in: "path", required: true, schema: string },
      ],
    },
  },
  "/api/uploads/{id}": {
    get: {
      summary: "Read a locally uploaded article image",
      parameters: [{ name: "id", in: "path", required: true, schema: string }],
      responses: {
        "200": { description: "Image bytes" },
        "404": response(ref("Error"), "Not found"),
      },
    },
  },
});
for (const path of [
  "/api/integrations/google/sync",
  "/api/sources/google",
  "/api/sources/google/{provider}/{id}",
]) {
  const methods = (openapi.paths as any)[path];
  for (const op of Object.values(methods) as any[])
    Object.assign(op.responses, {
      "401": response(ref("Error"), "Connect Google first"),
      "422": response(ref("Error"), "Unsupported source format"),
      "502": response(ref("Error"), "Google request failed"),
    });
}
