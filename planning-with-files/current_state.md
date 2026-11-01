# Current client state

Issue #75 follow-up: Alerts Plan uses one proper shadcn sheet, independent context, editable requests, nested Escape/focus and cancellation/stale-response guards. Remaining preview/research/workload colors, alert/task layout, grade upload keyboard access, quiz/notifications and service-table containment are fixed locally.

Verified: all 43 E2E scenarios across full/focused runs (41/42 then 7/7 after fixing populated-task overflow), 170 API/source checks, 13 units, 48 expanded nested desktop/mobile/light/dark states and ten public accessibility states. No expanded-audit serious/critical accessibility failures, overflow or app errors. Real authenticated CRM OpenAI plan and client backend verification pass. Teardown/SQL: one owner, zero test/orphan identities; unchanged 101 migrations/101 public RLS tables. Preparing the follow-up commit/deployment; no new production release yet.

Canonical auth remains /signin and /signup, with /login and /crm compatibility. Public email delivery remains restricted by the user-selected Supabase default sender; #75 remains open for that external dependency.
