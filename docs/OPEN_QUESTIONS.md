# Open questions for the product owner

Agents (Claude Code, Codex, others): **these need a human answer.** When your task touches one of these,
ask the person you're working with before changing the assumption — quote the question and the current
default. When you get an answer, move it into "Confirmed human decisions" in
[SHARED_MEMORY.md](SHARED_MEMORY.md) and delete it here. Add new questions here instead of guessing.

Each entry lists the **current default** — what the code does until someone decides.

## Release and deployment

1. **Deploy these changes to orgflow.dev?** Pushing to `main` deploys production automatically
   (`.github/workflows/deploy.yml`). Default: not pushed; confirm before pushing.
2. **Sample content in production.** On startup the backend adds labelled sample playbooks and people to
   the shared demo workspace once (`backend/samples.ts`, meta `samples-v1`). Default: yes, demo workspace
   only; new organizations start empty.
3. **Product name.** The original brief says "Continuity AI"; the repo, domain and apps say "OrgFlow".
   Default: OrgFlow everywhere user-facing.
4. **iOS distribution.** TestFlight/App Store account, bundle ID (`ryannair05.OrgFlow`), and who owns it.
   Default: local builds only.
5. **Which root `CLAUDE.md` is canonical?** The committed one is the Bun guide; one developer keeps an
   uncommitted iOS-focused version. Default: unchanged; agent instructions live in `AGENTS.md`.

## Organizations and permissions

6. **Default for new sign-ups.** Sign-up without an organization name or invite code joins the shared
   demo workspace. Should it create a private organization instead? Default: demo workspace.
7. **Who may approve and publish?** Any member can publish any draft, including their own (per the
   product design brief). Should approval require a second person or the admin role? Default: anyone.
8. **Who may invite?** Only admins see and rotate the invite code. Default: admins only.
9. **People vs accounts.** People (for ownership and Transfer) are separate records, not linked to sign-in
   accounts. Default: separate.
10. **Review cadence.** Published playbooks are due for review 90 days after publishing or last review
    (`REVIEW_INTERVAL_DAYS`). Default: 90 days for every article.

## Data, consent and AI

11. **Luminal data handling for donor data.** Indexed email/document excerpts and article text are sent to
    Luminal for Ask, Discover, and drafts under the indexing consent. Luminal's retention/training terms
    have not been verified. Default: allowed under the consent text shown in the app.
12. **Index scope.** Indexing reads the connecting person's own Gmail (last 365 days, ≤60 messages, excluding
    promotions/social/forums) and their most recent ≤40 Google Docs/text files. Is a person's mailbox the
    right scope, or should an admin connect an organization-wide account? Default: personal, limited.
13. **Retention.** Indexed text and the audit log are kept until someone removes them; there is no automatic
    expiry. Default: keep until removed.
14. **Google verification.** `gmail.readonly` and `drive.readonly` are restricted scopes: going beyond test
    users requires Google's verification and a security assessment (weeks). Start it, and who owns it?
    Default: not started; the OAuth app works for listed test users only.
15. **Microsoft 365 (Outlook, SharePoint, OneDrive).** Needs an Entra ID app registration (tenant, client
    ID/secret, redirect URI, admin consent). Default: not built; shown as "coming soon".
16. **ElevenLabs voice on iOS.** The web uses ElevenLabs live interviews; iOS transcribes on device and
    drafts afterwards. Adopt ElevenLabs on iOS (adds their SDK and sends live audio to them)?
    Default: on-device transcription.

## Business

17. **Pricing tiers by organization size** (brief: nonprofit-friendly monthly tiers). Amounts and seat
    bands are undecided; billing runs in the AWS Monetization sandbox with enforcement off
    (`MONETIZATION_ENFORCE=false`). Default: no limits enforced.
18. **Which actions are billable?** Currently metered: Ask, draft, Google import/indexing. Discover and
    handoff drafts go through the draft path. Default: as listed.
19. **Demo plan.** Judging time and demo script are not recorded. Default: the walkthrough in
    [README.md](../README.md#demo-walkthrough).
