# OrgFlow design brief

Confirmed human decisions unless marked as an assumption. Decisions and state: [shared memory](SHARED_MEMORY.md). Original vision: [MVP](MVP.md). Open questions: [OPEN_QUESTIONS](OPEN_QUESTIONS.md).

## Visual direction

Modern and expressive. Off-white backgrounds, purple accents, professional chat and voice tone. Left sidebar navigation: Home, Files, Knowledge Base, Checklists, People, Organization.

## Home

AI chat is primary ("How can I help?"). Recent files and upcoming events sit below it; the calendar has a month grid and agenda list with a toggle. Calendar events are synthetic samples; no calendar sync exists.

## Organizations and roles

Each organization's data is isolated. Sign-up creates a new organization (the creator is admin) or joins one by invite code (member); sign-up with neither joins the shared demo workspace, which carries clearly labelled sample playbooks and people. Admins see and rotate the invite code. An audit log records publishing, reviews, runs, indexing and handoffs. Whether new sign-ups should default to a private organization, and who may approve, are open questions.

## Connect and Files

Files are an index across providers; originals stay in Google Drive and similar systems. Start from the provider's folder structure; staff can rearrange links inside OrgFlow only. Clicking a file opens the original provider. Gmail and Google Drive (read-only OAuth) are the live providers; Outlook, SharePoint and OneDrive are product direction, not built.

Indexing is explicit and consented: staff choose to index the text of recent Google Docs and emails. Indexed text stays in OrgFlow, feeds Ask and Discover, may be sent to the AI provider (Luminal), and can be removed per source or entirely.

## Knowledge Base and approval

OrgFlow hosts all knowledge-base content. Categories form a sidebar; staff create and rename them. Articles are rich text, authored manually, drafted by AI from sources, or captured via chat/voice. Edits autosave as drafts; Publish is a separate human action and preserves a published snapshot. Any staff member may approve and publish. Agent-created content always arrives as a draft.

## Capture: Discover, drafting and living playbooks

- Discover scans indexed emails and documents for recurring workflows and proposes candidate playbooks with evidence. Staff can draft a playbook from a candidate (saved as a draft article) or dismiss it.
- Voice capture: on the web, a live ElevenLabs interview produces an editable transcript, then (after consent) a draft; on iOS, on-device transcription feeds the drafter.
- Playbooks have an owner and a review date (90 days by default). The owner confirms a playbook is still accurate; overdue ones show as "due for review".

## Checklists

A published playbook's list items become a runnable checklist (steps, assignee, due date, per-step notes and completion). Runs complete automatically when all steps are done.

## Ask

Answers are grounded in approved articles plus indexed email and document excerpts retrieved by keyword (BM25). Citations are labelled by source type (article, email excerpt, document excerpt, file location). Drafts are used only when explicitly selected and are marked unapproved.

## Transfer: people and handoff

People records (name, role, email) are separate from sign-in accounts. Marking a person as leaving lets staff generate a handoff guide from the playbooks they own, emails they sent (from the index) and notes: responsibilities, timing, relationships, where things live, work in progress, a first-30-days checklist and review questions. It is a draft needing approval. A successor onboarding checklist can then be started from the approved guide.

## Global agent

Launcher at the top left opens a centered modal, dockable to the bottom right. Chat and Voice are tabs sharing one conversation. Voice uses a private ElevenLabs realtime agent through an authenticated short-lived session token; the key stays server-side.

## Implementation choices (agent assumptions)

React via Bun HTML imports, Tiptap editor, Bun HTTP API, PostgreSQL via `DATABASE_URL` with SQLite for local development, Swagger at `/docs` and `/openapi.json`, billing through the AWS Monetization sandbox (enforcement off). Sample content is always labelled.

## iOS app (voice-first companion)

Status: implemented, builds; not verified on a physical device. Programmatic UIKit, Metal "Living Thread" knot, iOS 27 target.

- Three modes: Ask (answers from approved knowledge and consented excerpts), Capture (narrate a process to draft a playbook), Handoff (narrate a role to draft a handoff guide with a first-30-days checklist).
- Transcription is on device. Drafting defaults to the backend agent (`mode: "draft"`); an optional "Draft on this iPhone" setting (off by default, needs Apple Intelligence) structures the narration locally and sends only the finished draft.
- Capture and Handoff produce drafts only; staff open the draft and tap "Approve & publish".
- Library has Knowledge, Files, Upcoming and Checklists (run checklists). There is no rich-text editing on iOS.
- Provider connections and indexing stay on the web; sign-in is in-app.
