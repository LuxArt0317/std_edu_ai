# Certificate award applications

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks School Affairs service 52-1. The signed-in source displays the student certificate form, source catalog lookup, proof upload, award option, read-only cashier fields and a separate review block. The introductory link returns to the entry. The source was observed without submitting a form or copying private values. [University certificate service](https://info.stu.edu.tw/sao/certificate/index.asp)

## Workflow

At [stu.best service 52-1](https://stu.best/school-affairs/services/52-1), select from the 30 initially observed catalog entries, enter the date earned and contact phone, and upload JPG or PDF proof. The catalog is searchable by code, name, level and issuer. An administrator can maintain catalog entries and the student's verified payout reference. The form uses the student baseline from service 8-1 and shows an empty identity until one is available.

Uploading creates a versioned draft with a unique proof reservation. The private Supabase bucket limits each file to 5 MiB. The student can remove a proof before submitting or while supplying requested documents. The submission waits for an attached proof and, for an award, verified payout details. Managers can request documents, approve, or record the review amount. The account details and proof files are accessible only to the record owner and authorized reviewer as appropriate. The assistant reads a narrow status response and links to the application. It receives no contact phone, bank details, proof path or attachment.

Asking for certificate award status from a saved record page checks that exact application and links back to it. The main certificate menu keeps the recent-application summary. A missing or inaccessible selection leaves the status unavailable.

The school-facing manager stores only the last four account digits and administrative reference. No payment transfer or university-side application takes place from the stu.best form. The 30 captured catalog records are the initial source view, and protected results beyond the initial view and official handling remain open.

## Verification

```sh
npm run db:plan -- --only=20261114230000
node tests/integration/certificate-awards-db.mjs --rollback-preflight
node tests/integration/certificate-awards-db.mjs --deployed
node --experimental-strip-types --test tests/api/certificate-awards.test.ts
node --experimental-strip-types tests/integration/certificate-awards-http.mjs --verify-client
PUBLIC_SITE_ORIGIN=http://127.0.0.1:54630 node tests/integration/certificate-awards-ui.mjs
```

Use rollback preflight before applying the migration and deployed mode afterward. The browser suite uses disposable fixtures. The authenticated HTTP suite creates disposable accounts, issues a real Storage upload, checks unauthorized access and removes the fixture bytes through Storage before deleting database records.

## Protected selected-status evaluation

Use the exact clean revision deployed to the approved protected Preview, the existing client fixture credentials, the Development OIDC identity and the shared fixture lease. The existing `20261114230000` migration, authenticated reader grant and three published catalog entries must be present before account creation.

```sh
node tests/evaluation/run-certificate-award-preview.mjs --preflight
node tests/evaluation/run-certificate-award-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

The preflight lists seven frozen cases without provider access. The protected run seeds two disposable profiles and three owned applications. It grades English and Traditional Chinese selected status, a newer application under the same owner, the second owner's selected status, both crossed reads, a missing record, and the existing aggregate status. Independent paired RPC checks and SQL readbacks bracket each request. The report records exact release pins, case verdicts, digests, cleanup, and protected-owner and catalog preservation. Application writes and proof Storage operations are outside this packet. Browser dispatch, model acceptance and the base multipart bank-settlement question remain separate evaluation scopes.

Run the same packet through the actual handler and migrations in an isolated local database with an installed PGlite runtime.

```sh
STU_CERTIFICATE_TEST_PGLITE_ENTRY=/absolute/path/to/@electric-sql/pglite/dist/index.js \
  node --experimental-strip-types --test tests/evaluation/certificate-award-preview.test.mjs
```

## Deployed evidence

Production `014def8` is live as Vercel `C57h6aW36V71tBftNhFu9LLg3g11`. Migration 20261114230000 brings the client to 157 migrations and 187 RLS-protected public tables with a private proof bucket. The pinned browser, actual-JWT HTTP and Storage test with exact cleanup, four bilingual guest assistant checks, eight shell routes and Quality 43550501226 passed. The 94-destination local audit reports 31 generic and 23 partial entries. The first 30 observed catalog entries are available. Official review and bank transfer remain outside the verified workflow. Payout references store the final four digits only.

The exact protected `fc357c6` replay passed all seven native HTTP cases. It checked the release 32 times, matched each own and crossed read, left the published catalog and protected owner unchanged, and removed both disposable callers and their exact applications. The focused local Chromium run verified two views across eight independent comparisons. The protected report verifies native HTTP acceptance. Its browser and model acceptance flags remain false.
