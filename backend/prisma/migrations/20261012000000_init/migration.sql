CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "orgflow_entities" (
    "kind" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "orgflow_entities_pkey" PRIMARY KEY ("kind", "id")
);
