# Production role account directory

STU Nexus has one confirmed production identity for every canonical role. These accounts are intended for owner-led acceptance testing and role-specific portal validation until named university staff and students are onboarded through the approved identity process.

| Tier | Role | Sign-in email |
| --- | --- | --- |
| Ownership | `owner` | `winsonbaring10@gmail.com` |
| Leadership | `admin` | `winsonbaring10+admin@gmail.com` |
| Leadership | `president` | `winsonbaring10+president@gmail.com` |
| Leadership | `vice_president` | `winsonbaring10+vice-president@gmail.com` |
| Leadership | `dean` | `winsonbaring10+dean@gmail.com` |
| Leadership | `registrar` | `winsonbaring10+registrar@gmail.com` |
| Academic | `department_head` | `winsonbaring10+department-head@gmail.com` |
| Academic | `faculty` | `winsonbaring10+faculty@gmail.com` |
| Academic | `advisor` | `winsonbaring10+advisor@gmail.com` |
| Operations | `admissions` | `winsonbaring10+admissions@gmail.com` |
| Operations | `finance` | `winsonbaring10+finance@gmail.com` |
| Operations | `support` | `winsonbaring10+support@gmail.com` |
| Operations | `librarian` | `winsonbaring10+librarian@gmail.com` |
| Learner | `student` | `winsonbaring10+student@gmail.com` |

Every account has a unique generated password stored as a macOS internet password with service `www.stu.best` and its sign-in email as the account name. Passwords are never present in tracked source code, migrations, GitHub, CI, or test output. For authorized local POC operation, `npm run export:role-credentials` verifies every live account and writes the Git-ignored root file `PRODUCTION_ROLE_CREDENTIALS.local.md` with owner-only mode `0600`.

The owner-only `provision-role-account` Edge Function is the trusted creation and credential-rotation boundary for non-owner identities. It verifies the caller's fresh Auth user, rejects the protected `owner` role, validates account fields, and calls the Supabase Auth Admin API with a server-only service credential. Database role synchronization remains atomic and audited.

Run `npm run test:live-accounts` on the provisioner's Mac to verify all Keychain credentials, production logins, trusted Auth roles, and self-visible profile roles without displaying passwords.

Run `npm run export:role-credentials` on that Mac to regenerate the protected local credential sheet. Never remove its ignore rule, commit it, upload it, or paste its contents into GitHub issues or logs.
