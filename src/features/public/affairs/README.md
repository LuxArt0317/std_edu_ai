# School Affairs UI

The captured 94-link service catalog opens local pages. Shared routes cover the homepage, notifications, bookmarks, DTM and the student SSO information page. Other entries open a service workspace with its university destination and private tracking records.

The logged-out entry uses the 16 public campus photos captured from `info.stu.edu.tw/ePortal/login.asp`. It starts on a varying photo, advances every five seconds, and offers previous, next and pause controls. Reduced-motion visitors start paused. Photo URLs and hashes are recorded in `public/stu-reference/provenance.json`.

Google sign-in starts from a full browser page. A login page opened in an assistant iframe first navigates the parent to `/school-affairs/login`. The OAuth URL is generated without an automatic frame redirect, validated against the configured Supabase Auth endpoint, then opened in the top-level page. A stalled start returns a retryable error after 15 seconds.

Successful School Affairs sign-out clears the current tab's assistant transcript, including account-specific answers and activity. The assistant keeps that bounded transcript only for the verified Google identity while the session remains active; see the linked assistant QA guide for restore and privacy behavior.

`/school-affairs/services/leave` and its history page save leave dates, type, periods and an optional reason. The internship workspace tracks contracts, self-assessments and companies. Requesting site review sends a summary to the existing stu.best admin queue after confirmation. The owner retains private notes. Use the official leave and internship links to file with the university.

`SchoolAccountRecords.tsx` renders account-scoped sample enrollment and tuition, saved assignments, tasks and requests. The verified Lux Google admin manages sample records and resolves site requests. Private reads and audited writes use `/api/affairs-data`, `/api/affairs-action` and `/api/affairs-manage`. [School Affairs assistant and account data](../../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md).
