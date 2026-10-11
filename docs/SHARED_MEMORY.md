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
| 2026-10-11 | User | Product is Continuity AI; original product brief is preserved in MVP.md. |
| 2026-10-11 | User | Hackathon priority: presentation-ready and sellable. Work collaboratively in interview style. |
| 2026-10-11 | User | Capture—turning scattered content into employee-approved playbooks—is the demo centerpiece. |
| 2026-10-11 | User, accepting suggested scenario | Use donor stewardship as the first demo process. |
| 2026-10-11 | User | Demo a live connection; file upload is the fallback. |
| 2026-10-11 | User | Build both Gmail and Google Drive connections. |
| 2026-10-11 | User | Six hours remained before judging when stated; do not assume a fresh six-hour window on resumption. Exact judging time was not recorded. |
| 2026-10-11 | User | Demo uses a personal Google login. Google Cloud project and OAuth configuration must start from scratch. |
| 2026-10-11 | User | Save state, preserve MVP and core decisions, create shared human/agent memory, and reference it from AGENTS.md. |
| 2026-10-11 | User | Team has substantial free access to https://dash.luminal.com/flash and sees it as useful for quick indexing. Evaluate this resource when implementing ingestion/indexing; integration is not yet confirmed. |

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
- No AWS resources or Google Cloud project were created in this conversation.
- Workspace inspection found no `gcloud` executable or available Google Cloud management tool. No Google Cloud authentication was established.
- Model provider, indexing architecture, storage, deployment, auth, and exact pricing remain undecided.

## Google setup handoff

User was given these browser steps; completion has **not** been reported:

1. Create Google Cloud project named Continuity AI at https://console.cloud.google.com/projectcreate.
2. Enable Gmail API and Google Drive API.
3. Configure Google Auth Platform branding/support email, External audience, Testing status, and add the personal Gmail as a test user.

Next: confirm progress, choose the app's actual callback origin/URL, and create a Web application OAuth client. The exact redirect URI has not been chosen. An API key alone does not authorize private Gmail/Drive access; no service-account key is needed for the selected personal-user OAuth flow. Keep client secrets server-side and outside version control.

Official references consulted:

- https://developers.google.com/workspace/guides/configure-oauth-consent
- https://developers.google.com/workspace/guides/create-credentials

## Next session

1. Read this memory and MVP; check repository changes before assuming scaffolds are unchanged.
2. Resume from Google setup status and the remaining hackathon time.
3. Inspect Luminal Flash capabilities/docs and available access before deciding how it fits indexing. No Flash capabilities, API, or integration have been verified yet.
4. Implement the agreed demo flow, retaining file upload as fallback.

Work is saved for handoff; no background build or setup is running.
