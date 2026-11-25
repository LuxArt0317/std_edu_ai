import {isOwnFeeBalanceQuestion} from './pendingFeesAnswer.js';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const materialRoute = new RegExp('^/dtm/course/(' + uuid + ')(?:/material/(' + uuid + ')|(/materials))?/?$', 'u');
const topic = /\b(?:materials?|resources?|handouts?|slides?|course files?)\b|教材|教學資源|講義|投影片/iu;
const thisResource = /\b(?:this (?:link|file|page|item|document)|what(?:['’]s| is) (?:this|it)(?: about)?|(?:link|summary|title) (?:here|for it)|what does it (?:say|link to))\b|這(?:個|份)(?:連結|檔案|文件|是什麼)|本頁(?:連結|摘要|標題)/iu;
const otherSubject = /\b(?:tuition|balance|fees?|gradebook|grades?|grade reports?|assignments?|homework|(?:my )?next class(?:es)?|schedule|timetable|transcript|scholarship|leave (?:requests?|history|records?)|attendance)\b|學費|餘額|餘款|成績|作業|下一堂|課表|獎學金|請假|出席/iu;
const foreign = /\b(?:another|other) (?:student|person|user|account)\b|\b(?:their|his|her) (?:[\p{L}-]+\s+){0,2}(?:materials?|resources?|slides?|file|link)\b|\bmy (?:friend|classmate|roommate|sibling|brother|sister|colleague)\b|\b(?!course['’]s\b|material['’]s\b|resource['’]s\b|what['’]s\b)[\p{L}\d_-]+['’]s (?:[\p{L}-]+\s+){0,2}(?:materials?|resources?|slides?|file|link)\b|別人|他人|其他學生|同學的|(?:他|她|他們|她們)的|[\p{Script=Han}]{2,6}同學/iu;
const ignore = /^(?:please )?(?:do not|don['’]t|never|skip|exclude|not|without)\b|^(?:請)?(?:不要|不用|排除)/iu;
const edit = /\b(?:delete|replace|rename|update|edit|upload|remove|change|share|send|import|publish)\b|刪除|移除|重新命名|修改|編輯|上傳|分享|寄送|匯入|發布/iu;
const named = /\b(?:material|resource|handout|file|course|slides?)\s+(?:named\s+|called\s+|(?:id|number)\s+|["“«][^"”»]+|#[\p{L}\d]|[A-Z]{2,}\d+\b)|(?:教材|資源|課程)[「『]/u;
const explicitOtherTarget = /\b(?:for|from|in) (?:the )?(?:course|class) (?!materials?\b|resources?\b|page\b|that\b|i\b|this\b)[\p{L}\d][\p{L}\d-]*|\b(?:for|belonging to|owned by) (?:student|account|user)\b/iu;
const foreignMaterial = /\b(?:for|belonging to|owned by) (?!me\b|my\b|this\b|that\b|the\b|it\b|use\b|review\b|them\b|teacher\b|students?\b|class\b|course\b|preview\b|reference\b|practice\b)[\p{L}][\p{L}-]{1,}\b/iu;
const chinesePossessive = /^(?!我|這|这|本|該|该)[\p{Script=Han}]{2,6}的(?:教材|資源|講義|投影片|檔案|連結)/u;
const summary = /\b(?:summary|description|about|describes?|summari[sz]e)\b|摘要|說明|簡介/iu;
const contents = /\b(?:contents?|body|transcri(?:be|pt)|download|inside|full text|read (?:the|this) (?:pdf|file|document))\b|全文|內文|內容|逐字稿|下載/iu;
const destination = /\b(?:link|url|where|open|destination|download)\b|連結|網址|在哪|開啟|下載/iu;

export function dtmMaterialRoute(route) {
  if (typeof route !== 'string') return null;
  const local = route.startsWith('https://stu.best/') ? route.slice('https://stu.best'.length) : route;
  return materialRoute.exec(local);
}
const detailField = /\b(?:file|document|url|link|title|summary|description|contents?|full text|body|download)\b|摘要|檔案|文件|內文|全文|連結|網址|標題/iu;

export function dtmMaterialIntent(question, route = '') {
  if (typeof question !== 'string' || typeof route !== 'string') return null;
  const local = route.startsWith('https://stu.best/') ? route.slice('https://stu.best'.length) : route;
  const routeLooksRelevant = /^\/dtm\/course\/[^/]+(?:\/materials?\b|\/?$)/u.test(local);
  const target = dtmMaterialRoute(route);
  const explicitlyDtm = /\b(?:dtm|moodle)\b|數位教材網/iu.test(question);
  const own = /\b(?:my|saved|recorded|this (?:course|file|material))\b|我的|已儲存|這(?:門課|份|個)/iu.test(question);
  const detail = Boolean(target?.[2]);
  const relevant = text => topic.test(text) || detail && (thisResource.test(text) || detailField.test(text));
  if (!relevant(question) || !routeLooksRelevant && !(explicitlyDtm && own)) return null;

  const clauses = question.split(/[,，;；。！？\n]|\s+(?:and|also|but|plus)\s+|\s+(?=without\b)|[.!?](?:\s|$)|以及|並且|還有/iu);
  const targetClauses = clauses.filter(part => !otherSubject.test(part) && relevant(part));
  if (!targetClauses.length) return null;
  const independent = clauses.map(part => part.trim()).filter(part => part && otherSubject.test(part) && !topic.test(part));
  const feeQuestion = independent.map(part => part.replace(/^just\s+/iu,'')).find(isOwnFeeBalanceQuestion) ?? null;
  const hasOtherQuestion = independent.some(part => part.replace(/^just\s+/iu,'') !== feeQuestion && !ignore.test(part));
  const parts = clauses.map(part => part.trim()).filter(part => part && !independent.includes(part));
  const materialQuestion = parts.join(' ');
  const affirmative = parts.filter(part => !ignore.test(part)).join(' ');
  const denied = parts.filter(part => ignore.test(part)).join(' ');
  const base = target ? '/dtm/course/' + target[1] : null;
  const path = detail ? base + '/material/' + target[2] : base ? base + '/materials' : null;
  const scope = {courseId:target?.[1] ?? null, materialId:target?.[2] ?? null, path,
    summary:detail && summary.test(affirmative) && !summary.test(denied),
    destination:detail && destination.test(affirmative) && !destination.test(denied),
    contents:contents.test(affirmative) && !contents.test(denied), feeQuestion, hasOtherQuestion};
  if (foreign.test(affirmative) || foreignMaterial.test(affirmative)
    || chinesePossessive.test(affirmative.replace(/^(?:請)?(?:顯示|查詢|列出|給我|告訴我)\s*/u,''))) return {...scope, reason:'foreign'};
  if (!affirmative || ignore.test(materialQuestion.trim()) && !relevant(affirmative)) return {...scope, reason:'excluded'};
  if (edit.test(affirmative)) return {...scope, reason:'operation'};
  if (!path || named.test(affirmative) || explicitOtherTarget.test(affirmative)) return {...scope, reason:'choose'};
  // Never accept an explicit second link as authority for a different resource.
  const statedRoutes = affirmative.match(/\/(?:dtm\/course)\/[^\s)\]<>]+/gu) ?? [];
  if (statedRoutes.some(stated => stated.replace(/\/$/u, '') !== path)) return {...scope, reason:'choose'};
  return {...scope, reason:null};
}

export function dtmMaterialBoundary(selection, question, signedIn) {
  const zh = /\p{Script=Han}/u.test(question);
  const say = (en, cn) => zh ? cn : en;
  const reason = selection.reason;
  const title = say('Open the saved Moodle material page','開啟已儲存的 Moodle 教材頁');
  const returnPath = selection.path ?? '/dtm/my';
  const url = signedIn ? returnPath : '/dtm/login?next=' + encodeURIComponent(returnPath);
  let answer = reason === 'foreign' ? say('I can only check materials saved to your own account.','我只能查詢你帳戶中已儲存的教材。')
    : reason === 'excluded' ? say('I skipped the Moodle material as requested.','已略過你要求排除的 Moodle 教材。')
    : reason === 'operation' ? say('Use the Moodle course page to manage saved materials.','請在 Moodle 課程頁面管理已儲存的教材。')
    : reason === 'choose' ? say('Open the Moodle course or the exact material you want me to check.','請開啟要查詢的 Moodle 課程或確切的教材頁面。')
    : say('Sign in to view materials saved to your account.','登入後即可查看帳戶中已儲存的教材。');
  const citations = reason === 'foreign' || reason === 'excluded' ? [] : [{title,url}];
  if (citations.length) answer += '\n\n[' + title + '](' + url + ')';
  if (!signedIn && selection.feeQuestion) {
    const title = say('Sign in to check your fee balance','登入查看待繳費用');
    const url = '/school-affairs/login?next=%2Fschool-affairs%2Fservices%2F39-1';
    citations.push({title,url});
    answer += '\n\n[' + title + '](' + url + ')';
  }
  return {status:!signedIn || reason === 'foreign' ? 'handoff' : 'clarification',answer,citations,suggestedQuestions:[],
    grounding:{source:signedIn ? 'account' : 'directory',webSearched:false}};
}
