# pgvector for file indexing

## Confirmed direction

Use PostgreSQL with pgvector for semantic retrieval over indexed file/email chunks. Keep source IDs and organization IDs on every chunk so results remain attributable and organization-scoped. Preserve keyword retrieval as a hybrid path for exact names, dates and identifiers.

## Current state

- The app currently chunks indexed text and retrieves it with BM25 (`backend/retrieval.ts`). No embeddings are generated.
- Luminal is used for chat completions only; its embeddings support is not verified (`docs/LUMINAL_FLASH.md`).
- The app now requires PostgreSQL and uses Prisma. A PostgreSQL 17 pgvector Docker service is provided for local development. Production still has SQLite data and is awaiting the RDS instance, credentials, import and cutover.
- The Knowledge map feature is deployed. The latest deployment workflow succeeded and the production frontend and backend health endpoint responded successfully.

## Deployment implication

The first Prisma migration enables `vector` and creates the app entity table. Production still needs the RDS instance, migration run, an SQLite data import, and an app configuration cutover. The app remains on its current release until the data has been copied and verified.

## Decisions needed before embedding data

1. Choose an embedding provider. Embeddings send indexed text to a model; current consent text and provider review cover Ask/drafts, not this new use. Luminal embeddings are unverified, and the existing Luminal retention/training question remains open.
2. Select the embedding model and vector dimensions before creating the vector column/index. Store model/version metadata so re-embedding can happen safely later.

Primary implementation reference: [pgvector README](https://github.com/pgvector/pgvector). AWS-managed alternative reference: [RDS for PostgreSQL supported extensions](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html).
