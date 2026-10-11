# Luminal (AI provider)

Status: the text model is used server-side and implemented; image generation and embeddings are not used.

- **Endpoint:** OpenAI-compatible chat completions at the base URL in `LUMINAL_BASE_URL`, model in `LUMINAL_MODEL`, bearer key in `LUMINAL_API_KEY`. Code defaults (`backend/luminal.ts`): `https://flash.luminal.cloud/v1` and `deepseek-ai/DeepSeek-V4.1-Flash`; 50 s request deadline.
- **Used for:** Ask answers, playbook and handoff drafting, and Discover (suggested playbooks), all as JSON completions through `backend/luminal.ts` and `backend/agent.ts`.
- **Not used:** images (`LUMINAL_IMAGES_*` variables exist but nothing depends on them) and embeddings. Retrieval is keyword-based BM25 in `backend/retrieval.ts`.
- **Safeguards:** the key never reaches the browser. Source text is treated as untrusted data. Model output is validated (structure, citation IDs); unparseable JSON is retried once and malformed drafts are never saved. AI saves drafts only and never publishes. Without the key, routes return `AI_NOT_CONFIGURED`.
- **Data:** indexed excerpts and article text sent to Luminal require the user's indexing/AI consent. Luminal's retention and training terms are not verified (see [OPEN_QUESTIONS](OPEN_QUESTIONS.md) item 11).
- **Verification:** a basic text request and synthetic Ask/draft calls succeeded earlier. Ask with email excerpts was verified on synthetic data. Discover and handoff drafting were not verified live (provider returned 503). Credit balance, expiry and rate limits are not verified.
- **Not built:** quote-level evidence validation, extraction caching, usage dashboards.

Keep the key only in Git-ignored `backend/.env` and production secrets.
