# Public accessibility checks

`npm run test:accessibility-public` audits the compiled React assistant, source citations, correction feedback, campus routes, study consent and withdrawal, plus320pxreflow. CI supplies its installed Chromium via `CHROME_PATH`; public responses are controlled fixtures and no live model or account is used. Copied source pages have a separate `test:school-mirror` gate.

Assistant headings and feedback are checked in their exact current language: initial English, Chinese after a Chinese question, then English after an English question. Feedback capabilities use a future fixture expiry. The WCAG serious/critical, target size, focus, status-message and overflow checks remain mandatory. Local browser execution must follow the user’s current browser-use authorization.
