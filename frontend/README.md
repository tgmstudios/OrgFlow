# OrgFlow frontend

React with Bun HTML imports (no Vite), Tiptap rich text, Lucide icons, ElevenLabs React SDK for voice.

```sh
bun install
bun --hot index.ts    # http://127.0.0.1:3002; start the backend on :3003 first
bun run typecheck
bun run build         # production bundle (assets under /a/)
NODE_ENV=production bun index.ts   # serves the bundle at /a/
bun test server.test.ts
```

`/api`, `/auth`, `/docs`, `/swagger` and `/openapi.json` proxy to the backend (`BACKEND_URL` overrides; `PORT` overrides the bind port; loopback by default). Production routing and service environment live in `../deploy/`.

## Files

- `app.tsx`: shell, sign-in/sign-up, Home, Files and connections, Knowledge Base and editor, global chat/voice agent.
- `api.ts`: typed API client.
- `indexing.tsx`: consented Gmail/Drive indexing and indexed-source list.
- `discover.tsx`: suggested playbooks (Discover) in the Knowledge Base.
- `checklists.tsx`: runnable checklists.
- `people.tsx`: people, mark leaving, handoff guide, onboarding.
- `organization.tsx`: organization info, members, invite code, audit log.
- `article-meta.tsx`: article owner and review metadata.
- `motion.tsx`: shared animation helpers (built on `motion`; respects reduced motion).
- `ambient.tsx`: aurora background, assistant orb, typing placeholder, live voice waveform.
- `map.tsx`, `map-store.ts`: Knowledge Map (`/map`): documents clustered into groups, drag to regroup, drop a group on a person to hand it over. Map state (groups, owners, handovers) is stored per organization in the browser's localStorage until the API stores it.
- `server.ts`: static/proxy server.

Voice needs microphone permission and an authenticated session token from `GET /api/voice/session-token`; after a session, staff edit the transcript, consent to AI drafting, and create a draft. Google and AI features need the backend configured (see [backend README](../backend/README.md)). Sample workspace content is labelled demo data.
