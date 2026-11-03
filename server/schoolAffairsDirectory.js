import catalog from '../src/features/public/affairs/catalog.json' with { type: 'json' };

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
export const directoryEntries = catalog.flatMap(([group,kind,section,links]) => links.map(([title,sourcePath]) => ({
  group, kind, section, title,
  officialUrl: /^https?:\/\//i.test(sourcePath) ? sourcePath : `https://${sourcePath}`,
  localUrl: `/school-affairs/menu/${group === 'sysmenu' || group === 'sysDoc' ? 'menu' : group}/${kind === 'external' || kind === 'stu' ? (kind === 'external' ? 'external' : 'help') : kind}`,
})));

function normalized(value) { return String(value).normalize('NFKC').toLocaleLowerCase(); }
function routeGroup(route) {
  const match = /^\/school-affairs\/menu\/([a-zA-Z]+)\/(all|input|query|portal|external|help|library)$/.exec(route || '');
  return match ? {group:match[1],view:match[2]} : null;
}
function citation(entry) {
  return {chunkId:`directory:${entry.group}:${entry.title}`,claim:'Captured School Affairs service directory entry; the official service may require separate sign-in.',title:entry.title,sourceName:'School Affairs service directory · captured snapshot',url:entry.officialUrl,locator:entry.localUrl,effectiveAt:null,reviewedAt:null};
}
export function answerDirectoryQuestion(question, route='') {
  const section = routeGroup(route);
  const here = /\b(?:here|this page|this section|on this screen|services here|what can i do)\b|這(?:裡|頁|個頁面)|此頁|這些(?:服務|資訊)/i.test(question);
  const all = /\b(?:all|every|full|entire)\b.{0,35}\b(?:services?|systems?|menu|directory)\b|所有.{0,12}(?:服務|系統|選單)|全部.{0,12}(?:服務|系統|選單)/i.test(question);
  const requestedGroup = groupAliases.find(([pattern])=>pattern.test(question))?.[1];
  const query = aliases.find(([pattern]) => pattern.test(question))?.[1] || question;
  const token = normalized(query).replace(/[?？。，!！]/g,'').trim();
  const scoped = section && here ? directoryEntries.filter(item => item.group === section.group && (section.view === 'all' || item.kind === section.view)) : [];
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
