import {elearningCatalogPageRoute} from './elearningCatalogPageIntent.js';

const origin='https://stu.best';
const controls=/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;
const localRoute=route=>typeof route!=='string'||route.length>3100?'':route.startsWith(origin+'/')?route.slice(origin.length):route;

export function elearningMetadataRoute(route){
  const local=localRoute(route);
  if(/^\/elearning\/categories\/?$/u.test(local))return {path:'/elearning/categories',view:'categories',id:null};
  const notice=/^\/elearning\/notice\/([1-9]\d{0,9})\/?$/u.exec(local);
  if(notice&&Number(notice[1])<=2147483647)return {path:'/elearning/notice/'+notice[1],view:'notice',id:Number(notice[1])};
  const catalog=elearningCatalogPageRoute(local);
  return catalog?.categoryId?{path:catalog.path,view:'category',id:catalog.categoryId}:null;
}

function metadataQuestion(question,view){
  if(typeof question!=='string'||question.length>300||controls.test(question))return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'');
  if(view==='categories'){
    const locate=/^(?:what are the main categories,? and where is |(?:主要課程類別有哪些|有哪些主要類別)[,，](?:以及)?)([\p{L}\p{N}][\p{L}\p{N} /_-]{0,47})$/iu.exec(text);
    if(locate)return {mode:'category-index',label:locate[1].trim()};
    if(/^(?:(?:what are|list) (?:the )?(?:main|top-level) (?:course )?categories|(?:主要|最上層)的?(?:課程)?類別有哪些|請列出主要課程類別)$/iu.test(text))return {mode:'category-index',label:null};
  }
  if(view==='category'){
    if(/^(?:what is (?:this (?:course )?category called|the name of this (?:course )?category)|(?:請問)?(?:這個|此|本)(?:課程)?類別的名稱是什麼|(?:這個|本)課程類別叫什麼)$/iu.test(text))return {mode:'category-title',label:null};
    if(/^(?:(?:what|which) subcategories are (?:below|under|in) this category|(?:please )?list (?:the )?subcategories (?:below|under|in) this category|(?:這個|此|本)類別(?:下|中)有哪些(?:子類別|子分類))$/iu.test(text))return {mode:'category-children',label:null};
  }
  if(view==='notice'){
    if(/^(?:(?:please )?summari[sz]e this notice|what does this notice say|(?:請)?(?:摘要|總結)(?:這個|本|這則)公告|(?:這則|這個|本)公告說什麼)$/iu.test(text))return {mode:'notice-summary',label:null};
    if(/^(?:what (?:date or )?deadline does this (?:two-step verification )?notice give|what is the deadline in this notice|(?:這則|這個|本)公告的截止(?:日|日期|期限)是什麼時候)$/iu.test(text))return {mode:'notice-deadline',label:null};
    if(/^(?:when did remote learning move to tronclass according to this notice|(?:這個|這則|本)公告說遠距教學從哪個學期轉入創課)$/iu.test(text))return {mode:'notice-transition',label:null};
  }
  return null;
}

export function selectElearningMetadata(question,route){
  const target=elearningMetadataRoute(route);
  const intent=target&&metadataQuestion(question,target.view);
  return intent?{...target,...intent}:null;
}

export function isElearningMetadataQuestion(question,route){
  const local=localRoute(route);
  const match=/^\/elearning\/(categories|category(?=\/)|notice(?=\/))(?:\/[^?#]*)?(?:[?#]|$)/u.exec(local);
  return Boolean(match&&metadataQuestion(question,match[1]));
}

export function elearningMetadataGuestRoute(route){
  const local=localRoute(route);
  const match=/^\/elearning\/login\/?\?([^#]+)$/u.exec(local);
  if(!match)return local;
  try{
    if(controls.test(decodeURIComponent(match[1])))return '';
    const params=new URLSearchParams(match[1]);
    const next=params.get('next');
    return params.size===1&&next?.startsWith('/elearning/')?elearningMetadataRoute(next)?.path??'':'';
  }catch{return '';}
}
