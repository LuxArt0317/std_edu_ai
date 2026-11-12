import {
  internshipPath, leavePath, officialInternshipUrl, officialLeaveUrl, officialRegistrarUrl, officialWifiUrl,
  schoolServiceEntries, studentServiceByKey, wifiGuidePath,
} from '../src/features/public/affairs/studentServices.js';

import {studentAidNavigation} from './studentAidRecords.js';
import {creditLoadHistoryNavigation} from './creditLoadHistory.js';

const groups = { personal:'選單資訊', sysmenu:'選單資訊', sysDoc:'選單資訊', aca:'教務系統', sao:'學務資訊', swd:'總務資訊', rdd:'研發系統', infoSystem:'資訊系統' };
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

const navigation = [
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
    description:['正式請假請從校方請假系統送出。您也可以先在 stu.best 儲存私人草稿。','File official leave through the university’s Student Leave system. You can prepare and track a private draft on stu.best.'],
  },
  {
    id:'internship', match:/\binternship\b|校外實習|實習系統/i,
    title:['校外實習系統','Off-campus internship system'], officialUrl:officialInternshipUrl, localUrl:internshipPath,
    description:['校方實習系統提供契約、自我評量和企業資料。stu.best 提供私人追蹤紀錄。','The university’s internship service handles contracts, self-assessments and company records. Use stu.best to track your own internship work.'],
  },
];
const registrarFaq = 'https://www.aca.stu.edu.tw/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C%EF%BD%9Cqa/';

export function answerCampusNavigation(question) {
  if (/\b(?:password\s*[:=]|access_token|refresh_token|sesskey)\b|密碼[：:]/i.test(question)) return null;
  const navigational = /\b(?:where|how (?:can|do|to)|link|url|website|contact|phone|help (?:me )?find)\b|哪裡|哪裏|在哪|怎麼|如何|連結|電話|聯絡/i.test(question);
  const privateStatus = /\b(?:status|approved|rejected|pending|my (?:leave|internship) (?:record|history|draft))\b|請假紀錄|審核|核准|我的實習紀錄/i.test(question);
  if (privateStatus) return null;
  const ownEnrollment = /\b(?:my|our)\b.{0,35}\b(?:enrollments?|enrolled|selected|registered|completed|withdrawn|timetable)\b|\b(?:i am|i'm|we are|i have|i've|we have|am i|are we)\b.{0,35}\b(?:enrolled|taking|registered|completed|selected)\b|我.{0,12}(?:已選|已修|選修紀錄|選課紀錄|修過|正在修|課表)/i.test(question);
  const entry = navigation.find(item => item.match.test(question) && (item.id!=='course-catalog' || !ownEnrollment) && (navigational ||
    item.id==='course-catalog' && !ownEnrollment ||
    item.id==='wifi' && /\b(?:connect|setup|settings?)\b|連線|設定/i.test(question)));
  if (!entry) return null;
  const zh = /[\u3400-\u9fff]/.test(question), i = zh ? 0 : 1;
  const wantsRegistrarContact = entry.id==='registrar' && /\b(?:contact|phone|telephone|email|e-mail|call|number|address|hours)\b|電話|聯絡|分機|地址|時間|信箱/i.test(question);
  const description = wantsRegistrarContact
    ? (zh?'註冊課務組在行政大樓 1 樓。電話 07-615-8000，分機 2007、2009、2010、2012、2014、2016。電子郵件 course@stu.edu.tw。'
      :'The Registration and Curriculum Division is on the first floor of the Administration Building. Call +886 7 615 8000, ext. 2007, 2009, 2010, 2012, 2014 or 2016, or email course@stu.edu.tw.')
    : entry.description[i];
  const source = wantsRegistrarContact?registrarFaq:entry.officialUrl;
  const links = [markdownLink(zh ? '校方網站' : 'Official university page',source)];
  if (entry.localUrl) links.push(markdownLink(zh ? '在 stu.best 開啟' : 'Open on stu.best',entry.localUrl));
  return {
    status:'answered',answer:description + '\n\n' + links.join(' · '),
    citations:[{chunkId:'campus-navigation:'+entry.id,claim:description,title:entry.title[i],
      sourceName:'Shu-Te University',url:source,locator:entry.localUrl ?? null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
    activity:[{kind:'directory',label:'Checked the campus service directory',detail:entry.title[i],status:'complete'}],
  };
}

function markdownLink(title, url) { return '[' + title + '](' + url + ')'; }

function normalized(value) { return String(value).normalize('NFKC').toLocaleLowerCase(); }
function routeGroup(route) {
  const match = /^\/school-affairs\/menu\/([a-zA-Z]+)\/(all|input|query|portal|external|help|library)$/.exec(route || '');
  return match ? {group:match[1],view:match[2]} : null;
}
function citation(entry) {
  return {chunkId:`directory:${entry.group}:${entry.title}`,claim:'Captured School Affairs service directory entry; the official service may require separate sign-in.',title:entry.title,sourceName:'School Affairs service directory · captured snapshot',url:entry.officialUrl,locator:entry.localUrl,effectiveAt:null,reviewedAt:null};
}
export function answerDirectoryQuestion(question, route='') {
  const navigationAnswer = answerCampusNavigation(question);
  if (navigationAnswer) return navigationAnswer;
  const section = routeGroup(route);
  const here = /\b(?:here|this page|this section|on this screen|services here|what can i do)\b|這(?:裡|頁|個頁面)|此頁|這些(?:服務|資訊)/i.test(question);
  const all = /\b(?:all|every|full|entire)\b.{0,35}\b(?:services?|systems?|menu|directory)\b|所有.{0,12}(?:服務|系統|選單)|全部.{0,12}(?:服務|系統|選單)/i.test(question);
  const requestedGroup = groupAliases.find(([pattern])=>pattern.test(question))?.[1];
  const query = aliases.find(([pattern]) => pattern.test(question))?.[1] || question;
  const token = normalized(query).replace(/[?？。，!！]/g,'').trim();
  const serviceRoute = /^\/school-affairs\/services\/([^/]+)(?:\/history)?$/.exec(route)?.[1];
  const service = serviceRoute && here ? studentServiceByKey(serviceRoute) : null;
  const scoped = service ? [service] : section && here ? directoryEntries.filter(item => item.group === section.group && (section.view === 'all' || item.kind === section.view)) : [];
  const matches = scoped.length ? scoped : requestedGroup && /services?|systems?|menu|list|available|資訊|系統|服務|選單/i.test(question) ? directoryEntries.filter(item=>item.group===requestedGroup) : directoryEntries.filter(item => token.length >= 2 && (normalized(item.title).includes(token) || normalized(item.section).includes(token)));
  if (all && !requestedGroup && !here) {
    const chinese = /[\u3400-\u9fff]/.test(question);
    const categories = ['aca','sao','swd','rdd','personal','infoSystem'];
    const lines = categories.map(group=>`- [${groups[group]}](/school-affairs/menu/${group}/all) · ${directoryEntries.filter(item=>item.group===group).length} ${chinese?'個服務':'services'}`);
    return {status:'answered',answer:`${chinese?'校務服務目錄涵蓋以下分類：':'The captured School Affairs directory covers these categories:'}\n\n${lines.join('\n')}\n\n${chinese?'這是 2026 年 11 月的擷取快照，校方服務需要另行登入。':'This is a November 2026 snapshot; official services may require separate sign-in.'}`,citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'directory',label:'Checked the School Affairs service directory',detail:`${directoryEntries.length} captured service links across the directory`,status:'complete'}]};
  }
  if (!matches.length) return null;
  const relevant = matches.slice(0, here ? 12 : 6);
  const chinese = /[\u3400-\u9fff]/.test(question);
  const lead = here ? (chinese ? `此頁列出${groups[section?.group] || '校務資訊'}的服務：` : `This page lists ${groups[section?.group] || 'School Affairs'} services:`) : (chinese ? '校務服務目錄中有：' : 'The School Affairs directory lists:');
  const lines = relevant.map(item => `- [${item.title}](${item.localUrl}) · [${chinese ? '校方服務' : 'official service'}](${item.officialUrl})`);
  const extra = matches.length>relevant.length ? (chinese?`\n\n另有 ${matches.length-relevant.length} 個項目；請開啟[服務清單](/school-affairs/menu/${requestedGroup || section?.group || 'aca'}/all)查看。`:`\n\n${matches.length-relevant.length} more entries are available in the [service list](/school-affairs/menu/${requestedGroup || section?.group || 'aca'}/all).`) : '';
  const note = chinese ? '這是 2026 年 11 月擷取的服務目錄；校方服務可能需要另外登入。stu.best 的 Google 登入不會匯入正式選課、成績或個人課表。' : 'This is a November 2026 service-directory snapshot. Official services may require a separate school sign-in. Your stu.best Google login does not import official enrollment, grades or timetable.';
  return {status:'answered',answer:`${lead}\n\n${lines.join('\n')}${extra}\n\n${note}`,citations:relevant.map(citation),suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'directory',label:'Checked the School Affairs service directory',detail:`${matches.length} matching services in the captured catalog`,status:'complete'}]};
}
