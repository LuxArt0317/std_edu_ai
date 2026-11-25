# Setup

Use [the operational setup guide](docs/operations/SETUP.md) for prerequisites, environment variables, local development, database deployment, and Vercel configuration.

See [the infrastructure record](docs/operations/INFRASTRUCTURE.md) for the exact client-owned resources and [the handoff checklist](docs/operations/HANDOFF.md) for verification status.

For narrated pitch/tutorial production, use the isolated [video guide setup](media/tutorials/SETUP.md).

The [DTM preview](src/features/public/dtm/README.md) uses the existing School Affairs Google OAuth provider and the client database migration workflow in the operational setup guide. No separate OAuth client is required.

For local chatbot source retrieval, the development runner sets a restricted loopback capture origin automatically. Model/data providers remain online. Source refresh and manual evaluation details: [server](server/README.md), [source importer](scripts/README.md), [Answer Lab setup](tools/evaluation-lab/SETUP.md).

Question/reference source and sync behavior: [Q&A README](docs/question-answer/README.md), [Answer Lab setup](tools/evaluation-lab/SETUP.md). Restart the local server and refresh the lab after editing the canonical reference file.

For local evaluation model defaults and slash controls, see [Answer Lab setup](tools/evaluation-lab/SETUP.md) and [server documentation](server/README.md). Production remains independently configured.

For local source refresh and independent source-audit model configuration, see [server helpers](server/README.md) and [source projection scripts](scripts/README.md). These changes do not deploy or replace cloud evaluation data.
