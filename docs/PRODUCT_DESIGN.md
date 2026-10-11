# OrgFlow build brief

Date: 2026-10-11. Confirmed decisions from the human interview unless marked as an assumption. Full chronology: [shared memory](SHARED_MEMORY.md). Original vision: [MVP](MVP.md).

## Visual direction

Modern and expressive. Off-white backgrounds and purple accents. Professional chat and voice tone. Main navigation is a left sidebar: Home, Files, Knowledge Base.

## Home

AI chat is the primary experience, using a “How can I help?” prompt. Recent files and upcoming events appear below chat. The calendar supports a month grid and agenda list with a toggle. Including both connected meetings and operational deadlines is a working interpretation of the user's “yes,” not an explicit selection.

## Files

Index files across providers; originals remain in Google Drive, OneDrive, SharePoint, and similar systems. Start from each provider's native folder structure. Staff can reorganize links inside OrgFlow without moving source files. Clicking a file opens its original provider.

Gmail and Google Drive were selected for the first live demo; other providers are product direction rather than confirmed live MVP integrations. Donor stewardship remains the demo process.

## Knowledge Base

OrgFlow hosts all knowledge-base content on its servers. PostgreSQL is the user's probable database choice. Categories appear in a sidebar and staff can create and rename them.

Support manual authoring, AI assistance, drafting from connected sources, and knowledge capture through chat/voice. Articles use rich text. Autosave edits as drafts; publishing is a separate human action. Any staff member may approve and publish. Agent-created content and changes require approval before publication.

## Global agent

Launcher at the top left. Open a centered modal with the option to dock at the bottom right. Chat and Voice are tabs in the same window and preserve the conversation on switching. Live spoken interviews with follow-up questions are the agent's stated interpretation of an ambiguous “yes”; voice-note-only behavior was not chosen explicitly.

## Authorized implementation choices

The user requested subagents, frontend and backend implementation, reasonable assumptions along the way, and Swagger documentation once the backend is ready.

- React through Bun HTML imports, following the repository's Bun instructions.
- Tiptap open-source editor with rich-text, image, and checklist extensions. Save structured JSON; image binaries need separate server storage.
- Bun HTTP API, PostgreSQL via configuration; persistent SQLite fallback for local development if PostgreSQL is unavailable, clearly labeled.
- Swagger UI at `/docs` and `/swagger`; machine-readable OpenAPI at `/openapi.json`.
- Local development only until authentication and organization authorization exist. No cloud deployment requested.
- Synthetic demo content clearly marked; no provider shown as connected unless a real connection exists.
- Browser speech input/output for initial voice experience, with explicit capability and privacy information. A dedicated realtime voice service remains future work.

These implementation choices are agent assumptions, not independently confirmed human selections. Implementation status and validation results belong in shared memory and project READMEs.
