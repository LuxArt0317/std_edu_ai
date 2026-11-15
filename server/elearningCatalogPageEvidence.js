import {readElearningCatalog} from './elearning.js';
import {elearningCatalogPageSize,elearningCatalogScope,elearningCoursePath} from './elearningContract.js';

const origin='https://stu.best';
const routePattern=/^(\/elearning\/(?:search|category\/([1-9]\d{0,9})))\/?(?:\?([^#]+))?$/u;
const pagePattern=/^[1-9]\d{0,3}$/u;
const controls=/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;
const int32=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
const ownAccount=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

function questionMode(question,categoryId){
  if(typeof question!=='string'||question.length>300||controls.test(question))return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'').toLowerCase();
  if(categoryId===null?/this category|(?:這個|此)類別/u.test(text):/this search|這次搜尋/u.test(text))return null;
  if(/^(?:(?:how many (?:matches|results|courses) are there|what is the total (?:match|result|course) count),? and (?:which (?:courses|results) are (?:on|shown on) this page|list (?:this page's courses|the results on this page))|(?:這|本)頁有哪些(?:課程|搜尋結果)[,，]?(?:共|總共)(?:有)?(?:幾門課程|幾筆結果))$/u.test(text))return 'both';
  if(/^(?:(?:how many (?:courses|results) (?:are (?:on|shown on) this page)|(?:這|本)頁(?:有)?(?:幾門課程|幾筆(?:搜尋)?結果)))$/u.test(text))return 'page-count';
  if(/^(?:how many (?:matches|results|courses) (?:are there|match this search|are (?:in this category|there in total))|what is the total (?:match|result|course) count|(?:這次搜尋|這個類別|此類別)(?:總)?共有(?:幾門課程|幾筆結果))$/u.test(text))return 'total-count';
  if(/^(?:(?:what|which) (?:courses|results) (?:does this page show|are (?:on|shown on|listed on) (?:this|the current) page)|(?:please )?(?:show|list) (?:me )?(?:the )?(?:courses|results) (?:on|shown on|listed on) (?:this|the current) page|(?:這|本)頁(?:顯示|列出)?有哪些(?:課程|(?:搜尋)?結果)|(?:請)?(?:顯示|列出)(?:這|本)頁的?(?:課程|(?:搜尋)?結果))$/u.test(text))return 'list';
  return null;
}

/** Keep the read bound to the same path, term and page that the catalog UI uses. */
export function selectElearningCatalogPage(question,route=''){
  if(typeof route!=='string'||route.length>3100)return null;
  const local=route.startsWith(origin+'/')?route.slice(origin.length):route;
  if(/[\\\s#]/u.test(local))return null;
  const match=routePattern.exec(local);
  if(!match)return null;
  const [,pathname,rawCategory,rawQuery='']=match;
  const categoryId=rawCategory===undefined?null:Number(rawCategory);
  if(categoryId!==null&&!int32(categoryId))return null;
  const mode=questionMode(question,categoryId);
  if(!mode)return null;
  try{
    if(controls.test(decodeURIComponent(rawQuery)))return null;
  }catch{return null;}
  const parameters=new URLSearchParams(rawQuery);
  const allowed=categoryId===null?['q','page']:['page'];
  if([...parameters.keys()].some(key=>!allowed.includes(key)||parameters.getAll(key).length!==1))return null;
  const rawPage=parameters.get('page')??'1';
  if(!pagePattern.test(rawPage)||Number(rawPage)>1000)return null;
  const rawTerm=parameters.get('q')??'';
  if(rawTerm.length>100)return null;
  return {path:pathname+(rawQuery?'?'+rawQuery:''),categoryId,query:rawTerm.trim(),page:Number(rawPage),mode};
}

function projectCatalog(result,selection,expectedOwner){
  const {total,courses}=result??{};
  if(result?.userId!==expectedOwner||!Number.isSafeInteger(total)||total<0||!Array.isArray(courses))return null;
  const offset=(selection.page-1)*elearningCatalogPageSize;
  const rowCount=Math.min(elearningCatalogPageSize,Math.max(0,total-offset));
  if(courses.length!==rowCount)return null;
  const term=selection.query.normalize('NFKC').toLowerCase();
  const ids=new Set();
  const projected=[];
  let previous=null;
  for(const row of courses){
    if(!int32(row?.id)||!int32(row?.category_id)||!int32(row?.position)||
      typeof row.title!=='string'||!row.title.trim()||[...row.title].length>200||controls.test(row.title)||
      (selection.categoryId!==null&&row.category_id!==selection.categoryId)||ids.has(row.id)||
      (term&&!row.title.normalize('NFKC').toLowerCase().includes(term))||
      (previous!==null&&(row.category_id<previous.category_id||
        (row.category_id===previous.category_id&&row.position<=previous.position))))return null;
    ids.add(row.id);
    previous=row;
    projected.push({title:row.title,url:elearningCoursePath(row.id)});
  }
  return {
    state:rowCount?'ok':'empty_page',
    emptyReason:rowCount?null:total?'past_last_page':'no_matching_courses',
    selection,total,pageCount:Math.ceil(total/elearningCatalogPageSize),listedCount:rowCount,
    courses:selection.mode==='list'||selection.mode==='both'?projected:[],
  };
}

/** Requires a verified School Affairs account from the calling handler. */
export async function readElearningCatalogPage(account,{question,route='',deadline}){
  const selection=selectElearningCatalogPage(question,route);
  if(!selection)return null;
  if(!account)return {state:'sign_in',selection};
  const unavailable={state:'unavailable',selection};
  if(!ownAccount.test(account.user?.id??''))return unavailable;
  const requestDeadline=Math.min(deadline??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
  if(!Number.isSafeInteger(requestDeadline)||requestDeadline<=Date.now())return unavailable;
  const {categoryId,query,page}=selection;
  try{
    const result=await readElearningCatalog({...account,requestDeadline},{
      scope:elearningCatalogScope,
      ...(categoryId===null?{term:query}:{category:String(categoryId)}),
      page:String(page),
    });
    return projectCatalog(result,selection,account.user.id)??unavailable;
  }catch{return unavailable;}
}
