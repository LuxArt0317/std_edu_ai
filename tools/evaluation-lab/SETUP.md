# Setup

Use Node 24 and the repository's installed dependencies. Configure the existing server-only model and Supabase settings in ignored `.env.local`; never put secrets into this directory.

From the repository root:

```sh
npm run dev:local
```

Open [Answer Lab](http://127.0.0.1:5173/evaluation-lab). If another process already serves port 5173, stop that development process before restarting, or set `LOCAL_PORT` and open that port. Restart after editing API or server modules; frontend edits use Vite hot reload.

For private questions, sign in through School Affairs on the same local origin. Existing sign-in on the production domain does not create a localhost session. Public questions can run without sign-in. Model calls and account data services remain online even though the UI and saved evaluation history are local. Run and AI-review buttons may incur provider costs.

Select a question, edit its reference, select models and run it manually. The response, reference, rating, Activity and model history appear together. To compare another model, select it and run again; the old run remains in History. No batches or AI reviews start automatically.

For architecture, storage, score limitations and future deployment requirements, see [README](README.md). Root setup remains in [SETUP](../../SETUP.md).

On startup, the lab syncs the 53 questions and expected answers from `docs/question-answer/README.md`. Changed source references receive new case versions; old runs and scores retain their original references. A private backup is made before sync. Custom questions, attachments, enabled/archive flags and subsequent CRUD edits survive unchanged-source restarts. Refresh the tab after a source sync; it does not execute questions automatically.

## Hosted setup

Apply only migration `20261124220000_evaluation_lab.sql` to the declared client database after confirming its prerequisite `private.affairs_is_admin()`. Build with the normal Vite configuration and deploy the existing linked Vercel project; the multi-entry build and rewrites include `/evaluation-lab`. The existing server-only provider configuration is reused. Sign in with the authorized School Affairs administrator account. Student accounts are denied.

Publication does not run question batches. Local history is not automatically transferred to production. The hosted database must be provisioned before the lab's data operations can work. See README for isolation and quotas.

The current local configuration uses OPENAI_MODEL/OPENAI_PUBLIC_MODEL/OPENAI_SEARCH_MODEL/OPENAI_VERIFICATION_MODEL=gpt-6-luna and EVALUATION_EVALUATOR_MODEL=gpt-6.1-terra in ignored .env.local. Restart the local API after changing these settings. They are not production settings. The lab recognizes GPT-6 Luna only when the provider catalog actually lists it.

For local source-verification timing experiments, the backend supports ASSISTANT_REQUEST_BUDGET_MS (documented in server/README.md). Current local run budget115seconds is not evidence of production timeout parity; record this when comparing historical55-second runs.
