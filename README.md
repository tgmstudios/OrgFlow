# OrgFlow

OrgFlow is the official and permanent product name. Its exact capitalization is OrgFlow. Never rename it without explicit approval from the project owner. Every browser tab must display exactly OrgFlow.

Authoritative brand configuration: `backend/branding.ts` defines `PRODUCT_NAME = "OrgFlow"`, `DOCUMENT_TITLE = "OrgFlow"`, and `PRODUCT_DOMAIN = "orgflow.dev"`. Preserve technical identifiers, integration URLs, storage paths, the iridescent knot and provider icons.

Your nonprofit's knowledge shouldn't leave when your employees do. OrgFlow is an AI-powered institutional memory platform for nonprofits: it turns scattered emails, documents and employee knowledge into living, human-approved playbooks that survive staff turnover. Think Process Street plus AI knowledge management, built for organizations with 10-200 staff.

Status: PostgreSQL/Prisma production cutover is deployed and verified; AI paths partly verified live; nothing verified on a physical iPhone. Details: [docs/SHARED_MEMORY.md](docs/SHARED_MEMORY.md).

## Capabilities

| Capability | What it does | Where |
| --- | --- | --- |
| Connect | Google Drive and Gmail OAuth (read-only); consented text indexing of recent Docs and emails. Microsoft 365 is not built. | Web (Files: connections and indexing); `backend/google.ts` |
| Capture | Discover suggests recurring workflows from indexed content and drafts playbooks; voice interview on web (ElevenLabs) and on iOS (on-device transcription); drafts need human approval; runnable checklists; owners and periodic review ("due for review"). | Web, iOS (Capture, Library); `backend/operations.ts`, `agent.ts` |
| Ask | Answers grounded in approved articles plus consented email/document excerpts (BM25 retrieval), labelled by source type. | Web agent, iOS Ask; `backend/agent.ts`, `retrieval.ts` |
| Transfer | People records, mark leaving, AI handoff guide from owned playbooks, sent emails and notes, successor onboarding checklist. | Web (People, Knowledge map), iOS Handoff; `backend/operations.ts` |

Platform: organizations with isolation (new org at sign-up or invite code; default shared demo workspace with labelled samples), admin/member roles, audit log, billing through the AWS Monetization sandbox (enforcement off).

## Quick start

Requires [Bun](https://bun.sh).

```sh
bun run install:app   # installs backend and frontend dependencies
(cd backend && docker compose up -d)  # local PostgreSQL + pgvector
cp backend/.env.example backend/.env   # first time only; fill values locally, never commit
cd backend && bun run prisma:migrate:deploy && cd ..  # create the local schema
bun run dev           # backend :3003 and frontend :3002
```

- Web app: http://localhost:3002 (production: https://orgflow.dev/a/)
- Swagger UI: http://localhost:3003/docs; OpenAPI: `/openapi.json`; health: `/health`
- Verify: `bun run typecheck`, `bun run test`, `bun run build`
- iOS: open `app/iOS/OrgFlow.xcodeproj` in Xcode, run on a simulator or device (deployment target iOS 27). It talks to `OrgFlowBaseURL` in `app/iOS/OrgFlow/Info.plist` (default `https://orgflow.dev`); point it at your own backend to test local changes.

Without `LUMINAL_API_KEY`, Ask, drafting, Discover and handoff return an `AI_NOT_CONFIGURED` error. PostgreSQL is required for all app runs; local development uses the pgvector Docker image described above. Pushing to `main` deploys production (`.github/workflows/deploy.yml`, `deploy/`).

## Demo walkthrough

Live AI steps need `LUMINAL_API_KEY` on the backend; Google steps need a Google test user (the OAuth app is in Testing). Use synthetic or consented content only. Live AI steps for Discover and handoff were not verified end to end (provider returned 503 during testing).

1. **Connect.** Sign up with an organization name (or use the demo workspace). On Files, under Connected tools, click Connect for Google and consent as a test user.
2. **Index.** On Files, in the indexing panel, read the consent text, and index recent Docs and emails. Show the indexed source list and that any source can be removed.
3. **Discover.** In Knowledge Base, run Discover (suggested playbooks). It proposes recurring workflows (for example donor stewardship) with evidence from the indexed emails and documents.
4. **Draft and approve.** Draft a playbook from a suggestion, review the cited sources, edit, then Approve and publish. Assign an owner; show the review date and "due for review".
5. **Run a checklist.** Start a run from the published playbook, assign it, and tick off steps.
6. **Ask.** Ask a question in the agent. Show the answer citing the approved playbook and email/document excerpts, each labelled by source type.
7. **Transfer.** In People, mark a person as leaving and generate their handoff guide (from owned playbooks, sent emails and notes), approve it, then start the successor's onboarding checklist.
8. **Knowledge map.** See playbooks and indexed source material grouped by owner, assign or reassign owners, and open a person's handoff flow. Assigned sources feed that person's handoff draft.

iOS moment: on an iPhone, open Capture (or Handoff), narrate a process or role aloud (on-device transcription), and show the resulting draft in Library awaiting "Approve & publish". Not verified on a physical device.

## Docs

- [AGENTS.md](AGENTS.md): instructions for coding agents
- [docs/SHARED_MEMORY.md](docs/SHARED_MEMORY.md): decisions, current state, handoff
- [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md): questions needing a human answer
- [docs/MVP.md](docs/MVP.md): original brief; [docs/PRODUCT_DESIGN.md](docs/PRODUCT_DESIGN.md): design brief
- [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md), [docs/LUMINAL_FLASH.md](docs/LUMINAL_FLASH.md)
- [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md)

`landing/` is a separate placeholder. Secrets stay in Git-ignored `backend/.env` and GitHub Actions secrets.


## Fictional OrgFlow showcase library (opt-in)

The `demo-content/` package contains complete, nonidentifying nonprofit documents,
PDFs, CSVs, email examples, a calendar and a verified 90-second ad handoff.
It is not a customer dataset.

An admin of a newly registered
`Center Valley Community Pantry (OrgFlow Showcase)` organization can visit
Organization and choose **Load showcase files and staff**. This imports linked
original documents and searchable synthetic source text, plus role ownership,
reporting lines, successors and draft playbooks. It never touches the shared demo
or another organization's data and does not connect a Google account.

Google Drive
and Gmail integration require separate OAuth authorization and indexing consent.
Instructions: [Website import and access](demo-content/00_START_HERE/WEBSITE_IMPORT_AND_ACCESS.md).
