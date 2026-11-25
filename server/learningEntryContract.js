import {elearningPath,elearningServicePath} from './elearningContract.js';
import {elearningCatalogPageRoute} from './elearningCatalogPageIntent.js';

const dtm='/dtm';
const legacyDtm='/school-sites/dtm.stu.edu.tw';
const legacyElearning='/school-sites/elearning.stu.edu.tw';
const controls=/[\u0000-\u0020\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;
const dtmHomePaths=[dtm,dtm+'/dashboard',dtm+'/my',dtm+'/assignments',dtm+'/grades'];
const elearningHomePaths=[elearningPath,elearningPath+'/categories',elearningPath+'/my-courses'];
const dtmView=/^\/dtm\/course\/[A-Za-z0-9-]{1,72}(?:\/(?:materials|meetings|assignments|grades(?:\/overview)?|material\/[A-Za-z0-9-]{1,72}|assignment\/[A-Za-z0-9-]{1,72}(?:\/edit)?))?$/u;
const elearningView=/^\/elearning\/(?:notice\/([1-9]\d{0,9})|course\/([1-9]\d{0,9})(?:\/activity\/([1-9]\d{0,9}))?)$/u;
const entryKinds=new Map([
  [elearningPath+'/login','elearning-login'],
  [elearningServicePath,'elearning-service'],
  [legacyElearning,'elearning-legacy-home'],
  [legacyElearning+'/login/index.php','elearning-legacy-login'],
  [legacyElearning+'/course/index.php','elearning-legacy-category'],
  [dtm+'/login','dtm-login'],
  [dtm+'/login/index.php','dtm-login'],
  [legacyDtm+'/login/index.php','dtm-login'],
  [legacyDtm,'dtm-legacy-home'],
]);

/** Keep preserved return paths inside a mounted learning page. Both login
 * components and the assistant use this selection. */
export function learningLoginReturn(platform,value){
  const home=platform==='dtm'?dtm:elearningPath;
  if(typeof value!=='string'||value.length>3100||controls.test(value)||value.includes('\\'))return home;
  const [path,hash,...extra]=value.split('#');
  if(extra.length||hash!==undefined&&!/^[a-z0-9_-]{1,80}$/iu.test(hash))return home;
  if(platform==='dtm')return dtmHomePaths.includes(path)||dtmView.test(path)?value:home;
  const catalog=elearningCatalogPageRoute(path);
  if(catalog&&path.startsWith(elearningPath+'/')&&!(hash&&path.includes('?')))return catalog.path+(hash?'#'+hash:'');
  const matched=elearningView.exec(path);
  return elearningHomePaths.includes(path)||matched&&matched.slice(1).every(id=>id===undefined||Number(id)<=2147483647)
    ?value:home;
}

/** Map the copied DTM workspace to the same local record route used by DTM's
 * readers. Legacy entry pages keep their separate sign-in guidance. */
export function legacyDtmWorkspacePath(pathname){
  if(typeof pathname!=='string'||!pathname.startsWith(legacyDtm+'/'))return null;
  const path=dtm+pathname.slice(legacyDtm.length).replace(/\/$/u,'');
  return path!==dtm&&learningLoginReturn('dtm',path)===path?path:null;
}

/** Mirrors the existing router. The exact assistant entry map below is
 * deliberately limited to the mounted, meaningful legacy entry pages. */
export function legacyElearningDestination(pathname,search){
  if(pathname.endsWith('/login/index.php'))return elearningPath+'/login';
  const category=onlySelector(search,'categoryid');
  return pathname.endsWith('/course/index.php')&&/^[1-9]\d{0,8}$/u.test(category??'')
    ?elearningPath+'/category/'+category:elearningPath;
}

const onlySelector=(search,key)=>{
  if(!search||/%(?![0-9a-f]{2})/iu.test(search))return null;
  try{decodeURIComponent(search);}catch{return null;}
  const params=new URLSearchParams(search);
  return params.getAll(key).length===1?params.get(key):null;
};
const withReturn=(login,destination)=>login+'?next='+encodeURIComponent(destination);

export function learningLoginReturnFromQuery(platform,search){
  return learningLoginReturn(platform,onlySelector(search,'next'));
}

export function learningEntryRoute(route){
  if(typeof route!=='string'||route.length>3100||controls.test(route)||/[\\#]/u.test(route))return null;
  const local=route.startsWith('https://stu.best/')?route.slice('https://stu.best'.length):route;
  const at=local.indexOf('?');
  const path=(at<0?local:local.slice(0,at)).replace(/\/$/u,'');
  const search=at<0?'':local.slice(at+1);
  const kind=entryKinds.get(path);
  if(!kind)return null;
  const platform=kind.startsWith('dtm')?'dtm':'elearning';
  const home=platform==='dtm'?dtm:elearningPath;
  const login=home+'/login';
  let destination=home,guest=login,context=path;
  if(kind==='elearning-login'||kind==='dtm-login'){
    destination=learningLoginReturnFromQuery(platform,search);
    if(destination!==home){
      guest=withReturn(login,destination);
      context=withReturn(path,destination);
    }
  }else if(kind==='elearning-service'){
    guest=withReturn('/school-affairs/login',elearningServicePath);
  }else if(kind==='elearning-legacy-home'){
    guest=withReturn(login,home);
  }else if(kind==='elearning-legacy-category'){
    const category=onlySelector(search,'categoryid');
    const categoryQuery=category?new URLSearchParams({categoryid:category}).toString():'';
    destination=legacyElearningDestination(path,categoryQuery);
    guest=withReturn(login,destination);
    if(destination!==home)context=path+'?'+categoryQuery;
  }
  return {context,platform,kind,destination,guest};
}

export function learningEntryIntent(question,route){
  if(typeof question!=='string'||question.length>220||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(question))return null;
  const page=learningEntryRoute(route);
  if(!page)return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'');
  const concerned=/^(?:do i (?:need to )?(?:enter|use) my (?:school|university|moodle) password here|does this (?:login|sign-in|sign in) (?:ask for|use) my (?:school|university|moodle) password|我需要(?:在這裡)?輸入(?:學校|校務|Moodle)密碼嗎|這裡要(?:用|輸入)(?:學校|校務)密碼嗎)$/iu.test(text);
  const navigation=/^(?:where (?:does this (?:link|shortcut|page) (?:take|send) me|will i (?:go|land) after (?:signing in|logging in))|what (?:page opens after i (?:sign|log) in|does this (?:link|shortcut) open)|(?:這個|這條|此)(?:連結|捷徑)會(?:帶我去哪裡|開啟哪個頁面)|登入後會(?:去哪裡|回到哪個頁面))$/iu.test(text);
  const instructions=/^(?:how (?:do|can|should) i (?:sign|log) in(?: (?:here|on this page|to (?:dtm|digital teaching materials|digital academy|(?:this )?moodle)))?|which (?:button|account) should i use to (?:sign|log) in|(?:請問)?(?:我要|我該|我可以)?(?:如何|怎麼)(?:在這裡)?登入(?:數位學園|數位教材網|Moodle)?|我應該用哪個帳號登入)$/iu.test(text);
  return concerned||navigation||instructions?{...page,topic:concerned?'credentials':navigation?'destination':'login'}:null;
}

export function answerLearningEntry(question,selection,signedIn){
  const zh=(question.match(/\p{Script=Han}/gu)?.length??0)>(question.match(/[a-z]{2,}/giu)?.length??0);
  const say=(en,cn)=>zh?cn:en;
  const name=selection.platform==='dtm'?say('Digital Teaching Materials','數位教材網'):say('Digital Academy','數位學園');
  const url=signedIn?selection.destination:selection.guest;
  const title=signedIn?say('Open '+name,'開啟'+name):selection.kind==='elearning-service'
    ?say('Sign in through School Affairs','使用校務系統登入')
    :say('Open '+name+' sign-in','開啟'+name+'登入頁');
  const lines=[signedIn?say('Your verified stu.best Google session can open this learning page.','使用目前已驗證的 stu.best Google 登入，即可開啟此學習頁面。'):
    say('Open the stu.best sign-in page and choose Continue with Google.','開啟 stu.best 登入頁，選擇 Continue with Google。')];
  if(selection.topic==='credentials')lines.push(say('Enter your Google credentials only on Google. Official university services have their own sign-in.','請只在 Google 頁面輸入 Google 帳號密碼。校方正式服務使用各自的登入頁。'));
  lines.push('['+title+']('+url+')');
  const citations=[{chunkId:'directory:learning-entry:'+selection.platform,title,url,sourceName:'stu.best learning entry'}];
  if(!signedIn&&(selection.topic==='destination'||selection.kind==='elearning-service')){
    const arrival=say('Page after sign-in','登入後的頁面');
    lines.push('['+arrival+']('+selection.destination+')');
    citations.push({chunkId:'directory:learning-entry:return',title:arrival,url:selection.destination,sourceName:'stu.best learning entry'});
  }
  return {status:'answered',answer:lines.join('\n\n'),citations,suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
