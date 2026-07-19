# Research runtime services

`knowledgePipeline.ts` contains environment-neutral, deterministic corpus primitives shared by the protected ingestion API and verification suite:

- executable HTML/style removal and normalized text extraction;
- HTTPS source canonicalization and tracking-parameter removal;
- bilingual language inference;
- SHA-256 content identity;
- bounded, ordered, content-addressed chunks with stable locators.

It performs no network, database, or credential access. Provider embeddings and governed Supabase writes remain in the server-only `api/knowledge-ingest.ts` boundary.
