# Setup

Use [the operational setup guide](docs/operations/SETUP.md) for prerequisites, environment variables, local development, database deployment, and Vercel configuration.

See [the infrastructure record](docs/operations/INFRASTRUCTURE.md) for the exact client-owned resources and [the handoff checklist](docs/operations/HANDOFF.md) for verification status.

For narrated pitch/tutorial production, use the isolated [video guide setup](media/tutorials/SETUP.md).

The [DTM preview](src/features/public/dtm/README.md) uses the existing School Affairs Google OAuth provider and the client database migration workflow in the operational setup guide. No separate OAuth client is required.

For local chatbot source retrieval, the development runner sets a restricted loopback capture origin automatically. Model/data providers remain online. Source refresh and manual evaluation details: [server](server/README.md), [source importer](scripts/README.md), [Answer Lab setup](tools/evaluation-lab/SETUP.md).

Question/reference source and sync behavior: [Q&A README](docs/question-answer/README.md), [Answer Lab setup](tools/evaluation-lab/SETUP.md). Restart the local server and refresh the lab after editing the canonical reference file.

For local evaluation model defaults and slash controls, see [Answer Lab setup](tools/evaluation-lab/SETUP.md) and [server documentation](server/README.md). Production remains independently configured.

For local source refresh and independent source-audit model configuration, see [server helpers](server/README.md) and [source projection scripts](scripts/README.md). These changes do not deploy or replace cloud evaluation data.

For automatic chatbot API discovery, local feature flags and hosted action-review prerequisites, see [server setup](server/README.md#automatic-application-api-tools-issue-104).

For local website/database discovery, embedding-cache generation and planner-versus-answer model settings, see [discovery setup](server/README.md#unified-websitedatabase-discovery-issue-108).

The local discovery runner includes alternate account-source completion and the released assessment read scope. No additional migration or environment variable is required; see [server documentation](server/README.md#alternate-account-source-completion-issue-109).

For the local original Moodle import database, private environment settings and resuming remaining captures, see [Moodle library setup](server/local-dtm/README.md).

For optional `OPENAI_CONVERSATION_UPDATE_MODEL` and interim update behavior, see [conversation commentary setup](server/README.md#conversational-commentary-and-identity-continuity-issue-114). Default commentary model is GPT6Luna; production remains unchanged.

Assistant memory deployment prerequisites and staging acceptance are documented in [server/README.md](server/README.md#durable-assistant-memory-115). It requires a pending migration, server-only secrets and daily expiry cleanup before enabling; it is not enabled by a frontend build.
