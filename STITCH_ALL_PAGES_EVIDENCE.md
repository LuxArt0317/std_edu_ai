# Stitch all-pages evidence

Issue #58 extends Stitch review to every CRM surface. The public `/` landing page, route, implementation, and design are excluded and must remain unchanged.

## Fixed design context

- Project: `projects/16353832066758496067`
- Design system: `assets/dfc4619bb6af499394c5c7afed65bcda`
- Model/device: Gemini 3.1 Pro, desktop
- Authority: Stitch proposes; `needed.md`, visible repository actions, trusted role checks, and Supabase RLS decide what may ship.

## Page matrix

| Surface | Current functionality supplied | Stitch screen | HTML controls validated | Decision implemented | Production evidence |
| --- | --- | --- | --- | --- | --- |
| CRM sign-in and recovery | yes | `0b68074fcdb0433db05b7f6932f7f51c` | 9 controls | Adopted hierarchy; added visibility and real Supabase reset/recovery flow | pending |
| Global authenticated shell | yes | `6ec569a92d7d4fb3b98b1be1ec47ae65` | 41 controls | Adopted context strip, current-page and skip semantics | pending |
| My Day | yes | `a29ca30fbec14adc9a0bd11a1ced3b0f` | 25 controls | Adopted tonal hierarchy; retained complete role actions | pending |
| Academic Office | yes | `ec9f31aef5a64be5807376f943a1c431` | 39 controls | Adopted workspace framing; retained complete relational CRUD | pending |
| Teaching | yes | `db678cbd9a4c4788a0f72d22bdaf5eee` | 25 controls | Adopted studio framing; retained labeled open/edit/delete/preview controls | pending |
| Learning — student | yes | `7ec9c7679da345d68ae841416880ea47` | 33 controls | Adopted learning hierarchy; retained explicit completion and next lesson | pending |
| Learning — staff context | yes | `4ff9c940964243268882a47abb2638dd` | 18 controls | Adopted contextual hierarchy; retained read-only role boundary | pending |
| Assessments — student | yes | `71e4215642ad41bfad809b6dace33987` | 22 controls | Adopted status hierarchy; retained eligibility, policy and AI boundaries | pending |
| Assessments — teacher | yes | `e3e27dd7224c4b5c8533fe27a654a628` | 34 controls | Adopted studio hierarchy; retained complete authoring/grading controls | pending |
| Grades — student | yes | `fe58e5e4cfa7485dadc792e2a79c8c3d` | 30 controls | Adopted official-record hierarchy; retained privacy-safe release logic | pending |
| Grades — teacher | yes | `7d19493379e642c2a9bc95a523fdb28f` | 26 controls | Adopted review hierarchy; retained governance and AI quarantine | pending |
| Schedule | yes | `2d6cb42abf12488fb38719646f675856` | 21 controls | Adopted calendar framing; retained labeled conflict-safe CRUD | pending |
| People & Roles | yes | `b5557bad145f417780ff2c3eca1e49fd` | 45 controls | Adopted directory hierarchy; retained complete lifecycle/responsibility controls | pending |
| Learner Support — Command Center | yes | `f2879e30acc84e7cb74e7484e1dfbcda` | 26 controls | Adopted context hierarchy; made header actions and export real | pending |
| Learner Support — Student 360 | yes | `c45981ba49504cda861bebc6cf241c55` | 26 controls | Adopted detail hierarchy; retained complete contextual mutations | pending |
| Learner Support — Success Radar | yes | `4565cbce061144438b864672ffb82dd4` | 15 controls | Kept stronger real action rows; adopted consistent surface/focus language | pending |
| Learner Support — Admissions | yes | `26e1efc0ce3d47caa4607af724661bfe` | 28 controls | Adopted pipeline hierarchy; retained explicit edit/stage/owner/decision actions | pending |
| Learner Support — Cases | yes | `64778340c4da4d62b64e37730d79e6db` | 31 controls | Adopted case hierarchy; retained sensitive access and controlled transitions | pending |
| Learner Support — Campaigns | yes | `a0f0fd074ae0424784743cea214fe64c` | 26 controls | Adopted campaign hierarchy; retained rich CRUD and governed delivery | pending |
| Learner Support — Knowledge Hub | yes | `e2eec7d6820f47b0af660430ab21a5d4` | 27 controls | Adopted knowledge hierarchy; retained create/edit/verify/publish controls | pending |
| Learner Support — Analytics | yes | `c5dbb59a08ec40ad8e2154ee42d68ecc` | 23 controls | Adopted metric hierarchy; real section export replaces toast-only behavior | pending |
| Notifications | yes | `672d29b06997401fab496c8c0dd05c3e` | 33 controls | Retained stronger governed communication and per-item read actions | pending |
| Nexus AI assistant | yes | `90a82f6d5862458fa35091c2df3d1fc8` | 14 controls | Retained confirmed action executor and layered student prohibition | pending |

## Control validation findings

- All 23 generated HTML artifacts returned HTTP 200 and were inspected for buttons, links, inputs, selects, textareas, visible labels, and accessible names—not screenshots alone.
- Strong Stitch patterns: clear workspace identity, tonal page headers, obvious primary actions, course/lesson hierarchy, student/teacher assessment separation, dense-but-readable tables, account directory hierarchy, case detail, campaign operations, metric explanations, and structured AI confirmation.
- Incomplete or ambiguous Stitch controls: temporary-password completion; teacher module reorder/delete; staff read-only scope; some assessment edit/preview labels; controlled grade correction; schedule edit/delete; account lifecycle/responsibility actions; nearly every Success Radar mutation; applicant edit/stage/owner; Knowledge create/verify; notification governed communication approval; and student AI assessed-work prohibition.
- Decision: follow Stitch's visual hierarchy and interaction framing, but never remove the real platform's more complete labeled actions, controlled transitions, audit evidence, or RLS boundaries.

## Implementation evidence

- A live role/page context strip, stronger tonal page framing, consistent focus treatment, skip links, `aria-current`, responsive context stacking, and reduced card shadow language apply across every authenticated platform and Learner Support page.
- The Learner Support Updates and case-notification controls now navigate to real work instead of doing nothing; Export produces a real dated, section-scoped JSON file instead of only displaying a toast.
- The CRM sign-in page now supports show/hide password, an enumeration-safe Supabase reset request, `PASSWORD_RECOVERY` handling, and a secure 16–128 character password replacement path.
- Existing page-specific actions remain intact wherever they exceed Stitch's control coverage.

## Production evidence

Pending reviewed merge and Ready custom-domain deployment.
