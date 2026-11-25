import {readElearningCatalog} from './elearning.js';
import {elearningCatalogPageSize,elearningCatalogScope,elearningCoursePath} from './elearningContract.js';

import {selectElearningCatalogPage} from './elearningCatalogPageIntent.js';
export {selectElearningCatalogPage} from './elearningCatalogPageIntent.js';

const controls=/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;
const int32=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
const ownAccount=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

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
