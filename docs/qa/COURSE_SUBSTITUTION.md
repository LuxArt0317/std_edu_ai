# Course substitution search

The [university form](https://info.stu.edu.tw/ACA/student/qryCOURSEKD/qryCourseKindAdmit.asp) uses an autocomplete selection to submit a department code. The native service opens from Academic Affairs and supports its 28 cohorts and 15 study tracks. It uses the public department suggestions and returns an exact result URL. The 1280px source reference has a 962px shell, a centered filter form and an 866px result table.

For department 01 (資管系), track 1 (四技日間部), the official read returned 16 original courses for cohort 110, three for cohort 113 and zero for cohort 115. The cohort 110 result gives IMU07201 as the published replacement for IMU07302. Blank detail and an explicit no-replacement message are kept distinct. Multiple groups remain separate, and all courses in a selected group are shown together.

The lookup reads the current public form and validates the result caption against all three selectors. When the university is unavailable, the three exact verified results are available in Supabase, dated November 14, 2026 (Taipei). Any other unavailable selection shows a retry state. The records are reference data. The search cannot determine personal eligibility or grant credit.

The assistant supports a directory link and exact public lookup. For example, ask “Course substitutions for IMU07302, cohort 110, track 1, department 01.” The answer links to the expanded source-backed row. On the result page, “What replaces IMU07302?” uses that page’s cohort, track and department. Previously saved service notes remain accessible on a separate route.
