# OrgFlow backend

Bun HTTP API on `http://localhost:3003` (binds 127.0.0.1; override with `HOST`/`PORT`). Swagger UI at `/docs` (also `/swagger`), OpenAPI at `/openapi.json`, health at `/health`. Swagger assets are served locally.

```sh
bun install
bun run index.ts      # or `bun run start`
bun test              # tests (mocked OAuth, synthetic AI content)
bun run typecheck
```

From the repo root, `bun run dev` starts backend and frontend together.

## Modules

- `index.ts`: server entry; longer idle timeout for AI and indexing routes.
- `app.ts`: routing, articles, categories, files, bootstrap, auth routes, origin checks.
- `operations.ts`: consented source index, Discover, runnable checklists, people and Transfer, periodic review, organization info, audit log.
- `workspace.ts`: per-organization data isolation (the original shared workspace is org `default`).
- `retrieval.ts`: BM25 retrieval over indexed text and articles.
- `luminal.ts`: server-only Luminal JSON completion (OpenAI-compatible).
- `agent.ts`: Ask and draft agent (`POST /api/agent`), citation validation.
- `google.ts`: read-only Google OAuth (PKCE), Drive metadata sync, Docs/Gmail readers and indexing.
- `auth.ts`: email/password accounts (Argon2id), HttpOnly session cookie, roles, invite codes, login rate limit.
- `monetization.ts`: AWS Monetization sandbox entitlement checks and metering.
- `elevenlabs.ts`: ephemeral WebRTC token for the private voice agent (`GET /api/voice/session-token`).
- `samples.ts`: labelled sample playbooks and people for the shared demo workspace (added once; new organizations start empty).
- `store.ts`: Prisma/PostgreSQL persistence. `migrate-sqlite-to-postgres.ts`: one-time legacy import. `uploads.ts`: image uploads. `openapi.ts`: API description.

## Configuration

Copy `.env.example` to `.env` (Git-ignored, mode 0600; Bun loads it automatically). Keep secrets server-side and out of logs. Variables in `.env.example`:

- AI: `LUMINAL_API_KEY`, `LUMINAL_BASE_URL`, `LUMINAL_MODEL`, `LUMINAL_IMAGES_BASE_URL`, `LUMINAL_IMAGES_MODEL`
- Voice: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- Google: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (see [Google setup](../docs/GOOGLE_SETUP.md))
- Secrets: `TOKEN_ENCRYPTION_KEY` (seals stored Google sessions)
- Storage and origins: `DATABASE_URL`, `FRONTEND_ORIGIN`, `FRONTEND_REDIRECT_URL`, `HOST`, `PORT`

Also read by the code, not in `.env.example`: `REVIEW_INTERVAL_DAYS`, `MONETIZATION_APP_ID`, `MONETIZATION_ENFORCE`.

## Behaviour notes

- PostgreSQL is required. For local development, start `docker compose up -d`, copy `.env.example` to `.env`, then run `bun run prisma:migrate:deploy`. The Docker image includes pgvector. Prisma migrations install the extension and create the app table.
- To import the legacy SQLite database, make a backup first, then set `SQLITE_SOURCE` and `DATABASE_URL` and run `bun run db:import:sqlite`. The importer is idempotent and upserts by `(kind, id)`.
- Without `LUMINAL_API_KEY`, AI routes return 503 `AI_NOT_CONFIGURED`. AI saves drafts only; publishing is `POST /api/articles/:id/publish`.
- All `/api/*` routes except `/api/auth/*` need the session cookie. Browser writes from unexpected origins are rejected.
- Google sessions are sealed with AES-256-GCM (`vault.ts`) and stored in the database, keyed by the `orgflow_google` cookie (30 days), so a restart keeps connections. The key is `TOKEN_ENCRYPTION_KEY` (any string) or a generated `data/token.key` (mode 0600); back it up with the database. Disconnecting deletes the record and revokes the token at Google.
- AI citations must include verbatim quotes. `evidence.ts` checks each quote against the text actually supplied and returns `evidence` (with `verified`), `grounding` and `conflicts`; drafts store them. Verified means the quote exists in the source, not that the claim follows from it.
- `GET /api/insights/health` (`health.ts`): score, per-person risk (leaving, no handoff guide, no successor, nothing published), overdue and due-soon reviews, unowned processes, stuck drafts, changed sources and unverified quotes, with recommended actions.
- `POST /api/people/:id/interview` returns a gap-driven question plan and an `agentBrief` for the live voice agent. `POST /api/people/:id/handoff` with `{"mode":"outline"}` writes a facts-only handoff draft with no AI call.
- Articles include `sourceChanges` when a cited document's indexed `updatedAt` is newer than the version captured with the draft.
- Image uploads (`POST /api/uploads`): PNG/JPEG/GIF/WebP, at most 5 MB, stored in ignored `data/uploads/`.
- Concurrent edits are last-write-wins.
