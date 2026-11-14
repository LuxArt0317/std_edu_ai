# Announcement email preferences

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks the protected workflows. Service 2-1 follows the signed-in source layout with one checkbox, Confirm and Cancel. The local setting takes effect at midnight in Taipei on the following day. Turning it off takes effect immediately. [University settings](https://info.stu.edu.tw/ePortal/pg/setNewsToMail.asp)

The [stu.best settings page](https://stu.best/school-affairs/services/2-1) uses the caller's Google-linked account. Supabase persists the choice and a retry receipt. The assistant can describe the signed-in user's saved preference and link to the form. It receives no recipient address. Accounts are opted out until they choose to enable email.

## Delivery

New site or verified announcements queue only for accounts whose opt-in was effective when the announcement was published. The queue excludes sample announcements, rechecks opt-out and account eligibility before a send, and uses a fenced lease and stable provider key for retries. Once handed to the provider a message cannot be recalled. The queue marks a provider acknowledgement as accepted. Mailbox delivery needs a separate live acceptance check.

Configure a verified sender domain and a sending-scoped Resend key. Set server-only Vercel values `ANNOUNCEMENT_EMAIL_FROM`, `ANNOUNCEMENT_EMAIL_RESEND_KEY`, and a random `CRON_SECRET` of at least 32 characters. The worker uses the project's existing server-only Supabase key. Set the matching GitHub Actions secret `ANNOUNCEMENT_EMAIL_CRON_SECRET`, then set the repository variable `ANNOUNCEMENT_EMAIL_DELIVERY_ENABLED` to `true`. The workflow can be dispatched manually and checks the queue every 15 minutes when enabled. Begin with a controlled opted-in recipient and verify that a newly published notice reaches the mailbox. Provider responses and workflow output contain no recipient addresses. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

## Verification

```sh
npm run db:plan -- --only=20261114220000
node tests/integration/announcement-email-db.mjs --rollback-preflight
node tests/integration/announcement-email-db.mjs --deployed
node --experimental-strip-types tests/api/announcement-email.test.ts
node --experimental-strip-types tests/integration/announcement-email-http.mjs --verify-client
PUBLIC_SITE_ORIGIN=http://127.0.0.1:54629 node tests/integration/announcement-email-ui.mjs
```

Use the preflight mode before applying the migration and the deployed mode afterward. The database suite rolls back its announcements and fixtures. The authenticated HTTP suite removes disposable accounts and preferences. Worker tests use a controlled provider response, and browser tests use a synthetic account. The deployment ships with the delivery workflow disabled until a sender is available.

## Deployed evidence

Production `2917920` is live as Vercel `9wmknk5mMEQEspGaerrDGzJzA2bh`. Migration 20261114220000 brings the client to 156 migrations and 184 RLS-protected public tables. The pinned browser, authenticated HTTP with fixture cleanup, four bilingual guest assistant checks, eight shell routes and Quality 43547791212 passed. The 94-destination local audit reports 32 generic and 22 partial entries. The sender is unconfigured and the delivery job is disabled by its repository gate. Queue eligibility, retries and transport were verified with controlled responses. Mailbox receipt remains open.
