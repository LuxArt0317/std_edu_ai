# STU Edu AI

Live portal: [School Affairs](https://stu.best/school-affairs) · [Digital Teaching Materials](https://stu.best/dtm) · [Nexus sign in](https://stu.best/signin) · [Dashboard](https://stu.best/app).

A bilingual university website and authenticated school platform built with React, TypeScript, Vite, Supabase, and Vercel.

- `/` — public university homepage, campus information, and research assistant with live source-check activity.
- `/school-affairs` — independent school service directory, Google site sign-in and campus assistant; [assistant scope](docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md).
- `/dtm` — local Digital Teaching Materials preview using the same Google session and account-scoped sample courses; [DTM scope](src/features/public/dtm/README.md).
- `/signin` — sign in and password recovery.
- `/signup` — public student registration with email verification.
- `/login` and `/crm` — compatibility redirects.
- `/app` — one School OS for academics, learning, student support, administration, and Nexus AI. See the [workspace guide](docs/guides/portal.md).

## Start here

- [Local development and deployment](SETUP.md)
- [Architecture and repository map](PROJECT.md)
- [Client handoff and verified deployment status](docs/operations/HANDOFF.md)
- [Infrastructure identifiers and access](docs/operations/INFRASTRUCTURE.md)
- [Documentation index](docs/README.md)
- [Release history](CHANGELOG.md)
- [Narrated teacher, student and all-role video guides](media/tutorials/README.md)

The client repository is `LuxArt0317/std_edu_ai`. Non-secret deployment identifiers live in [deployment.json](deployment.json). Environment values, passwords, and provider credentials are supplied outside Git.

## Verification

```sh
npm ci
npm run lint
npm test
npm run test:unit
npm run build
npm run verify:handoff
npm run verify:dependency-audit
```

`npm run test:e2e` runs actual browser and database workflows against the exact client project with isolated disposable role accounts; it requires the protected local client configuration. `npm run test:accessibility-public` runs 10 public states with deterministic API fixtures.

[Operational setup](docs/operations/SETUP.md) covers database migrations and live client checks. Historical research and acceptance evidence is retained under `docs/` and `planning-with-files/`; it is not evidence of completion in the client environment.

The current app interface uses compact transactional screens and plain labels. See the [frontend reference](docs/reference/FRONTEND.md#transactional-ui) and [portal guide](docs/guides/portal.md).
