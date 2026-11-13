/** Local tuition statements and unverified metadata only. No issuance, payment, Storage or download. */
export const tuitionDocumentPaths={summer:'/school-affairs/services/48-1',extended:'/school-affairs/services/48-2',evening:'/school-affairs/services/48-3',settlement:'/school-affairs/services/49-1'};
export const tuitionDocumentMaxPayloadBytes=26000;
export const tuitionDocumentKinds=['save_tuition_settlement','delete_tuition_settlement','save_tuition_document_metadata','delete_tuition_document_metadata'];
export const tuitionDocumentFields={
  save_tuition_settlement:['period_label','statement_text','row_order'],delete_tuition_settlement:[],
  save_tuition_document_metadata:['kind','period_label','note_text','status','issuer'],delete_tuition_document_metadata:[],
};
const envelopeColumns=['id','user_id','source_mode','version','created_at','updated_at','deleted_at'];
const settlementColumns=[...envelopeColumns,...tuitionDocumentFields.save_tuition_settlement];
const documentColumns=[...envelopeColumns,...tuitionDocumentFields.save_tuition_document_metadata];
export const tuitionDocumentReadSources=[
  {key:'settlements',table:'affairs_tuition_settlements',select:settlementColumns.join(','),order:'id.asc'},
  {key:'documentMetadata',table:'affairs_tuition_document_metadata',select:documentColumns.join(','),order:'id.asc'},
];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max)=>typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const code=char.codePointAt(0);return code!==0&&!(code>=0xd800&&code<=0xdfff);});
const nullableText=(value,max)=>value===null||text(value,max);
const commonFields=['id','user_id','request_id','expected_version'];
function instant(value){
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:0[0-9]|1[0-5]):[0-5][0-9])$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
/** Matches PostgreSQL's JSONB spacing for the approved flat scalar payload. */
export function tuitionDocumentPayloadBytes(value){
  try{
    if(!object(value)||Object.values(value).some(item=>item!==null&&!['string','boolean','number'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item)))return Infinity;
    return new TextEncoder().encode('{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}').byteLength;
  }catch{return Infinity;}
}
export function validateTuitionDocumentPayload(kind,value){
  if(typeof kind!=='string'||!Object.hasOwn(tuitionDocumentFields,kind)||!tuitionDocumentKinds.includes(kind))return 'Invalid tuition operation.';
  if(!exact(value,[...commonFields,...tuitionDocumentFields[kind]]))return 'Use exactly the approved tuition fields, including nullable fields.';
  if(!['id','user_id','request_id'].every(key=>uuid(value[key]))||!integer(value.expected_version,kind.startsWith('delete_')?1:0,999999998))return 'Invalid tuition identifier or expected version.';
  if(kind==='save_tuition_settlement'){
    if(!text(value.period_label,160)||!value.period_label.trim()||!nullableText(value.statement_text,4000)||!integer(value.row_order,0,10000))return 'Use an explicit period label, literal statement or null, and a valid display order.';
  }else if(kind==='save_tuition_document_metadata'){
    if(!['summer','evening'].includes(value.kind)||value.issuer!=='stu.best'||!['metadata_only','revoked'].includes(value.status)||!nullableText(value.period_label,160)||!nullableText(value.note_text,1000))return 'Only unverified local summer/evening document metadata is supported.';
  }
  return tuitionDocumentPayloadBytes(value)>tuitionDocumentMaxPayloadBytes?'Tuition payload exceeds the 26000-byte JSONB limit.':null;
}
export class TuitionDocumentsError extends Error{constructor(message,status=503){super(message);this.name='TuitionDocumentsError';this.status=status;}}
const malformed=()=>new TuitionDocumentsError('Local tuition records could not be verified. No partial records were returned.');
const pageSize=200,maxRows=1000,budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new TuitionDocumentsError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new TuitionDocumentsError('Invalid tuition request deadline.');
  return {...account,user:{...account.user},requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response,signal,maximum){
  if(!response.body||Number(response.headers.get('content-length'))>maximum){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maximum)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error instanceof TuitionDocumentsError?error:malformed();}finally{reader.releaseLock();}
}
async function request(account,name,{query={},body}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new TuitionDocumentsError('Tuition request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+name),signal=AbortSignal.timeout(Math.min(budgetMs,remaining));
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new TuitionDocumentsError('Local tuition records are temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new TuitionDocumentsError(status===401?'Sign in to School Affairs again.':status===403?'This tuition operation is not available to your account.':status===409?'This tuition record changed. Refresh before saving.':status===400?'Check the approved tuition fields.':'Local tuition records are temporarily unavailable. Retry the same operation.',status);}
  return jsonWithin(response,signal,body?4096:6*1024*1024);
}
async function requireAdmin(account){
  const access=await request(account,'affairs_tuition_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==account.user.id||access.canManage!==true)throw new TuitionDocumentsError('School Affairs administrator access is required.',403);
}
function validRow(row,key){
  const fields=key==='settlements'?settlementColumns:documentColumns;
  if(!exact(row,fields)||row.source_mode!=='local_demo'||row.deleted_at!==null||!integer(row.version,1,999999999)||!instant(row.created_at)||!instant(row.updated_at))return false;
  const operation=key==='settlements'?'save_tuition_settlement':'save_tuition_document_metadata',payload={id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0};
  for(const field of tuitionDocumentFields[operation])payload[field]=row[field];
  return validateTuitionDocumentPayload(operation,payload)===null;
}
const mappedEnvelope=row=>({id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
const settlement=row=>({...mappedEnvelope(row),periodId:row.id,periodLabel:row.period_label,text:row.statement_text,rowOrder:row.row_order});
const documentMetadata=row=>({...mappedEnvelope(row),kind:row.kind,periodLabel:row.period_label,noteText:row.note_text,status:row.status,issuer:row.issuer});
function mapSettlements(rows){
  const settlements=rows.map(settlement).sort((a,b)=>a.rowOrder-b.rowOrder||a.id.localeCompare(b.id));
  return {settlements,periods:settlements.map(row=>({id:row.periodId,userId:row.userId,label:row.periodLabel})),documents:[]};
}
async function readRows(account,source,ownerId){
  const rows=[];let cursor;
  for(;;){
    const page=await request(account,source.table,{query:{select:source.select,order:source.order,limit:pageSize,deleted_at:'is.null',...(ownerId?{user_id:'eq.'+ownerId}:{}),...(cursor?{id:'gt.'+cursor}:{})}});
    if(!Array.isArray(page)||page.length>pageSize)throw malformed();
    for(const row of page){if(!validRow(row,source.key)||ownerId&&row.user_id!==ownerId||cursor&&row.id<=cursor)throw malformed();rows.push(row);cursor=row.id;if(rows.length>maxRows)throw new TuitionDocumentsError('Local tuition records exceed the complete-read limit. Narrow the administrator account filter.');}
    if(page.length<pageSize)return rows;
  }
}
/** Always personal, including for admins. Metadata never becomes a verified_local_file capability. */
export async function loadTuitionDocuments(account){
  account=boundedAccount(account);return mapSettlements(await readRows(account,tuitionDocumentReadSources[0],account.user.id));
}
/** Explicit administrator reader; never substitute its records into a personal page. */
export async function loadTuitionDocumentsAdmin(account,options={}){
  if(!object(options)||Object.keys(options).some(key=>key!=='userId')||Object.hasOwn(options,'userId')&&!uuid(options.userId))throw new TuitionDocumentsError('Invalid tuition account filter.',400);
  const ownerId=options.userId;
  account=boundedAccount(account);await requireAdmin(account);
  const rows=await readRows(account,tuitionDocumentReadSources[0],ownerId),documents=await readRows(account,tuitionDocumentReadSources[1],ownerId);
  const seen=new Set();for(const row of documents){const key=row.user_id+':'+row.kind;if(seen.has(key))throw malformed();seen.add(key);}
  return {...mapSettlements(rows),documentMetadata:documents.map(documentMetadata)};
}
/** SQL repeats trusted admin authorization, immutable identity, exact receipt and version checks. */
export async function manageTuitionDocumentRecord(account,kind,input){
  const error=validateTuitionDocumentPayload(kind,input);if(error)throw new TuitionDocumentsError(error,400);
  const payload={...input};account=boundedAccount(account);await requireAdmin(account);
  const receipt=await request(account,'affairs_manage_tuition_documents',{body:{p_kind:kind,p_payload:payload}});
  if(!exact(receipt,['id','kind','version','summary'])||receipt.id!==payload.id||receipt.kind!==kind||receipt.version!==payload.expected_version+1||!text(receipt.summary,200))throw malformed();
  return receipt;
}
