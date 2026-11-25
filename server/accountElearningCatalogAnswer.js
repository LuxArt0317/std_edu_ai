import {runAnswerVerification} from './answerVerification.js';
import {readElearningCatalogPage} from './elearningCatalogPageEvidence.js';
import {selectElearningCatalogPage} from './elearningCatalogPageIntent.js';
import {selectElearningMetadata} from './elearningMetadataIntent.js';
import {readElearningMetadataEvidence} from './elearningMetadataEvidence.js';

const sourceId='account:elearningCatalog';
const metadataId='account:elearningMetadata';
const wording=question=>{
  const han=question.match(/\p{Script=Han}/gu)?.length??0;
  const englishWords=question.match(/[A-Za-z]{2,}/gu)?.length??0;
  return (english,chinese)=>han>englishWords?chinese:english;
};
const link=(title,url)=>'['+title+']('+url+')';
const localGrounding={source:'account',webSearched:false};
const inertLabel=value=>value.replace(/[\u0009\u000a\u000d\u2028\u2029]+/gu,' ')
  .replace(/[&<>"'\x60*_[\]()#!~|:@.\\]/gu,char=>'&#'+char.charCodeAt(0)+';');

export function elearningCatalogBoundary(question,selection,signedIn){
  const say=wording(question);
  if(signedIn)return {status:'clarification',
    answer:say('Open the exact Digital Academy search or category page and ask again.','請開啟確切的數位學園搜尋或類別頁面後再詢問。'),
    citations:[],suggestedQuestions:[],grounding:localGrounding};
  const title=say('Sign in to view this Digital Academy catalog page','登入數位學園查看課程頁面');
  const url='/elearning/login?next='+encodeURIComponent(selection?.path??'/elearning/categories');
  return {status:'handoff',answer:link(title,url),
    citations:[{chunkId:'directory:elearning-catalog',title,url,sourceName:'Digital Academy'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

export function elearningMetadataBoundary(question,selection,signedIn){
  const say=wording(question);
  if(signedIn)return {status:'clarification',
    answer:say('Open the exact Digital Academy category or notice page and ask again.','請開啟確切的數位學園類別或公告頁面後再詢問。'),
    citations:[],suggestedQuestions:[],grounding:localGrounding};
  const title=say('Sign in to view this Digital Academy page','登入數位學園查看此頁面');
  const url='/elearning/login?next='+encodeURIComponent(selection?.path??'/elearning/categories');
  return {status:'handoff',answer:link(title,url),
    citations:[{chunkId:'directory:elearning-metadata',title,url,sourceName:'Digital Academy'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

function catalogDraft(question,selection,packet){
  if(packet.length!==1||packet[0].id!==sourceId||packet[0].url!==selection.path)throw new TypeError('Invalid catalog evidence.');
  const {total,pageCount,listedCount,emptyReason,courses}=JSON.parse(packet[0].content);
  const {page,mode,categoryId}=selection;
  const say=wording(question);
  const title=say('Open this Digital Academy catalog page','開啟這個數位學園課程頁面');
  const lines=[];
  if(emptyReason==='no_matching_courses')lines.push(categoryId===null
    ?say('No saved courses match this search.','這次搜尋找不到符合的已儲存課程。')
    :say('The catalog returned no saved courses for this category filter.','此類別篩選條件查無已儲存課程。'));
  else if(emptyReason==='past_last_page')lines.push(
    say(`Page ${page} has no courses. The last page is ${pageCount}.`,`第 ${page} 頁沒有課程。最後一頁是第 ${pageCount} 頁。`));
  else if(mode==='list'||mode==='both'){
    lines.push(say(`Courses on page ${page} of ${pageCount}.`,`第 ${page} 頁課程，共 ${pageCount} 頁。`));
    lines.push(courses.map(row=>{
      if(!/^\/elearning\/course\/[1-9]\d{0,9}$/u.test(row.url))throw new TypeError('Wrong catalog course link.');
      return '- '+link(inertLabel(row.title),row.url);
    }).join('\n'));
  }
  if(mode==='both'||mode==='total-count')lines.push(say(`The catalog has ${total} matching courses.`,`符合條件的課程總數為 ${total} 門。`));
  if(mode==='both'||mode==='page-count')lines.push(say(`There are ${listedCount} courses on this page.`,`本頁有 ${listedCount} 門課程。`));
  lines.push(link(title,selection.path));
  return {status:'answered',answer:lines.join('\n\n'),
    citations:[{chunkId:sourceId,title,url:selection.path,sourceName:'Digital Academy catalog'}],
    suggestedQuestions:[],grounding:localGrounding};
}

function metadataDraft(question,selection,packet){
  if(packet.length!==1||packet[0].id!==metadataId||packet[0].url!==selection.path)throw new TypeError('Invalid Digital Academy page evidence.');
  const data=JSON.parse(packet[0].content);
  const say=wording(question);
  const title=say('Open this Digital Academy page','開啟這個數位學園頁面');
  const categoryUrl=row=>'/elearning/category/'+row.id;
  const categoryLink=row=>link(inertLabel(row.title),categoryUrl(row));
  const displayedCategory=row=>categoryLink(row)+(row.sourceCount===null?'':' ('+row.sourceCount+')');
  const lines=[];
  if(data.state==='missing')lines.push(selection.view==='notice'
    ?say('This notice could not be verified. No saved notice matched this page.','無法查核此公告。此頁面沒有相符的已儲存公告。')
    :say('No saved category matched this page.','此頁面沒有相符的已儲存類別。'));
  else if(selection.mode==='category-title')lines.push(say('This category is called ','這個課程類別的名稱是')+inertLabel(data.category.title)+say('.','。'));
  else if(selection.mode==='category-children'){
    lines.push(say('Subcategories below ','以下是子類別，所屬類別為')+categoryLink(data.category)+'.');
    lines.push(data.children.length?data.children.map(row=>'  '.repeat(row.depth)+'- '+displayedCategory(row)).join('\n')
      :say('This category has no saved subcategories.','此類別沒有已儲存的子類別。'));
  }else if(selection.mode==='category-index'){
    lines.push(say('Main course categories','主要課程類別'));
    lines.push(data.roots.length?data.roots.map(row=>'- '+displayedCategory(row)).join('\n')
      :say('There are no saved course categories.','沒有已儲存的課程類別。'));
    if(selection.label)lines.push(data.location
      ?say('Category location is ','類別位置為')+data.location.map(categoryLink).join(' › ')+'.'
      :data.matchCount?say('More than one category matches that name.','有多個類別符合該名稱。')
        :say('No saved category matches that name.','沒有相符名稱的已儲存類別。'));
  }else{
    const {body, title:noticeTitle}=data.notice;
    lines.push('**'+inertLabel(noticeTitle)+'**');
    if(selection.mode==='notice-deadline'){
      lines.push(body===null?say('The saved local notice does not specify a deadline.','本站儲存的公告未提供截止日期。')
        :say('I could not verify a deadline from the saved text.','無法從本站儲存的內文確認截止日期。'));
    }else if(selection.mode==='notice-transition'){
      const transition=body&&/遠距教學.{0,30}轉入\s*TronClass/iu.test(body)&&/\d{2,3}\s*學年度第\s*[12]\s*學期/u.test(body);
      if(!transition)lines.push(say('The saved notice text does not establish a semester for the TronClass transition.','儲存的公告內文無法確認哪個學期轉入 TronClass。'));
    }else if(body===null)lines.push(say('The saved page contains the notice title only.','本站只儲存此公告的標題。'));
    if(body!==null)lines.push(say('Saved notice text follows.','以下為儲存的公告內文。'),inertLabel(body));
  }
  lines.push(link(title,selection.path));
  return {status:'answered',answer:lines.join('\n\n'),
    citations:[{chunkId:metadataId,title,url:selection.path,sourceName:'Digital Academy'}],
    suggestedQuestions:[],grounding:localGrounding};
}

/** Keep credentials and evidence in request closures. The shared graph keeps
 * only its usual attempt and verdict state. */
async function verifyPage({account,selection,question,deadline,onProgress,source,read,format,label}){
  const caller=Object.freeze({...account,user:Object.freeze({id:account.user.id})});
  const activity=new Map();
  const progress=step=>{
    activity.set(step.kind,step);
    try{onProgress?.(step);}catch{/* Closed response stream. */}
  };
  const draft=packet=>format(question,selection,packet);
  const load=async attempt=>{
    const kind=source+':'+attempt;
    const name='account-read:'+kind.slice('account:'.length);
    progress({kind:name,label,detail:'Checking the exact page and its saved records.',status:'running'});
    const data=await read(caller);
    if(!data){
      progress({kind:name,label,detail:'The selected page could not be verified.',status:'unavailable'});
      return [];
    }
    progress({kind:name,label,detail:'The selected page and returned records were checked.',status:'complete'});
    return [{id:source,url:selection.path,content:JSON.stringify(data)}];
  };
  const first=await load(1);
  const initial=first.length?draft(first):{status:'abstained',answer:'',citations:[],grounding:localGrounding};
  const result=await runAnswerVerification({
    question,initialAnswer:initial,deadline,onProgress:progress,
    loadEvidence:({attempt})=>attempt===1?Promise.resolve(first):load(attempt),
    verify:async ({candidate,evidence})=>{
      if(!evidence.length)return {ok:false,reason:'evidence_unavailable'};
      const supported=draft(evidence);
      return {ok:candidate.status===supported.status&&candidate.answer===supported.answer&&
        JSON.stringify(candidate.citations)===JSON.stringify(supported.citations)};
    },
    repair:async ({evidence})=>evidence.length?draft(evidence):initial,
  });
  return {...result,activity:[...activity.values()]};
}

export async function answerElearningCatalog({account,question,route,deadline,onProgress}){
  const selection=selectElearningCatalogPage(question,route);
  if(!selection)throw new TypeError('Invalid catalog page selection.');
  return verifyPage({account,question,selection,deadline,onProgress,source:sourceId,format:catalogDraft,label:'Checking the Digital Academy catalog page',
    read:async caller=>{
      const result=await readElearningCatalogPage(caller,{question,route:selection.path,deadline});
      if(!result||!['ok','empty_page'].includes(result.state))return null;
      const {total,pageCount,listedCount,emptyReason,courses}=result;
      return {total,pageCount,listedCount,emptyReason,courses};
    }});
}

export async function answerElearningMetadata({account,question,route,deadline,onProgress}){
  const selection=selectElearningMetadata(question,route);
  if(!selection)throw new TypeError('Invalid Digital Academy metadata selection.');
  return verifyPage({account,question,selection,deadline,onProgress,source:metadataId,format:metadataDraft,
    label:'Checking saved Digital Academy page information',
    read:caller=>readElearningMetadataEvidence(caller,selection,deadline)});
}
