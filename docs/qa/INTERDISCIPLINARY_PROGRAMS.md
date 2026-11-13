# Interdisciplinary credit programs

The [university program directory](https://info.stu.edu.tw/ACA/teacher/QryIntraCourse/qryIntraCourse.asp) returned 35 entries in six sortable columns on November 14, 2026 (Taipei). Thirty titles linked to downloadable PDFs. PU082 through PU086 had no linked file. The [logo](https://info.stu.edu.tw/ACA/teacher/images/Tlogo.png) and PDF digests are in [the capture manifest](../../public/stu-reference/interdisciplinary/checksums.json).

The migration stores each published row and the digest of its document, where present. The site and assistant read the same data through the Supabase publishable key. RLS and table grants restrict anonymous and authenticated users to SELECT. No student information or university account credentials are included. The program pages use fixed public PDF copies.

The compiled UI suite checks the Academic Affairs menu destination, column sorting, separate document routes, available downloads, guest return path and narrow-screen containment. The deployed checks additionally verify the full release revision, all 30 PDF digests, and the assistant's English and Chinese directory answers.

The related university [course substitution search](https://info.stu.edu.tw/ACA/student/qryCOURSEKD/qryCourseKindAdmit.asp) returned HTTP 451 on result requests for academic years 115, 113 and 109. The site makes no claim about equivalencies for those years.
