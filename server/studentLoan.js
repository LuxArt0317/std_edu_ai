/** Explicit local loan metadata only. No applications, approvals, amounts or file capabilities. */
export const studentLoanPath='/school-affairs/services/21-1';
export const studentLoanMaxPayloadBytes=32000;
export const studentLoanHistoryCountMax=1000000;
export const studentLoanKinds=Object.freeze(['save_student_loan','delete_student_loan']);
export const studentLoanApplicationStates=Object.freeze(['unknown','not_applied','recorded']);
export const studentLoanTextLimits=Object.freeze({current_term_label:160,current_application_text:2000,progress_text:2000,history_text:2000});
export const studentLoanFields=Object.freeze({save_student_loan:Object.freeze(['current_term_label','current_application_state','current_application_text','progress_text','history_count','history_text']),delete_student_loan:Object.freeze([])});
const commonFields=['id','user_id','request_id','expected_version'];
const columns=['id','user_id','source_mode','version','created_at','updated_at','deleted_at',...studentLoanFields.save_student_loan];
export const studentLoanReadSource=Object.freeze({table:'affairs_student_loan',select:columns.join(','),order:'id.asc'});
const fieldMap={current_term_label:'currentTermLabel',current_application_state:'currentApplicationState',current_application_text:'currentApplicationText',progress_text:'progressText',history_count:'historyCount',history_text:'historyText'};
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
/** PostgreSQL JSONB byte accounting for this exact flat scalar contract. */
export function studentLoanPayloadBytes(value){
  try{
    if(!object(value)||Object.values(value).some(item=>item!==null&&!['string','number'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item)))return Infinity;
    return new TextEncoder().encode('{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}').byteLength;
  }catch{return Infinity;}
}
export function validateStudentLoanPayload(kind,value){
  if(typeof kind!=='string'||!studentLoanKinds.includes(kind))return 'Invalid student loan metadata operation.';
  if(!exact(value,[...commonFields,...studentLoanFields[kind]]))return 'Use exactly the approved loan metadata fields, including nullable fields.';
  if(!['id','user_id','request_id'].every(key=>uuid(value[key]))||!integer(value.expected_version,kind==='delete_student_loan'?1:0,999999998))return 'Invalid loan metadata identifier or expected version.';
  if(kind==='save_student_loan'){
    if(!studentLoanApplicationStates.includes(value.current_application_state))return 'Choose an explicit local application state.';
    for(const [field,limit] of Object.entries(studentLoanTextLimits))if(value[field]!==null&&!text(value[field],limit))return 'Loan metadata text must be bounded literal text or null.';
    if(value.history_count!==null&&!integer(value.history_count,0,studentLoanHistoryCountMax))return 'History count must be null or an integer between 0 and 1000000.';
  }
  return studentLoanPayloadBytes(value)>studentLoanMaxPayloadBytes?'Loan metadata exceeds the 32000-byte JSONB limit.':null;
}
export class StudentLoanError extends Error{constructor(message,status=503){super(message);this.name='StudentLoanError';this.status=status;}}
const malformed=()=>new StudentLoanError('Local loan metadata could not be verified. No application or history state was inferred.');
const mapped=row=>({id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,
  currentTermLabel:row.current_term_label,currentApplicationState:row.current_application_state,currentApplicationText:row.current_application_text,
  progressText:row.progress_text,historyCount:row.history_count,historyText:row.history_text});
/** Loaded/null means absent metadata, never "not applied" or an empty history. */
export function parseStudentLoanSnapshot(value,userId){
  if(!uuid(userId)||!exact(value,['status','record'])||value.status!=='loaded')throw malformed();
  if(value.record===null)return {status:'loaded',record:null};
  const row=value.record;
  if(!exact(row,['id','userId','sourceMode','version','createdAt','updatedAt',...Object.values(fieldMap)])||row.userId!==userId||row.sourceMode!=='local_demo'
    ||!integer(row.version,1,999999999)||!instant(row.createdAt)||!instant(row.updatedAt))throw malformed();
  const payload={id:row.id,user_id:row.userId,request_id:row.id,expected_version:0,...Object.fromEntries(Object.entries(fieldMap).map(([field,key])=>[field,row[key]]))};
  if(validateStudentLoanPayload('save_student_loan',payload))throw malformed();
  return {status:'loaded',record:{...row}};
}
const budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key
    ||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new StudentLoanError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new StudentLoanError('Invalid loan metadata request deadline.');
  return {...account,user:{...account.user},requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response,signal,maxBytes){
  if(!response.body||Number(response.headers.get('content-length'))>maxBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error instanceof StudentLoanError?error:malformed();}finally{reader.releaseLock();}
}
async function request(account,name,{query={},body}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new StudentLoanError('Loan metadata request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+name),signal=AbortSignal.timeout(Math.min(budgetMs,remaining));
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new StudentLoanError('Local loan metadata is temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new StudentLoanError(status===401?'Sign in to School Affairs again.':status===403?'This loan metadata operation is not available to your account.':status===409?'This account loan snapshot changed. Refresh and edit the active record.':status===400?'Check the approved loan metadata fields.':'Local loan metadata is temporarily unavailable. Retry the same operation.',status);}
  return jsonWithin(response,signal,body?4096:65536);
}
async function requireAdmin(account){
  const access=await request(account,'affairs_student_loan_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==account.user.id||access.canManage!==true)throw new StudentLoanError('School Affairs administrator access is required.',403);
}
async function readSnapshot(account,ownerId){
  // Two rows detect a broken singleton invariant instead of hiding a duplicate.
  const rows=await request(account,studentLoanReadSource.table,{query:{select:studentLoanReadSource.select,order:studentLoanReadSource.order,limit:2,deleted_at:'is.null',user_id:'eq.'+ownerId}});
  if(!Array.isArray(rows)||rows.length>1)throw malformed();
  if(!rows.length)return {status:'loaded',record:null};
  const row=rows[0];if(!exact(row,columns)||row.deleted_at!==null)throw malformed();
  return parseStudentLoanSnapshot({status:'loaded',record:mapped(row)},ownerId);
}
/** Personal scope remains caller-owned even when the caller can administer other accounts. */
export async function loadStudentLoan(account){account=boundedAccount(account);return readSnapshot(account,account.user.id);}
/** A separate authorized reader requires one explicit selected account. */
export async function loadStudentLoanAdmin(account,options){
  if(!exact(options,['userId'])||!uuid(options.userId))throw new StudentLoanError('Choose one student account for loan metadata maintenance.',400);
  const ownerId=options.userId;account=boundedAccount(account);await requireAdmin(account);return readSnapshot(account,ownerId);
}
/** SQL repeats role, ownership, singleton, version, tombstone and durable receipt checks. */
export async function manageStudentLoanRecord(account,kind,input){
  const invalid=validateStudentLoanPayload(kind,input);if(invalid)throw new StudentLoanError(invalid,400);
  const payload={...input};account=boundedAccount(account);await requireAdmin(account);
  const receipt=await request(account,'affairs_manage_student_loan',{body:{p_kind:kind,p_payload:payload}});
  if(!exact(receipt,['id','kind','version','summary'])||receipt.id!==payload.id||receipt.kind!==kind||receipt.version!==payload.expected_version+1||!text(receipt.summary,200))throw malformed();
  return receipt;
}
