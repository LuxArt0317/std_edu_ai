# Stitch UI/UX Evidence

This is the production design ledger for Issue #56. Stitch is used for exploration and interaction hierarchy; `needed.md`, trusted role authorization, repository services, and Supabase RLS remain the functional authority.

## Scope protection

Stitch is used only for the authenticated `/crm` product experience in this work. The public `/` landing page and its design are explicitly excluded and remain unchanged.

## Stitch setup

- MCP endpoint: official Google Stitch server configured in Codex
- Private project: `projects/16353832066758496067` (`Shu-Te AI Smart Campus`)
- Design system: `assets/dfc4619bb6af499394c5c7afed65bcda` (`Smart Campus Intelligent System`)
- Generation model: Gemini 3.1 Pro, desktop, existing STU design system

## Generated screens

| Workflow | Stitch screen IDs |
| --- | --- |
| Teacher course outline, lesson editor, assessment operations | `63de6cca0ba943cb880cb021b176758c`, `07aad8e7e64f4a3aa64755f29c93a3cb`, `d9e0eb14ea744f6f84e8a85222b59974` |
| Student learning path | `cf90c8ad448f4aa7bd796b30f4bba369` |
| Account directory, detail, protected owner, interface states | `96d7e7b391154076a8fc815f34dd226d`, `8bbdb15df0ab46df83d0bc687ef276fa`, `ae8974af794e407f8c6e71d2ff85a6e7`, `0e49f91fde364b4fac3169fcb5952d67` |
| Admissions, campaigns, applicant handoff, student-success case | `079b6a5afaf94899a725d4d1b56062e1`, `6a0e22234c8f4679b33fb11980cf0813`, `def825d8782d47a2ab29e6672136b2a2`, `153aebecef9b4b3e88e1c4db98c621fe` |

## Control validation

The generated HTML—not only the screenshots or Stitch summary—was inspected for interactive labels.

| Area | Stitch included | Missing or ambiguous in Stitch | Production decision |
| --- | --- | --- | --- |
| Teacher modules | Add Module, Edit, Publish, add material, delete | Open lesson/module and reorder were icon-only or ambiguous | Make every material row explicitly openable; keep labeled contextual actions and accessible names |
| Lesson editor | Preview as Student, Save Draft, Publish, upload, duplicate/delete page, rich toolbar | Page reorder used an unlabeled drag icon | Keep the rich editor and give every action an accessible label/title |
| Assessments | Create, Edit, Questions, Preview, Results, Grade Submissions, Publish | Open was not consistently distinct from title/navigation | Make assessment cards/details visibly openable and retain complete authoring controls |
| Student learning | Clickable module/material outline, Mark Complete, page navigation, download, Ask Nexus, Start Assessment, feedback | Schedule/teacher-contact shortcuts were incomplete | Adopt the two-pane path and add explicit learner shortcuts without AI assessed-work actions |
| Accounts | Add account, bulk import, invite/resend, rotate credential, revoke, suspend, archive, audit, protected owner | Department/program/class/advisee assignments were generalized | Preserve explicit responsibility controls from the real platform and use Stitch’s directory/detail hierarchy |
| Admissions/CRM | Add applicant, admit/reject, Registrar handoff, tasks, campaign preview/send/archive, case edit/assign/status/interaction/sensitive access | Applicant Edit/stage/owner and campaign Edit were incomplete | Keep every existing mutation visible in contextual detail actions; never remove controls to match Stitch |

## Implementation evidence

- Teacher curriculum uses a course-outline hierarchy with clearly openable materials, contextual module controls, and an in-context lesson preview/editor path.
- Student learning defaults to the first available lesson, exposes active/completed states, rich multi-page reading, page navigation, completion, resources, and course workflow shortcuts.
- Existing People & Roles, Admissions, Campaign, and Case operations retain their complete role-authorized controls while adopting consistent primary/secondary/destructive action hierarchy.
- Every icon-only control added or retained by this phase has an accessible label or visible text; interactive rows use actual buttons or links.
- `npm run verify:stitch-ui` checks this ledger and the critical source control markers, while API contracts protect the workflow structure.

## Production evidence

- PR #57 passed Vercel Preview and CodeRabbit checks and merged to `main` as `8c7c1305e56a162960a71a66efce599bdab619b5`.
- Vercel production deployment `dpl_8qKDB5r5j2NQYaC7miqeC51X9CFP` is Ready on the standard Vite build and Node 24 runtime.
- `https://www.stu.best/` and `https://www.stu.best/crm` return HTTP 200 and pass recursive entry, lazy CRM bundle, stylesheet, recovery-shell, auth-style, and onboarding-disabled diagnostics.
- Released CRM asset `/assets/CRMRoot-Wdhucpup.js` returns HTTP 200 and contains `Open lesson`, `Preview as student`, `Next lesson:`, and `Manage account`.
- The public landing route serves the same intentionally unchanged landing implementation; the Stitch-specific contract test confirms no authenticated workflow markers entered `src/App.tsx`.
