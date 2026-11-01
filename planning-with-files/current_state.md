# Current client state

Issue #75: readability/layout fixes and public student signup implemented in the client checkout. `/signin` and `/signup` are canonical auth screens in src/features/auth; `/login` and `/crm` remain compatibility entries. Shared semantic surfaces, wrapping selectors, separate metric/action layout, named roster controls and shadcn quiz sheet fix reported nested UI defects. Mobile Tasks overflow also corrected.

Verified locally: 170 API/source checks, 13 units, all 38 E2E scenarios across full/focused runs, 100 unique visual/theme/viewport states, ten public accessibility states, build/assets, docs and zero dependency vulnerabilities. Extended signup security checks deny forged staff metadata and direct profile-role escalation. Public signup request and verification succeeded; all temporary accounts removed. Lint retains inherited warnings.

Client DB migration dry-run/applied: 101 migrations, 101 public RLS tables. Auth password settings strengthened and exact production/local /signin redirects added; email confirmation retained. Existing owner/staff privileges preserved.

UI/auth code fa01a84 is published Ready as Vercel 751pwPAFk66kfybEqVgg7zGPPMEU; quality workflow 41325153100 succeeded. Actual live signin/signup, owner navigation and backend checks passed. Final documentation follows this runtime release. Remaining limitation: user chose Supabase; its built-in sender is restricted to approved team addresses and two emails/hour. Public student email delivery still requires a production sender connection. Default Supabase mailer is still in use; production email delivery/capacity are not claimed. Issue #75 stays open until SMTP is configured and verified.
