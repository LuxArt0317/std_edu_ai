import {readElearningPageMetadata} from './elearning.js';

const categoryLimit=128;
const ownerPattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff]/u;
const int32=value=>Number.isInteger(value)&&value>=1&&value<=2147483647;
const text=(value,limit)=>typeof value==='string'&&value.trim()!==''&&[...value].length<=limit&&!controls.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const categoryKeys=['id','parentId','title','sourceCount'];
const noticeKeys=['id','title','body'];
const metadataKeys=['userId','view','id','categories','notice'];
const fold=value=>value.normalize('NFKC').trim().toLowerCase();

function projectCategories(source,selection){
  if(!Array.isArray(source)||source.length>categoryLimit)return null;
  const rows=new Map();
  for(const item of source){
    if(!exact(item,categoryKeys)||!int32(item.id)||(item.parentId!==null&&!int32(item.parentId))||
      !text(item.title,200)||(item.sourceCount!==null&&item.sourceCount!==0&&!int32(item.sourceCount))||rows.has(item.id))return null;
    rows.set(item.id,item);
  }
  const root=selection.id;
  if(root!==null&&!rows.has(root))return rows.size?null:{state:'missing'};
  const pathFrom=row=>{
    const chain=[],seen=new Set();
    let current=row;
    while(current){
      if(seen.has(current.id))return null;
      seen.add(current.id);
      chain.unshift(current);
      if(current.id===root||root===null&&current.parentId===null)return chain;
      current=rows.get(current.parentId);
    }
    return null;
  };
  // Verify the complete branch before rendering any title or parent links.
  if(root!==null&&rows.has(rows.get(root).parentId))return null;
  const paths=new Map();
  for(const row of rows.values()){
    const path=pathFrom(row);
    if(!path)return null;
    paths.set(row.id,path);
  }
  if(selection.mode==='category-title')return {state:'ok',category:rows.get(root)};
  if(selection.mode==='category-children'){
    const children=new Map();
    for(const row of rows.values()){
      const group=children.get(row.parentId)??[];
      group.push(row);
      children.set(row.parentId,group);
    }
    const descend=(id,depth,result)=>{
      for(const child of children.get(id)??[]){
        result.push({...child,depth});
        descend(child.id,depth+1,result);
      }
      return result;
    };
    return {state:'ok',category:rows.get(root),children:descend(root,0,[])};
  }
  const matches=selection.label?[...rows.values()].filter(row=>fold(row.title)===fold(selection.label)):[];
  return {state:'ok',roots:[...rows.values()].filter(row=>row.parentId===null),
    location:matches.length===1?paths.get(matches[0].id):null,matchCount:matches.length};
}

/** Project only fields the selected view can render. A rejected response must
 * remain unavailable, distinct from an exact scope returning zero rows. */
export async function readElearningMetadataEvidence(account,selection,deadline){
  if(!ownerPattern.test(account.user?.id??''))return null;
  const requestDeadline=Math.min(deadline??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
  if(!Number.isSafeInteger(requestDeadline)||requestDeadline<=Date.now())return null;
  try{
    const view=selection.mode==='category-title'?'category_title':selection.view;
    const response=await readElearningPageMetadata({...account,requestDeadline},{view,id:selection.id});
    if(!exact(response,metadataKeys))return null;
    if(selection.view==='notice'){
      if(!Array.isArray(response.categories)||response.categories.length)return null;
      const notice=response.notice;
      if(notice===null)return {state:'missing'};
      if(!exact(notice,noticeKeys)||notice.id!==selection.id||!text(notice.title,240)||(notice.body!==null&&!text(notice.body,4000)))return null;
      return {state:'ok',notice};
    }
    if(response.notice!==null)return null;
    if(view==='category_title'&&response.categories?.length>1)return null;
    return projectCategories(response.categories,selection);
  }catch{return null;}
}
