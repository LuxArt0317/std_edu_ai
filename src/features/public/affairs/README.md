# School Affairs UI

The captured 94-link service catalog and portal views live here. Google site authentication is isolated from Nexus, and official school services may require a separate school sign-in. This is a dated interface copy, not an official university system.

The logged-out entry uses the 16 public campus photos captured from `info.stu.edu.tw/ePortal/login.asp`. It starts on a varying photo, advances every five seconds, and offers previous, next and pause controls. Reduced-motion visitors start paused. Photo URLs and hashes are recorded in `public/stu-reference/provenance.json`.

Google sign-in starts from a full browser page. A login page opened in an assistant iframe first navigates the parent to `/school-affairs/login`. The OAuth URL is generated without an automatic frame redirect, validated against the configured Supabase Auth endpoint, then opened in the top-level page. A stalled start returns a retryable error after 15 seconds.

Successful School Affairs sign-out clears the current tab's assistant transcript, including account-specific answers and activity. The assistant keeps that bounded transcript only for the verified Google identity while the session remains active; see the linked assistant QA guide for restore and privacy behavior.

`SchoolAccountRecords.tsx` renders account-scoped sample subjects across terms, assignments, tuition, tasks and notices. `SchoolRecordManager.tsx` lets the verified Lux site admin manage sample enrollments, charges and assignments. Private reads and audited writes use `/api/affairs-data`, `/api/affairs-action` and `/api/affairs-manage`; see [School Affairs assistant and account data](../../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md). No Nexus or official university records are imported here.
