# Shared human / agent memory

Last updated: 2026-10-11. This file preserves collaboration state across sessions. It is shared by humans and agents; it is not evidence that a feature has been implemented.

## How to use and maintain this memory

- Read this file and [MVP.md](MVP.md) before product work.
- Record consequential human decisions, constraints, implementation progress, unresolved questions, and the next concrete action.
- Distinguish confirmed decisions from agent proposals and unverified claims. Never silently treat a proposal as human approval.
- When a decision changes, preserve the previous decision and mark it superseded with a reason.
- Keep credentials, OAuth tokens, keys, private email content, and donor data out of this file and version control.
- Prefer concise entries with date, author/source, decision or observation, and status. Update this file when handing work off.
- This memory does not override explicit user instructions or AGENTS.md. Use the latest explicit user direction when they conflict.

## Confirmed human decisions and context

| Date | Source | Decision / context |
| --- | --- | --- |
| 2026-10-11 | User | Product is OrgFlow; original product brief is preserved in MVP.md. |
| 2026-10-11 | User | Hackathon priority: presentation-ready and sellable. Work collaboratively in interview style. |
| 2026-10-11 | User | Capture—turning scattered content into employee-approved playbooks—is the demo centerpiece. |
| 2026-10-11 | User, accepting suggested scenario | Use donor stewardship as the first demo process. |
| 2026-10-11 | User | Demo a live connection; file upload is the fallback. |
| 2026-10-11 | User | Build both Gmail and Google Drive connections. |
| 2026-10-11 | User | Six hours remained before judging when stated; do not assume a fresh six-hour window on resumption. Exact judging time was not recorded. |
| 2026-10-11 | User | Demo uses a personal Google login. Google Cloud project and OAuth configuration must start from scratch. |
| 2026-10-11 | User | Save state, preserve MVP and core decisions, create shared human/agent memory, and reference it from AGENTS.md. |
| 2026-10-11 | User | Team has substantial free access to https://dash.luminal.com/flash and sees it as useful for quick indexing. Evaluate this resource when implementing ingestion/indexing; integration is not yet confirmed. |
| 2026-10-11 | User | Asked to fit Luminal Flash into the MVP because the team has substantial free credits. Credits are user-reported; balance and expiry have not been verified. |

## Sponsor interview context

User spoke with the CEO of Bloomerang, a hackathon sponsor. Reported notes:

- Nonprofits have 50% annual employee turnover, with “36% of that is leadership.” These are interview claims, not independently verified statistics; the meaning of the leadership percentage is unresolved. Do not present them as established public facts without a source.
- Suggested solution: a process playbook defining tool and AI-assisted knowledgebase integrated with existing email systems and file stores.
- Competitor/reference: https://www.process.st/; user wants a better version for this use case.

Agent reviewed Process Street's homepage during this conversation. It already advertises AI workflow generation, integrations, and document management, with a compliance operations emphasis. Avoid claiming it has no AI. Working positioning: recover the nonprofit's actual practices from its sources, with evidence and human approval.

## Proposed demo flow (agent proposal; details still open)

Connect Gmail and Google Drive → select relevant emails/documents → generate donor stewardship playbook → inspect source citations → edit/answer knowledge gaps → approve for a successor.

Possible stewardship steps: record a gift, send acknowledgment, assign follow-up, preserve donor preferences. Specific dataset and UI are not finalized.

Agent proposed keeping Ask and Transfer on the roadmap for the six-hour build; user has not explicitly confirmed their exclusion. Do not build all original integrations automatically: only Gmail and Drive were selected for this demo.

## Repository / implementation state

- Initial inspection found Bun/TypeScript scaffolds only.
- `landing/index.ts`: placeholder HTML, default port 3001.
- `frontend/index.ts`: placeholder HTML, default port 3002.
- `backend/index.ts`: JSON service and health responses, default port 3003.
- No product UI, live connectors, ingestion, AI playbook generation, approval flow, or upload fallback has been implemented in this conversation.
- No AWS resources were created in this conversation.
- 2026-10-11 implemented: After user confirmed CLI login and requested a new project, created Google Cloud project `orgflow-20261011` (display name OrgFlow) and selected it as the default gcloud project. Project creation completed successfully. Gmail and Drive APIs were subsequently enabled and verified; application OAuth setup remains pending.
- 2026-10-11: Installed Google Cloud CLI 588.0.0 at `/home/node/google-cloud-sdk`, with PATH initialization in `/home/node/.bashrc`; verified `gcloud version`. User completed browser login; active CLI authentication verified. Default Google Cloud project is `orgflow-20261011`. Credentials remain outside the repository.
- Model provider, indexing architecture, storage, deployment, auth, and exact pricing remain undecided.
- 2026-10-11 agent proposal: [Luminal Flash integration plan](LUMINAL_FLASH.md) places Flash in Capture for source-backed fact extraction and playbook drafting, with embeddings conditional on verified support. MVP.md links this plan. Documentation only; no API adapter or live integration exists. The supplied Flash URL returned a 404 during inspection; API contract, models, credit eligibility, and data policies remain unverified. Luminal's public homepage describes managed inference but does not verify Flash's specific capabilities.

## Google setup handoff

Project creation is complete through gcloud (`orgflow-20261011`). The remaining browser setup steps have not been reported complete. Original setup checklist:

1. Create Google Cloud project named OrgFlow at https://console.cloud.google.com/projectcreate.
2. Enable Gmail API and Google Drive API.
3. Configure Google Auth Platform branding/support email, External audience, Testing status, and add the personal Gmail as a test user.

Next: confirm progress, choose the app's actual callback origin/URL, and create a Web application OAuth client. The exact redirect URI has not been chosen. An API key alone does not authorize private Gmail/Drive access; no service-account key is needed for the selected personal-user OAuth flow. Keep client secrets server-side and outside version control.

Official references consulted:

- https://developers.google.com/workspace/guides/configure-oauth-consent
- https://developers.google.com/workspace/guides/create-credentials

## Next session

1. Read this memory and MVP; check repository changes before assuming scaffolds are unchanged.
2. Resume from Google setup status and the remaining hackathon time.
3. Follow LUMINAL_FLASH.md: obtain working Flash API documentation/access, verify model and credit eligibility, and make a small synthetic extraction/drafting call before implementing the Capture adapter. Do not assume embedding support or an API format.
4. Implement the agreed demo flow, retaining file upload as fallback.

Work is saved for handoff; no background build or setup is running.

## Luminal configuration handoff — 2026-10-11

- User supplied text API details: OpenAI-compatible `https://flash.luminal.cloud/v1`, model `deepseek-ai/DeepSeek-V4.1-Flash`, bearer authentication. These details have not yet been tested with a live authenticated request.
- Saved supplied credential only in Git-ignored `backend/.env` with owner-only permissions. Added credential-free `.env.example` and backend README instructions. Never copy the credential into memory or tracked files.
- Retrieved official image docs at https://images.luminal.cloud/docs/ and recorded endpoints, authentication, polling, and retention notes in LUMINAL_FLASH.md. This supersedes the earlier lack of usable API information; the original dashboard URL still did not provide docs. No generation or credit-consuming requests were made.
- Next: synthetic text smoke request, then the Capture adapter. Text embeddings and retention remain unverified.

### Luminal live test — 2026-10-11

Authenticated text smoke test succeeded: `POST https://flash.luminal.cloud/v1/chat/completions` returned HTTP 200 with model `deepseek-ai/DeepSeek-V4.1-Flash`, content `Luminal connection works`, and finish reason `stop`. Reported usage: 38 prompt tokens + 41 completion tokens = 79 total (35 reasoning tokens included in completion). This verifies the saved key and text endpoint/model for a basic request; image generation, structured extraction quality, and embedding support remain untested. An earlier small synthetic extraction request was submitted, but its response was not captured; do not treat extraction as validated.

## Product layout interview — 2026-10-11

Confirmed user direction:
- Research Process Street before design/build; work through theme and MVP decisions in interview style.
- Three main user-facing views: AI-chat-first Home with recent files and upcoming-events calendar; organization-wide Files explorer; Knowledge Base for SOPs and similar material.
- Original files remain in external providers such as SharePoint, OneDrive, and Google Drive. OrgFlow presents an index rather than becoming the original-file host. Retention of extracted text/index data and storage of generated SOPs remain open.
- Global agent popup modal supports chat and voice; exact voice interaction remains open.
- Build both frontend and backend. This turn begins discovery; no new product implementation yet.

Research: reviewed Process Street public homepage and Docs, Ops, Cora product pages. Public positioning centers on compliance operations; Docs describes rich-text pages, permissions, versioning, approvals, and document control. These are vendor claims, not independently tested product behavior. References: https://www.process.st/ and https://www.process.st/product/docs/ . Authenticated application UI was not inspected.

Next: collect visual-theme preference, generated-SOP storage/editing choice, calendar source, and meaning of voice agent; preserve existing Gmail/Drive and donor-stewardship demo decisions unless user changes them.

### Confirmed visual direction — 2026-10-11

User selected modern and expressive styling, an off-white background, and purple as the accent color. Exact shades, typography, and component styling remain undecided.

### Knowledge base storage — 2026-10-11

Confirmed human decision: all knowledge-base content lives on OrgFlow's servers. Original connected files remain in external providers, per the earlier decision. User suggested PostgreSQL as the probable knowledge-base database; database selection is tentative, not finalized or implemented.

### Knowledge base authoring — 2026-10-11

Confirmed human direction: support both manual article authoring with AI assistance and AI drafting from connected sources. User also explicitly included the chat/voice agent in knowledge-base authoring. Agent interpretation: the global agent can help create or update articles; exact interaction and save/approval behavior remain to be defined. Earlier employee-approval requirement for generated playbooks remains in effect.

### Voice and calendar interview — 2026-10-11

- User answered "yes" to a question offering live spoken conversation or recorded voice notes. Agent interpreted this as live spoken interviews with follow-up questions and SOP drafting for review, then stated that interpretation to the user. This remains an interpretation of an ambiguous answer, not an explicit choice between options.
- User answered "yes" to a question offering connected meetings, operational deadlines, or both for the Home calendar. Agent proceeds with both as a working assumption; exact calendar provider and deadline source remain open.

### SOP publishing approval — 2026-10-11

Confirmed human decision: when the agent creates or changes an SOP, show a draft for human approval before publishing. Applies to chat and voice authoring as well as drafts from connected sources. Who can approve remains undecided.

### SOP approvers — 2026-10-11

Confirmed human decision: any staff member can approve and publish SOPs; approval is not restricted to designated admins/editors. Organization boundaries and source-access permissions still apply.

### Files opening behavior — 2026-10-11

Confirmed human decision: clicking a file in OrgFlow opens it in its original provider/app. An in-OrgFlow preview is not the selected opening behavior.

### Agent tone — 2026-10-11

Confirmed human decision: the chat and voice agent should use a professional tone.

### Knowledge base navigation — 2026-10-11

Confirmed human decision: the knowledge base uses a sidebar of categories, rather than topic cards as its primary browsing layout.

### Knowledge base category management — 2026-10-11

Confirmed human decision: staff can create and rename knowledge-base categories. Categories are not restricted to a fixed MVP set.

### Files organization — 2026-10-11

Confirmed human direction: preserve each provider's original folder structure initially, while allowing reorganization as needed because providers may use different organizational structures. Whether reorganization changes only OrgFlow's presentation or moves source files in the provider remains unresolved; do not implement provider-side moves without resolving this distinction.

### Files reorganization scope — 2026-10-11

Confirmed human decision: reorganization changes only how file links are arranged within OrgFlow. It does not move or reorganize original files in connected providers. This resolves the preceding open question about provider-side moves.

### Google APIs and OAuth handoff — 2026-10-11

- Implemented and verified: enabled `gmail.googleapis.com` and `drive.googleapis.com` in `orgflow-20261011`.
- OAuth consent screen and Google Workspace Web application client are not configured by this agent. Available tools provide CLI access but no authenticated browser control; official Workspace instructions use Google Auth Platform in the browser. IAM workforce OAuth clients are a different feature and were not created.
- Prepared credential-free Google variables in `backend/.env.example` and exact browser steps in [GOOGLE_SETUP.md](GOOGLE_SETUP.md). Proposed development redirect: `http://localhost:3003/auth/google/callback`, matching the current backend port. Callback handler is not implemented; deployed redirect remains undecided.
- Next: finish External/Testing consent setup, add the personal login as a test user, create a Web application client, save its credentials only in ignored `backend/.env`, then implement the OAuth callback and connectors.

### Home layout — 2026-10-11

Confirmed human decision: recent files and upcoming events sit below the main AI chat, rather than in a right-hand panel.

### Google OAuth credentials saved — 2026-10-11

- User supplied a Google OAuth client ID and secret. Saved them only in ignored `backend/.env`, preserving existing configuration and enforcing permissions `0600`. Credential values are not recorded here.
- Configured local project and planned redirect (`http://localhost:3003/auth/google/callback`). Local variable presence and file permissions verified. Consent-screen settings, registered redirect, and end-to-end OAuth have not been verified; callback handler and connectors remain unimplemented.

### Agent launcher and modal placement — 2026-10-11

Confirmed human decision: place the global agent launcher at the top left. It opens a centered modal, with an option to move/dock the agent to the bottom right. This supersedes the agent's proposed bottom-right launcher, which the user did not select.

### Agent chat/voice switching — 2026-10-11

Confirmed human decision: chat and voice are two tabs within the same agent window, preserving the conversation when switching modes.

### Main navigation — 2026-10-11

Confirmed human decision: use a left sidebar for main navigation between Home, Files, and Knowledge Base. Knowledge Base additionally uses its previously selected category sidebar.

### Calendar presentation — 2026-10-11

Confirmed human decision: upcoming events support both a monthly calendar grid and an agenda list, with a toggle between views.

### Rich-text editor — 2026-10-11

Confirmed human decision: knowledge-base articles support rich text. User requested researching an existing editor library/plugin to simplify implementation.

Agent researched Tiptap and BlockNote official documentation. Implementation proposal: Tiptap open-source editor with StarterKit plus image and checklist extensions, custom styling for the off-white/purple theme, and structured JSON article content stored in PostgreSQL if selected. Tiptap supports vanilla JavaScript as well as framework integrations; current frontend is a Bun placeholder without a UI framework. Tiptap's image extension displays images but does not provide an upload backend, which must be implemented separately. No editor dependency installed and no editor implemented during this discovery turn.

References: https://tiptap.dev/docs/editor/getting-started/overview ; https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript ; https://tiptap.dev/docs/editor/extensions/nodes/task-list ; https://tiptap.dev/docs/editor/extensions/nodes/image ; https://tiptap.dev/docs/editor/core-concepts/persistence ; https://www.blocknotejs.org/docs .

### Build authorization and autosave — 2026-10-11

Confirmed human decisions: rich-text articles autosave as drafts with a separate Publish action. User authorized spawning subagents to build frontend/backend, making reasonable assumptions along the way, saving all decisions, and exposing Swagger documentation once the backend is ready.

Implementation assumptions for this build: use React + Bun HTML imports + Tiptap for the frontend (Bun selected after reading the local frontend instructions); Bun backend; PostgreSQL via DATABASE_URL when configured with persistent local development fallback if unavailable. Any fallback and synthetic demo data must be clearly labeled. No cloud deployment is requested. Calendar defaults to agenda with a month toggle. Source provider integrations remain explicitly disconnected until credentials are configured. Voice uses browser speech capabilities initially if available and displays availability honestly. Agent writes drafts; publication remains an explicit human action. These are agent choices, not separate human decisions.

### Google OAuth configuration probe — 2026-10-11

- Live credential probe: supplied client credentials with a deliberately invalid authorization code returned `invalid_grant` / malformed code; invalid-secret control returned `invalid_client` / invalid secret. This supports acceptance of the saved client ID/secret. No tokens were issued.
- Authorization URL with the planned local callback and Gmail/Drive read-only scopes reached Google sign-in (HTTP 200) without a redirect mismatch or invalid-client error. Consent-screen/test-user eligibility and actual user grant remain unverified. No Gmail/Drive data was accessed. Callback handler remains unimplemented.

## Frontend/backend build handoff — 2026-10-11

User authorized parallel subagent implementation. Confirmed decisions are consolidated in [PRODUCT_DESIGN.md](PRODUCT_DESIGN.md); this supersedes earlier scaffold-only implementation descriptions.

Implemented locally:
- React/Bun frontend with off-white/purple styling, left navigation, AI-first Home, recent files/calendar below chat, agenda/month toggle, provider folder explorer and OrgFlow-only link reorganization.
- Knowledge-base category creation/rename, Tiptap rich text, links/checklists/images, local image upload, draft autosave, explicit Publish, and preserved published snapshots while edits remain draft.
- Top-left agent launcher, centered modal, bottom-right docking, shared Chat/Voice conversation, keyboard controls, browser-dependent speech input/output. This is turn-based browser speech, not a dedicated realtime voice backend.
- Bun API and persistent SQLite development storage; PostgreSQL JSONB implementation selected with DATABASE_URL. No configured PostgreSQL instance was available for a live integration check. A configured PostgreSQL failure stops startup rather than silently falling back.
- Swagger UI at /docs and /swagger, local assets, OpenAPI at /openapi.json, available directly on backend or through frontend proxy.
- Google read-only OAuth with PKCE and browser-bound state, server-memory tokens, Drive metadata sync, selected Google Doc/text-file and Gmail plain-text source readers. No live Google consent/access verified during this build; session restarts require reconnecting. Metadata sync preserves staff's custom OrgFlow paths. Original files never move or upload into OrgFlow.
- Luminal professional chat and draft adapter, explicit selected-text consent, structured content/citation-ID validation, source metadata persistence and evidence links. General Ask uses published snapshots; selected working drafts are tagged unapproved. Metadata permits file discovery without claims about contents. Malformed responses do not save. A small live synthetic draft succeeded; fuller capture verification exposed intermittent malformed JSON, being investigated before final handoff.
- Root run/install/typecheck/test/build scripts and updated READMEs. Existing unrelated AGENTS/Submission Video changes were preserved.

Validation so far: 20 backend tests/90 assertions, backend/frontend typechecks, production HTML bundle, and browser checks for categories, autosave, publish snapshots, file reorganization, calendar controls, agent docking/tabs/Escape, Swagger through frontend, and mobile overflow. Test-browser actions used a separate /tmp SQLite database and ports 3012/3013, not the main workspace database. Tests use mocks for OAuth and synthetic content for AI.

Material limits: single-workspace localhost prototype without staff authentication/organization isolation; no public deployment. Microsoft connectors and calendar sync remain disconnected, calendar sample events are synthetic. No production database instance, indexing/embeddings, quote-level citation verification, extraction caching, or dedicated realtime voice service. Browser speech may send audio to browser vendor; UI discloses this. Provider text retention remains unverified.

### Final verification and running app — 2026-10-11

- AI capture verification is now complete for synthetic content. Simplified model output to sections converted server-side to Tiptap, retained legacy validated rich-text support, and added one malformed-JSON retry within a shared timeout. Invalid output remains unsaved. Provider errors are surfaced honestly.
- Full browser pipeline passed: text-file upload → explicit consent gate → live Luminal generation → saved draft with citation metadata → evidence panel → image upload/rendering/autosave. No browser runtime errors. No private connected content was used.
- Final automated validation: 22 backend tests, 99 assertions; backend and frontend typechecks; production HTML bundle; git diff whitespace check. Browser checks additionally cover category CRUD supported scope (create/rename), publish snapshot preservation, OrgFlow-only file rearrangement, calendar controls, agent docking/voice tabs/Escape, Swagger assets via frontend, and mobile overflow. PostgreSQL and live Google consent remain unverified.
- Main app remains running at http://localhost:3002; backend http://localhost:3003; Swagger http://localhost:3003/docs (also /swagger); OpenAPI /openapi.json. Main backend uses persistent local SQLite. Root `bun run dev` restarts both services; see README for setup. Development hot reload/restarts clear server-memory Google sessions.
- Separate browser-test servers on 3012/3013 were stopped at handoff. Their synthetic test database remains under /tmp, outside the repository. No AWS resources or public deployment were created.
- Next substantive work: configure/verify a PostgreSQL instance, complete Google browser consent and test selected live sources, add staff authentication and organization authorization before hosting, and choose calendar sync/realtime voice providers. These are outstanding integration/production work, not additional confirmed product decisions.
