# Student aid payment inquiries

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98)

The verified university claim and salary screens share the legacy inquiry frame. The observed claim view has four columns and the salary view has seventeen. Both showed empty tables in the available session. The local routes are [claims](https://stu.best/school-affairs/services/37-1) and [salary](https://stu.best/school-affairs/services/37-1/salary). Course and activity learning reports and the remittance link remain separate source destinations. The activity report and remittance link returned HTTP 404 during verification.

Migration `20261115050000` establishes two independent RLS-protected tables. Trusted service-role integrations can maintain them. The inquiry RPC binds its result to the caller's verified Google identity and pages by a stable per-account position. Bank details are limited to the last four digits in storage and masked on screen. Assistant requests receive only an account-scoped count. The migration creates no claims, salary entries, bank records or payments.

```sh
node tests/integration/aid-payments-db.mjs --preflight
node tests/integration/aid-payments-db.mjs --deployed
node --experimental-strip-types tests/integration/aid-payments-http.mjs
PUBLIC_SITE_ORIGIN=http://127.0.0.1:54635 node tests/integration/aid-payments-ui.mjs
```

The SQL checks confirm caller isolation, rejection of full bank numbers, pagination and rollback. The browser checks verify distinct claim and salary tables, reload, retry, mobile scrolling, the assistant count and sign-in return. The source and data model are separate from the pending-fees page.

[University aid claims](https://info.stu.edu.tw/SAO/PAYMENT/trnFiles/qryPaymentByStu.asp) · [University salary inquiry](https://info.stu.edu.tw/SAO/payment/trnFiles/qrySalaryByStu.asp)
