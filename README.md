# OrgFlow

AI-assisted institutional memory for nonprofits. Product decisions: [design brief](docs/PRODUCT_DESIGN.md), [shared memory](docs/SHARED_MEMORY.md), [original MVP](docs/MVP.md).

## Run locally

Requires Bun. In this workspace the executable is `/home/node/.bun/bin/bun`; add `/home/node/.bun/bin` to PATH if needed.

```sh
bun run install:app
bun run dev
```

- App: http://localhost:3002
- Swagger UI: http://localhost:3003/docs (also `/swagger`)
- OpenAPI: http://localhost:3003/openapi.json
- Backend health: http://localhost:3003/health

The frontend proxies API requests to the backend. Both bind to loopback by default. This is a single-workspace local MVP; staff authentication and organization authorization must be implemented before external hosting.

## Features

- Off-white/purple interface with left navigation, AI-first Home, recent files, agenda/month calendar.
- External file index preserving provider structure, with OrgFlow-only reorganization and original-provider links.
- Server-hosted knowledge base, editable categories, Tiptap rich-text editor, autosaved drafts and separate approval/publication. Published snapshots survive later edits.
- Global chat/voice agent, centered window with bottom-right docking, one conversation across tabs. Browser speech availability varies; speech recognition may use the browser vendor's service.
- Server-side Luminal chat and SOP drafting. Connected/uploaded source text requires explicit consent before transmission. AI drafts never publish automatically.
- Read-only Google OAuth, Drive metadata indexing, selection of Google Docs/text files and Gmail plain-text email bodies. Microsoft providers and calendar sync remain disconnected.
- Article image uploads and local Swagger assets.

## Configuration and storage

Copy `backend/.env.example` to `backend/.env` if there is no existing local configuration. Keep secrets server-side and out of version control. See [backend setup](backend/README.md) and [Google setup](docs/GOOGLE_SETUP.md).

Set `DATABASE_URL` for PostgreSQL. Without it, local development persists to SQLite under `backend/data/`. Seed content is synthetic and labeled in the UI. Original connected files are never uploaded or moved by OrgFlow; the knowledge base and selected metadata live in the app's database. Google tokens are held server-side in memory, so restarting requires reconnection.

## Verify

```sh
bun run typecheck
bun run test
bun run build
```

`landing/` remains a separate placeholder; this build targets the product in `frontend/` and API in `backend/`.
