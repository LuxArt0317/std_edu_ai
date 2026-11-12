# Digital Teaching Materials

The signed-in home uses the university's three-column layout, notice icons, course-category tree and Open Sans. The dashboard and private record views use the two-column workspace. The account menu opens assignments, grades and the campus assistant.

`/dtm/login` uses Google sign-in. `/dtm` follows the official three-column layout with navigation, announcements, course categories and contact details checked on 2026-11-12. `/dtm/dashboard` groups your saved courses by academic term. The English and Traditional Chinese choices update the interface and the page language metadata used by browsers.

DTM and School Affairs use the same Google session. Sign-in returns to the requested DTM page. The homepage account indicator and assistant use the same verified identity. Old `/school-sites/dtm.stu.edu.tw/` links open the local DTM.

Add a personal course, then save materials, class meetings, attendance, assignments and grades. Link an assignment to the meeting where it was given. `/dtm/assignments` and `/dtm/grades` aggregate the saved records. The seed course stays labeled as a sample. The site administrator's existing manager covers sample records, and RLS restricts personal DTM records to their owner.

To import deadlines, download a Moodle Calendar `.ics` file, choose the matching saved course, and select the deadlines to import. The import stores titles, Taipei-normalized dates and a deduplication hash. Calendar feed URLs, descriptions and credentials stay out of storage. The assistant can link to the selected meeting's assignments, unfinished work, attendance and grades from this account.

Official enrollment, submissions, notifications and grade sync require a university-approved Moodle integration. Use the official links for those services. [Moodle calendar export](https://docs.moodle.org/502/en/Using_Calendar), [Moodle external services](https://moodledev.io/docs/4.5/apis/subsystems/external).
