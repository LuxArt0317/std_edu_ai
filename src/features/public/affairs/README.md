# School Affairs UI

The captured 94-link service catalog and portal views live here. Google site authentication is isolated from Nexus, and official school services may require a separate school sign-in. This is a dated interface copy, not an official university system.

The logged-out entry uses the 16 public campus photos captured from `info.stu.edu.tw/ePortal/login.asp`. It starts on a varying photo, advances every five seconds, and offers previous, next and pause controls. Reduced-motion visitors start paused. Photo URLs and hashes are recorded in `public/stu-reference/provenance.json`.

`SchoolAccountRecords.tsx` renders the separate Google account's sample-labeled School Affairs records and protected site admin controls. Private reads and writes use `/api/affairs-data` and `/api/affairs-action`; see [School Affairs assistant and account data](../../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md). No Nexus or official university records are imported here.
