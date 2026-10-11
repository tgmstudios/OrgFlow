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
- Visual direction: modern, expressive, off-white background, purple accent, professional tone for chat and voice.
- Reference competitor: process.st; the user wants a better version for this use case.
- Judging time was never recorded; do not assume a fresh time window.
- No accessibility work and no tests unless needed for personal verification.

Knowledge base and approval
- All knowledge-base content lives on OrgFlow's servers (PostgreSQL is the probable database; not finalized). Original files stay in external providers.
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

Overall: implemented in code, builds and typechecks. AI paths partly verified live: Ask with email excerpts verified on synthetic data. Discover and handoff drafting were not verified live (the AI provider returned 503 during testing). Nothing verified on a physical iPhone. The latest changes (organizations, indexing, Discover, checklists, People/Transfer, review, audit, samples, iOS Capture/Handoff/Library) are not deployed. Run `bun run test` and `bun run typecheck` for current test results; counts were not re-verified.

Backend (`backend/`, Bun, port 3003)
- Email/password accounts, Argon2id, HttpOnly session cookie (7 days). Organizations with data isolation (`workspace.ts`): sign-up creates an org (caller is admin) or joins by invite code (member); otherwise joins the shared demo workspace (`orgId: "default"`). Audit log, invite rotation.
- Articles with draft/publish snapshots, owners, `reviewDueAt` (default 90 days, `REVIEW_INTERVAL_DAYS`), review confirmation. Runnable checklists, people and Transfer (handoff guide, onboarding run), Discover candidates.
- Consented Google indexing of recent Docs and Gmail text; BM25 retrieval (`retrieval.ts`); Ask cites approved articles plus labelled excerpts. Google OAuth read-only with PKCE; tokens kept server-side in memory (restart requires reconnect).
- Storage: PostgreSQL via `DATABASE_URL` (no live PostgreSQL integration check done), otherwise SQLite in `backend/data/`.
- Billing: AWS Monetization sandbox; enforcement off (`MONETIZATION_ENFORCE=false` in the deploy workflow). Metered: Ask, draft, Google sync/indexing.
- API contract for the new routes: Swagger at `/docs` and `/openapi.json`.

Web (`frontend/`, React/Bun, port 3002; production at https://orgflow.dev/a/)
- Home, Files, Knowledge Base, plus Discover, indexing consent, Checklists, People, Organization views and article owner/review metadata. ElevenLabs live voice interview (WebRTC session token, mute control), editable transcript, consent, then draft. Mobile voice fix deployed in `070ce2e`; the user's device retest is not recorded.

iOS (`app/iOS`)
- Ask, Capture and Handoff modes; Library (Knowledge, Files, Upcoming, Checklists); sign-in sheet; billing denial shows "See plans". Base URL from Info.plist `OrgFlowBaseURL` (default `https://orgflow.dev`). Optional on-device Foundation Models drafting is off by default. Provider connection stays on the web. Bundle ID `ryannair05.OrgFlow`. Builds; device behaviour not verified.

AI providers
- Luminal: OpenAI-compatible text chat completions (see [LUMINAL_FLASH.md](LUMINAL_FLASH.md)); basic and synthetic Ask/draft calls verified earlier. Retention/training terms unverified (OPEN_QUESTIONS 11).
- ElevenLabs Conversational AI private agent "OrgFlow Voice" (server-held key and agent ID); unauthenticated calls return 401.

Deployment
- Pushing to `main` deploys via `.github/workflows/deploy.yml` to the existing EC2 server (Region us-east-2 from local config) behind Cloudflare and Nginx (`deploy/`). Server `.env` is preserved across deploys. Production OAuth redirect: `https://orgflow.dev/auth/google/callback`; whether it is saved in the Google client was last reported as missing (`redirect_uri_mismatch`), current status not verified. Google app is in Testing, test users only. Google project `orgflow-20261011`.
- Microsoft 365, calendar sync (events are synthetic), quote-level citation validation and extraction caching: not built.

## Superseded decisions

- Product name "Continuity AI" -> OrgFlow.
- Proposed NDJSON `POST /api/ask` for iOS -> iOS uses `POST /api/agent` (`mode: "ask"`) and reveals the answer progressively.
- Agent-proposed bottom-right launcher -> top-left launcher with dock option.
- Browser speech recognition/synthesis for web voice -> ElevenLabs live voice; WebSocket signed URL -> WebRTC `GET /api/voice/session-token`.
- "Single-workspace, local-only, no organization isolation" -> organizations with isolation and public deployment at orgflow.dev/a/.
- "Only Capture in scope" for the hackathon -> Connect, Capture, Ask and Transfer all have implementations.
- Luminal Flash as a documentation-only plan -> implemented adapter (agent.ts, luminal.ts).

## Handoff notes

1. Read [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) and ask the human before touching any of them (deploying, approval rules, Google verification, Microsoft, pricing).
2. Before demoing: set `LUMINAL_API_KEY` and retest Discover and handoff drafting live; add a Google test user; confirm the production redirect URI.
3. Verify the iOS app on a physical iPhone (voice capture, Handoff, Library).
4. Do not push to `main` without confirmation; it deploys production.
5. Run `bun run typecheck && bun run test` before handing off; update this file instead of adding logs.
