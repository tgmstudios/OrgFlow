# Open questions for the product owner

Agents (Claude Code, Codex, others): **these need a human answer.** When your task touches one of these,
ask the person you're working with before changing the assumption — quote the question and the current
default. When you get an answer, move it into "Confirmed human decisions" in
[SHARED_MEMORY.md](SHARED_MEMORY.md) and delete it here. Add new questions here instead of guessing.

Each entry lists the **current default** — what the code does until someone decides.

## Release and deployment

1. **Finish the rename to OrgFlow.** "Continuity AI" is retired; OrgFlow is the name everywhere. User-facing
   leftovers: the iOS microphone and speech-recognition permission prompts (`OrgFlow.xcodeproj`, "Continuity
   listens…" / "Continuity transcribes…"). Internal names (`ContinuityTheme`, "Continuity Knot" comments) can
   follow. Default: not yet changed.

## Organizations and permissions

2. **Default for new sign-ups.** Sign-up without an organization name or invite code joins the shared
   demo workspace. Should it create a private organization instead? Default: demo workspace.
3. **Who may approve and publish?** Any member can publish any draft, including their own (per the
   product design brief). Should approval require a second person or the admin role? Default: anyone.
4. **Who may invite?** Only admins see and rotate the invite code. Default: admins only.
5. **People vs accounts.** People (for ownership and Transfer) are separate records, not linked to sign-in
   accounts. Default: separate.
6. **Review cadence.** Published playbooks are due for review 90 days after publishing or last review
    (`REVIEW_INTERVAL_DAYS`). Default: 90 days for every article.

## Data, consent and AI

7. **Luminal data handling for donor data.** Indexed email/document excerpts and article text are sent to
    Luminal for Ask, Discover, and drafts under the indexing consent. Luminal's retention/training terms
    have not been verified. Default: allowed under the consent text shown in the app.
8. **Index scope.** Indexing reads the connecting person's own Gmail (last 365 days, ≤60 messages, excluding
    promotions/social/forums) and their most recent ≤40 Google Docs/text files. Is a person's mailbox the
    right scope, or should an admin connect an organization-wide account? Default: personal, limited.
9. **Retention.** Indexed text and the audit log are kept until someone removes them; there is no automatic
    expiry. Default: keep until removed.
10. **Google verification.** `gmail.readonly` and `drive.readonly` are restricted scopes: going beyond test
    users requires Google's verification and a security assessment (weeks). Start it, and who owns it?
    Default: not started; the OAuth app works for listed test users only.
11. **Microsoft 365 (Outlook, SharePoint, OneDrive).** Needs an Entra ID app registration (tenant, client
    ID/secret, redirect URI, admin consent). Default: not built; shown as "coming soon".
12. **ElevenLabs voice on iOS.** The web uses ElevenLabs live interviews; iOS transcribes on device and
    drafts afterwards. Adopt ElevenLabs on iOS (adds their SDK and sends live audio to them)?
    Default: on-device transcription.

13. **Owner changes unpublish playbooks.** The article PATCH returns a published playbook to draft on any
    change, including a new owner, so reassigning or handing over knowledge (Knowledge map list and clusters)
    sends published playbooks back for re-approval. Should owner/review-date changes keep publish status?
    Default: return to draft; the handover preview warns.
14. **Token encryption key.** Google sessions are stored encrypted. Set `TOKEN_ENCRYPTION_KEY` in production
    secrets and back it up with the database; otherwise a key file is generated in `backend/data/`.
    Default: generated key file.
15. **Evidence checks are advisory.** Unverified quotes are flagged, never blocked. Should publishing be
    blocked (or need an admin) while a draft has unverified quotes? Default: advisory only.

## Business

16. **Pricing tiers by organization size** (brief: nonprofit-friendly monthly tiers). Amounts and seat
    bands are undecided; billing runs in the AWS Monetization sandbox with enforcement off
    (`MONETIZATION_ENFORCE=false`). Default: no limits enforced.
17. **Which actions are billable?** Currently metered: Ask, draft, Google import/indexing. Discover and
    handoff drafts go through the draft path. Default: as listed.
18. **Demo plan.** Judging time and demo script are not recorded. Default: the walkthrough in
    [README.md](../README.md#demo-walkthrough).
