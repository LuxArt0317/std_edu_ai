import {runAnswerVerification} from './answerVerification.js';
import {readElearningCatalogPage} from './elearningCatalogPageEvidence.js';
import {selectElearningCatalogPage} from './elearningCatalogPageIntent.js';

const sourceId='account:elearningCatalog';
const wording=question=> (english,chinese)=>/\p{Script=Han}/u.test(question)?chinese:english;
const link=(title,url)=>'['+title+']('+url+')';
const localGrounding={source:'account',webSearched:false};
const inertLabel=value=>value.replace(/[&<>"'\x60*_[\]()#!~|:\\]/gu,char=>'&#'+char.charCodeAt(0)+';');

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

/** Keep credentials and catalog evidence in request closures. The shared
 * verification graph receives only its usual attempt and verdict state. */
export async function answerElearningCatalog({account,question,route,deadline,onProgress}){
  const selection=selectElearningCatalogPage(question,route);
  if(!selection)throw new TypeError('Invalid catalog page selection.');
  const caller=Object.freeze({...account,user:Object.freeze({id:account.user.id})});
  const activity=new Map();
  const progress=step=>{
    activity.set(step.kind,step);
    try{onProgress?.(step);}catch{/* Closed response stream. */}
  };
  const draft=packet=>catalogDraft(question,selection,packet);
  const load=async attempt=>{
    const kind='account-read:elearningCatalog:'+attempt;
    const label='Checking the Digital Academy catalog page';
    progress({kind,label,detail:'Checking the exact catalog filter and page.',status:'running'});
    const result=await readElearningCatalogPage(caller,{question,route:selection.path,deadline});
    if(!result||!['ok','empty_page'].includes(result.state)){
      progress({kind,label,detail:'The catalog page could not be verified.',status:'unavailable'});
      return [];
    }
    const {total,pageCount,listedCount,emptyReason,courses}=result;
    progress({kind,label,detail:'The catalog filter, page and returned records were checked.',status:'complete'});
    return [{id:sourceId,url:selection.path,content:JSON.stringify({total,pageCount,listedCount,emptyReason,courses})}];
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
