/** Independent source34-2 local notice metadata; no rows, eligibility or document capability. */
export const dormitoryConductPath='/school-affairs/services/34-2';
export const dormitoryConductMaxPayloadBytes=1024;
export const dormitoryConductKinds=Object.freeze(['save_dormitory_conduct','delete_dormitory_conduct']);
export const dormitoryConductResults=Object.freeze(['empty','unknown']);
export const dormitoryConductFields=Object.freeze({save_dormitory_conduct:Object.freeze(['result']),delete_dormitory_conduct:Object.freeze([])});
const commonFields=['id','user_id','request_id','expected_version'];
const columns=['id','user_id','source_mode','version','created_at','updated_at','deleted_at','result'];
export const dormitoryConductReadSource=Object.freeze({table:'affairs_dormitory_conduct',select:columns.join(','),order:'id.asc'});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max)=>typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const point=char.codePointAt(0);return point!==0&&!(point>=0xd800&&point<=0xdfff);});
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
export function dormitoryConductPayloadBytes(value){
  try{
    if(!object(value)||Object.values(value).some(item=>item!==null&&!['string','number'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item)))return Infinity;
    return new TextEncoder().encode('{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}').byteLength;
  }catch{return Infinity;}
}
export function validateDormitoryConductPayload(kind,value){
  if(typeof kind!=='string'||!dormitoryConductKinds.includes(kind))return 'Invalid dormitory conduct metadata operation.';
  if(!exact(value,[...commonFields,...dormitoryConductFields[kind]]))return 'Use exactly the approved dormitory conduct metadata fields.';
  if(!['id','user_id','request_id'].every(key=>uuid(value[key]))||!integer(value.expected_version,kind==='delete_dormitory_conduct'?1:0,999999998))return 'Invalid dormitory conduct identifier or expected version.';
  if(kind==='save_dormitory_conduct'&&!dormitoryConductResults.includes(value.result))return 'Choose an explicit empty or unknown result.';
  return dormitoryConductPayloadBytes(value)>dormitoryConductMaxPayloadBytes?'Dormitory conduct metadata exceeds the 1024-byte JSONB limit.':null;
}
export class DormitoryConductError extends Error{constructor(message,status=503){super(message);this.name='DormitoryConductError';this.status=status;}}
const malformed=()=>new DormitoryConductError('Local dormitory conduct metadata could not be verified. No empty-record result was inferred.');
const projection=row=>({userId:row.userId,sourceMode:row.sourceMode,version:row.version,result:row.result});
function validSnapshot(row,userId){return exact(row,['userId','sourceMode','version','result'])&&row.userId===userId&&row.sourceMode==='local_demo'&&integer(row.version,1,999999999)&&dormitoryConductResults.includes(row.result);}
/** Null is absent/unknown metadata, never an asserted empty dormitory record. */
export function parseDormitoryConductData(value,userId){
  if(!uuid(userId)||!exact(value,['snapshot']))throw malformed();
  if(value.snapshot===null)return {snapshot:null};
  if(!validSnapshot(value.snapshot,userId))throw malformed();return {snapshot:{...value.snapshot}};
}
/** Stable editing identifiers/timestamps exist only in the separate admin DTO. */
export function parseDormitoryConductAdminData(value,userId){
  if(!uuid(userId)||!exact(value,['record']))throw malformed();
  if(value.record===null)return {record:null};const row=value.record;
  if(!exact(row,['id','userId','sourceMode','version','result','createdAt','updatedAt'])||!uuid(row.id)||!validSnapshot(projection(row),userId)||!instant(row.createdAt)||!instant(row.updatedAt))throw malformed();
  return {record:{...row}};
}
const budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key
    ||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new DormitoryConductError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new DormitoryConductError('Invalid dormitory conduct request deadline.');
  return {...account,user:{...account.user},requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response,signal){
  const maxBytes=4096;
  if(!response.body||Number(response.headers.get('content-length'))>maxBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error instanceof DormitoryConductError?error:malformed();}finally{reader.releaseLock();}
}
async function request(account,name,{query={},body}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new DormitoryConductError('Dormitory conduct request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+name),signal=AbortSignal.timeout(Math.min(budgetMs,remaining));
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new DormitoryConductError('Local dormitory conduct metadata is temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new DormitoryConductError(status===401?'Sign in to School Affairs again.':status===403?'This dormitory conduct operation is not available to your account.':status===409?'This dormitory conduct snapshot changed. Refresh and edit the active record.':status===400?'Check the approved dormitory conduct metadata fields.':'Local dormitory conduct metadata is temporarily unavailable. Retry the same operation.',status);}
  return jsonWithin(response,signal);
}
async function requireAdmin(account){
  const access=await request(account,'affairs_dormitory_conduct_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==account.user.id||access.canManage!==true)throw new DormitoryConductError('School Affairs administrator access is required.',403);
}
async function readRecord(account,ownerId){
  // Two rows expose a broken singleton invariant instead of silently choosing one.
  const rows=await request(account,dormitoryConductReadSource.table,{query:{select:dormitoryConductReadSource.select,order:dormitoryConductReadSource.order,limit:2,deleted_at:'is.null',user_id:'eq.'+ownerId}});
  if(!Array.isArray(rows)||rows.length>1)throw malformed();if(!rows.length)return null;
  const row=rows[0];if(!exact(row,columns)||row.deleted_at!==null)throw malformed();
  return parseDormitoryConductAdminData({record:{id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:row.version,result:row.result,createdAt:row.created_at,updatedAt:row.updated_at}},ownerId).record;
}
export async function loadDormitoryConduct(account){
  account=boundedAccount(account);const record=await readRecord(account,account.user.id);
  return {snapshot:record?projection(record):null};
}
export async function loadDormitoryConductAdmin(account,options){
  if(!exact(options,['userId'])||!uuid(options.userId))throw new DormitoryConductError('Choose one student account for dormitory conduct maintenance.',400);
  const ownerId=options.userId;account=boundedAccount(account);await requireAdmin(account);return {record:await readRecord(account,ownerId)};
}
export async function manageDormitoryConductRecord(account,kind,input){
  const invalid=validateDormitoryConductPayload(kind,input);if(invalid)throw new DormitoryConductError(invalid,400);
  const payload={...input};account=boundedAccount(account);await requireAdmin(account);
  const receipt=await request(account,'affairs_manage_dormitory_conduct',{body:{p_kind:kind,p_payload:payload}});
  if(!exact(receipt,['id','kind','version','summary'])||receipt.id!==payload.id||receipt.kind!==kind||receipt.version!==payload.expected_version+1||!text(receipt.summary,200))throw malformed();return receipt;
}
