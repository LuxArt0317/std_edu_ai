import {createHash} from 'node:crypto';
import manifestCaptures from '../src/features/public/mirror/pages.json' with {type:'json'};
import prospectus from './data/ipiac115.json' with {type:'json'};
const captures=[...manifestCaptures,{source:prospectus.source,title:prospectus.title,route:prospectus.url,
  file:prospectus.captureFile,checksum:prospectus.captureChecksum,capturedOn:prospectus.capturedOn}];
import {detectAndExtractSource} from './knowledgeAcquisition.js';
import {universityFoundingYearQuestion} from './currentStudyOwnerScope.js';

function captureOrigin(){
  // Only the loopback development runner can select a local source origin.
  if(process.env.VERCEL_ENV==='development'&&process.env.STU_LOCAL_CAPTURE_ORIGIN){
    try {const url=new URL(process.env.STU_LOCAL_CAPTURE_ORIGIN);
      if(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)return url.origin;
    }catch{}
  }
  return 'https://stu.best';
}
const maxCaptureBytes=4_000_000;
const maxExcerptCharacters=18000;
const reservedPath=/^\/(?:app|api|auth|signin|signout|school-affairs|dtm|student-sso)(?:\/|$)/i;
const unsafeRouteCharacters=value=>[...value].some(character=>character.charCodeAt(0)<=32||character.charCodeAt(0)===127||character==='\\');

// Route context is an identifier, never a URL to fetch. Normalize encoding and
// query order, but do not collapse traversal, accept new parameters, or turn an
// arbitrary same-origin path into public evidence.
function routeKey(value) {
  if(typeof value!=='string'||value.length>4096||!value.startsWith('/')||value.startsWith('//')||unsafeRouteCharacters(value))return null;
  const withoutHash=value.split('#',1)[0];
  const separator=withoutHash.indexOf('?');
  const pathname=separator<0?withoutHash:withoutHash.slice(0,separator);
  if(/%(?:2f|5c|3f|23|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pathname))return null;
  try {
    const decoded=decodeURIComponent(pathname);
    if(decoded.includes('//')||unsafeRouteCharacters(decoded)||decoded.includes('%')||decoded.split('/').some(part=>part==='.'||part==='..')||reservedPath.test(decoded))return null;
    const params=new URLSearchParams(separator<0?'':withoutHash.slice(separator+1));
    const keys=[...params.keys()];
    if(new Set(keys).size!==keys.length||keys.some(key=>/token|password|secret|session|ticket|authorization|api.?key|^code$/i.test(key)))return null;
    params.sort();
    const query=params.toString();
    return decoded+(query?'?'+query:'');
  } catch { return null; }
}

function validCapture(page) {
  if(!page||!routeKey(page.route)||typeof page.title!=='string'||page.title.length>1000||!/^\/school-pages\/[a-f0-9]{20}\.html$/.test(page.file)||!/^[a-f0-9]{64}$/.test(page.checksum)||!/^\d{4}-\d{2}-\d{2}$/.test(page.capturedOn))return false;
  try {
    const source=new URL(page.source);
    return source.protocol==='https:'&&!source.username&&!source.password&&!source.port
      &&(source.hostname==='stu.edu.tw'||source.hostname.endsWith('.stu.edu.tw'))
      &&!/(?:^|\/)(?:login|signin|auth|logout)(?:[./]|$)/i.test(source.pathname)
      &&![...source.searchParams.keys()].some(key=>/token|password|secret|session|ticket|authorization|saml|api.?key|^code$/i.test(key));
  } catch { return false; }
}

function captureIndex(pages) {
  const index=new Map();
  for(const page of pages) {
    if(!validCapture(page))continue;
    const key=routeKey(page.route);
    // Ambiguous manifest entries fail closed rather than choosing one source.
    index.set(key,index.has(key)?null:page);
  }
  return index;
}
const publicIndex=captureIndex(captures);

export function publicPageForRoute(route,pages) {
  const key=routeKey(route);
  if(!key)return null;
  return (pages?captureIndex(pages):publicIndex).get(key)||null;
}

export function normalizePublicPageRoute(route) {
  return publicPageForRoute(route)?.route||'';
}

export function isPublicPageQuestion(question) {
  return /\b(?:this|current|present)\s+(?:web\s*)?page\b|\bpage\s+(?:(?:that\s+)?i(?:'m| am)\s+(?:on|viewing|reading)|i (?:have )?opened)\b|(?:這(?:個|一)?|此|本|目前(?:的)?|當前(?:的)?)\s*(?:(?:在校學生|學生服務)\s*)?(?:網頁|頁面|頁)/i.test(String(question));
}

const pageMention='(?:this|the current|the present)\\s+(?:web\\s*)?page';
const englishPageSummary=new RegExp(
  `\\b(?:what(?: is| was|['’]s) ${pageMention} about|what (?:does|did) ${pageMention} (?:cover|discuss)|(?:summari[sz]e|describe|explain|give (?:me )?(?:a |an )?(?:brief )?(?:summary|overview) of) ${pageMention})\\b(?!['’]s\\b)`,'iu');
const chinesePageSummary=/(?:這(?:個|一)?|此|本|目前(?:的)?|當前(?:的)?)\s*(?:(?:在校學生|學生服務)\s*)?(?:網頁|頁面|頁).{0,10}(?:關於什麼|主要內容|在說什麼|介紹什麼|有什麼內容)|(?:摘要|概述|總結).{0,12}(?:這(?:個|一)?|此|本).{0,8}(?:網頁|頁面|頁)/u;

/** A page summary asks about the capture body, beyond its manifest identity. */
export function isPublicPageSummaryQuestion(question) {
  return englishPageSummary.test(String(question))||chinesePageSummary.test(String(question));
}

/** Route explicit institutional facts to their manifested primary source. */
export function institutionalPublicCapture(question,route='') {
  const text=String(question).normalize('NFKC').trim();
  const about=publicPageForRoute('/關於樹德/');
  const samePage=Boolean(about&&publicPageForRoute(route)?.route===about.route);
  const institution=/\b(?:shu[-\s]?te(?: university)?|stu)\b|樹德(?:科技大學|科大)/iu;
  const siteReference=/\b(?:the|this|our) (?:school|university)\b|本校|這所學校/iu.test(text)
    && !/\b(?:school|university)\s+(?:of|named|called)\b/iu.test(text);
  const contextualSchool=(samePage&&/\b(?:school|university)\b|學校|本校/iu.test(text))||siteReference;
  const facts=/\b(?:found(?:er|ing|ed)s?|(?:school |educational |university )?mission|motto|educational philosophy|history|background|renamed)\b|創辦|創校|沿革|校史|校訓|治校理念|教育(?:使命|理念)|更名|改名/iu;
  const otherScope=/\b(?:my|compare|versus|recent(?:ly)?|updated|changed|changes|admissions?|tuition|scholarships?|grades?|attendance|timetable|assignments?|deadlines?|registration|foundations?|departments?|clubs?|associations?|library|dormitories|housing)\b|我的|本人|個人|學號|比較|最近|更新|改變|招生|學費|獎學金|成績|出勤|課表|作業|截止|報名|校友會|系所|社團|圖書館|宿舍/iu;
  return (institution.test(text)||contextualSchool)&&(facts.test(text)||institutionalFactRequest(text)==='founding-year')&&!otherScope.test(text)
    ? publicPageForRoute('/關於樹德/') : null;
}

/** Exact questions whose complete answer can be projected from the About page. */
export function institutionalFactRequest(question) {
  const text=String(question).normalize('NFKC').toLowerCase().trim().replace(/[?.。]+$/u,'');
  if(/^(?:what does shu[- ]te university say about its founding and educational mission|when was shu[- ]te university founded and what is its educational mission)$/u.test(text))return 'founding-and-mission';
  if(universityFoundingYearQuestion(text))return 'founding-year';
  if(/^(?:what is (?:the motto of shu[- ]te university|shu[- ]te university['’]s motto)|(?:請問\s*)?樹德(?:科技大學|科大)的?校訓(?:是)?什麼)$/u.test(text))return 'motto';
  return null;
}

export function institutionalFactAnswer(context,question) {
  const request=institutionalFactRequest(question);
  const page=publicPageForRoute('/關於樹德/');
  if(!request||!context?.contentAvailable||!page||context.page.route!==page.route||context.page.source!==page.source
    ||context.page.capturedOn!==page.capturedOn||context.evidence.url!==page.route
    ||context.evidence.id!=='public-page:'+createHash('sha256').update(page.route).digest('hex').slice(0,24))return null;
  let snapshot;
  try{snapshot=JSON.parse(context.evidence.content);}catch{return null;}
  if(snapshot?.contentStatus!=='verified_snapshot'||snapshot.localUrl!==page.route||snapshot.originalSource!==page.source
    ||snapshot.capturedOn!==page.capturedOn||typeof snapshot.excerpt!=='string')return null;
  const chinese=/\p{Script=Han}/u.test(question);
  let answer;
  if(request==='motto'){
    const mottos=[...snapshot.excerpt.matchAll(/「([\p{Script=Han}、]{4,32})」的校訓/gu)];
    if(mottos.length!==1)return null;
    const [,motto]=mottos[0];
    answer=chinese?`樹德科技大學的校訓是「${motto}」。`:`Shu-Te University lists its motto as 「${motto}」.`;
  }else{
    const approvals=[...snapshot.excerpt.matchAll(/民國([1-9]\d{1,2})年奉准設校招生/gu)];
    if(approvals.length!==1)return null;
    const rocYear=Number(approvals[0][1]);
    answer=chinese?`樹德科技大學於民國${rocYear}年（西元${rocYear+1911}年）獲准設校招生。`
      :`Shu-Te University says it received approval to establish the school and admit students in ${rocYear+1911} (ROC year ${rocYear}).`;
    if(request==='founding-and-mission'){
      if(!snapshot.excerpt.includes('培養兼具人文與科技、組織領導與問題解決能力的專業人才')
        ||!snapshot.excerpt.includes('落實現代大學理論與實務之平衡發展'))return null;
      answer+=' Its educational mission emphasizes the humanities, technology, leadership, and problem-solving, and balancing theory with practice.';
    }
  }
  const title=chinese?'關於樹德':'About Shu-Te University';
  const provenance=chinese?`擷取日期：${page.capturedOn}`:`Source snapshot: ${page.capturedOn}.`;
  return {status:'answered',answer:`${answer}\n\n[${title}](${page.route}) · ${provenance}`,
    citations:[{chunkId:context.evidence.id,claim:answer,title,sourceName:`Public page snapshot · ${page.capturedOn}`,
      url:page.route,locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,capturedOn:page.capturedOn,contentAvailable:true}};
}

async function captureBytes(response) {
  if(!response.body||Number(response.headers.get('content-length'))>maxCaptureBytes)throw new Error('capture_size');
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try {
    while(true) {
      const part=await reader.read();
      if(part.done)break;
      size+=part.value.byteLength;
      if(size>maxCaptureBytes)throw new Error('capture_size');
      chunks.push(part.value);
    }
  } catch(error) { await reader.cancel().catch(()=>{});throw error; }
  finally { reader.releaseLock(); }
  if(!size)throw new Error('capture_empty');
  return Buffer.concat(chunks,size);
}

/** Only a checksum-pinned, already-public local snapshot can be read here.
 * A missing body still permits honest manifest metadata, never invented text. */
export async function loadPublicPageContext(route,deadline,dependencies={}) {
  const page=publicPageForRoute(route,dependencies.captures);
  if(!page)return null;
  const metadata={
    pageTitle:page.title,titleSource:page.title?'manifest':'unavailable',localUrl:page.route,originalSource:page.source,capturedOn:page.capturedOn,
    provenance:'Saved public page snapshot, not a live school source or authenticated account record.',
    coverage:'Title, local URL and capture date are manifest metadata. Body facts require contentAvailable=true and support in the excerpt. A truncated excerpt cannot establish that an item is absent from the full page. This public source cannot establish any signed-in user record.',
    contentAvailable:false,contentStatus:'unavailable',excerpt:'',excerptTruncated:false,
    totalCharacters:null,includedCharacters:0,
  };
  try {
    if(!Number.isFinite(deadline)||deadline-Date.now()<750)throw new Error('capture_deadline');
    const url=captureOrigin()+page.file;
    const response=await (dependencies.fetchCapture||fetch)(url,{
      redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now()))),
      headers:{Accept:'text/html'},
    });
    if(!response.ok||response.redirected||(response.url&&response.url!==url))throw new Error('capture_response');
    const bytes=await captureBytes(response);
    if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw new Error('capture_checksum');
    const extracted=await detectAndExtractSource(bytes,'text/html',page.source);
    if(!metadata.pageTitle&&extracted.title?.trim()) { metadata.pageTitle=extracted.title.trim().slice(0,1000);metadata.titleSource='verified_snapshot'; }
    const content=extracted.sections.map(section=>section.content).join('\n');
    if(!content.trim())throw new Error('capture_unreadable');
    metadata.contentAvailable=true;
    metadata.contentStatus='verified_snapshot';
    metadata.excerpt=content.slice(0,maxExcerptCharacters);
    metadata.excerptTruncated=content.length>metadata.excerpt.length;
    metadata.totalCharacters=content.length;
    metadata.includedCharacters=metadata.excerpt.length;
  } catch {
    // Deliberately omit infrastructure details and unknown/unverified bytes.
    metadata.contentStatus='metadata_only';
  }
  const id='public-page:'+createHash('sha256').update(page.route).digest('hex').slice(0,24);
  return {
    page:{title:metadata.pageTitle,route:page.route,source:page.source,capturedOn:page.capturedOn},
    contentAvailable:metadata.contentAvailable,
    evidence:{id,title:metadata.pageTitle||page.route,url:page.route,urls:[page.route],capturedOn:page.capturedOn,content:JSON.stringify(metadata)},
  };
}

/** Budget the entire serialized evidence wrapper, not a raw JSON substring.
 * All page identity/provenance fields survive; only the explicitly marked
 * text excerpt can shrink. A metadata overflow is not an empty page. */
export function boundedPublicPageEvidence(context,{budget=6000}={}) {
  if(!Number.isInteger(budget)||budget<1024)throw new RangeError('Public page evidence budget is too small.');
  const source=context?.evidence;
  const metadata=JSON.parse(source?.content||'null');
  if(!source||!metadata||Array.isArray(metadata)||typeof metadata!=='object'||typeof metadata.excerpt!=='string')throw new TypeError('Public page evidence must contain structured snapshot metadata.');
  const characters=Array.from(metadata.excerpt);
  const render=length=>{
    const excerpt=characters.slice(0,length).join('');
    const excerpted=metadata.excerptTruncated===true||length<characters.length;
    return {...source,content:JSON.stringify({...metadata,excerpt,excerptTruncated:excerpted,excerpted,includedCharacters:excerpt.length})};
  };
  const size=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
  if(size(render(0))>budget)throw new RangeError('Public page metadata does not fit the evidence budget.');
  let low=0,high=characters.length;
  while(low<high){const middle=Math.ceil((low+high)/2);if(size(render(middle))<=budget)low=middle;else high=middle-1;}
  return render(low);
}

export function publicPageCandidate(context,question,{summary}={}) {
  const chinese=/[\u3400-\u9fff]/.test(question);
  const {page,evidence,contentAvailable}=context;
  const title=(page.title||(chinese?'目前公開頁面':'this public page')).replace(/[\\[\]]/g,'\\$&');
  const link=`[${title}](${page.route})`;
  const snapshot=chinese?`擷取日期：${page.capturedOn}`:`Source snapshot: ${page.capturedOn}`;
  const body=contentAvailable&&typeof summary==='string'
    ?summary.split('\n').filter(line=>!/^(?:Source snapshot:\s*|擷取日期[：:]\s*)\d{4}-\d{2}-\d{2}[.。]?$/iu.test(line.trim())).join('\n').trim():'';
  const answer=(chinese?`這個頁面是 ${link}，為已儲存的學校公開頁面。`:`This is ${link}, a saved public school page.`)
    +(body?`\n\n${body}`:'')
    +`\n\n${snapshot}`
    +(contentAvailable&&summary===null?(chinese?'\n\n已核對頁面資訊，但未能驗證內文摘要。':'\n\nI could verify the page details, but I could not verify a summary of its contents.'):'')
    +(page.title?'':(chinese?'\n\n儲存的資料中沒有可核對的頁面標題。':'\n\nNo page title is available in the saved metadata.'))
    +(contentAvailable?'':(chinese?`\n\n目前只能核對${page.title?'頁面標題、':''}連結與擷取日期；頁面內文暫時無法讀取，因此不能確認內文細節。`:`\n\nI can verify the ${page.title?'page title, ':''}link and capture date, but the saved page text is unavailable, so I cannot verify its content details.`));
  return {status:'answered',answer,citations:[{
    chunkId:evidence.id,claim:body?'Saved page identity, capture date and content.':'Saved public page identity and capture date.',title:page.title,
    sourceName:`Public page snapshot · ${page.capturedOn}`,url:page.route,locator:null,effectiveAt:null,reviewedAt:null,
  }],suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,capturedOn:page.capturedOn,contentAvailable},
  activity:[{kind:'page-context',label:chinese?'已核對目前頁面':'Checked the current page',detail:contentAvailable?(chinese?'已讀取並核對儲存的公開頁面。':'Read and checked the saved public page.'):(chinese?'已核對公開頁面資料；內文暫時無法讀取。':'Checked public page metadata; page text is unavailable.'),status:contentAvailable?'complete':'unavailable'}]};
}
