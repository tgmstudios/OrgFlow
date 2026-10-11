# Luminal Flash integration plan

## Purpose and status

Use the team's Luminal Flash credits to power Continuity AI's Capture flow: turn selected nonprofit emails and documents into a cited, employee-reviewed playbook. Start with donor stewardship, Gmail, Google Drive, and the upload fallback already selected for the demo.

User confirmed substantial free credits on 2026-10-11; balance, expiry, eligible models, and rate limits are unverified. Backend configuration is now saved in Git-ignored `backend/.env`, with a credential-free `backend/.env.example`. No application adapter exists yet. A live text smoke request succeeded on 2026-10-11 (HTTP 200, configured model, 79 total tokens).

## API information saved on 2026-10-11

- **Text (user-supplied contract):** OpenAI-compatible base URL `https://flash.luminal.cloud/v1`; model `deepseek-ai/DeepSeek-V4.1-Flash`; bearer authentication. The conventional chat-completions URL is `https://flash.luminal.cloud/v1/chat/completions`; a live smoke request verified this endpoint, bearer authentication, and model on 2026-10-11. A public text documentation page was not retrieved at `/docs`.
- **Images (official docs retrieved):** https://images.luminal.cloud/docs/. Ideogram-compatible base URL `https://images.luminal.cloud`; model `ideogram-4-5`. Authentication accepts `Authorization: Bearer $LUMINAL_API_KEY` or `Api-Key: $LUMINAL_API_KEY`.
- **Image paths:** `POST /v2/image/generate/ideogram-4-5` and `POST /v2/image/precise-edit/ideogram-4-5`. Poll with `GET /v1/generations/{generation_id}`. Balance endpoint: `GET /v1/balance`.
- **Image integration details:** synchronous calls can return HTTP 202 with `status: pending`; poll rather than assuming the image is ready. Use explicit quality and image count. After a dropped connection, look up recent generations before resubmitting to avoid duplicate charges.
- **Image retention documented:** delivered image copies are retained for 7 days; generation records, including the first 2 KB of the prompt, for 30 days. These image terms do not establish text API retention policies.

Image generation is available for future visual assets; the Capture pipeline uses text inference. Embedding support, text retention, credit eligibility, rate limits, remain unverified; basic text authentication is verified. Credentials are stored only in the local backend environment, never in this plan.

## Capture pipeline

1. **Select sources.** Staff explicitly select Gmail messages, Drive documents, or uploads. The backend verifies access and normalizes readable text. Keep provider credentials and Google OAuth tokens server-side.
2. **Prepare an index.** Assign stable source and chunk IDs, preserve document title and source location, and split text into bounded chunks. Hash content so unchanged chunks can reuse previous extraction results. Scope cached data to the organization and source access permissions.
3. **Extract with Flash.** Send relevant chunks to a verified Flash text model. Ask for workflow actions, owner roles, timing, donor preferences, exceptions, and missing information. Each extracted fact must reference supplied chunk IDs and an exact supporting excerpt. Treat source text as untrusted data, never as instructions to execute tools or change system behavior.
4. **Retrieve evidence.** For the demo, search the normalized text and extracted facts for donor stewardship. Add Flash embeddings only if its API explicitly supports a suitable embedding model; text inference alone does not provide a vector index. Do not block the demo on vector infrastructure.
5. **Draft with Flash.** Send the retrieved evidence and fact records to the generation model. Return a draft containing title, ordered steps, owner role, timing, source citations, and open questions. Missing details become questions rather than invented nonprofit policy. Conflicting sources remain visible for the reviewer.
6. **Review and approve.** Resolve citation IDs against the actual selected sources; validate cited excerpts and required output fields server-side. Reject unsupported steps or mark them as needing review. The employee inspects evidence, edits steps, answers gaps, and explicitly approves the playbook. Generation never implies approval.

## Backend boundary

Keep provider-specific code behind two operations: `extractWorkflowFacts(chunks)` and `draftPlaybook(evidence)`. Both return application-owned, validated structures. Include source IDs in inputs and outputs so model changes cannot break citation identity. Include model and prompt version in extraction cache keys.

The user-supplied endpoint, model ID, and API key are configured as backend environment variables; verify them with a synthetic request before building the adapter. Never put keys in the browser, committed files, screenshots, or shared memory. Do not expose a publicly callable paid generation endpoint before application authentication and organization authorization exist.

Bound source size, chunk count, output length, parallel requests, and request duration. Retry only transient failures with a small limit; record usage metadata without private source text or credentials. Set a per-run budget using the provider's verified usage units and credit pricing. Display a clear retry state on errors and retain selected sources. Upload remains the connector fallback; it still requires working inference. A saved demo playbook must be labeled as a sample rather than presented as fresh generation.

## Verify before sending private content

- Obtain the working Flash dashboard/API documentation and one request example; confirm authentication, endpoint, model IDs, output format, limits, and error responses.
- Confirm the credits cover the selected model and note their balance and expiry privately.
- Confirm provider retention and training policies are acceptable for nonprofit email and donor information. Use synthetic donor stewardship content for the initial connection test.
- Run one small extraction and drafting request, validate output and citations, then measure a complete demo run. Credit availability does not establish quality or latency.

## Demo acceptance criteria

- A selected synthetic Gmail/Drive dataset or equivalent uploaded text produces a donor stewardship draft through the verified Flash API.
- Every factual step links to authorized source evidence; fabricated source IDs, mismatched excerpts, unsupported policy, and malformed responses cannot appear as approved facts.
- Knowledge gaps and conflicting instructions are visible; approval requires a human action.
- Reprocessing unchanged sources reuses extraction results. Usage is observable, bounded, and keeps secrets and source content out of logs.
- Provider errors are recoverable without losing source selection, and no browser response contains a provider key.

## Implementation order

Verify access and run a synthetic smoke request → implement and validate the two backend operations → connect normalized upload text → add Gmail/Drive text through the same pipeline → render citations and approval → measure credit use and demo latency. Ask and Transfer remain broader MVP capabilities; this integration does not expand the current Capture demo scope.


## Implemented local adapter — 2026-10-11

`backend/agent.ts` now implements bounded professional chat and SOP drafting, requesting JSON mode from the configured Luminal endpoint. Live synthetic drafting succeeded after JSON response format and output-budget fixes. The adapter validates structured Tiptap content and citation IDs, persists citation metadata without source text, and saves drafts only. General questions use published article snapshots; selected working articles are explicitly unapproved. File metadata supports discovery, not claims about file contents. Selected connected/uploaded text requires explicit consent before transmission.

This is the local MVP adapter, not completion of every pipeline item above. Exact quote-level evidence validation, chunk indexing/embeddings, unchanged-source extraction caching, usage dashboards, and production organization authorization are not implemented. Provider retention policies remain unverified; tests used synthetic content.
