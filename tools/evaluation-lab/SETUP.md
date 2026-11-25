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

The hosted workspace requires `20261124220000_evaluation_lab.sql` and shared-admin migration `20261125020000_evaluation_lab_shared_admins.sql` in the declared client database. The production build runs only the idempotent shared-admin migration through `scripts/deploy-evaluation-sharing.mjs`; it does not run pending student-service migrations. Build with the normal Vite configuration and deploy the existing linked Vercel project; the multi-entry build and rewrites include `/evaluation-lab`. The existing server-only provider configuration is reused. Sign in with the authorized School Affairs administrator account. Student accounts are denied.

Publication does not run question batches. Local history is not automatically transferred to production. The hosted database must be provisioned before the lab's data operations can work. See README for isolation and quotas.

For an explicitly authorized local-to-cloud replacement, use `scripts/sync-evaluation-lab-cloud.mjs` from the repository root with `--local-state` and `--env-file`. Without `--apply`, it only compares counts and the local digest. After the corresponding code is live, `--apply` saves and verifies a private backup under the local state directory’s `cloud-backups`, then replaces the shared dataset/results with an optimistic revision increment and read-back checks. This does not alter school records. Existing tabs must refresh after replacement.
