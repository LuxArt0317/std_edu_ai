# Course substitution search

The [university form](https://info.stu.edu.tw/ACA/student/qryCOURSEKD/qryCourseKindAdmit.asp) uses an autocomplete selection to submit a department code. The native service opens from Academic Affairs and supports its 28 cohorts and 15 study tracks. It uses the public department suggestions and returns an exact result URL. The 1280px source reference has a 962px shell, a centered filter form and an 866px result table.

For department 01 (資管系), track 1 (四技日間部), the official read returned 16 original courses for cohort 110, three for cohort 113 and zero for cohort 115. The cohort 110 result gives IMU07201 as the published replacement for IMU07302. Blank detail and an explicit no-replacement message are kept distinct. Multiple groups remain separate, and all courses in a selected group are shown together.

The lookup reads the current public form and validates the result caption against all three selectors. When the university is unavailable, the three exact verified results are available in Supabase, dated November 14, 2026 (Taipei). Any other unavailable selection shows a retry state. The records are reference data. The search cannot determine personal eligibility or grant credit.

The assistant supports a directory link and exact public lookup. For example, ask “Course substitutions for IMU07302, cohort 110, track 1, department 01.” The answer links to the expanded source-backed row. On the result page, “What replaces IMU07302?” uses that page’s cohort, track and department. Previously saved service notes remain accessible on a separate route.

## Production verification

Vercel deployed revision `52ec598a870b16d17d970e10ba938f43d4a85d00` at [stu.best](https://stu.best) on November 14, 2026 (Taipei). The [deployment](https://vercel.com/v1-d286/std_edu_ai/F1UxWEuf58LFNFSCB3oSZpcfsZvy) and public manifest agree. Production returned 16, 3 and 0 live results for the three checked cohorts. The browser checked autocomplete, expanded groups, exact links, retry, guest return and four widths with a synthetic sign-in. Four public assistant queries returned their expected answers and links. The public shell passed eight routes with 50 resolved assets each. [GitHub Quality](https://github.com/LuxArt0317/std_edu_ai/actions/runs/43476117467) passed on attempt 2.

The isolated database check forced the upstream read to return HTTP 451. Each selection returned its exact dated Supabase record, and the uncaptured cohort 112 returned an unavailable result. Only migration `20261114080000` was applied. Both application roles have read-only RLS access to these public reference records. The catalog browser verified navigation for all 94 entries. It still identifies 49 generic pages and seven partial workflows.

Repeat the production browser check with Node 24 and the repository's existing Playwright Chromium:

```sh
PUBLIC_SITE_ORIGIN=https://stu.best EXPECTED_RELEASE_REVISION="$(curl -fsS https://stu.best/release.json | node -p 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).revision')" node tests/integration/course-substitution-ui.mjs
STU_BASE_URL=https://stu.best npm run test:live-shell
```
