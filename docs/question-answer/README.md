# School questions and answers

Updated **25 November 2026 (Asia/Manila)** from the [school question spreadsheet](https://docs.google.com/spreadsheets/d/1JUDwxx5LmdwtIJ0hDZEjuwM4UNMN3cr7Gmx-m5F6M-Y/edit?gid=1159453213). This is the canonical authored question/reference document for the local Answer Lab: **53 questions across 12 categories**.

## How to interpret these answers

- Questions use the spreadsheet’s wording. Directory paths and notes are leads, not proof of current policy, personal records or access permission. “Not found,” “probably,” and “login required” remain explicit limitations.
- Student-facing links use confirmed stu.best destinations. A related local page is not represented as an exact replacement for an unavailable original source. Exact source gaps are tracked in [issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102).
- Signed-in questions require the caller’s authorized records. These reference answers contain no invented personal balance, timetable, rank or submission. A complete empty result, an unread collection and a failed lookup are different.
- Public school captures are dated **3 November 2026** unless a source says otherwise. The imported IPIAC PDF is a **115-entry draft**, captured locally **25 November 2026**. **115 academic year is 2026–2027**; 115級/class-of-2026 ceremony labels are not interchangeable with academic-year dates. Financial amounts are NT$. Dates do not establish that a deadline is currently open.
- This reference document feeds only question/expected-answer management and the separate evaluator. It is not runtime evidence for the answering chatbot. Improve retrieval from raw sources instead of feeding these answers to the model.

## Evaluation settings

The settings below identify the page context and public/account boundary for each case; they are not facts or answers sent to the model. Existing runs retain their original question, reference, model and version when this document is synced.

```evaluation-lab-config
{
  "Q01": {
    "scope": "public",
    "route": "/school-sites/www.acc.stu.edu.tw/%E5%AD%B8%E8%B2%BB%E8%A8%88%E7%AE%97/%E5%AD%B8%E9%9B%9C%E8%B2%BB%E5%B0%88%E5%8D%80/"
  },
  "Q02": {
    "scope": "public",
    "route": "/school-sites/cash.stu.edu.tw/%E6%9C%8D%E5%8B%99%E9%A0%85%E7%9B%AE/"
  },
  "Q03": {
    "scope": "account",
    "route": "/school-affairs/services/39-1"
  },
  "Q04": {
    "scope": "public",
    "route": "/school-sites/life.sao.stu.edu.tw/%E6%95%99%E8%82%B2%E9%83%A8%E5%AD%B8%E9%9B%9C%E8%B2%BB%E6%B8%9B%E5%85%8D/"
  },
  "Q05": {
    "scope": "account",
    "route": "/school-affairs/services/9-1"
  },
  "Q06": {
    "scope": "public",
    "route": "/source-documents/ipiac-115/index.html"
  },
  "Q07": {
    "scope": "public",
    "route": "/source-documents/ipiac-115/index.html"
  },
  "Q08": {
    "scope": "public",
    "route": "/school-sites/life.sao.stu.edu.tw/%E7%8D%8E%E5%8A%A9%E5%AD%B8%E9%87%91/"
  },
  "Q09": {
    "scope": "public",
    "route": "/school-sites/www.oica.stu.edu.tw/en/foreign-students/"
  },
  "Q10": {
    "scope": "public",
    "route": "/"
  },
  "Q11": {
    "scope": "public",
    "route": "/school-sites/life.sao.stu.edu.tw/%E8%AB%8B%E5%81%87%E6%B5%81%E7%A8%8B%E8%AA%AA%E6%98%8E/"
  },
  "Q12": {
    "scope": "account",
    "route": "/school-affairs/services/leave/history"
  },
  "Q13": {
    "scope": "account",
    "route": "/school-affairs/services/11-2"
  },
  "Q14": {
    "scope": "public",
    "route": "/school-affairs/services/13-1"
  },
  "Q15": {
    "scope": "account",
    "route": "/school-affairs/services/15-1"
  },
  "Q16": {
    "scope": "account",
    "route": "/school-affairs/services/11-1"
  },
  "Q17": {
    "scope": "account",
    "route": "/school-affairs/services/11-1"
  },
  "Q18": {
    "scope": "account",
    "route": "/school-affairs/services/13-1"
  },
  "Q19": {
    "scope": "public",
    "route": "/school-sites/activity.sao.stu.edu.tw/%E6%A8%B9%E5%BE%B7%E7%A7%91%E6%8A%80%E5%A4%A7%E5%AD%B8%E7%95%A2%E6%A5%AD%E5%85%B8%E7%A6%AE%E5%AE%98%E7%B6%B2/"
  },
  "Q20": {
    "scope": "public",
    "route": "/school-sites/life.sao.stu.edu.tw/%E8%AB%8B%E5%81%87%E6%B5%81%E7%A8%8B%E8%AA%AA%E6%98%8E/"
  },
  "Q21": {
    "scope": "public",
    "route": "/dtm/login"
  },
  "Q22": {
    "scope": "account",
    "route": "/dtm/assignments"
  },
  "Q23": {
    "scope": "public",
    "route": "/dtm"
  },
  "Q24": {
    "scope": "account",
    "route": "/dtm"
  },
  "Q25": {
    "scope": "public",
    "route": "/school-sites/webpac.stu.edu.tw/webopac/"
  },
  "Q26": {
    "scope": "public",
    "route": "/latestnews"
  },
  "Q27": {
    "scope": "account",
    "route": "/school-affairs/services/15-1"
  },
  "Q28": {
    "scope": "public",
    "route": "/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/"
  },
  "Q29": {
    "scope": "public",
    "route": "/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/"
  },
  "Q30": {
    "scope": "public",
    "route": "/school-sites/omh.sao.stu.edu.tw/%E6%88%BF%E5%9E%8B-%E5%83%B9%E7%9B%AE%E4%B8%80%E8%A6%BD/"
  },
  "Q31": {
    "scope": "public",
    "route": "/school-sites/omh.sao.stu.edu.tw/%E7%94%B3%E8%AB%8B-%E6%9B%B4%E6%8F%9B-%E9%80%80%E5%AE%BF/"
  },
  "Q32": {
    "scope": "public",
    "route": "/school-affairs/services/45-1"
  },
  "Q33": {
    "scope": "public",
    "route": "/school-sites/www.ecc.stu.edu.tw/%E5%AD%B8%E7%94%9F%E5%AE%BF%E8%88%8D%E7%B6%B2%E8%B7%AF%E5%A0%B1%E4%BF%AE/"
  },
  "Q34": {
    "scope": "public",
    "route": "/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/"
  },
  "Q35": {
    "scope": "public",
    "route": "/school-sites/www.oica.stu.edu.tw/en/school-map/"
  },
  "Q36": {
    "scope": "public",
    "route": "/%E5%88%86%E6%A9%9F%E8%A1%A8/"
  },
  "Q37": {
    "scope": "public",
    "route": "/分機表/"
  },
  "Q38": {
    "scope": "public",
    "route": "/school-sites/freshman.stu.edu.tw/2020/05/13/%E5%AD%B8%E7%94%9F%E8%AD%89/"
  },
  "Q39": {
    "scope": "public",
    "route": "/school-sites/help.ecc.stu.edu.tw/wireless-setting/"
  },
  "Q40": {
    "scope": "public",
    "route": "/school-sites/www.aca.stu.edu.tw/2024/02/01/%E5%AD%B8%E6%9C%9F%E6%88%90%E7%B8%BE%E9%96%8B%E6%94%BE%E6%9F%A5%E8%A9%A2%E5%8F%8A%E7%94%B3%E8%AB%8B%E5%88%97%E5%8D%B0/"
  },
  "Q41": {
    "scope": "public",
    "route": "/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/"
  },
  "Q42": {
    "scope": "public",
    "route": "/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/"
  },
  "Q43": {
    "scope": "public",
    "route": "/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/"
  },
  "Q44": {
    "scope": "public",
    "route": "/school-sites/reg.aca.stu.edu.tw/overseas_admissions"
  },
  "Q45": {
    "scope": "public",
    "route": "/admissions"
  },
  "Q46": {
    "scope": "public",
    "route": "/%E5%AD%B8%E8%A1%93%E5%96%AE%E4%BD%8D/"
  },
  "Q47": {
    "scope": "public",
    "route": "/%E9%97%9C%E6%96%BC%E6%A8%B9%E5%BE%B7/"
  },
  "Q48": {
    "scope": "public",
    "route": "/school-sites/www.ssc.stu.edu.tw/"
  },
  "Q49": {
    "scope": "account",
    "route": "/school-affairs/services/47-1"
  },
  "Q50": {
    "scope": "public",
    "route": "/教職員工/"
  },
  "Q51": {
    "scope": "public",
    "route": "/school-sites/things.stu.edu.tw/%E5%81%9C%E8%BB%8A%E8%AD%89%E7%94%B3%E8%BE%A6%E6%B5%81%E7%A8%8B/"
  },
  "Q52": {
    "scope": "public",
    "route": "/source-documents/ipiac-115/index.html"
  },
  "Q53": {
    "scope": "public",
    "route": "/分機表/"
  }
}
```

## 1. Tuition & payment

### Q01. How much is tuition, including for IPIAC scholars and international students?

**Answer:** Your program and study level determine the rate. The **115 academic-year undergraduate daytime table** lists tuition and miscellaneous fees of **NT$53,390 per semester** for Information/Design, Child Care and Family Services, and Information Management; the Management/Applied Social Sciences category is **NT$46,433**, subject to the table's department exceptions. International students use the rate for their program. These are tuition-and-miscellaneous totals, not an all-inclusive living-cost bill. [Read the 115 fee table](https://stu.best/school-assets/ae47f1b002b79a4e65d6.pdf) or [browse tuition information](https://stu.best/school-sites/www.acc.stu.edu.tw/%E5%AD%B8%E8%B2%BB%E8%A8%88%E7%AE%97/%E5%AD%B8%E9%9B%9C%E8%B2%BB%E5%B0%88%E5%8D%80/).

For the three IPIAC programs in the supplied 115-entry prospectus—Information Management, Computer and Communication, and Computer Science and Information Engineering—the stated base is **NT$53,390**. It describes a first-semester tuition waiver and later performance-based awards. Those conditions apply to that prospectus, not automatically to every entry year. See Q06–Q08 for the calculation and limitations.

### Q02. What are the tuition fee payment options and deadlines?

**Answer:** For tuition payment, start at **Current Students → Registration & Payment → Registration Payment Info**. Use [Payment Printing & Lookup](https://stu.best/school-sites/cash.stu.edu.tw/%E6%9C%8D%E5%8B%99%E9%A0%85%E7%9B%AE/) to find the bill-printing and query services. The captured [registration-payment notice](https://stu.best/school-sites/cashier.swd.stu.edu.tw/registration-fee-area/) lists bank-counter payment, Taiwan Pay, ATM bill payment, credit card and convenience-store payment. Convenience stores charge a handling fee. Use the payment details on your own bill; do not send money to an account supplied in chat.

For **115-1 only**, the notice says payment was due **11 September 2026**, with convenience-store payment ending **31 August 2026**. Those dates have passed; they are not the next semester's deadline. Obtain the applicable term's bill before paying. The same notice says credit-card reconciliation takes about three business days and convenience stores about five to six; specified bank/ATM/Taiwan Pay channels reconcile the same day. Receipt availability is described separately, so payment status need not change instantly. For a deadline or reconciliation problem, contact the Cashier, **07-6158000 ext. 2208**.

The exact supplied payment-method page is not in the local catalog. The link above is a related notice with usable instructions; its missing exact equivalent is **[P0 issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

### Q03. Can I see my real-time tuition and fee payment status?

**Answer:** Sign in to [School Affairs](https://stu.best/school-affairs), then check [your notifications](https://stu.best/school-affairs/notifications) and [pending fees](https://stu.best/school-affairs/services/39-1). You can ask the assistant to read the fee records linked to your account. Without sign-in, I can explain the process but cannot show a personal balance.

A saved status is only as current as its last update. Compare the term, outstanding amount, payment reference and update time with your receipt; an unposted payment should not be described as unpaid with certainty. Bank settlement may take the time described in Q02. These pages do not by themselves guarantee a live bank connection.

### Q04. What tuition discounts are available?

**Answer:** Check **Current Students → Scholarships & Aid (獎助學金資源)**. The sheet identifies three separate routes: [MOE tuition reduction](https://stu.best/school-sites/life.sao.stu.edu.tw/%E6%95%99%E8%82%B2%E9%83%A8%E5%AD%B8%E9%9B%9C%E8%B2%BB%E6%B8%9B%E5%85%8D/), [tuition-gap reduction plan](https://stu.best/school-sites/life.sao.stu.edu.tw/%E8%A1%8C%E6%94%BF%E9%99%A2%E6%B8%9B%E5%85%8D%E5%AD%B8%E9%9B%9C%E8%B2%BB%E6%8B%89%E8%BF%91%E6%96%B9%E6%A1%88/) and [aid for disadvantaged students](https://stu.best/school-sites/life.sao.stu.edu.tw/%E5%BC%B1%E5%8B%A2%E5%8A%A9%E5%AD%B8/). Their eligibility, documentation, amounts and application windows differ; a listing is not proof that your account qualifies. Read the applicable notice, then check [your fee-remission records](https://stu.best/school-affairs/services/21-3) or [student-aid application](https://stu.best/school-affairs/services/22-1). Your confirmed award and bill determine any actual deduction; do not automatically add different schemes together.

## 2. Scholarships

### Q05. Where can I find my scholarship status?

**Answer:** Sign in and open [International Student Scholarship Applications](https://stu.best/school-affairs/services/9-1). The menu path is **School Affairs → Academic Affairs (教務系統) → Application/Input Programs (申請輸入程式) → International Students (境外學生) → 境外學生獎助學金申請**. Select the application period and review the saved application or award status. An application awaiting review is not an approved scholarship or a payment. If the period or decision is absent, ask OICA rather than assuming rejection. [OICA contact information](https://stu.best/school-sites/www.oica.stu.edu.tw/%E8%81%AF%E7%B5%A1%E8%B3%87%E8%A8%8A/).

### Q06. Can you explain my IPIAC scholarship, including its regulations for different academic years of entry?

**Answer:** I need your **entry academic year, program and scholarship award notice** to identify your rules. Read the [115-entry IPIAC source draft](https://stu.best/source-documents/ipiac-115/index.html) for that cohort. The supplied 115-entry prospectus states a first-semester tuition waiver; students living in campus accommodation throughout that semester may receive an **NT$11,000 accommodation subsidy in the following semester**. From semester two, it describes performance-based awards of **NT$20,000, NT$10,000 or NT$3,000**, subject to eligibility.

It does not establish the rules for earlier cohorts. Its appendix also contains mixed 114/115 and 2025 year labels. Older cohort regulations remain an urgent gap in **[issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**. Use [your saved award](https://stu.best/school-affairs/services/9-1) and [OICA](https://stu.best/school-sites/www.oica.stu.edu.tw/%E8%81%AF%E7%B5%A1%E8%B3%87%E8%A8%8A/) to settle which conditions apply to you; do not transfer the 115 draft to a 112-entry student.

### Q07. How is the tuition deduction for scholars calculated?

**Answer:** Start with the tuition-and-miscellaneous charge, subtract the **approved tuition award**, then add separately billed items and account for payments or credits already posted. For the prospectus's NT$53,390 base, the arithmetic is:

| Approved tuition award | Tuition and miscellaneous amount remaining |
| --- | ---: |
| First-semester full waiver: NT$53,390 | NT$0 |
| NT$20,000 | NT$33,390 |
| NT$10,000 | NT$43,390 |
| NT$3,000 | NT$50,390 |

These calculations exclude accommodation, deposits, insurance and other items; they are **not your final bill**. The NT$11,000 accommodation subsidy described for eligible first-semester residents is paid in semester two and should not automatically be treated as an immediate dorm-fee deduction. Check [your scholarship decision](https://stu.best/school-affairs/services/9-1) and [pending fees](https://stu.best/school-affairs/services/39-1). The PDF's first-semester subtotal retains the pre-waiver tuition despite listing zero after reduction, so that subtotal is not safe to reuse. **[Correction tracked here](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

### Q08. What scholarship programs does the school offer?

**Answer:** Browse **Current Students → Scholarships & Aid → Scholarship Info (獎助學金資訊)**. The [school scholarship directory](https://stu.best/school-sites/life.sao.stu.edu.tw/%E7%8D%8E%E5%8A%A9%E5%AD%B8%E9%87%91/) separates internal and external awards and awardee notices. The [higher-education incentive area](https://stu.best/school-sites/www.sao.stu.edu.tw/%E9%AB%98%E6%95%99%E5%8B%B5%E5%AD%B8%E9%87%91-2/) is another scheme, with its own conditions. International students can also check [OICA scholarships](https://stu.best/school-sites/www.oica.stu.edu.tw/%E7%8D%8E%E5%8A%A9%E5%AD%B8%E9%87%91/) and the [115-entry IPIAC source draft](https://stu.best/source-documents/ipiac-115/index.html). Choose an award to check its current eligibility, amount, documents, deadline and renewal rules. These directories list opportunities; they do not establish that you personally received an award.

### Q09. What are the requirements for applying for the IPIAC scholarship?

**Answer:** Applicants entering under this prospectus must complete and sign **Annex IV, Scholarship Application Form for Foreign Student**, and submit it with their admission documents; an application is not an automatic award. In the [115-entry IPIAC source draft](https://stu.best/source-documents/ipiac-115/index.html), later-semester awards depend on academic performance **and** other requirements. Its tiers are **average at least 85 and top 20% of the class: NT$20,000; average at least 75 and top 50%: NT$10,000; all subjects at least 60: NT$3,000**. These are tier descriptions, not cumulative awards.

The appendix requires campus residence throughout the semester, except approved accommodation arranged through the internship provider/employer; from semester three it requires **TOCFL A2 or higher** and participation in the required internship program. Your cohort's award notice still controls applicability. Submit/check the relevant [application](https://stu.best/school-affairs/services/9-1); older-year rules remain **[P0 work](https://github.com/LuxArt0317/std_edu_ai/issues/102)**. The complete source is now available as the [115-entry IPIAC source draft](https://stu.best/source-documents/ipiac-115/index.html); it is a draft, and the mixed year labels still require cohort-specific confirmation.

## 3. Grades, leave & records

### Q10. How do I check my grades, including in Moodle?

**Answer:** Sign in and open [School Affairs Grade Inquiry](https://stu.best/school-affairs/services/13-1) through **Current Students → School Affairs → Academic Affairs → Student Course Selection → Score → Grade Inquiry**. Choose the academic year and semester. For Moodle coursework marks, open [DTM grades](https://stu.best/dtm/grades) or enter the course in [Moodle/DTM](https://stu.best/dtm) and choose **Grades**. DTM coursework marks and recorded School Affairs semester grades are separate collections; one must not be presented as the other or combined into an invented final mark.

### Q11. Where is the leave (請假) section?

**Answer:** Open the [Student Leave form](https://stu.best/school-affairs/services/leave). From the menu: **School Affairs → Student Affairs (學務資訊) → Application/Input Programs → Student Leave (學生請假) → 請假填單**. Choose the new-request option, enter the leave type, dates and class periods, supply any required evidence, and review the request before submitting. You can check it later in [leave history](https://stu.best/school-affairs/services/leave/history). “New Fake Orders” in the supplied notes is a machine-translation error, not the name of a separate service. A saved draft must not be described as an approved leave. For the published attendance/leave procedure, see [Student Leave process](https://stu.best/school-sites/life.sao.stu.edu.tw/%E8%AB%8B%E5%81%87%E6%B5%81%E7%A8%8B%E8%AA%AA%E6%98%8E/). That public guidance is separate from your private leave history.

### Q12. How many leaves have I already used?

**Answer:** Sign in and open [your leave history](https://stu.best/school-affairs/services/leave/history). Specify the semester and whether you mean **requests, approved days or approved class periods**; these totals can differ. I can count the matching saved records and state whether pending, rejected and cancelled requests were excluded. I won’t invent a remaining leave allowance when the applicable rule has not been supplied.

### Q13. What is my class schedule?

**Answer:** Open [My Course Schedule](https://stu.best/school-affairs/services/11-2) after signing in: **Academic Affairs → Query Programs → Student Course Selection → 我的功課表 → Query**. Select the term and check the course, weekday, period, time, teacher and room shown in your account. For “my next class,” I can compare your selected timetable with the current date and **Taiwan time**, and check any cancellation notice available. A general course catalog does not prove you are enrolled.

### Q14. How do I look up a friend's grades?

**Answer:** Your sign-in lets you see **your own authorized records**, not another student's private grades. Your friend can open [Grade Inquiry](https://stu.best/school-affairs/services/13-1) in their own account or choose to share a transcript with you. Knowing their name or student number does not grant access. Staff access must follow the permissions assigned to that staff account.

## 4. Graduation & course planning

### Q15. What are the graduation requirements for my department?

**Answer:** Check [your graduation-credit review](https://stu.best/school-affairs/services/15-1) alongside the [curriculum for your entry year](https://stu.best/school-affairs/services/12-5). Requirements depend on department, degree and entry year; total credits alone may not cover required subjects, language or other graduation conditions. I can identify satisfied and missing categories from the applicable rules and your records. If the entry-year rules are absent, I can name that gap instead of claiming a standard university-wide threshold. [Missing exact-rule coverage is tracked here](https://github.com/LuxArt0317/std_edu_ai/issues/102). The sheet also points to a [graduation-credit-check notice](https://stu.best/school-sites/www.aca.stu.edu.tw/2025/09/07/%E8%AB%8B%E5%90%8C%E5%AD%B8%E4%B8%8A%E7%B6%B2%E6%9F%A5%E7%9C%8B%E7%95%A2%E6%A5%AD%E5%AD%B8%E5%88%86%E6%AA%A2%E6%A0%B8%E8%A1%A8/), but its current saved capture is an Access Denied response, so it does not establish the department requirements. Use the native review and applicable curriculum rather than treating that error page as evidence.

### Q16. Which classes should I take next semester to meet my credit threshold?

**Answer:** Start with [Curriculum Map](https://stu.best/school-affairs/services/12-7) under **Current Students → Course Learning**. Compare [completed enrollments](https://stu.best/school-affairs/services/11-1), [credit review](https://stu.best/school-affairs/services/15-1), your [entry-year curriculum](https://stu.best/school-affairs/services/12-5) and the [offered-course list](https://stu.best/school-affairs/services/12-4). Prioritize missing required courses, prerequisites and remaining credit categories, then check timetable clashes and credit limits. I can propose a course plan from those records, but a proposed subject is not enrolled until the actual registration succeeds. If next semester's offering has not been published, the plan must remain provisional.

### Q17. What are my subjects for a given year and semester?

**Answer:** Open [Course Selection Records](https://stu.best/school-affairs/services/11-1), choose the academic year and semester, and review that term's saved subjects. Use [My Course Schedule](https://stu.best/school-affairs/services/11-2) for their times and rooms. Tell the assistant the term you mean, such as **115-1 (2026–2027, semester one)**; I can distinguish completed, currently enrolled and planned subjects, rather than treating every course in DTM or the public catalog as your enrollment. The spreadsheet also names current and past **course searches**. Those show offerings, not proof of your enrollment; for your own subjects use the signed-in course-selection records.

### Q18. Based on my past grades, can I graduate, and what rank would I get?

**Answer:** Graduation eligibility requires [your grades](https://stu.best/school-affairs/services/13-1), [credit review](https://stu.best/school-affairs/services/15-1), the correct curriculum and other required clearance conditions. Past marks alone cannot prove graduation eligibility. Class rank additionally needs an authorized official ranking and comparison group; your individual transcript cannot establish the rest of the class's results. I can explain the gaps and any recorded rank, but should not predict a rank as a fact. If you mean finishing early, read the separate [early-graduation information](https://stu.best/school-sites/www.aca.stu.edu.tw/%E6%8F%90%E5%89%8D%E7%95%A2%E6%A5%AD-graduate-in-advance/) and check [your early-graduation application](https://stu.best/school-affairs/services/7-4) where authorized. Early-graduation eligibility is not the same as class rank.

### Q19. When is graduation?

**Answer:** The captured **115 academic-year student calendar** lists the graduation ceremony on **12 June 2027**. Ceremony attendance, academic completion and degree issuance are separate events. Check the [student calendar PDF](https://stu.best/school-assets/45b4315881485ac84bff.pdf) for the year and the [graduation-clearance information](https://stu.best/school-sites/www.aca.stu.edu.tw/%E7%95%A2%E6%A5%AD%E9%9B%A2%E6%A0%A1-leaving/) for the relevant graduating semester. The latter capture contains earlier 114-2 processing dates, which should not be reused as the 115-2 clearance deadlines. The sheet’s [Commencement site](https://stu.best/school-sites/activity.sao.stu.edu.tw/%E6%A8%B9%E5%BE%B7%E7%A7%91%E6%8A%80%E5%A4%A7%E5%AD%B8%E7%95%A2%E6%A5%AD%E5%85%B8%E7%A6%AE%E5%AE%98%E7%B6%B2/) is a separate ceremony resource; its saved page describes the class of 2026. Do not confuse a 2026 ceremony page with the 2026–2027 academic-year calendar.

### Q20. Can I graduate without attending classes?

**Answer:** You must satisfy the requirements that apply to your program, including earned credits, required activities or placements and any attendance-related course rules. Simply stopping attendance does not complete them. If you already have eligible credits, check [credit review](https://stu.best/school-affairs/services/15-1) and the relevant credit-transfer or graduation procedure with your department. If you need to stop studying, ask about formal leave of absence or withdrawal rather than just missing classes; those are different from the [single-class/day leave form](https://stu.best/school-affairs/services/leave). Check the [published leave/attendance procedure](https://stu.best/school-sites/life.sao.stu.edu.tw/%E8%AB%8B%E5%81%87%E6%B5%81%E7%A8%8B%E8%AA%AA%E6%98%8E/) for the relevant attendance rules. There is no verified attendance-free graduation pathway in the supplied sheet; do not treat that as a waiver of program requirements.

## 5. Moodle & coursework

### Q21. How do I open or log in to Moodle?

**Answer:** For the **Digital Teaching Materials service described in this survey**, open [DTM](https://stu.best/dtm) or [its sign-in page](https://stu.best/dtm/login) and use Continue with Google. On stu.best, DTM and School Affairs use the same account session on that domain. Choose your course after sign-in. DTM, the separate Digital Academy and TronClass are distinct services; I can ask which one holds your course if it is unclear. Google sign-in identifies your account; it does not grant unrelated students' course records. The spreadsheet specifically places Moodle under **Current Students → Information Systems → Moodle數位教材網**. Its remote-teaching alternative is TronClass; an exact local TronClass equivalent remains a gap in [issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102), so it must not be silently replaced with the separate Digital Academy.

### Q22. Do I have pending or missed assignments?

**Answer:** Open [My assignments](https://stu.best/dtm/assignments). I can compare each authorized assignment's deadline, submission status and any extension using Taiwan time, then list **not submitted, overdue, submitted or returned for revision** separately. A submitted activity awaiting grading is not automatically unfinished. If a course or deadline is missing, I can identify the coverage gap rather than say you have nothing due. Check the actual course platform: a DTM-only lookup does not establish that a TronClass course has no unfinished work. When submission data was not read, distinguish an open tracker entry from a verified unsubmitted assignment.

### Q23. How do I submit my midterm answers?

**Answer:** In [DTM](https://stu.best/dtm), open the correct course, then the midterm activity. Follow that activity's instructions: a file assignment, quiz and external assessment can require different steps. Check the allowed format and deadline, add your work, complete the submission/confirmation step if shown, and verify the saved status or receipt. An upload preview or draft is not final submission. I need the exact activity to give a precise link, and should not claim it submitted an exam without a successful supported action and your required confirmation. For a Moodle file activity, the sheet names **course → assignment → Add submission**. If the teacher uses a quiz or TronClass instead, confirm that activity’s instructions before uploading or submitting.

### Q24. Is there class today, and when is the midterm?

**Answer:** Check [your timetable](https://stu.best/school-affairs/services/11-2), the course's [DTM announcements and activities](https://stu.best/dtm), and the [academic calendar](https://stu.best/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/). The 115-1 general midterm period was **2–8 November 2026**; the 115-2 calendar lists **19–25 April 2027**. A course's exact exam time can differ within the published arrangements, so use the teacher's activity notice for the exact session. A timetable entry alone does not rule out a cancellation.

### Q25. Can you recommend books or videos to supplement my learning?

**Answer:** Tell me your subject, topic and level so I can suggest relevant materials. Start with [the library catalog](https://stu.best/school-sites/webpac.stu.edu.tw/webopac/) or [the electronic-resource gateway](https://stu.best/school-sites/stars.stu.edu.tw/stuhyint/index.jsp) under **Current Students → Academic Resources**, and compare suggestions with the [course reading list/materials](https://stu.best/dtm). I can suggest books or videos with an actual title, source and suitable level; a suggestion is not required reading unless the teacher says so. If no topic or source results are available, I should ask a focused question instead of inventing a book or video.

## 6. Calendar & events

### Q26. What events are being held this year?

**Answer:** For campus announcements, open [Latest News → Campus News](https://stu.best/latestnews); for club activities use [club introductions](https://stu.best/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/). Also check the [academic calendar](https://stu.best/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/) and the announcements relevant to your course or student group. In the captured 115 calendar, **Library Week runs 30 November–6 December 2026**, and the **graduation ceremony is 12 June 2027**. Those are examples from the published academic calendar, not a complete live list of all campus events. Check each event notice for registration, place and changes before attending.

### Q27. Which school activities am I lacking (credits or requirements)?

**Answer:** This depends on your department, entry year and which requirement you mean. The sheet points to a **Learning Portfolio System (歷程檔案系統)** behind sign-in, but says it was unverified and its directory link looked broken. An exact local equivalent is still a [P0 gap](https://github.com/LuxArt0317/std_edu_ai/issues/102). For the records currently available here, I can compare [graduation review](https://stu.best/school-affairs/services/15-1), [club records](https://stu.best/school-affairs/services/40-1) and [service-leadership records](https://stu.best/school-affairs/services/42-1) with the applicable requirements. These are related sources, not a claim to have checked the missing portfolio. Missing evidence is not proof of a missed compulsory activity, and not every club event is required.

### Q28. What are the exact semester dates, holidays and exam periods?

**Answer:** In the captured **115 academic-year student calendar**:

| Item | Semester 1 | Semester 2 |
| --- | --- | --- |
| Administrative semester span | 1 Aug 2026–31 Jan 2027 | 1 Feb–31 Jul 2027 |
| Classes begin | 7 Sep 2026 | 22 Feb 2027 |
| Midterm period | 2–8 Nov 2026 | 19–25 Apr 2027 |
| General final-exam period | 4–10 Jan 2027 | 21–27 Jun 2027 |
| Vacation begins | 11 Jan 2027 | 28 Jun 2027 |

The second-semester calendar separately lists graduating-class finals for **7–13 June 2027**. Read the [student calendar PDF](https://stu.best/school-assets/45b4315881485ac84bff.pdf) for the complete holidays and study-level notes. Scheduled weekend classes still run unless the calendar identifies a holiday. Emergency closures follow the applicable government announcement; a static calendar cannot predict them.

### Q29. Where is the school calendar?

**Answer:** Open the [Academic Affairs Calendar](https://stu.best/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/). Choose the student or staff edition and the correct academic year; Chinese and English downloads are listed there. The [115 student PDF](https://stu.best/school-assets/45b4315881485ac84bff.pdf) is the 2026–2027 version. Personal assignment due dates still come from the activity in DTM, not just the university calendar.

## 7. Dormitory

### Q30. What are the dorm fees, and how do I apply (international students)?

**Answer:** The [dorm room-and-price page](https://stu.best/school-sites/omh.sao.stu.edu.tw/%E6%88%BF%E5%9E%8B-%E5%83%B9%E7%9B%AE%E4%B8%80%E8%A6%BD/) lists **NT$10,000 per semester for second-dorm rooms; NT$11,000 for third/fourth-dorm room types, including the overseas-student residence; and NT$16,000 for Wenhui Hall**. Confirm the assigned room and academic year; this is not an all-inclusive personal invoice. The page lists an **NT$3,500 deposit**, separate summer/winter arrangements and separate refund conditions. The [115 Accounting fee table](https://stu.best/school-assets/ae47f1b002b79a4e65d6.pdf) is another source with residence-specific categories; do not combine different room categories or IPIAC subsidy estimates into one universal price.

Use [apply / change rooms / move out](https://stu.best/school-sites/omh.sao.stu.edu.tw/%E7%94%B3%E8%AB%8B-%E6%9B%B4%E6%8F%9B-%E9%80%80%E5%AE%BF/). Its saved instructions say new-student applications open through the new-student system in August; continuing students apply in April through School Affairs → Student Affairs → Housing → Student Accommodation, with the bed lottery in the first week of May. These are published recurring arrangements, not proof that a current window is open. The local [accommodation application](https://stu.best/school-affairs/services/26-1) and [bed allocation](https://stu.best/school-affairs/services/34-1) require your account. International/IPIAC students should confirm any program-arranged accommodation with OICA. Housing enquiries: **07-6158000 ext. 2136**. An application is not a confirmed bed.

### Q31. How and when can I move out of the dorm?

**Answer:** Use the [dorm application / change / checkout instructions](https://stu.best/school-sites/omh.sao.stu.edu.tw/%E7%94%B3%E8%AB%8B-%E6%9B%B4%E6%8F%9B-%E9%80%80%E5%AE%BF/). The published checkout process is: **(1)** obtain the checkout application (and the parent undertaking for a student under 18); **(2)** clean the bed/room, take the forms, key and access card to the residence office for inventory inspection and handover; **(3)** settle any assessed damage and wait for the applicable deposit/fee adjustment. The saved page describes about **3–4 weeks after Housing receives the paperwork** for processing, not a guaranteed payment date.

Early checkout is restricted. The page lists exceptions such as study suspension, withdrawal, graduation, documented off-campus internship, exchange or approved special cases; unapproved early withdrawal can forfeit the full deposit. Check your category and date with Housing, **07-6158000 ext. 2136**. The captured 115 calendar separately lists term-end closure before **10:00 on 11 January 2027** and **28 June 2027**. Those closure dates are not early-move-out approval; IPIAC residents must also check scholarship residence conditions.

### Q32. How do I report a broken light and schedule a repair?

**Answer:** Open [Online Repair](https://stu.best/school-affairs/services/45-1), identify the dorm/building, room and faulty light, describe when the issue occurs, and add any requested evidence or contact availability. Keep the saved request/reference and check its status. A reported fault does not mean a technician's visit is booked; use the recorded appointment or residence-office confirmation for that. If there is sparking, exposed wiring or another immediate hazard, avoid the fixture and notify the residence staff promptly rather than waiting for a routine online request.

### Q33. How do I get dorm Wi-Fi for my laptop?

**Answer:** The [wireless guide](https://stu.best/school-sites/www.ecc.stu.edu.tw/wireless/) says dorm wireless service requires registration through the dorm network system. After that, use the [device-specific setup guide](https://stu.best/school-sites/help.ecc.stu.edu.tw/wireless-setting/): choose computer, Windows/macOS and dorm. It recommends the 802.1X networks **STU-Dorm-Mobile** or **STU-Dorm-Mobile-5G**, depending on the device. Do not invent a shared campus-wide password. The [dorm network guide](https://stu.best/school-sites/freshman.stu.edu.tw/2020/05/13/%E5%AE%BF%E8%88%8D%E7%B6%B2%E8%B7%AF/) also explains that wired service uses the IP assigned to your bed; do not use someone else's IP.

The exact dorm-registration page has no local catalog equivalent yet: **[P0 issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**. The local instruction pages above are not themselves network registration. For connection problems, the wireless page lists **07-6158000 ext. 2420**, **service@stu.edu.tw**, or [online repair](https://stu.best/school-affairs/services/45-1). The sheet’s dedicated [dorm network repair page](https://stu.best/school-sites/www.ecc.stu.edu.tw/%E5%AD%B8%E7%94%9F%E5%AE%BF%E8%88%8D%E7%B6%B2%E8%B7%AF%E5%A0%B1%E4%BF%AE/) is the appropriate public troubleshooting route; a general facilities-repair ticket and dorm-network registration are different services.

## 8. Campus services

### Q34. Where is a specific office or department, and how do I get there?

**Answer:** Tell me the office or department name so I can identify the building and room rather than guess. Use the [campus map](https://stu.best/school-sites/www.oica.stu.edu.tw/en/school-map/) for orientation. The captured Academic Affairs page places Registration/Curriculum on the **first floor of the Administration Building**, while OICA's contact page lists **Administration Building, fourth floor, A0428**. Department offices differ; check the specific office entry and opening hours before going. The spreadsheet’s starting directory is [Administrative Units](https://stu.best/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/); [Academic Units](https://stu.best/學術單位/) is useful for a department. The unlinked “Campus Friendly Map” menu label does not itself establish an accessible walking route.

### Q35. Where can I find the campus map?

**Answer:** Open the [School Map page](https://stu.best/school-sites/www.oica.stu.edu.tw/en/school-map/). Find your destination's building first, then its room/floor from the department or office contact details. A static map helps with orientation but does not prove an accessible route, an open entrance or real-time walking conditions.

### Q36. How do I contact the school office or my department?

**Answer:** The school switchboard is **+886 7 615 8000**. Open [the full phone-extension directory](https://stu.best/%E5%88%86%E6%A9%9F%E8%A1%A8/) through **Current Students → Campus Life → Phone Extensions (全校分機表)**. Tell me the office or department name and I can help find the matching contact rather than guess a staff number. For academic-record enquiries, the verified Registration/Curriculum contact is **course@stu.edu.tw**, **Administration Building, first floor**, extensions **2007 / 2009 / 2010 / 2012 / 2014 / 2016**. For international matters, use [OICA contacts](https://stu.best/school-sites/www.oica.stu.edu.tw/%E8%81%AF%E7%B5%A1%E8%B3%87%E8%A8%8A/).

### Q37. Is there a lost and found, and where is it?

**Answer:** The spreadsheet does not provide a confirmed lost-and-found room or exact procedure. Ask **Student Affairs (學務處)** through [the phone-extension directory](https://stu.best/%E5%88%86%E6%A9%9F%E8%A1%A8/) or the switchboard, **07-6158000**, and describe the item, where it was lost and when. That is a contact for clarification, not a claim that a particular office has your item. Do not post ID numbers or other private details publicly. A confirmed local lost-property location and collection procedure remain a [P0 source gap](https://github.com/LuxArt0317/std_edu_ai/issues/102).

### Q38. How and where do I get a replacement student ID?

**Answer:** The captured [student-card information page](https://stu.best/school-sites/freshman.stu.edu.tw/2020/05/13/%E5%AD%B8%E7%94%9F%E8%AD%89/) directs card enquiries to Registration/Curriculum, **07-6158000 ext. 2010**. Ask that office for the replacement application, required identification, current fee and collection arrangement. If the card's named iPASS function is active, also ask about blocking the lost card and handling its stored value. The source does not establish an exact replacement fee or turnaround, so those must not be invented. The complete local replacement procedure is **[a P0 gap](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

### Q39. How do I connect to school Wi-Fi?

**Answer:** Open the [Wi-Fi setup guide](https://stu.best/school-sites/help.ecc.stu.edu.tw/wireless-setting/) and choose your device, operating system and campus location. The [wireless information page](https://stu.best/school-sites/www.ecc.stu.edu.tw/wireless/) recommends **STU-dot1x / STU-dot1x-5G** for personal devices using 802.1X; some devices need the certificate/configuration steps. **STUWLAN** uses browser-based authentication and has a session limit. Use the credentials required by the selected guide—there is no source here supporting a single shared “school Wi-Fi password.” For help: **07-6158000 ext. 2420**, **service@stu.edu.tw**.

### Q40. How do I request my academic transcripts/records?

**Answer:** [Grade Inquiry](https://stu.best/school-affairs/services/13-1) lets you review your results; an issued transcript or enrollment certificate is a separate document request. The supplied [transcript notice](https://stu.best/school-sites/www.aca.stu.edu.tw/2024/02/01/%E5%AD%B8%E6%9C%9F%E6%88%90%E7%B8%BE%E9%96%8B%E6%94%BE%E6%9F%A5%E8%A9%A2%E5%8F%8A%E7%94%B3%E8%AB%8B%E5%88%97%E5%8D%B0/) lists Chinese/English enrollment and transcript documents, with collection/payment through Registration/Curriculum.

That particular reservation notice opened **1–31 August 2026**, with collection **7–18 September 2026**. It is expired as of this FAQ date, so do not treat its reservation form as currently open. Ask Registration/Curriculum, **course@stu.edu.tw** or **07-6158000**, for the current request channel. A copied notice or displayed grade table is not an issued transcript. The linked third-party reservation-form equivalent/current process is included in **[issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

## 9. Clubs

### Q41. What clubs exist, and how do I apply?

**Answer:** Browse [club introductions](https://stu.best/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/). The captured directory includes photography, guitar, rock music, electronic music, K-pop dance, badminton and student associations, among others. Open the relevant introduction and confirm its recruitment details. [Club activity records](https://stu.best/school-affairs/services/40-1) are separate from a public club listing. Where a join action is available, check its receipt/status rather than assuming that viewing a club enrolled you. Club-office contact: **07-6158000 ext. 2118**, **activity@stu.edu.tw**.

### Q42. Which clubs would improve my skills?

**Answer:** It depends on the skill you want to practise. For example, the [directory](https://stu.best/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/) lists Photography Club for visual practice, Guitar/Rock/Electronic Music groups for music interests and student associations for organizing activities. Those are suggestions based on the listed club types, not a guarantee of training quality or academic credit. Tell me your interests, level and available time so we can narrow the options and check their actual activities.

### Q43. Where is the music club, and how do I contact them?

**Answer:** Which one do you mean—**Rock Club (熱門音樂社), Guitar Club (吉他公社), or Electronic Music Club (電子音樂研究社)**? All three appear in the [club directory](https://stu.best/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/). It does not establish one shared “music club” room. Use the selected club's details, or ask the extracurricular activities office at **07-6158000 ext. 2118**, **activity@stu.edu.tw**, for the current room and contact. A confirmed room/contact for each club is part of the missing detail coverage in **[issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

## 10. Admissions & general

### Q44. Do international students need Mandarin to enroll?

**Answer:** It depends on the admission track and teaching language. For the supplied **115-entry English-taught IPIAC prospectus**, the English requirement is **CEFR B1 or equivalent**, with specified exemptions/evidence for English-speaking backgrounds or previous English-medium study. It says English-taught students must reach **TOCFL A2 or higher before graduation**, and not obtaining A2 before semester three affects scholarship eligibility. That is different from saying every international applicant must already have A2 to enroll. Check your exact track through [overseas admissions](https://stu.best/school-sites/reg.aca.stu.edu.tw/overseas_admissions) and the [115-entry IPIAC source draft](https://stu.best/source-documents/ipiac-115/index.html). The draft does not settle earlier cohorts; those rules remain pending in [issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102).

### Q45. When does enrollment start?

**Answer:** Choose your admission track, intake and year first. The supplied IPIAC prospectus gave **11 June 2026** as its document-submission deadline and **7 September 2026** as the class opening date; both are historical, not the next intake's application window. Use [Admissions](https://stu.best/admissions) or [International Admissions](https://stu.best/international) for the applicable announcement. The administrative start of a semester is not necessarily the application-opening or registration date. Current track-specific windows still need source confirmation under **[issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

### Q46. What courses are offered?

**Answer:** Use the [current course list](https://stu.best/school-affairs/services/12-4) for term offerings and the [permanent course catalog](https://stu.best/school-affairs/services/12-2) for descriptions. The [curriculum](https://stu.best/school-affairs/services/12-5) explains how courses fit a department and entry year. A permanent description does not guarantee the subject is running next semester. For your own subjects, use [Course Selection Records](https://stu.best/school-affairs/services/11-1), not the general catalog. For department/program information, the sheet also points to [Academic Units](https://stu.best/%E5%AD%B8%E8%A1%93%E5%96%AE%E4%BD%8D/).

### Q47. What is the school's background?

**Answer:** This is **Shu-Te University (樹德科技大學)** in **Yanchao District, Kaohsiung, Taiwan**, not St. Thomas University. The [About STU page](https://stu.best/%E9%97%9C%E6%96%BC%E6%A8%B9%E5%BE%B7/) says a preparatory office was established in **September 1994**, approval to establish the school and admit students came in **1997**, and it was renamed Shu-Te University on **1 August 2000**. Its motto is **學術、知性、快樂、希望**. The page describes a student-centred, teaching-focused university emphasizing practical application, industry links, humanities and technology. The campus address is **No. 59, Hengshan Road, Yanchao District, Kaohsiung**; use the [university homepage](https://stu.best/) and [campus map](https://stu.best/school-sites/www.oica.stu.edu.tw/en/school-map/) for orientation.

### Q48. Is the school's location safe for students?

**Answer:** I cannot guarantee that any location is completely safe or derive current crime, traffic or emergency conditions from a webpage. For school-specific help, open the [Campus Safety Center](https://stu.best/school-sites/www.ssc.stu.edu.tw/): its captured page covers campus safety, transport, off-campus housing and anti-fraud notices, and lists the **24-hour campus-safety line 07-6158024**. Tell me the route, accommodation and time of day you are concerned about so I can help find relevant guidance. For immediate danger, contact the appropriate emergency service or campus safety instead of relying on a chatbot’s general description.

## 11. Faculty & staff

### Q49. How do I book a classroom for a meeting, and which rooms and times are available?

**Answer:** Check [room availability](https://stu.best/school-affairs/services/47-1) for the date, room and periods, then use [venue booking](https://stu.best/school-affairs/services/44-1) if your account is permitted. The captured service directory specifically says **faculty/staff should apply through the electronic-document system**; the student booking form should not be presented as a replacement for that required staff route. A free slot is not a reservation, and a submitted request may still need approval. I need to use current availability and the authorized workflow before saying a room is booked. The staff submission equivalent is tracked in **[issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**.

### Q50. What training courses can teachers join, and where do I register?

**Answer:** The spreadsheet did **not** identify a verified current teacher-training list or registration destination. Start with [Faculty & Staff](https://stu.best/教職員工/) and the relevant development announcement, then confirm the event, eligibility, date and registration route with the organizing office. Its suggested Human Resources system was not verified to contain training, so it must not be described as a confirmed registration page. The [OICA teacher-exchange training page](https://stu.best/school-sites/www.oica.stu.edu.tw/%E5%B8%AB%E8%B3%87%E5%9F%B9%E8%A8%93/) describes a different organized exchange-training service, not a live internal workshop catalog. Exact internal training/registration coverage remains a [P0 gap](https://github.com/LuxArt0317/std_edu_ai/issues/102).

### Q51. Is there teacher parking, where, what are the rules, and how do I apply?

**Answer:** The [parking procedure](https://stu.best/school-sites/things.stu.edu.tw/%E5%81%9C%E8%BB%8A%E8%AD%89%E7%94%B3%E8%BE%A6%E6%B5%81%E7%A8%8B/) says staff car permits are applied for/renewed annually; staff without a permit number use a unit-organized application endorsed by their supervisor. For **115**, it says staff motorcycle access returns to staff-ID control, with barrier testing at the start of term and assistance if it fails. Open [Parking Permit Applications](https://stu.best/school-affairs/services/46-1) for the linked local workflow and confirm that your account has the staff option. Do not apply student lottery prices to staff permits. General Affairs parking enquiries: **07-6158000 ext. 2242 or 2239**. The procedure describes student South/North-campus parking categories and prices separately. Those student locations and prices are not proof of a particular staff member’s assigned parking space; confirm staff allocation with General Affairs.

### Q52. What are the IPIAC regulations?

**Answer:** The supplied prospectus combines admission eligibility, language standards, fees, scholarships, accommodation and placement obligations. In its 115-entry terms, relevant examples include the first-semester tuition waiver, later performance awards, the A2 condition, campus residence or an approved exception, required placements from semester three, and a student–school–employer agreement for internship activity. See Q06–Q09 and Q44 for the detailed figures. Use the student's entry-year rules and award/placement documents before taking a decision. Read the [115-entry IPIAC source draft](https://stu.best/source-documents/ipiac-115/index.html). Year/cohort conflicts remain in **[P0 issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)**; [OICA](https://stu.best/school-sites/www.oica.stu.edu.tw/%E8%81%AF%E7%B5%A1%E8%B3%87%E8%A8%8A/) is the appropriate clarification contact.

## 12. Communication

### Q53. Can the website provide a way to communicate with students?

**Answer:** The spreadsheet identifies a **Service Quality Mailbox (服務品質信箱)** under **Popular Links → Students** and the footer’s **電子郵件** link. That is a school-contact/feedback channel, not proof of direct messaging to other students or permission to reveal student email lists. Its Google Sites destination has no verified exact local equivalent yet ([P0 issue #102](https://github.com/LuxArt0317/std_edu_ai/issues/102)). For current local communication, use [School Affairs notifications](https://stu.best/school-affairs/notifications) and [the school contact directory](https://stu.best/%E5%88%86%E6%A9%9F%E8%A1%A8/). Ask which recipient or purpose you mean. A draft message is not a sent message; sending needs the available authorized channel and any required confirmation.

## Maintainer notes

### Spreadsheet directory and source audit

The original spreadsheet is a source/navigation inventory, not a verified personal-data dump. Original external URLs below are provenance only; they are not links to invent or redirect to when a local equivalent is unavailable. The local runtime/API and source-manifest review identified these controlled equivalents:

| Row | Spreadsheet directory / source status | Local equivalent / limitation |
| --- | --- | --- |
| Q01 | Main page > Current Students (在校學生) > Registration & Payment (註冊及繳費) > Tuition Standards (學雜費標準)   /   or Main page > Popular Links (熱門連結) > Students > Tuition Info (學雜費資訊) | `/school-sites/www.acc.stu.edu.tw/%E5%AD%B8%E8%B2%BB%E8%A8%88%E7%AE%97/%E5%AD%B8%E9%9B%9C%E8%B2%BB%E5%B0%88%E5%8D%80/` |
| Q02 | Main page > Current Students > Registration & Payment > Registration Payment Info (註冊繳費專區資訊)   /   or Main page > Popular Links > Students > Registration Payment Area (註冊繳費專區) | `/school-sites/cash.stu.edu.tw/%E6%9C%8D%E5%8B%99%E9%A0%85%E7%9B%AE/` |
| Q03 | Main page > Current Students > School Affairs Information System > System Job Notifications | `/school-affairs` |
| Q04 | Main page > Current Students > Scholarships & Aid (獎助學金資源) > MOE Tuition Reduction (教育部學雜費減免) / Tuition Gap Reduction Plan (行政院減免學雜費拉近方案) / Aid for Disadvantaged Students (弱勢助學) | `/school-sites/life.sao.stu.edu.tw/%E6%95%99%E8%82%B2%E9%83%A8%E5%AD%B8%E9%9B%9C%E8%B2%BB%E6%B8%9B%E5%85%8D/; /school-sites/life.sao.stu.edu.tw/%E8%A1%8C%E6%94%BF%E9%99%A2%E6%B8%9B%E5%85%8D%E5%AD%B8%E9%9B%9C%E8%B2%BB%E6%8B%89%E8%BF%91%E6%96%B9%E6%A1%88/; /school-sites/life.sao.stu.edu.tw/%E5%BC%B1%E5%8B%A2%E5%8A%A9%E5%AD%B8/` |
| Q05 | Main page > Academic Affairs > Request Input Program > International Student > Application for Scholarships and Grants for International Students | `No exact source equivalent established` |
| Q06 | No directory path found | `/source-documents/ipiac-115/index.html (115-entry draft only)` |
| Q07 | No directory path found | `/source-documents/ipiac-115/index.html (115-entry draft only)` |
| Q08 | Main page > Current Students > Scholarships & Aid > Scholarship Info (獎助學金資訊)   /   or Main page > Popular Links > Students > Higher Education Scholarship (高教勵學金) | `/school-sites/life.sao.stu.edu.tw/%E7%8D%8E%E5%8A%A9%E5%AD%B8%E9%87%91/; /school-sites/www.sao.stu.edu.tw/%E9%AB%98%E6%95%99%E5%8B%B5%E5%AD%B8%E9%87%91-2/` |
| Q09 | No directory path found | `/source-documents/ipiac-115/index.html` |
| Q10 | Main page > Current Students > School Affairs Information System > Academic Affairs > Student Course Selection > Score > Grade Inquiry | `/school-affairs/services/13-1; /dtm/login` |
| Q11 | Main page > Current Students > School Affairs Information System > Student Affairs > Student Leave > Leave Application Form > New Fake Orders | `/school-affairs/services/leave; /school-affairs/services/leave/history` |
| Q12 | Main page > Current Students > School Affairs Information System > Student Affairs > Student Leave | `/school-affairs/services/leave/history` |
| Q13 | Main page > Current Students > School Affairs Information System > Academic Affairs > Student Course Selection > My Course Schedule > Query | `/school-affairs/services/11-2` |
| Q14 | Not provided | `No exact source equivalent established` |
| Q15 | Main page > Current Students > Graduation Info (畢業資訊) > Bachelor Graduation Check (學士班畢業檢核) | `/school-sites/www.aca.stu.edu.tw/2025/09/07/%E8%AB%8B%E5%90%8C%E5%AD%B8%E4%B8%8A%E7%B6%B2%E6%9F%A5%E7%9C%8B%E7%95%A2%E6%A5%AD%E5%AD%B8%E5%88%86%E6%AA%A2%E6%A0%B8%E8%A1%A8/` |
| Q16 | Main page > Current Students > Course Learning > Curriculum Map (課程地圖) / Required Courses (必修科目查詢) | `/school-affairs/services/12-7` |
| Q17 | Main page > Current Students > Course Learning > Current-Semester Course Search (當學期課程查詢) / Past Course Search (歷年課程查詢) | `/school-affairs/services/12-4 (offering search); /school-affairs/services/11-1 (personal enrollment)` |
| Q18 | Main page > Current Students > Graduation Info > Bachelor Graduation Check   /   Early Graduation (學士班成績優異提前畢業) | `/school-sites/www.aca.stu.edu.tw/%E6%8F%90%E5%89%8D%E7%95%A2%E6%A5%AD-graduate-in-advance/` |
| Q19 | Main page > Current Students > Graduation Info > Commencement (畢業典禮)   /   or Course Learning > Academic Calendar (行事曆(學生)) | `/school-sites/activity.sao.stu.edu.tw/%E6%A8%B9%E5%BE%B7%E7%A7%91%E6%8A%80%E5%A4%A7%E5%AD%B8%E7%95%A2%E6%A5%AD%E5%85%B8%E7%A6%AE%E5%AE%98%E7%B6%B2/` |
| Q20 | No directory path found | `/school-sites/life.sao.stu.edu.tw/%E8%AB%8B%E5%81%87%E6%B5%81%E7%A8%8B%E8%AA%AA%E6%98%8E/` |
| Q21 | Main page > Current Students > Information Systems (資訊系統) > Moodle (Moodle數位教材網) | `/dtm/login; TronClass exact equivalent pending` |
| Q22 | Main page > Current Students > Information Systems > Moodle → log in → course page | `/dtm/assignments` |
| Q23 | Main page > Current Students > Information Systems > Moodle → course → assignment → Add submission | `/dtm` |
| Q24 | Main page > Current Students > Course Learning > Academic Calendar (行事曆(學生))   /   plus My Course Schedule (row 13) | `/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/` |
| Q25 | Main page > Current Students > Academic Resources (學術資源) > Library Catalog (圖書館館藏目錄) / E-resource Databases (電子資源資料庫) | `/school-sites/webpac.stu.edu.tw/webopac/; /school-sites/stars.stu.edu.tw/stuhyint/index.jsp` |
| Q26 | Main page > Latest News (最新消息) > Campus News (校園新聞) > more | `/latestnews` |
| Q27 | Main page > Current Students > Course Learning > Learning Portfolio System (歷程檔案系統) | `Learning Portfolio exact equivalent unverified; related graduation/club/service records are not the portfolio` |
| Q28 | Main page > Current Students > Course Learning > Academic Calendar (行事曆(學生)) | `/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/` |
| Q29 | Main page > Current Students > Course Learning > Academic Calendar (行事曆(學生)) | `/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/` |
| Q30 | Main page > Current Students > Registration & Payment > Dormitory Fee Standards (住宿收費標準)   /   Campus Life > Dormitory Application (宿舍申請) | `/school-sites/omh.sao.stu.edu.tw/%E6%88%BF%E5%9E%8B-%E5%83%B9%E7%9B%AE%E4%B8%80%E8%A6%BD/; /school-sites/omh.sao.stu.edu.tw/%E7%94%B3%E8%AB%8B-%E6%9B%B4%E6%8F%9B-%E9%80%80%E5%AE%BF/` |
| Q31 | Main page > Current Students > Campus Life > Dormitory Application (宿舍申請) | `/school-sites/omh.sao.stu.edu.tw/%E7%94%B3%E8%AB%8B-%E6%9B%B4%E6%8F%9B-%E9%80%80%E5%AE%BF/` |
| Q32 | Main page > Current Students > Campus Life > Online Repair (線上報修) | `/school-affairs/services/45-1` |
| Q33 | Main page > Current Students > Information Systems > Dorm Network Management (宿網管理系統)   /   Dorm Network Repair (宿網報修) | `Dorm registration exact equivalent missing; public repair guide exists` |
| Q34 | Main page > Administrative Units (行政單位) / Academic Units (學術單位)   /   Current Students > Campus Life > Campus Friendly Map (校園友善地圖) | `/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/` |
| Q35 | Main page > Current Students > Campus Life > Campus Friendly Map (校園友善地圖) | `Related English map /school-sites/www.oica.stu.edu.tw/en/school-map/; original tracked Chinese URL exact match absent` |
| Q36 | Main page > Current Students > Campus Life > Phone Extensions (全校分機表)   /   footer > 電話聯絡 | `/%E5%88%86%E6%A9%9F%E8%A1%A8/` |
| Q37 | No directory path found | `No exact source equivalent established` |
| Q38 | No directory path found | `No exact source equivalent established` |
| Q39 | Main page > Current Students > Information Systems > Wireless Network (無線網路) | `/school-sites/help.ecc.stu.edu.tw/wireless-setting/` |
| Q40 | Main page > Current Students > Course Learning > Grade Inquiry | `/school-sites/www.aca.stu.edu.tw/2024/02/01/%E5%AD%B8%E6%9C%9F%E6%88%90%E7%B8%BE%E9%96%8B%E6%94%BE%E6%9F%A5%E8%A9%A2%E5%8F%8A%E7%94%B3%E8%AB%8B%E5%88%97%E5%8D%B0/` |
| Q41 | Main page > Current Students > Campus Life > Club Introduction (社團介紹) | `/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/` |
| Q42 | Main page > Current Students > Campus Life > Club Introduction (社團介紹) | `/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/` |
| Q43 | Main page > Current Students > Campus Life > Club Introduction (社團介紹) | `/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/` |
| Q44 | Main page > Admissions Zone (招生專區) > Overseas Admissions (境外招生) | `/school-sites/reg.aca.stu.edu.tw/overseas_admissions` |
| Q45 | Main page > Admissions (招生訊息)   /   or Admissions Zone (招生專區) | `/admissions` |
| Q46 | Main page > Academic Units (學術單位)   /   Current Students > Course Learning > Course Search (課程查詢系統) | `/%E5%AD%B8%E8%A1%93%E5%96%AE%E4%BD%8D/` |
| Q47 | Main page > About STU (關於樹德) | `/%E9%97%9C%E6%96%BC%E6%A8%B9%E5%BE%B7/` |
| Q48 | Main page > Current Students > Campus Life > Campus Safety (校園安全) | `/school-sites/www.ssc.stu.edu.tw/` |
| Q49 | Main page > Faculty & Staff (教職員工) > Meeting Room System (會議室系統)   /   Current Students > Campus Life > Venue Booking (場地借用) | `/school-affairs/services/47-1 and /school-affairs/services/44-1 are local related workflows; staff meeting system exact equivalent not established` |
| Q50 | No directory path found | `Human Resources training destination unverified` |
| Q51 | Main page > Current Students > Campus Life > Parking Permit (停車證申辦) | `/school-sites/things.stu.edu.tw/%E5%81%9C%E8%BB%8A%E8%AD%89%E7%94%B3%E8%BE%A6%E6%B5%81%E7%A8%8B/` |
| Q52 | No directory path found | `/source-documents/ipiac-115/index.html (115-entry draft only)` |
| Q53 | Main page > Popular Links > Students > Service Quality Mailbox (服務品質信箱) | `Service Quality Mailbox exact local equivalent missing; local notifications/contact directory are related channels` |

### Confirmed gaps and source conflicts

- Exact payment-method instructions returned HTTP 403; the local payment/printing pages are related sources, not proof that the blocked page was copied.
- The spreadsheet’s exact graduation-credit notice is represented by an Access Denied capture. A registered URL is not a readable policy. Native graduation records and cohort rules remain separate.
- Older IPIAC entry-year rules remain absent. The 115 draft mixes year labels and contains cost subtotals that retain pre-waiver tuition; do not reuse those totals as a student’s final bill. Its insurance/accommodation estimates also differ from Accounting’s fee table.
- Dorm registration, Learning Portfolio, TronClass, staff meeting/HR training, the Service Quality Mailbox and current third-party payment/submission integrations are not established merely by having a related page. Keep these as exact-source/service gaps under #102 until verified.
- The dorm application/checkout page now provides verified steps and deposit caveats; these supersede the earlier statement that no exact public checkout instructions were available. The assigned residence, current dates and IPIAC accommodation conditions still control an individual request.
- Reference revisions reflect the new spreadsheet and source checks, not an attempt to inflate scores. Do not silently lower the evaluator rubric or replace personal-record requirements with generic links. Re-evaluate against the new case versions; historic scores remain attached to the old ones.
