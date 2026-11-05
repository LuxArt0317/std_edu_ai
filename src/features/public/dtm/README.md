# Digital Teaching Materials preview

`/dtm/login` recreates the source Moodle-style logged-out entrance with a Google sign-in button. `/dtm` shows a responsive, three-column dashboard, sample notices, a term/course tree and a sample course-material page. Old copied `/school-sites/dtm.stu.edu.tw/` links resolve to these local pages. This is an independent stu.best preview, not the university's Moodle service.

Authentication uses the existing School Affairs Google PKCE session. A successful DTM sign-in returns to `/dtm`; signing out ends this shared site session, so both previews sign out together. Nexus sign-in remains separate. The public homepage account indicator and assistant use the same verified Google identity.

The client migration `20261105020000_dtm_sample_workspace.sql` creates `dtm_courses`, `dtm_materials` and `dtm_notices`. `dtm_initialize_account()` creates one sample course and three sample materials per verified Google account. Only that account may read its courses and materials; sample notices are visible to verified Google accounts. All records are marked `sample`, and no official DTM course, grade, submission or university account is imported.

The private assistant receives DTM and School Affairs records only after server verification of the Google bearer token. Anonymous requests receive no account snapshot. Check locally with `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5175 node tests/integration/dtm-ui.mjs` and test database isolation with `node tests/integration/dtm-workspace-rls-live.mjs` after applying migrations to the exact client project.
