import {assistantLanguage} from '../src/services/assistantLanguage.js';
import {campusHelpGuide} from './campusHelpGuides.js';
import {findOfficialLibraryServiceLeads} from './publicLibrarySources.js';
import {questionKind} from './schoolWebSearch.js';
import {clearancePaths,clearanceQuestion} from './graduationClearanceContract.js';
import {teachingFeedbackPaths} from './teachingFeedbackContract.js';
import {earlyGraduationPath} from './earlyGraduationContract.js';
import {courseSubstitutionPath} from '../src/features/public/affairs/courseSubstitution.js';
import {firstSelectionPath,firstSelectionSource} from '../src/features/public/affairs/firstSelection.js';
import {adjustmentPaths} from './courseAdjustmentContract.js';
import {programRegistrationPath} from './programRegistrationContract.js';
import {curriculumMapPath} from '../src/features/public/affairs/curriculumMaps.js';
import {curriculumPlansPath} from '../src/features/public/affairs/curriculumPlans.js';
import {schoolServiceNoticeForRoute} from '../src/features/public/affairs/noticePages.js';
import {
  interdisciplinaryProgramsPath, internshipPath, leavePath, officialInternshipUrl, officialLeaveUrl, officialRegistrarUrl, officialWifiUrl,
  schoolMenuPrograms, schoolServiceEntries, studentServiceByKey, teachingAssistantPath, tutorEvaluationPath, wifiGuidePath,
} from '../src/features/public/affairs/studentServices.js';

import {parkingInstructionsPath,parkingPermitPath} from '../src/features/public/affairs/parkingPermits.js';
import {serviceLeadershipPath,serviceLeadershipViews} from '../src/features/public/affairs/serviceLeadership.js';
import {studentAidNavigation} from './studentAidRecords.js';
import {creditLoadHistoryNavigation} from './creditLoadHistory.js';
import {courseSelectionNavigation} from './courseSelection.js';
import {academicGradesNavigation,academicGradesPaths} from './academicGrades.js';
import {graduationReviewNavigation,graduationReviewPaths} from './graduationReview.js';
import {academicAttendanceNavigation,academicAttendancePaths} from './academicAttendance.js';

const groups = { personal:'電算中心', sysmenu:'選單資訊', sysDoc:'選單資訊', aca:'教務系統', sao:'學務資訊', swd:'總務資訊', rdd:'研發系統', infoSystem:'資訊系統' };
const menuLabels = {'menu/common':'常用選單', 'menu/external':'外部選單', 'menu/help':'系統說明選單',
  'menu/course':'選課選單', 'menu/graduation':'畢業離校選單', 'infoSystem/library':'圖書資訊系統'};
const customMenuUrl = '/school-affairs/menu/menu/custom';
const aliases = [
  [/repair|maintenance|fix (?:a |the )?(?:room|facility)|報修/i, '報修'],
  [/parking|car permit|停車/i, '停車證'],
  [/venue|room booking|borrow (?:a )?(?:room|space)|場地/i, '場地借用'],
  [/my (?:current )?(?:subjects?|courses?|classes|timetable|schedule)|我的(?:課程|科目|功課表|課表)/i, '我的功課表'],
  [/course selection|select (?:a )?course|enroll in (?:a )?course|選課/i, '選課'],
  [/grade|成績/i, '成績查詢'],
  [/absence|attendance|缺曠/i, '缺曠課紀錄查詢'],
  [/leave application|請假/i, '請假填單'],
  [/internship|校外實習/i, '校外實習'],
  [/student loans?|就學貸款/i, '就學貸款申請'],
  [/dormitory|accommodation|住宿|宿舍/i, '學生宿舍'],
  [/financial aid|scholarships?|助學/i, '經費申請'],
  [/counsel(?:ing|ling)|諮商/i, '學生諮商預約'],
  [/student insurance|團體保險/i, '學生團體保險查詢'],
  [/calendar|行事曆/i, '行事曆'],
];
const groupAliases = [
  [/general affairs|facilities|總務/i,'swd'],
  [/academic affairs|教務/i,'aca'],
  [/student affairs|學務/i,'sao'],
  [/research(?: and development)?|研發/i,'rdd'],
  [/information systems?|資訊系統/i,'infoSystem'],
  [/computer center|電算中心/i,'personal'],
];
export const directoryEntries = schoolServiceEntries;

const nativeAcademicNavigation=[
  {...graduationReviewNavigation,id:'legacy-graduation-review',serviceId:'15-2',match:/\blegacy\b.{0,35}\b(?:graduation|degree audit)\b|\bgraduation\b.{0,35}\blegacy\b|\b15-2\b|舊版畢業|舊式畢業/i,
    title:['舊版畢業檢核表','Legacy graduation review'],officialUrl:'https://info.stu.edu.tw/aca/grdcheckreport/index.asp',localUrl:graduationReviewPaths.legacy,
    description:['開啟您的站內舊版畢業檢核參考報告；此報告與新版檢核分開維護。','Open your local legacy graduation-reference report. It is maintained separately from the modern review.']},
  {...graduationReviewNavigation,serviceId:'15-1'},
  ...[
    ['transcript',/\b(?:transcripts?|grade history|historical grades?|past grades?|all grades?)\b|歷年成績|成績紀錄|成績記錄/i,'歷年成績','Academic transcript'],
    ['warning',/\bwarning grades?\b|預警成績/i,'預警成績','Warning grades'],
    ['ranking',/\b(?:rankings?|class standing)\b|學期排名|系排名|班排名|名次/i,'學期排名','Semester rankings'],
    ['current',/\bcurrent(?:[ -]term)? grades?\b|\bthis (?:term|semester)(?:’s|'s)? grades?\b|當學期成績|本學期成績|當期成績/i,'當期成績','Current-term grade query'],
    ['transfer',/\btransfer(?:red)?[ -]credits?\b|抵免學分|抵免成績/i,'抵免成績查詢','Transfer-credit query'],
    ['cycle',/\bcycle grades?\b|循環成績/i,'循環成績查詢','Cycle-grade query'],
  ].map(([view,match,zh,en])=>({...academicGradesNavigation,id:'academic-grades-'+view,serviceId:'13-1',match,title:[zh,en],localUrl:academicGradesPaths[view],
    description:[`開啟站內${zh}頁面。各查詢分開顯示，不代表已匯入校方紀錄。`,`Open the local ${en.toLowerCase()} page. Each query has its own scope; university records are not imported.`]})),
  {...academicGradesNavigation,serviceId:'13-1'},
  {...academicAttendanceNavigation,id:'academic-attendance-detail',serviceId:'14-1',match:/\b(?:absence|attendance|roll[ -]?call) (?:details?|dates?|records?)\b|缺曠課明細|缺曠明細|缺課明細|曠課明細/i,
    title:['缺曠課明細','Absence details'],localUrl:academicAttendancePaths.detail,
    description:['開啟您的站內缺曠課明細；課程日期與點名時間分開保留。','Open your local absence details, with course dates and roll-call timestamps kept separately.']},
  {...academicAttendanceNavigation,serviceId:'14-1'},
];
const localRecordIds=new Set([...courseSelectionNavigation,...nativeAcademicNavigation].map(entry=>entry.id));
const leadershipMatches = [
  /服務(?:實作)?單位預選|service (?:unit|placement) (?:preselection|pre-selection)/i,
  /服務實作單位確認|service (?:unit|placement) confirmation/i,
  /服務講堂課程|service leadership lectures?/i,
  /服務領導.{0,16}(?:作業|成績|反思)|service leadership.{0,22}(?:assignments?|reflection|grades?)/i,
];
const localServiceNavigation = [
  {
    id:'course-add-drop',match:/\badd\s*[/–-]\s*drop\b|加退選/iu,
    title:['加退選','Course add/drop'],localUrl:adjustmentPaths.add_drop,
    description:['登入後查詢本學期的站內加退選資格。','Sign in to check your saved add/drop eligibility for this term.'],
  },
  {
    id:'course-late-add',match:/\blate[ -]add\b|補加選/iu,
    title:['補加選','Late add'],localUrl:adjustmentPaths.late_add,
    description:['開啟補加選規則與站內資格查詢。','Open the late-add rules and eligibility lookup.'],
  },
  {
    id:'early-graduation',match:/\b(?:early[ -]graduation|graduate early)\b|提前畢業/iu,
    title:['提前畢業申請','Early graduation application'],localUrl:earlyGraduationPath,
    description:['查詢申請期間與個人提前畢業紀錄。','Open the application window and your saved early graduation history.'],
  },
  {
    id:'credit-transfer',match:/\b(?:credit[ -]transfer|transfer credits?)\b|抵免學分/iu,
    title:['抵免學分申請','Credit transfer application'],localUrl:'/school-affairs/services/7-2',
    description:['填寫站內抵免申請及查詢審查紀錄。','Open the credit transfer form and saved application history.'],
  },
  {
    id:'course-withdrawal',match:/\bcourse withdrawals?\b|\bwithdraw\b.{0,30}\b(?:course|class)\b|棄選/iu,
    title:['棄選','Course withdrawal'],localUrl:'/school-affairs/services/6-4',
    description:['查詢站內棄選期間、課程與棄選紀錄。','Open the withdrawal window and your saved withdrawal-phase courses.'],
  },
  {
    id:'first-selection',match:/\b(?:initial|first)[ -]+(?:course[ -]+)?(?:selection|registration)\b|初選/iu,
    title:['初選時程及注意事項','Initial course selection notice'],localUrl:firstSelectionPath,officialUrl:firstSelectionSource,
    description:['開啟初選時程、注意事項與收費說明。','Open the first-selection schedule, instructions and fee notice.'],
  },
  {
    id:'course-substitution',match:/\b(?:course substitutions?|course replacements?|replacement courses?)\b|替代科目/i,
    title:['替代科目查詢','Course substitution search'],localUrl:courseSubstitutionPath,
    description:['依屆別、學制與開課單位查詢已公布的替代科目。','Search published replacement courses by cohort, study track and department.'],
  },
  {
    id:'interdisciplinary-registration',match:/\b(?:interdisciplinary|interdepartmental)(?: credit)? program registration\b|跨院系學分學程登記/i,
    title:['跨院系學分學程登記系統','Interdisciplinary program registration'],localUrl:programRegistrationPath,
    description:['登入後查看與管理您的站內學程登記。','Sign in to view and manage your stu.best program registrations.'],
  },
  {
    id:'interdisciplinary-programs',match:/\b(?:interdisciplinary|interdepartmental|intramural) (?:credit )?programs?\b|跨院系學分學程|學分學程查詢/i,
    title:['跨院系學分學程查詢','Interdisciplinary credit programs'],localUrl:interdisciplinaryProgramsPath,
    description:['在跨院系學分學程查詢中查看開設單位、成立年度、學分及已公布的文件。','Browse the interdisciplinary program directory for participating departments, founding years, credit requirements, and published documents.'],
  },
  {
    id:'curriculum-map',match:/\b(?:curriculum|course) maps?\b|課程地圖/i,
    title:['課程地圖','Curriculum maps'],localUrl:curriculumMapPath,
    description:['依學院與系所瀏覽課程地圖，並選擇學年與學程查詢課程。','Browse curriculum maps by college and department. Choose an academic year and track to view courses.'],
  },
  {
    id:'historical-curriculum',match:/\b(?:historical curriculum|curriculum plans?|program plans?)\b|歷年課程規劃|課程規劃表/i,
    title:['歷年課程規劃查詢','Historical curriculum plans'],localUrl:curriculumPlansPath,
    description:['依學制、系所與入學學年度查閱課程規劃表。','Browse published curriculum plans by program type, department and academic year.'],
  },
  {
    id:'parking-instructions',match:/(?:parking|vehicle|car|motorcycle) permits?.{0,25}(?:guide|instructions?|rules)|(?:guide|instructions?|rules).{0,25}(?:parking|vehicle|car|motorcycle) permits?|(?:停車證|車輛通行證|汽機車證|車證).{0,12}(?:須知|需知|規定)/i,
    title:['車證申請須知','Parking permit instructions'],localUrl:parkingInstructionsPath,
    description:['在車證申請須知查看校方的申請流程與各停車場規定。','Open the parking permit instructions for the university’s application process and parking rules.'],
  },
  {
    id:'parking-permit',match:/\b(?:parking|vehicle|car|motorcycle) permits?\b|停車證|汽機車證|車輛通行證|車證申請/i,
    title:['汽機車證申請','Parking permit application'],localUrl:parkingPermitPath,
    description:['在總務資訊開啟汽機車證申請。正式申請需在校方系統完成認證。','Open Parking Permit Application under General Affairs. Complete the university’s sign-in to apply.'],
  },
  ...serviceLeadershipViews.map((view,index)=>({
    id:'service-leadership-'+view.key,match:leadershipMatches[index],title:[view.heading,view.englishLabel],
    localUrl:serviceLeadershipPath+'/'+view.key,description:['開啟'+view.heading+'。',view.english],
  })),
  {id:'service-leadership',match:/服務領導教育|\bservice leadership\b/i,
    title:['服務領導教育系統','Service Leadership Education'],localUrl:serviceLeadershipPath,
    description:['開啟服務領導教育系統，可查看服務單位、服務講堂及作業的入口。','Open Service Leadership Education for the placement, lecture and assignment destinations.']},

  {
    id:'ta-report', match:/\b(?:teaching assistant|TA)\b.{0,32}\b(?:report|learning log)\b|教學助理報告|撰寫[/／]維護學習單|教學助理.*學習單/i,
    title:['教學助理學習單','Teaching assistant learning report'],localUrl:teachingAssistantPath+'/report',
    description:['從教學助理系統的「學生」選單開啟學習單。','Open the learning report from the Student menu in the Teaching Assistant system.'],
  },
  {
    id:'ta-evaluation',match:/\b(?:teaching assistant|TA)\b.{0,32}\bself[- ]?evaluation\b|教學助理自我評表/i,
    title:['教學助理自我評表','Teaching assistant self-evaluation'],localUrl:teachingAssistantPath+'/evaluation',
    description:['從教學助理系統的「學生」選單開啟自我評表。','Open self-evaluation from the Student menu in the Teaching Assistant system.'],
  },
  {
    id:'graduation-clearance-status',match:{test:question=>clearanceQuestion(question)==='status'},
    title:['離校申請狀態查詢','Graduation clearance status'],localUrl:clearancePaths.status,
    description:['開啟離校申請與各單位審核紀錄。','Open your submitted clearance applications and office decisions.'],
  },
  {
    id:'graduation-clearance',match:{test:question=>clearanceQuestion(question)==='apply'},
    title:['畢業離校申請','Graduation clearance application'],localUrl:clearancePaths.apply,
    description:['開啟站內畢業離校申請。','Open the graduation clearance application and assigned periods.'],
  },
  {
    id:'teaching-survey',match:/\b(?:teaching|course) (?:evaluation|survey)s?\b|教學(?:成效|意見|評量)問卷/iu,
    title:['教學意見問卷調查','Teaching evaluation'],localUrl:teachingFeedbackPaths.survey,
    description:['開啟期中、期末問卷與填答紀錄。','Open the midterm and final teaching evaluations and your completion status.'],
  },
  {
    id:'teaching-feedback',match:/\b(?:(?:immediate|real[- ]time) teaching feedback|teaching feedback|course feedback)\b|即時反應教學意見|教學意見反應/iu,
    title:['即時反應教學意見','Immediate teaching feedback'],localUrl:teachingFeedbackPaths.immediate,
    description:['開啟本學期課程的教學意見表與紀錄。','Open immediate feedback for your current courses and your saved history.'],
  },
  {
    id:'tutor-evaluation',match:/\b(?:tutor|advis[eo]r) (?:evaluation|survey|questionnaire)\b|導師評量|導師問卷/i,
    title:['導師評量問卷','Tutor evaluation questionnaire'],localUrl:tutorEvaluationPath,
    description:['登入後可填寫十題評量與選填意見。問卷儲存在您的 stu.best 帳戶。','After signing in, you can rate ten questions and add an optional comment. The response is saved in your stu.best account.'],
  },
];
const navigation = [
  ...localServiceNavigation,
  ...courseSelectionNavigation,
  ...nativeAcademicNavigation,
  studentAidNavigation,
  creditLoadHistoryNavigation,
  {id:'course-catalog',match:/\bcourse (?:catalog(?:ue)?|offerings?|search)\b|\bcourses?(?:\s+are)?\s+(?:offered|available)\b|\b(?:offered|available)\s+courses?\b|當期課程查詢|開課(?:查詢|清單|資料)|(?:有|開設)哪些課程/i,title:['當期課程查詢','Course search'],officialUrl:'https://info.stu.edu.tw/ACA/student/QueryAGECourse/index.asp',localUrl:'/school-affairs/services/12-4',description:['在 stu.best 依學期、科系、教師與上課時段查詢站內範例開課資料；開課目錄獨立於您已選的課程。','Search local sample course offerings on stu.best by term, department, instructor and meeting time. The offering catalog is separate from your enrolled courses.']},
  {
    id:'wifi', match:/\b(?:wi[ -]?fi|eduroam|wireless (?:network|internet))\b|無線網路/i,
    title:['校園無線網路設定','Campus Wi-Fi setup'], officialUrl:officialWifiUrl, localUrl:wifiGuidePath,
    description:['電算中心的設定教學提供校園無線網路的連線方式。','Use the Computing Center’s wireless setup guide to connect to campus Wi-Fi.'],
  },
  {
    id:'registrar', match:/\b(?:registrar|registration (?:office|and curriculum division))\b|註冊課務組|註冊組/i,
    title:['註冊課務組','Registration and Curriculum Division'], officialUrl:officialRegistrarUrl,
    description:['教務處註冊課務組提供註冊與課務服務。聯絡方式請見校方頁面。','The Academic Affairs Registration and Curriculum Division handles registration and course records. Its official page lists contact information.'],
  },
  {
    id:'leave', match:/\b(?:file (?:for )?(?:student )?leave|apply for (?:student )?leave|(?:leave|absence) (?:form|application|request)|student leave|leave)\b|請假|假單/i,
    title:['學生請假填單','Student leave form'], officialUrl:officialLeaveUrl, localUrl:leavePath,
    description:['正式請假請從校方請假系統送出。您也可以先在 stu.best 儲存私人草稿。','Open the student leave form to prepare a private request on stu.best, and check saved requests in leave history. Saving a draft does not mean it has been submitted or approved.'],
  },
  {
    id:'internship', match:/\binternship\b|校外實習|實習系統/i,
    title:['校外實習系統','Off-campus internship system'], officialUrl:officialInternshipUrl, localUrl:internshipPath,
    description:['校方實習系統提供契約、自我評量和企業資料。stu.best 提供私人追蹤紀錄。','The university’s internship service handles contracts, self-assessments and company records. Use stu.best to track your own internship work.'],
  },
];
const registrarFaq = 'https://www.aca.stu.edu.tw/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C%EF%BD%9Cqa/';

function isRecordPageNavigation(question) {
  // A class location/time question needs private records, even when it mentions
  // the timetable. Only explicit page-opening requests belong in this directory.
  return /\b(?:open|navigate to|take me to|(?:link|url|website)(?:\s+(?:to|for))?|where (?:can|do) i (?:find|open|access|view)|how (?:can|do) i (?:find|open|access|view))\b/i.test(question)
    || /\bwhere (?:is|are) (?:the |my |our )?(?:weekly )?(?:timetables?|(?:class|course) schedule|course[ -]selection(?: history)?|selection history|registration history|(?:academic |warning |current(?:[ -]term)? )?grades?|transcripts?|(?:semester |class |department )?rankings?|(?:legacy )?(?:degree audit|graduation(?: (?:review|report|audit|check))?)|(?:academic )?attendance(?: (?:statistics|details|records))?|absence (?:statistics|details|records)|transfer credits?|cycle grades?)\b/i.test(question)
    || /(?:開啟|打開|前往|連結|網址)|(?:哪裡|哪裏|何處).{0,6}(?:查看|查詢|開啟)|(?:課表|功課表|選課(?:紀錄|記錄|歷史)?|(?:歷年|預警|當期)?成績|(?:學期|系|班)?排名|(?:舊版)?畢業(?:學分)?(?:審核|檢核|資格|條件|要求|狀態)?(?:表|報告)?|缺曠課?(?:明細|統計|紀錄|記錄)?)(?:查詢)?(?:的?(?:頁面|功能|連結|網址))?\s*(?:在哪|在哪裡|在哪裏)/.test(question);
}

export function answerCampusNavigation(question) {
  const help=campusHelpGuide(question);
  if(help)return help;
  if (/\b(?:password\s*[:=]|access_token|refresh_token|sesskey)\b|密碼[：:]/i.test(question)) return null;
  const navigational = /\b(?:where|how (?:can|do|to)|link|url|website|contact|phone|help (?:me )?find)\b|哪裡|哪裏|在哪|怎麼|如何|連結|電話|聯絡/i.test(question);
  const privateStatus = /\b(?:status|approved|rejected|pending|my (?:leave|internship) (?:record|history|draft))\b|請假紀錄|審核|核准|我的實習紀錄/i.test(question);
  const nativeAcademicPage=nativeAcademicNavigation.some(entry=>entry.match.test(question))&&isRecordPageNavigation(question);
  if (privateStatus&&!nativeAcademicPage) return null;
  const ownEnrollment = /\b(?:my|our)\b.{0,35}\b(?:enrollments?|enrolled|selected|registered|completed|withdrawn|timetable)\b|\b(?:i am|i'm|we are|i have|i've|we have|am i|are we)\b.{0,35}\b(?:enrolled|taking|registered|completed|selected)\b|我.{0,12}(?:已選|已修|選修紀錄|選課紀錄|修過|正在修|課表)/i.test(question);
  const entry = navigation.find(item => item.match.test(question) && (item.id!=='course-catalog' || !ownEnrollment) && (!nativeAcademicNavigation.includes(item)||!/\b(?:dtm|moodle|elearning|e-learning)\b|數位教材|教材網/i.test(question)) && (localRecordIds.has(item.id) ? isRecordPageNavigation(question) : (navigational ||
    item.id==='course-catalog' && !ownEnrollment ||
    item.id==='wifi' && /\b(?:connect|setup|settings?)\b|連線|設定/i.test(question))));
  if (!entry) return null;
  const zh = (assistantLanguage(question)==='zh-Hant'), i = zh ? 0 : 1;
  const wantsRegistrarContact = entry.id==='registrar' && /\b(?:contact|phone|telephone|email|e-mail|call|number|address|hours)\b|電話|聯絡|分機|地址|時間|信箱/i.test(question);
  const description = wantsRegistrarContact
    ? (zh?'註冊課務組在行政大樓 1 樓。電話 07-615-8000，分機 2007、2009、2010、2012、2014、2016。電子郵件 course@stu.edu.tw。'
      :'The Registration and Curriculum Division is on the first floor of the Administration Building. Call +886 7 615 8000, ext. 2007, 2009, 2010, 2012, 2014 or 2016, or email course@stu.edu.tw.')
    : entry.description[i];
  const source = wantsRegistrarContact ? registrarFaq : entry.localUrl || entry.officialUrl;
  const localDestination=source===entry.localUrl;
  const links = [markdownLink(localDestination ? (zh ? '在 stu.best 開啟' : 'Open on stu.best') : (zh ? '校方網站' : 'Official university page'),source)];
  if (wantsRegistrarContact && entry.localUrl) links.push(markdownLink(zh ? '在 stu.best 開啟' : 'Open on stu.best',entry.localUrl));
  return {
    status:'answered',answer:description + '\n\n' + links.join(' · '),
    citations:[{chunkId:'campus-navigation:'+entry.id,claim:description,title:entry.title[i],
      sourceName:localDestination ? 'stu.best School Affairs' : 'Shu-Te University',url:source,locator:entry.localUrl ?? null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
    activity:[{kind:'directory',label:'Checked the campus service directory',detail:entry.title[i],status:'complete'}],
  };
}

// Join precisely supported public companions. A loose directory keyword is
// insufficient to declare that a separate lookup has already been answered.
export function campusDirectoryResearch(question) {
  const kind = questionKind(question);
  if (kind.personal || kind.irrelevant || /@|\b(?:s[0-9]{6,}|(?:account|student) (?:id|number)|passport|password|authorization|submit|cancel)\b|學號|護照|密碼|送出|取消/iu.test(question)) return null;
  const clauses = question.split(/(?:[?？]+\s*(?:(?:and|also)\s+|另外|還有)?|[,，]\s*(?:and |also |另外|還有|以及|同時)|\s+(?:and|also)\s+(?=(?:what|where|how|when|is|does|can)\b))/iu)
    .map(part => part.trim()).filter(Boolean);
  if (clauses.length !== 2) return null;
  const index = clauses.findIndex(part => findOfficialLibraryServiceLeads(part).length > 0);
  if (index < 0 || findOfficialLibraryServiceLeads(clauses[1 - index]).length > 0) return null;
  const directoryClause = clauses[1 - index];
  const directory = answerCampusNavigation(directoryClause);
  const citation = directory?.citations[0].chunkId;
  const registrarContact = citation === 'campus-navigation:registrar'
    && /\b(?:phone|telephone|contact number|email|e-mail|address|website|link)\b|電話|聯絡|信箱|地址|連結/iu.test(directoryClause)
    && !/\b(?:hours|open|close|deadline)\b|時間|開放|截止/iu.test(directoryClause);
  const wifiSetup = citation === 'campus-navigation:wifi'
    && /\b(?:where|link|setup|settings|connect)\b|如何|怎麼|在哪|教學|連結|設定|連線/iu.test(directoryClause)
    && !/\b(?:password|status|outage)\b|故障|斷線/iu.test(directoryClause);
  return registrarContact || wifiSetup ? { directory, question: clauses[index], directoryFirst: index === 1 } : null;
}

function markdownLink(title, url) { return '[' + title + '](' + url + ')'; }

function normalized(value) { return String(value).normalize('NFKC').toLocaleLowerCase(); }
function routeGroup(route) {
  const match = /^\/school-affairs\/menu\/(menu|aca|sao|swd|rdd|personal|infoSystem)\/([a-z]+)\/?$/.exec(route || '');
  if (!match) return null;
  const [, group, view] = match;
  const label = menuLabels[group+'/'+view];
  if (label) return {group,view,label};
  if (group !== 'menu' && ['all','input','query','portal'].includes(view)) return {group,view,label:groups[group]};
  return null;
}
function citation(entry) {
  return {chunkId:`directory:${entry.group}:${entry.title}`,claim:'Captured School Affairs service directory entry; the official service may require separate sign-in.',title:entry.title,sourceName:'School Affairs service directory · captured snapshot',url:entry.localUrl||entry.officialUrl,locator:entry.localUrl,effectiveAt:null,reviewedAt:null};
}
function customMenuGuide(question) {
  const chinese = (assistantLanguage(question)==='zh-Hant');
  const title = chinese ? '自訂選單' : 'Custom menu';
  const claim = chinese ? '自訂選單的連結儲存在目前使用的瀏覽器。請在該瀏覽器開啟自訂選單查看。'
    : 'This menu shows links saved in your browser. Open it in that browser to see your selections.';
  return {status:'handoff',answer:claim+'\n\n'+markdownLink(title,customMenuUrl),
    citations:[{chunkId:'directory:custom-menu',claim,title,sourceName:'stu.best School Affairs',url:customMenuUrl,locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
    activity:[{kind:'directory',label:'Checked School Affairs menu scope',detail:title,status:'complete'}]};
}
export function answerSchoolSystemSearch(question,route) {
  if (!/^\/school-affairs\/search\/?$/u.test(route)
    || !/^(?:what does (?:the )?keyword field(?: on this page)? search|how (?:can|do) i (?:use (?:the )?keyword field(?: on this page)?(?: to find (?:a )?service)?|search(?: on)? this page)|(?:這個頁面|這頁|此頁)的?關鍵字(?:欄位)?(?:可以)?搜尋什麼|(?:如何|怎麼)(?:使用關鍵字|在這個頁面搜尋|在此頁搜尋))[?？。]?$/iu.test(question.trim())) return null;
  const chinese = (assistantLanguage(question)==='zh-Hant');
  const url='/school-affairs/search';
  const title=chinese?'校務系統搜尋':'School Affairs system search';
  const claim=chinese
    ? '在「系統名稱關鍵字」輸入程式名稱或分類，例如「線上報修」。結果會列出符合的服務連結，可直接開啟。'
    : 'Enter a service name or category in the keyword field. For example, search 線上報修 for online repairs, then open the matching service link.';
  return {status:'answered',answer:claim+'\n\n'+markdownLink(title,url),
    citations:[{chunkId:'directory:system-search',claim,title,sourceName:'stu.best School Affairs',url,locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
    activity:[{kind:'directory',label:'Checked School Affairs system search',detail:title,status:'complete'}]};
}
export function answerSchoolServiceNotice(question,route) {
  const notice=schoolServiceNoticeForRoute(route);
  if(!notice)return null;
  const chinese=(assistantLanguage(question)==='zh-Hant');
  const prompt=question.normalize('NFKC').trim().replace(/[?？。.!]+$/u,'');
  const matched=chinese
    ? /^(?:這(?:個|則)?(?:通知|提示|訊息)(?:是)?什麼意思|按(?:下)?確定(?:之後|後)?(?:會)?(?:去哪裡|回到哪(?:一)?頁)|這(?:個)?頁面說什麼)$/u
    : /^(?:what does (?:this|the) (?:notice|message|alert|page) (?:say|mean)|where (?:does confirming (?:this|the) notice take me|(?:do|will) i go (?:when|after) i (?:press|click|choose) confirm)|what happens (?:when|if) i (?:press|click|choose) confirm)(?:\s+and\s+(?:where does confirming it take me|what happens (?:when|if) i (?:press|click|choose) confirm))?$/iu;
  if(!matched.test(prompt))return null;
  const title=chinese?notice.title:notice.englishTitle;
  const destination=notice.returnTitle[chinese?0:1];
  const link=markdownLink(destination,notice.resultingRoute);
  const answer=chinese
    ? `${title}\n\n按「確定」即可返回${link}。`
    : `${title}\n\nChoose 確定 (Confirm) to return to ${link}.`;
  return {status:'answered',answer,citations:[{
    chunkId:'directory:notice:'+notice.id,claim:title,title,sourceName:'stu.best School Affairs',
    url:notice.route,locator:null,effectiveAt:null,reviewedAt:null,
  }],suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
  activity:[{kind:'service-notice',label:chinese?'已查核頁面提示':'Checked the page notice',detail:title,status:'complete'}]};
}
export function answerDirectoryQuestion(question, route='') {
  const noticeAnswer=answerSchoolServiceNotice(question,route);
  if(noticeAnswer)return noticeAnswer;
  const searchAnswer=answerSchoolSystemSearch(question,route);
  if (searchAnswer) return searchAnswer;
  const here = /\b(?:here|this page|this section|on this screen|services here|what can i do)\b|這(?:裡|裏|頁|個頁面)|此頁|這些(?:服務|資訊)/i.test(question);
  const navigationAnswer = answerCampusNavigation(question);
  if (navigationAnswer) return navigationAnswer;
  if (here && (route === customMenuUrl || route === customMenuUrl+'/')) return customMenuGuide(question);
  const section = routeGroup(route);
  const all = /\b(?:all|every|full|entire)\b.{0,35}\b(?:services?|systems?|menu|directory)\b|所有.{0,12}(?:服務|系統|選單)|全部.{0,12}(?:服務|系統|選單)/i.test(question);
  const requestedGroup = groupAliases.find(([pattern])=>pattern.test(question))?.[1];
  // A matching service name is a lead, not an answer to policy/amount/date questions.
  const directoryIntent=/\b(?:where|open|navigate|link|url|directory|menu|list|find|search|which (?:services|systems)|what (?:services|systems)|available (?:services|systems))\b|(?:how (?:can|do|should) i (?:access|open|find|view|check))|哪裡|在哪|開啟|連結|選單|服務清單|系統清單|有哪些(?:服務|系統)/iu.test(question);
  if(!here&&!all&&!directoryIntent)return null;

  const query = aliases.find(([pattern]) => pattern.test(question))?.[1] || question;
  const token = normalized(query).replace(/[?？。，!！]/g,'').trim();
  const nativeRoute=nativeAcademicNavigation.find(entry=>entry.localUrl===route.split(/[?#]/)[0].replace(/\/$/,''));
  const serviceRoute = /^\/school-affairs\/services\/([^/]+)(?:\/history)?$/.exec(route)?.[1]??nativeRoute?.serviceId;
  const baseService = serviceRoute && here ? studentServiceByKey(serviceRoute) : null;
  const service = baseService&&nativeRoute?{...baseService,title:nativeRoute.title[(assistantLanguage(question)==='zh-Hant')?0:1],officialUrl:nativeRoute.officialUrl,localUrl:nativeRoute.localUrl}:baseService;
  const scoped = service ? [service] : section && here ? schoolMenuPrograms(section.group,section.view) : [];
  const matches = scoped.length ? scoped : requestedGroup && /services?|systems?|menu|list|available|資訊|系統|服務|選單/i.test(question) ? directoryEntries.filter(item=>item.group===requestedGroup) : directoryEntries.filter(item => token.length >= 2 && (normalized(item.title).includes(token) || normalized(item.section).includes(token)));
  if (all && !requestedGroup && !here) {
    const chinese = (assistantLanguage(question)==='zh-Hant');
    const categories = ['aca','sao','swd','rdd','personal','infoSystem'];
    const lines = categories.map(group=>`- [${groups[group]}](/school-affairs/menu/${group}/all) · ${directoryEntries.filter(item=>item.group===group).length} ${chinese?'個服務':'services'}`);
    return {status:'answered',answer:`${chinese?'校務服務目錄涵蓋以下分類：':'The captured School Affairs directory covers these categories:'}\n\n${lines.join('\n')}\n\n${chinese?'這是 2026 年 11 月的擷取快照，校方服務需要另行登入。':'This is a November 2026 snapshot; official services may require separate sign-in.'}`,citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'directory',label:'Checked the School Affairs service directory',detail:`${directoryEntries.length} captured service links across the directory`,status:'complete'}]};
  }
  if (!matches.length) return null;
  const relevant = matches.slice(0, here ? 12 : 6);
  const chinese = (assistantLanguage(question)==='zh-Hant');
  const lead = here ? (chinese ? `此頁列出${section?.label || '校務資訊'}的服務：` : `This page lists ${section?.label || 'School Affairs'} services:`) : (chinese ? '校務服務目錄中有：' : 'The School Affairs directory lists:');
  const lines = relevant.map(item => `- [${item.title}](${item.localUrl}) · [${chinese ? '校方服務' : 'official service'}](${item.officialUrl})`);
  const listUrl = here && section && scoped.length ? `/school-affairs/menu/${section.group}/${section.view}`
    : `/school-affairs/menu/${requestedGroup || 'aca'}/all`;
  const extra = matches.length>relevant.length ? (chinese?`\n\n另有 ${matches.length-relevant.length} 個項目；請開啟[服務清單](${listUrl})查看。`:`\n\n${matches.length-relevant.length} more entries are available in the [service list](${listUrl}).`) : '';
  const note = chinese ? '這是 2026 年 11 月擷取的服務目錄；校方服務可能需要另外登入。stu.best 的 Google 登入不會匯入正式選課、成績或個人課表。' : 'This is a November 2026 service-directory snapshot. Official services may require a separate school sign-in. Your stu.best Google login does not import official enrollment, grades or timetable.';
  return {status:'answered',answer:`${lead}\n\n${lines.join('\n')}${extra}\n\n${note}`,citations:relevant.map(citation),suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'directory',label:'Checked the School Affairs service directory',detail:`${matches.length} matching services in the captured catalog`,status:'complete'}]};
}
