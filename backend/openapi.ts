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
      publishedBy: object({ id: string, name: string }, ["id", "name"]),
      reviewDueAt: { type: "string", format: "date-time", nullable: true },
      reviewedAt: { type: "string", format: "date-time" },
      reviewedBy: { ...object({ id: string, name: string }, ["id", "name"]), nullable: true },
      ownerId: { ...string, nullable: true },
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
  Person: object(
    {
      id: string,
      name: string,
      role: string,
      email: string,
      status: { type: "string", enum: ["active", "leaving", "left"] },
      leaveDate: string,
      successorId: string,
      handoffArticleId: string,
      createdAt: { type: "string", format: "date-time" },
    },
    ["id", "name", "role", "status", "createdAt"],
  ),
  Run: object(
    {
      id: string,
      articleId: string,
      title: string,
      assigneeId: string,
      dueAt: { type: "string", format: "date-time" },
      startedBy: { ...object({ id: string, name: string }, ["id", "name"]), nullable: true },
      startedAt: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["active", "completed"] },
      completedAt: { type: "string", format: "date-time" },
      steps: {
        type: "array",
        items: object(
          {
            id: string,
            text: string,
            done: { type: "boolean" },
            doneAt: { type: "string", format: "date-time" },
            doneBy: { ...object({ id: string, name: string }, ["id", "name"]), nullable: true },
            note: string,
          },
          ["id", "text", "done"],
        ),
      },
    },
    ["id", "articleId", "title", "startedAt", "status", "steps"],
  ),
  Candidate: object(
    {
      id: string,
      title: string,
      summary: string,
      frequency: string,
      evidence: {
        type: "array",
        items: object(
          {
            id: string,
            title: string,
            provider: string,
            url: string,
            from: string,
            updatedAt: { type: "string", format: "date-time" },
          },
          ["id", "title"],
        ),
      },
      status: { type: "string", enum: ["suggested", "drafted", "dismissed"] },
      articleId: string,
      createdAt: { type: "string", format: "date-time" },
    },
    ["id", "title", "summary", "evidence", "status", "createdAt"],
  ),
  IndexedSource: object(
    {
      id: string,
      title: string,
      provider: { type: "string", enum: ["Google Drive", "Gmail"] },
      url: string,
      from: string,
      updatedAt: { type: "string", format: "date-time" },
      indexedAt: { type: "string", format: "date-time" },
      chunkCount: { type: "integer" },
      preview: string,
    },
    ["id", "title", "provider", "url", "updatedAt", "indexedAt", "chunkCount", "preview"],
  ),
  AuditEntry: object(
    {
      id: string,
      at: { type: "string", format: "date-time" },
      actor: { ...object({ id: string, name: string }, ["id", "name"]), nullable: true },
      action: {
        type: "string",
        enum: [
          "article.publish",
          "article.review",
          "run.start",
          "run.complete",
          "run.delete",
          "person.update",
          "transfer.handoff",
          "discover.run",
          "discover.draft",
          "index.remove",
          "index.clear",
          "org.invite.rotate",
        ],
      },
      target: { type: "object", additionalProperties: true },
    },
    ["id", "at", "actor", "action"],
  ),
  Organization: object(
    {
      id: string,
      name: string,
      role: { type: "string", enum: ["admin", "member"] },
      inviteCode: { ...string, description: "Only returned to admins" },
      members: {
        type: "array",
        items: object(
          {
            id: string,
            name: string,
            email: string,
            role: { type: "string", enum: ["admin", "member"] },
          },
          ["id", "name", "email", "role"],
        ),
      },
    },
    ["id", "name", "role", "members"],
  ),
};
schemas.Bootstrap = object(
  {
    categories: { type: "array", items: ref("Category") },
    articles: { type: "array", items: ref("Article") },
    files: { type: "array", items: ref("File") },
    events: { type: "array", items: ref("Event") },
    integrations: { type: "array", items: ref("Integration") },
    people: { type: "array", items: ref("Person") },
    runs: { type: "array", items: ref("Run") },
    candidates: { type: "array", items: ref("Candidate") },
    sources: { type: "array", items: ref("IndexedSource") },
    meta: object({
      demo: { type: "boolean" },
      demoLabel: string,
      storage: string,
      authentication: string,
      voice: string,
    }),
  },
  [
    "categories",
    "articles",
    "files",
    "events",
    "integrations",
    "people",
    "runs",
    "candidates",
    "sources",
    "meta",
  ],
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
      "Local development API. Email/password accounts: sign in via /api/auth/login (HttpOnly session cookie); all /api routes except /api/auth/* require a session. Accounts belong to organizations; workspace data is isolated per organization. Accounts without an organization use the shared demo workspace. Seed data is synthetic. Editing a published article creates a draft and preserves publishedContent until explicit publication.",
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
        object({
          user: object({
            id: string,
            email: string,
            name: string,
            orgId: string,
            role: { type: "string", enum: ["admin", "member"] },
          }),
        }),
        object(
          {
            email: string,
            password: string,
            name: string,
            organization: {
              ...string,
              description: "Creates a new organization; the caller becomes its admin",
            },
            inviteCode: {
              ...string,
              description: "Joins the organization with this invite code as a member",
            },
          },
          ["email", "password"],
        ),
        false,
        true,
      ),
    },
    "/api/auth/login": {
      post: operation(
        "Sign in and start session",
        object({
          user: object({
            id: string,
            email: string,
            name: string,
            orgId: string,
            role: { type: "string", enum: ["admin", "member"] },
          }),
        }),
        object({ email: string, password: string }, ["email", "password"]),
      ),
    },
    "/api/auth/logout": { post: operation("End session", object({ ok: { type: "boolean" } })) },
    "/api/auth/me": {
      get: operation(
        "Current user (null when signed out)",
        object({
          user: {
            type: "object",
            nullable: true,
            properties: {
              id: string,
              email: string,
              name: string,
              orgId: string,
              role: { type: "string", enum: ["admin", "member"] },
            },
          },
        }),
      ),
    },
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
        object({
          title: string,
          categoryId: string,
          content: doc,
          ownerId: { ...string, nullable: true, description: "Person id, or null to clear" },
          reviewDueAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "ISO timestamp, or null to clear",
          },
        }),
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
        "Chat or interview; Ask can cite email and document excerpts from the consented index (sourceType: email excerpt | document excerpt); may save draft, never publishes",
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
    "/api/voice/session-token": {
      get: operation(
        "Create a short-lived WebRTC token for the private ElevenLabs voice agent",
        object(
          {
            conversationToken: string,
            conversationId: string,
            agentId: string,
          },
          ["conversationToken", "conversationId", "agentId"],
        ),
        undefined,
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
const indexGoogle = operation(
  "Index recent Google Docs and email text after explicit consent (about 30-60 s)",
  object({
    indexed: object({ drive: { type: "integer" }, gmail: { type: "integer" } }),
    notice: string,
  }),
  object(
    {
      consent: {
        type: "boolean",
        description:
          "Must be true. Consent copy: Index the text of recent Google Docs and emails into OrgFlow. Indexed text stays in OrgFlow, is used to answer questions and suggest playbooks, and may be sent to OrgFlow's AI provider (Luminal) for those answers and drafts. You can remove it any time.",
      },
      drive: { type: "boolean", default: true },
      gmail: { type: "boolean", default: true },
      gmailQuery: string,
      maxDocuments: { type: "integer", maximum: 80, default: 40 },
      maxEmails: { type: "integer", maximum: 150, default: 60 },
    },
    ["consent"],
  ),
);
Object.assign(indexGoogle.responses, {
  "400": response(ref("Error"), "Consent not confirmed"),
  "401": response(ref("Error"), "Connect Google first"),
});
const discover = operation(
  "Find recurring workflows in the indexed sources (up to about 50 s)",
  object({ candidates: { type: "array", items: ref("Candidate") } }),
  undefined,
);
Object.assign(discover.responses, {
  "409": response(ref("Error"), "Nothing indexed yet"),
  "503": response(ref("Error"), "AI key not configured"),
});
const runFromArticle = operation(
  "Start a runnable checklist from the article's list items",
  ref("Run"),
  object({
    title: string,
    assigneeId: string,
    dueAt: { type: "string", format: "date-time" },
  }),
  true,
  true,
);
Object.assign(runFromArticle.responses, {
  "400": response(ref("Error"), "Article has no list to turn into steps"),
});
const onboarding = operation(
  "Start the successor's first-30-days checklist from the handoff guide",
  ref("Run"),
  object({ successorId: string }),
  true,
  true,
);
Object.assign(onboarding.responses, {
  "409": response(ref("Error"), "Generate the handoff guide first"),
});
const inviteRotate = operation(
  "Rotate the organization invite code (admins only)",
  object({ inviteCode: string }, ["inviteCode"]),
);
Object.assign(inviteRotate.responses, {
  "403": response(ref("Error"), "Only admins can change the invite code"),
});

Object.assign(openapi.paths, {
  "/api/org": {
    get: operation(
      "Current organization, your role, and members (invite code for admins)",
      ref("Organization"),
    ),
  },
  "/api/org/invite": { post: inviteRotate },
  "/api/integrations/google/index": { post: indexGoogle },
  "/api/sources": {
    get: operation(
      "List indexed Gmail and Drive text (summaries, no full text)",
      object({ sources: { type: "array", items: ref("IndexedSource") } }),
    ),
    delete: operation(
      "Clear the whole consented index",
      object({ removed: { type: "integer" } }),
    ),
  },
  "/api/sources/{id}": {
    delete: operation(
      "Remove one indexed source",
      object({ ok: { type: "boolean" } }),
      undefined,
      true,
    ),
  },
  "/api/discover": { post: discover },
  "/api/candidates/{id}/draft": {
    post: operation(
      "Draft a playbook from a candidate's evidence (saved as a draft)",
      object({
        message: string,
        draft: ref("Article"),
        sources: { type: "array", items: { type: "object", additionalProperties: true } },
        candidate: ref("Candidate"),
      }),
      undefined,
      true,
    ),
  },
  "/api/candidates/{id}/dismiss": {
    post: operation(
      "Dismiss a suggested workflow",
      object({ ok: { type: "boolean" } }),
      undefined,
      true,
    ),
  },
  "/api/articles/{id}/review": {
    post: operation(
      "Owner confirms the playbook is still accurate; sets a new reviewDueAt",
      ref("Article"),
      undefined,
      true,
    ),
  },
  "/api/articles/{id}/runs": { post: runFromArticle },
  "/api/runs": {
    get: operation(
      "List checklist runs",
      object({ runs: { type: "array", items: ref("Run") } }),
    ),
  },
  "/api/runs/{id}": {
    delete: operation(
      "Delete a checklist run",
      object({ ok: { type: "boolean" } }),
      undefined,
      true,
    ),
  },
  "/api/runs/{id}/steps/{stepId}": {
    patch: {
      ...operation(
        "Mark a checklist step done or not done; the run completes when every step is done",
        ref("Run"),
        object({ done: { type: "boolean" }, note: string }, ["done"]),
      ),
      parameters: [
        { name: "id", in: "path", required: true, schema: string },
        { name: "stepId", in: "path", required: true, schema: string },
      ],
    },
  },
  "/api/people": {
    get: operation(
      "List people in the organization",
      object({ people: { type: "array", items: ref("Person") } }),
    ),
    post: operation(
      "Add a person",
      ref("Person"),
      object({ name: string, role: string, email: string }, ["name", "role"]),
      false,
      true,
    ),
  },
  "/api/people/{id}": {
    patch: operation(
      "Update a person's details, status, leave date, or successor",
      ref("Person"),
      object({
        name: string,
        role: string,
        email: string,
        status: { type: "string", enum: ["active", "leaving", "left"] },
        leaveDate: string,
        successorId: string,
      }),
      true,
    ),
  },
  "/api/people/{id}/handoff": {
    post: operation(
      "AI drafts or revises the person's role handoff guide (saved as a draft; an active person becomes leaving)",
      object({
        message: string,
        draft: ref("Article"),
        sources: { type: "array", items: { type: "object", additionalProperties: true } },
        person: ref("Person"),
      }),
      object({ notes: string }),
      true,
    ),
  },
  "/api/people/{id}/onboarding": { post: onboarding },
  "/api/audit": {
    get: operation(
      "Recent audit entries, newest first (up to 200)",
      object({ entries: { type: "array", items: ref("AuditEntry") } }),
    ),
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
