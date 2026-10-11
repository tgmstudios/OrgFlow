# Shared human / agent memory

Compact, current memory for humans and agents (Claude Code, Codex). Product brief: [MVP.md](MVP.md). Design: [PRODUCT_DESIGN.md](PRODUCT_DESIGN.md). Unanswered questions: [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## Rules for this file

- Keep it short and current; rewrite instead of appending logs. Move answered questions here from OPEN_QUESTIONS.md.
- Separate confirmed human decisions from agent assumptions and from verified facts. Never treat a proposal as approval.
- When a decision changes, add a one-line entry under "Superseded decisions".
- Never store secrets, tokens, private email content or donor data here or in Git. Credentials live only in Git-ignored `backend/.env` (mode 0600) and GitHub Actions secrets; do not print them in logs or chat.
- Latest explicit user instruction beats this file and AGENTS.md.

## Confirmed human decisions

Product and demo
- Product is OrgFlow; the original brief is preserved in MVP.md. Hackathon priority: presentation-ready and sellable; work in interview style.
- Capture (source content to employee-approved playbooks) is the demo centerpiece; donor stewardship is the first demo process.
- Demo a live connection (Gmail and Google Drive, personal Google login); file upload is the fallback.
- Visual direction: modern, expressive, off-white background, purple accent, professional tone for chat and voice. Primary color #7753CE; keep the teal/lavender/apricot thread palette; no dark mode or theme toggle. Fonts: Newsreader headlines, Geist UI, Geist Mono metadata.
- Build an organization-wide knowledge map showing knowledge alongside its owner, with a direct path to review and transfer it when a person leaves. Source files without ownership metadata must not be assigned by inference.
- Use Prisma with PostgreSQL and pgvector for all persistence and file indexing. Production database: managed Amazon RDS for PostgreSQL in us-east-2. Embedding model/provider remains undecided.
- Reference competitor: process.st; the user wants a better version for this use case.
- Judging time was never recorded; do not assume a fresh time window.
- No accessibility work and no tests unless needed for personal verification.

Knowledge base and approval
- All knowledge-base content lives on OrgFlow's servers (PostgreSQL). Original files stay in external providers.
- Articles are rich text, with manual authoring plus AI drafting from sources and via chat/voice. Edits autosave as drafts; Publish is a separate human action.
- Any agent-created or agent-changed SOP is shown as a draft for human approval before publishing (chat, voice and source drafts alike). Any staff member can approve and publish.
- Staff can create and rename categories; the knowledge base uses a category sidebar.

Files and navigation
- Clicking a file opens it in its original provider. Files start in the provider's folder structure; staff may rearrange links, which changes only OrgFlow's arrangement, never the provider.
- Layout: left sidebar (Home, Files, Knowledge Base); Home is AI chat first with recent files and upcoming events below it; calendar has month grid and agenda list with a toggle.
- Global agent launcher at top left opening a centered modal, dockable bottom right; Chat and Voice are tabs sharing one conversation.

iOS
- iOS app (`app/iOS/OrgFlow`) is programmatic UIKit, no storyboards; Ask screen with Metal "Living Thread" visualizer, Liquid Glass controls, on-device SpeechAnalyzer transcription; deployment target iOS 27.
- Ask answers come from the backend on Luminal (now `POST /api/agent`).

Context (reported, unverified)
- Bloomerang CEO interview notes: nonprofits have about 50% annual turnover, "36% of that is leadership" (meaning unresolved; do not cite as fact). Suggested solution: a process playbook plus AI knowledge base integrated with email and file stores.
- User says the team has substantial free Luminal Flash credits; balance and expiry not verified.

Agent assumptions (not explicit human choices)
- "Yes" to live voice vs voice notes was read as live spoken interviews; "yes" to meetings vs deadlines was read as both on the calendar.
- Stack choices: React + Bun HTML imports + Tiptap; Bun API; Swagger at `/docs`.

## Current state (verification status)

Overall: implemented in code, builds and typechecks. AI paths partly verified live: Ask with email excerpts verified on synthetic data. Discover and handoff drafting were not verified live (the AI provider returned 503 during testing). Nothing verified on a physical iPhone. The Knowledge map and current main branch are deployed; the latest GitHub deployment workflow succeeded and production frontend/backend health checks passed (2026-10-11). Turnover features not yet deployed before the latest user-approved rollout are now live.

Backend (`backend/`, Bun, port 3003)
- Turnover features ported onto this implementation (2026-10-11): verbatim-quote verification of AI citations (`evidence.ts`; `evidence`/`grounding`/`conflicts` in agent responses and on drafts), knowledge health and role/person risk (`health.ts`, `GET /api/insights/health`), gap-driven voice interview plans (`POST /api/people/:id/interview`, sent to the live agent as a contextual update), a no-AI handoff outline (`POST /api/people/:id/handoff` with `mode: "outline"`), changed-source flags (cited index version vs current index), and encrypted persistent Google sessions (`vault.ts`, AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY` or `data/token.key`). Automated tests (50 across backend and frontend server), typechecks, production build and a browser smoke run passed before this was recorded; not deployed.
- Email/password accounts, Argon2id, HttpOnly session cookie (7 days). Organizations with data isolation (`workspace.ts`): sign-up creates an org (caller is admin) or joins by invite code (member); otherwise joins the shared demo workspace (`orgId: "default"`). Audit log, invite rotation.
- Articles with draft/publish snapshots, owners, `reviewDueAt` (default 90 days, `REVIEW_INTERVAL_DAYS`), review confirmation. Runnable checklists, people and Transfer (handoff guide, onboarding run), Discover candidates.
- Consented Google indexing of recent Docs and Gmail text; BM25 retrieval (`retrieval.ts`); Ask cites approved articles plus labelled excerpts. Google OAuth read-only with PKCE; tokens sealed (AES-256-GCM) in the database and keyed by the browser session cookie, so restarts keep connections (previously: memory only, restart requires reconnect).
- Storage: Prisma/PostgreSQL only (`DATABASE_URL` required); production RDS PostgreSQL 18.6 in us-east-2 has pgvector enabled. The Prisma schema is deployed and all 36 SQLite entities across 9 types were imported and content-verified. The production backend rollout and post-cutover health check remain unverified. Embedding provider and vector index are not implemented. See [PGVECTOR.md](PGVECTOR.md).
- Billing: AWS Monetization sandbox; enforcement off (`MONETIZATION_ENFORCE=false` in the deploy workflow). Metered: Ask, draft, Google sync/indexing.
- API contract for the new routes: Swagger at `/docs` and `/openapi.json`.

Web (`frontend/`, React/Bun, port 3002; production at https://orgflow.dev/a/)
- Web redesign (2026-10-11): glass surfaces, ambient gradient, iridescent accents, page transitions, breathing assistant orb, typing placeholder, live voice waveform, glowing status indicators.
- Home, Files, Knowledge Base, Knowledge map, plus Discover, indexing consent, Checklists, People, Organization views and article owner/review metadata. Knowledge map groups playbooks and indexed sources by manually assigned owner, supports reassignment (List view, or drag-and-drop in the interactive Clusters view, which also hands a person's items to another in one step; owner changes return published playbooks to draft, OPEN_QUESTIONS 13), and links to People handoff; assigned sources are included in AI handoff drafts and source ownership persists on reindex. Implemented; typecheck and production build passed, no tests run. Not deployed. ElevenLabs live voice interview (WebRTC session token, mute control), editable transcript, consent, then draft. Mobile voice fix deployed in `070ce2e`; the user's device retest is not recorded.

Landing (`landing/`, Bun, port 3001)
- User approved merging the premium homepage into local `main` on 2026-10-11. No push or deployment is authorized by that merge request.
- Six sections, preserved paper/purple identity, and a deterministic fictional food pantry demo with cited answers, source previews, draft editing, human review, publication, and a successor checklist. Advanced sample controls remain behind optional exploration. Calls to action open `https://orgflow.dev/a/`.
- Latest landing source: `f6055fe`. Assets build at startup, matching the existing deployment entrypoint. Current product knot artwork is copied locally. Proposed $19 founding price and shared demo warnings are explicit. The example makes no live AI requests.
- Landing typecheck, seven server tests, production build, and browser checks at 1440/1024/768/375 passed before merge. Keyboard, reduced motion, source focus, published snapshots, navigation, and optional workspace controls passed. Merge preserves current main's application, deployment, and billing code.
- Integration checks passed against main base `bb6a6c1`: application and landing typechecks/builds, 50 application tests, and seven landing tests. Frozen-lock installs passed for all three services. Only the landing and this handoff document differ from that production base. No remote push or deployment occurred.
- Review instructions: [landing/README.md](../landing/README.md). Local preview: `http://localhost:3001`. Main integration worktree: `/Users/parth/Projects/c0mpiled-orgflow-main`. The original `feat/foundation` checkout remains untouched.

iOS (`app/iOS`)
- Ask, Capture and Handoff modes; Library (Knowledge, Files, Upcoming, Checklists); sign-in sheet; billing denial shows "See plans". Base URL from Info.plist `OrgFlowBaseURL` (default `https://orgflow.dev`). Optional on-device Foundation Models drafting is off by default. Provider connection stays on the web. Bundle ID `ryannair05.OrgFlow`. Builds; device behaviour not verified.

AI providers
- Luminal: OpenAI-compatible text chat completions (see [LUMINAL_FLASH.md](LUMINAL_FLASH.md)); basic and synthetic Ask/draft calls verified earlier. Retention/training terms unverified (OPEN_QUESTIONS 7).
- ElevenLabs Conversational AI private agent "OrgFlow Voice" (server-held key and agent ID); unauthenticated calls return 401.

Deployment
- Production app host (moved 2026-10-11 to AWS account 255260119952, us-east-2): EC2 `i-0b2f19dba772e2f22` (t3.micro, Amazon Linux 2023), Elastic IP `3.12.200.93`, SG `orgflow-web`, instance profile `orgflow-backend-monetization`. SSH: `ssh -i orgflow-prod-key.pem ec2-user@3.12.200.93` (key is git-ignored and in GitHub secret `EC2_SSH_KEY`). App in `/opt/app`, units `backend`/`frontend`/`landing`, nginx behind Cloudflare. RDS `orgflow-prod-pg` is PostgreSQL 18.6, Multi-AZ, private, encrypted, deletion-protected, with pgvector and 7-day backups. The production SQLite backup is retained on EC2; its 36 records were imported and verified. Backend rollout is pending. The previous host (`3.140.197.206`) is retired but not terminated.
- Monetization: AWS App Monetization app `01a12cef6e537c4288f0b6931dcaeeca` (account 255260119952, us-west-2 control plane, sandbox ARN in `PROD_MONETIZATION_APP_ID`); 3 draft plans without quotas, enforcement off, seller/Stripe registration not done yet.
- Pushing to `main` deploys via `.github/workflows/deploy.yml` to the existing EC2 server (Region us-east-2 from local config) behind Cloudflare and Nginx (`deploy/`). Server `.env` is preserved across deploys. Production OAuth redirect: `https://orgflow.dev/auth/google/callback`; whether it is saved in the Google client was last reported as missing (`redirect_uri_mismatch`), current status not verified. Google app is in Testing, test users only. Google project `orgflow-20261011`.
- Microsoft 365, calendar sync (events are synthetic), extraction caching and embeddings: not built.

## Superseded decisions

- Product name "Continuity AI" -> OrgFlow.
- Proposed NDJSON `POST /api/ask` for iOS -> iOS uses `POST /api/agent` (`mode: "ask"`) and reveals the answer progressively.
- Agent-proposed bottom-right launcher -> top-left launcher with dock option.
- Browser speech recognition/synthesis for web voice -> ElevenLabs live voice; WebSocket signed URL -> WebRTC `GET /api/voice/session-token`.
- "Single-workspace, local-only, no organization isolation" -> organizations with isolation and public deployment at orgflow.dev/a/.
- "Only Capture in scope" for the hackathon -> Connect, Capture, Ask and Transfer all have implementations.
- Luminal Flash as a documentation-only plan -> implemented adapter (agent.ts, luminal.ts).

## Showcase import work in progress (feature branch, NOT deployed)

- The separate `feat/orgflow-demo-showcase` branch adds an isolated admin-confirmed showcase installer, synthetic sources with links to original PDFs/Docs/CSV, a five-person owner/successor/supervisor map, and a People "Reports to" field with same-org/cycle validation. It never connects or uploads to the user's personal Google account. New procedures start as drafts.
- The loader works only for an organization named `Centre Valley Community Pantry (OrgFlow Showcase)` and refuses the shared default workspace. Source documents are original fictional training content. See `demo-content/00_START_HERE/WEBSITE_IMPORT_AND_ACCESS.md` for exact verification and permissions.
- Verified locally with memory-backed HTTP calls, dataset content checks, source owner reassignment, isolation across organizations, preserved edits on reimport, typechecks and tests. **Not yet production deployed or OAuth connected.** New Google account selection requires user confirmation.

## Handoff notes

1. Read [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) and ask the human before changing unresolved product decisions, including the embedding provider.
2. Before demoing: set `LUMINAL_API_KEY` and retest Discover and handoff drafting live; add a Google test user; confirm the production redirect URI.
3. Verify the iOS app on a physical iPhone (voice capture, Handoff, Library).
4. Pushing to `main` deploys production. The user explicitly authorized this PostgreSQL production cutover; get authorization for later production rollouts unless the task explicitly includes them.
5. Update this file instead of adding logs. No tests were run for the Knowledge map feature by request; typecheck/build passed.
