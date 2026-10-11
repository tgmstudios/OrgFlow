# OrgFlow backend

From this directory run `bun install`, then `bun run index.ts`. Tests: `bun test`. Type check: `bun run typecheck`.

Default address: `http://localhost:3003`, bound to 127.0.0.1. Swagger UI: `/docs` or `/swagger`. OpenAPI: `/openapi.json`. Swagger assets are served locally.

This is a **single-workspace local development build without staff authentication**. Do not expose publicly. Browser writes from unexpected origins are rejected. Set `FRONTEND_ORIGIN` for a custom frontend origin (default `http://localhost:3002`). `HOST` and `PORT` override the bind address.

## Persistence

`DATABASE_URL` enables PostgreSQL via Bun SQL. Startup creates an `orgflow_entities` table with JSONB records. A configured PostgreSQL failure stops startup rather than silently changing databases.

Without `DATABASE_URL`, persistent SQLite development storage is used at `./data/orgflow.sqlite`; override with `SQLITE_PATH`. Startup and bootstrap metadata disclose this fallback. Local data is ignored by Git. Run from the backend directory for a predictable default path.

First startup seeds synthetic articles, file links and events, labeled in bootstrap metadata and individual entities. Sample provider links are placeholders. Connections start disconnected; events are not a live calendar feed.

Articles autosave as drafts. Edits preserve `publishedContent`, `publishedTitle`, and `publishedCategoryId`; explicit `POST /api/articles/:id/publish` updates the published version. PATCH cannot publish. Staff authentication and organization authorization are prerequisites before deployment.

File PATCH changes only `orgflowPath`, never source URL/path. Categories support creation and rename.

## Images

POST `/api/uploads` accepts multipart field `file`: PNG, JPEG, GIF or WebP, at most 5 MB, with signature checks. SVG is excluded. Images live in ignored `data/uploads/` and are served through `/api/uploads/:generated-name`. Authenticated access and managed object storage remain deployment work.

## Configuration

Use credential-free `.env.example` as a guide. Bun automatically reads `.env`. Keep credentials server-side, ignored, and out of diagnostics.

`LUMINAL_API_KEY` enables the server-only agent. Missing configuration produces a clear error. AI saves drafts and never publishes. Explorer metadata supports document discovery; it never establishes facts about file contents. Explicitly selected source text requires AI consent.

Google OAuth setup instructions: `../docs/GOOGLE_SETUP.md`. Implemented routes start at `/auth/google/start`; the state-cookie/PKCE callback is `/auth/google/callback`. Session tokens remain in server memory and require reconnection after restart. `/api/integrations/google/sync` indexes Drive metadata only and preserves custom OrgFlow folder paths; `/api/sources/google` lists Drive files/Gmail subjects and the per-source GET reads explicitly selected text. Google Docs and plain text/Markdown/CSV files are supported; email capture requires a plain-text MIME body. Calendar, SharePoint and OneDrive connections are not implemented. OAuth secrets belong only in ignored `.env`; no service-account key is needed for the selected personal-user flow.

## Limits

Bun tests cover draft/publication behavior, categories, immutable provider paths, local documentation and synthetic labels. PostgreSQL requires a configured database for an integration check; SQLite fallback has been tested. Concurrent edits currently use last-write-wins. Authentication, organization isolation and live calendar integration remain future work.
