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

The first startup of the FAQ question bank replaces the old visible dataset with the 53 FAQ questions. An ignored private state backup preserves the previous questions/results. Refresh an already-open Answer Lab tab to load the replacement list. No questions execute during import.

## Hosted setup

Apply only migration `20261124220000_evaluation_lab.sql` to the declared client database after confirming its prerequisite `private.affairs_is_admin()`. Build with the normal Vite configuration and deploy the existing linked Vercel project; the multi-entry build and rewrites include `/evaluation-lab`. The existing server-only provider configuration is reused. Sign in through Google as either approved Answer Lab administrator; both see the same hosted dataset. Other accounts are denied.

Publication does not run question batches. Local history is not automatically transferred to production. The hosted database must be provisioned before the lab's data operations can work. See README for isolation and quotas.

For shared admin access, production builds apply only `20261125020000_evaluation_lab_shared_admins.sql` through the fixed release script using the existing server-side database connection. Both approved accounts must use Google sign-in; the original verified Lux owner record must already exist. No local credential copy or general database migration deploy is required. See README for the explicit membership and data-sharing scope.
