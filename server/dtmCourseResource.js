// This reader uses caller RLS and never fetches a material's external destination.
export const dtmMaterialTargetUrlMaxLength=2048;
export const dtmCourseResourceMaxResponseBytes=196608;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const unicode=value=>typeof value==='string'&&!value.includes('\u0000')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const mode=value=>value==='personal'||value==='sample';
const sourceUrl=value=>value===null||typeof value==='string'&&/^https:\/\/dtm[.]stu[.]edu[.]tw\/(course|mod\/[a-z_]+)\/view[.]php[?]id=[0-9]{1,12}$/.test(value);
const invalidTarget='Use a public HTTPS URL up to 2048 ASCII characters, without credentials, IP addresses, local hosts or nonstandard ports.';
/** A deliberately narrow, identical JS/SQL grammar. No DNS/public-address
 * assertion is made: DNS is not resolved, and these URLs are never fetched here.
 * International paths may use percent encoding; IDN hostnames are not accepted. */
export function validateDtmMaterialTargetUrl(value){
  if(value===null||value==='')return null;
  if(typeof value!=='string'||value.length>dtmMaterialTargetUrlMaxLength||/[^\x21-\x7e]|[\\"<>`{}|^]/.test(value)
    ||/%(?![0-9a-f]{2})/i.test(value)||/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value))return invalidTarget;
  const match=/^https:\/\/([a-z0-9.-]+)(:443)?([/?#].*)?$/i.exec(value);
  // Scheme remains canonical; host case and explicit default port are literal.
  if(!value.startsWith('https://')||!match)return invalidTarget;
  const host=match[1].toLowerCase(),labels=host.split('.');
  if(host.length>253||labels.length<2||labels.some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)||label.startsWith('xn--'))
    ||! /^[a-z]{2,63}$/.test(labels.at(-1))||['localhost','local','localdomain','internal','intranet','lan','home','corp','test','invalid','example','onion','arpa'].includes(labels.at(-1)))return invalidTarget;
  return null;
}
export class DtmCourseResourceError extends Error{constructor(message,status=503){super(message);this.name='DtmCourseResourceError';this.status=status;}}
const malformed=()=>new DtmCourseResourceError('This course resource could not be verified. No destination was inferred.');
function budget(value){try{if(new TextEncoder().encode(JSON.stringify(value)).byteLength<=dtmCourseResourceMaxResponseBytes)return;}catch{/* Reject non-JSON input. */}throw malformed();}
export function parseDtmCourseResourceData(value,userId,courseId,materialId){
  budget(value);
  if(!uuid(userId)||!uuid(courseId)||!uuid(materialId)||!exact(value,['course','material']))throw malformed();
  const course=value.course,row=value.material;
  if(!exact(course,['id','userId','title','code','term','sourceMode'])||course.id!==courseId||course.userId!==userId||!mode(course.sourceMode)
    ||!['title','code','term'].every(key=>unicode(course[key])))throw malformed();
  if(row!==null&&(!exact(row,['id','userId','courseId','title','kind','summary','position','sourceMode','sourceUrl','targetUrl'])||row.id!==materialId||row.userId!==userId||row.courseId!==courseId
    ||!unicode(row.title)||!unicode(row.summary)||!['page','file','assignment'].includes(row.kind)||!Number.isInteger(row.position)||row.position<1||row.position>2147483647||!mode(row.sourceMode)
    ||!sourceUrl(row.sourceUrl)||(row.targetUrl!==null&&(row.targetUrl===''||validateDtmMaterialTargetUrl(row.targetUrl)!==null))))throw malformed();
  return structuredClone(value);
}
function capture(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||!['token','key','url'].every(key=>Object.hasOwn(account,key))||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key
    ||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib[.]supabase[.]co\/?$/.test(account.url))throw new DtmCourseResourceError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new DtmCourseResourceError('Invalid course resource deadline.',400);
  return {userId:account.user.id,token:account.token,key:account.key,url:account.url,deadline:Math.min(account.requestDeadline??Infinity,Date.now()+12000)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function request(account,path,{query,body}={}){
  const remaining=Math.floor(account.deadline-Date.now());if(remaining<=0)throw new DtmCourseResourceError('Course resource request timed out. Please retry.');
  const signal=AbortSignal.timeout(remaining),url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+path);
  for(const [key,value] of Object.entries(query??{}))url.searchParams.set(key,value);
  let response;try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',signal,headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),signal);}
  catch{throw new DtmCourseResourceError('The course resource is temporarily unavailable. Please retry.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:503;
    throw new DtmCourseResourceError(status===401?'Sign in to School Affairs again.':status===403?'This course resource is not available to your account.':'The course resource is temporarily unavailable. Please retry.',status);}
  if(!response.body||Number(response.headers.get('content-length'))>dtmCourseResourceMaxResponseBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try{for(;;){const part=await within(()=>reader.read(),signal);if(part.done)break;bytes+=part.value.byteLength;if(bytes>dtmCourseResourceMaxResponseBytes)throw malformed();text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch{void reader.cancel().catch(()=>{});throw malformed();}finally{reader.releaseLock();}
}
export async function loadDtmCourseResource(account,options){
  if(!exact(options,['courseId','materialId'])||!uuid(options.courseId)||!uuid(options.materialId))throw new DtmCourseResourceError('Choose one owned course and material.',400);
  const {courseId,materialId}=options,caller=capture(account);
  const access=await request(caller,'rpc/dtm_course_content_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==caller.userId||typeof access.canManage!=='boolean')throw malformed();
  const rows=await request(caller,'dtm_courses',{query:{select:'id,user_id,title,code,term,source_mode,dtm_materials(id,course_id,title,kind,summary,position,source_mode,source_url,target_url)',
    id:'eq.'+courseId,user_id:'eq.'+caller.userId,'dtm_materials.id':'eq.'+materialId,'dtm_materials.course_id':'eq.'+courseId,limit:'2','dtm_materials.limit':'2'}});
  if(!Array.isArray(rows)||rows.length>1)throw malformed();if(rows.length===0)throw new DtmCourseResourceError('This course resource is not available to your account.',403);
  const row=rows[0];if(!exact(row,['id','user_id','title','code','term','source_mode','dtm_materials'])||!Array.isArray(row.dtm_materials)||row.dtm_materials.length>1)throw malformed();
  const item=row.dtm_materials[0];if(row.dtm_materials.length&&!exact(item,['id','course_id','title','kind','summary','position','source_mode','source_url','target_url']))throw malformed();
  return parseDtmCourseResourceData({course:{id:row.id,userId:row.user_id,title:row.title,code:row.code,term:row.term,sourceMode:row.source_mode},
    material:item?{id:item.id,userId:row.user_id,courseId:item.course_id,title:item.title,kind:item.kind,summary:item.summary,position:item.position,sourceMode:item.source_mode,sourceUrl:item.source_url,targetUrl:item.target_url}:null},caller.userId,courseId,materialId);
}
