const login='/school-affairs/login';
const portal='/school-affairs';
const search=portal+'/search';
const callback=portal+'/auth/callback';
const signOut=portal+'/signed-out';
const privacy=portal+'/privacy';
const saml='/auth/realms/stuarm/protocol/saml';
const preview='/student-sso';
const directory='/campus-directory';
const copies='/local-pages';
const entries=new Map([
  ['/ePortal/index.asp','portal'],['/ePortal/login.asp','login'],['/ePortal/apMenu.asp','search'],
  [login,'native-login'],
  [saml,'saml'],[preview,'preview'],[callback,'callback'],[signOut,'sign-out'],[privacy,'privacy'],
  [directory,'campus-directory'],[copies,'copied-pages'],
]);

function exactPage(route){
  if(typeof route!=='string')return null;
  const local=route.startsWith('https://stu.best/')?route.slice('https://stu.best'.length):route;
  const path=local.split(/[?#]/u,1)[0].replace(/\/$/u,'');
  const kind=entries.get(path);
  if(kind==='native-login'){
    const query=local.indexOf('?');
    const returns=query<0?[]:new URLSearchParams(local.slice(query+1).split('#',1)[0]).getAll('next');
    if(returns.length>1||returns.length&&returns[0]!==portal&&returns[0]!==search)return null;
    return {path:returns[0]===search?login+'?next='+encodeURIComponent(search):login,kind,returnTo:returns[0]??portal};
  }
  return kind?{path,kind}:null;
}

export function privateCampusTransitionPath(route){
  const page=exactPage(route);
  return page?.kind==='callback'||page?.kind==='saml'?page.path:null;
}

const entryQuestion=/^(?:where does this (?:link|shortcut|page) (?:take|send) me|what does this (?:link|shortcut|page) open|what page opens (?:here|after i (?:sign|log) in)|(?:這個|此)(?:連結|捷徑)會(?:帶我去哪裡|開啟哪個頁面))$/iu;
const loginQuestion=/^(?:how (?:do|can|should) i (?:sign|log) in(?: (?:here|on this page|to school affairs))?|which (?:button|account) should i use to (?:sign|log) in|(?:請問)?(?:我該|我可以)?(?:如何|怎麼)(?:在這裡)?登入(?:校務系統)?)$/iu;

/** The callback and old SAML entry never forward provider parameters or typed
 * text into retrieval. Other guidance is limited to explicit page questions. */
export function campusEntryIntent(question,route){
  const page=exactPage(route);
  if(!page)return null;
  if(page.kind==='callback'||page.kind==='saml')return {...page,topic:page.kind};
  if(typeof question!=='string'||question.length>220||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(question))return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'');
  const nav=entryQuestion.test(text);
  let topic;
  switch(page.kind){
    case 'portal':case 'login':case 'preview':case 'native-login':
      if(nav||loginQuestion.test(text))topic=page.kind;
      break;
    case 'search':
      if(nav||/^(?:what does (?:the )?keyword field(?: on this page)? search|how (?:do|can) i (?:find a system|search (?:on )?this page)|(?:這個頁面|此頁)的?關鍵字(?:欄位)?(?:可以)?搜尋什麼)$/iu.test(text))topic='search';
      break;
    case 'sign-out':
      if(nav||/^(?:what happens (?:here )?when i sign out|what does (?:this )?sign-out page do|how (?:do|can) i sign out here|登出後會去哪裡|這個登出頁面會做什麼)$/iu.test(text))topic='sign-out';
      break;
    case 'privacy':
      if(/^(?:what (?:information|data) does google share (?:with (?:stu\.best|this site)|when i sign in)|can (?:stu\.best|this site) (?:read|access) my gmail(?: (?:messages|inbox|mailbox))?|google 登入會分享哪些資料|網站可以讀我的 gmail 嗎)$/iu.test(text))topic='google-data';
      if(/^(?:what records can this assistant access after sign-in|what records can the assistant read here|登入後助理可以查詢哪些資料)$/iu.test(text))topic='record-scope';
      break;
    case 'campus-directory':
      if(nav||/^(?:how (?:do|can) i (?:use (?:the )?(?:campus directory|campus navigation)|find a campus route)|如何使用校園導覽|怎麼建立校園路線)$/iu.test(text))topic='campus-directory';
      break;
    case 'copied-pages':
      if(nav||/^(?:how (?:do|can) i (?:find|search) (?:the )?(?:copied (?:local )?school pages|local school pages)|如何搜尋本地校園頁面|怎麼搜尋校園頁面)$/iu.test(text))topic='copied-pages';
      break;
  }
  return topic?{...page,topic}:null;
}

export function answerCampusEntry(question,selection,signedIn){
  const zh=(question.match(/\p{Script=Han}/gu)?.length??0)>(question.match(/[A-Za-z]{2,}/gu)?.length??0);
  const say=(en,cn)=>zh?cn:en;
  const signInTitle=say('Open School Affairs sign-in','開啟校務系統登入');
  const links=[];
  const signIn=(url=login)=>links.push({title:signInTitle,url});
  let text;
  let status='answered';
  switch(selection.topic){
    case 'native-login':case 'portal':case 'login':
      if(selection.returnTo===search){
        text=signedIn
          ?say('Your verified stu.best session opens the School Affairs system search.','可使用目前已驗證的 stu.best 登入開啟校務系統搜尋。')
          :say('Choose Continue with Google to return to the School Affairs system search.','選擇 Continue with Google，登入後會回到校務系統搜尋。');
        if(!signedIn)signIn(selection.path);
        links.push({title:say('Open School Affairs system search','開啟校務系統搜尋'),url:search});
      }else if(signedIn){
        text=say('Your verified stu.best session opens the School Affairs home page.','可使用目前已驗證的 stu.best 登入開啟校務系統首頁。');
        links.push({title:say('Open School Affairs','開啟校務系統'),url:portal});
      }else{
        text=say('Open the stu.best School Affairs sign-in and choose Continue with Google.','開啟 stu.best 校務系統登入頁並選擇 Continue with Google。');
        signIn();
      }
      break;
    case 'search':
      if(!signedIn)signIn(login+'?next='+encodeURIComponent(search));
      text=say('This shortcut opens the School Affairs system search. Enter a service name or category in the keyword field.','此捷徑會開啟校務系統搜尋，可在系統名稱關鍵字欄位輸入服務名稱或分類。');
      links.push({title:say('Open School Affairs system search','開啟校務系統搜尋'),url:search});
      break;
    case 'callback':
      status='handoff';
      text=say('Your browser completes Google sign-in on this page. If it does not finish, return to School Affairs sign-in and start again.','此頁由瀏覽器完成 Google 登入。如果流程未完成，請回到校務系統登入頁重新開始。');
      signIn();
      break;
    case 'sign-out':
      text=say('This page ends the School Affairs session shared with DTM and Digital Academy. When sign-out succeeds, it returns to School Affairs sign-in.','此頁會結束校務系統、數位教材網與數位學園共用的登入。登出成功後會回到校務系統登入頁。');
      signIn();
      break;
    case 'saml':case 'preview':
      text=say('This shortcut opens the mySTU visual preview. Its account and password fields are disabled. For stu.best, use the separate School Affairs Google sign-in.','此捷徑會開啟 mySTU 介面預覽，帳號和密碼欄位均已停用。登入 stu.best 請使用校務系統的 Google 登入。');
      links.push({title:say('Open mySTU preview','開啟 mySTU 預覽'),url:preview});
      signIn();
      break;
    case 'google-data':
      text=say('Google shares your name, email address and profile picture for sign-in. The app requests no access to your Gmail mailbox, contacts, Drive or calendar. Enter your Google password only on Google.','Google 登入會分享姓名、電子郵件和頭像。本站不要求存取 Gmail 信箱、聯絡人、雲端硬碟或日曆。請只在 Google 頁面輸入密碼。');
      links.push({title:say('Read sign-in privacy','閱讀登入隱私說明'),url:privacy});
      break;
    case 'record-scope':
      text=say('After sign-in, the assistant can check personal DTM and service records saved under your account on stu.best. The university’s own services handle official enrollments, grades, applications and submissions.','登入後，助理可以查詢儲存在 stu.best 帳戶下的個人教材與服務紀錄。正式選課、成績、申請及提交由校方服務處理。');
      links.push({title:say('Read sign-in privacy','閱讀登入隱私說明'),url:privacy});
      break;
    case 'campus-directory':
      text=say('Open 校園導覽, choose an origin and destination, then select 建立文字路線. The directory uses verified locations and routes.','開啟校園導覽，選擇起點與目的地，再按建立文字路線。導覽使用已驗證的校園地點與路線。');
      links.push({title:say('Open campus directory','開啟校園導覽'),url:directory});
      break;
    case 'copied-pages':
      text=say('Use Search copied pages to filter the public copies by title, source, or indexed text. Select a result to open its local copy.','使用「搜尋頁面」依標題、來源或索引內文篩選公開頁面的副本。選擇結果即可開啟本地頁面。');
      links.push({title:say('Browse copied school pages','瀏覽校園頁面副本'),url:copies});
      break;
    default: throw new TypeError('Unknown campus guidance topic.');
  }
  return {status,answer:[text,...links.map(({title,url})=>'['+title+']('+url+')')].join('\n\n'),
    citations:links.map((row,index)=>({...row,chunkId:'directory:campus-entry:'+selection.kind+':'+index,sourceName:'stu.best campus navigation'})),
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
