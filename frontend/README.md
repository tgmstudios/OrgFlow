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
- `knowledge-map.tsx`: Knowledge map (`/knowledge-map`) with two views: Clusters (`cluster-view.tsx`: one cluster per person plus Unassigned, from recorded owners only; drag an item to reassign, drop a person on another to hand everything over) and List (owner pickers per item).
- `server.ts`: static/proxy server.

Voice needs microphone permission and an authenticated session token from `GET /api/voice/session-token`; after a session, staff edit the transcript, consent to AI drafting, and create a draft. Google and AI features need the backend configured (see [backend README](../backend/README.md)). Sample workspace content is labelled demo data.
