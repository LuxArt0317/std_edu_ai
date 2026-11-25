const origin='https://stu.best';
const routePattern=/^(\/elearning\/(?:search|category\/([1-9]\d{0,9})))\/?(?:\?([^#]+))?$/u;
const pagePattern=/^[1-9]\d{0,3}$/u;
const controls=/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;
const int32=value=>Number.isInteger(value)&&value>0&&value<=2147483647;

function questionMode(question,categoryId){
  if(typeof question!=='string'||question.length>300||controls.test(question))return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'').toLowerCase();
  if(categoryId===null?/this category|(?:這個|此)類別/u.test(text):categoryId!==undefined&&/this search|這次搜尋/u.test(text))return null;
  if(/^(?:(?:how many (?:matches|results|courses) are there|what is the total (?:match|result|course) count),? and (?:which (?:courses|results) are (?:on|shown on) this page|list (?:this page's courses|the results on this page))|(?:這|本)頁有哪些(?:課程|搜尋結果)[,，]?(?:共|總共)(?:有)?(?:幾門課程|幾筆結果))$/u.test(text))return 'both';
  if(/^(?:(?:how many (?:courses|results) (?:are (?:on|shown on) this page)|(?:這|本)頁(?:有)?(?:幾門課程|幾筆(?:搜尋)?結果)))$/u.test(text))return 'page-count';
  if(/^(?:how many (?:matches|results|courses) (?:are there|match this search|are (?:in this category|there in total))|what is the total (?:match|result|course) count|(?:這次搜尋|這個類別|此類別)(?:總)?共有(?:幾門課程|幾筆結果))$/u.test(text))return 'total-count';
  if(/^(?:(?:what|which) (?:courses|results) (?:does this page show|are (?:on|shown on|listed on) (?:this|the current) page)|(?:please )?(?:show|list) (?:me )?(?:the )?(?:courses|results) (?:on|shown on|listed on) (?:this|the current) page|(?:這|本)頁(?:顯示|列出)?有哪些(?:課程|(?:搜尋)?結果)|(?:請)?(?:顯示|列出)(?:這|本)頁的?(?:課程|(?:搜尋)?結果))$/u.test(text))return 'list';
  return null;
}

const localRoute=route=>typeof route!=='string'||route.length>3100?'':route.startsWith(origin+'/')?route.slice(origin.length):route;

/** Use the same exact term/page parser for evidence and OAuth return paths. */
export function elearningCatalogPageRoute(route){
  const local=localRoute(route);
  if(/[\\\s#]/u.test(local))return null;
  const match=routePattern.exec(local);
  if(!match)return null;
  const [,pathname,rawCategory,rawQuery='']=match;
  const categoryId=rawCategory===undefined?null:Number(rawCategory);
  if(categoryId!==null&&!int32(categoryId))return null;
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
  return {path:pathname+(parameters.size?'?'+parameters.toString():''),categoryId,query:rawTerm.trim(),page:Number(rawPage)};
}

export function selectElearningCatalogPage(question,route=''){
  const target=elearningCatalogPageRoute(route);
  const mode=target&&questionMode(question,target.categoryId);
  return mode?{...target,mode}:null;
}

export function isElearningCatalogPageQuestion(question,route=''){
  return Boolean(/^\/elearning\/(?:search|category\/[^/?#]+)\/?(?:[?#]|$)/u.test(localRoute(route))&&questionMode(question));
}

/** A guest on the login page may ask about the catalog they were opening. */
export function elearningCatalogGuestRoute(route){
  const local=localRoute(route);
  const match=/^\/elearning\/login\/?\?([^#]+)$/u.exec(local);
  if(!match)return local;
  let params;
  try{
    if(controls.test(decodeURIComponent(match[1])))return '';
    params=new URLSearchParams(match[1]);
  }catch{return '';}
  const next=params.get('next');
  return params.size===1&&next?.startsWith('/elearning/')?elearningCatalogPageRoute(next)?.path??'':'';
}
