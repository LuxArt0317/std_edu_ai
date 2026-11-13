/** Owner-only preferences for the three observed DTM dashboard blocks. */
export const dtmDashboardLayoutKinds=Object.freeze(['save_dtm_dashboard_layout','reset_dtm_dashboard_layout']);
export const dtmDashboardLayoutMaxPayloadBytes=2048;
const columns=['user_id','version','blocks','updated_at'];
export const dtmDashboardLayoutReadSource=Object.freeze({table:'dtm_dashboard_layouts',select:columns.join(','),order:'user_id.asc'});
const ids=['important','navigation','contacts'],regions=['side-pre','side-post','content'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const cloneBlocks=blocks=>blocks.map(({id,visible,region,weight})=>({id,visible,region,weight}));
function validBlocks(value){
  return Array.isArray(value)&&value.length===3&&Object.keys(value).length===3
    &&value.every(row=>exact(row,['id','visible','region','weight'])&&ids.includes(row.id)&&typeof row.visible==='boolean'
      &&regions.includes(row.region)&&integer(row.weight,-10,10))&&new Set(value.map(row=>row.id)).size===3;
}
function sameBlocks(left,right){return left.length===right.length&&left.every((row,index)=>['id','visible','region','weight'].every(key=>row[key]===right[index][key]));}
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
export function dtmDashboardLayoutDefaults(){return {version:0,blocks:ids.map((id,index)=>({id,visible:true,region:'side-pre',weight:index-1})),updatedAt:null};}
export class DtmDashboardLayoutError extends Error{constructor(message,status=503){super(message);this.status=status;}}
const malformed=()=>new DtmDashboardLayoutError('Your saved DTM dashboard layout could not be verified. Reload before editing.');
/** Match PostgreSQL JSONB spacing when bounding the exact validated command. */
export function dtmDashboardLayoutPayloadBytes(value){
  const seen=new Set();
  function encode(item,depth){
    if(depth>8)throw new Error('Nested value');
    if(item===null||typeof item==='boolean'||typeof item==='string'||typeof item==='number'&&Number.isFinite(item))return JSON.stringify(item);
    if(!object(item)&&!Array.isArray(item)||seen.has(item))throw new Error('Invalid JSON value');
    seen.add(item);let result;
    if(Array.isArray(item)){
      if(Object.keys(item).length!==item.length)throw new Error('Sparse array');
      result='['+item.map(value=>encode(value,depth+1)).join(', ')+']';
    }else{
      if(Reflect.ownKeys(item).length!==Object.keys(item).length)throw new Error('Hidden JSON field');
      result='{'+Object.entries(item).map(([key,value])=>JSON.stringify(key)+': '+encode(value,depth+1)).join(', ')+'}';
    }
    seen.delete(item);return result;
  }
  try{return new TextEncoder().encode(encode(value,0)).byteLength;}catch{return Infinity;}
}
export function validateDtmDashboardLayoutPayload(kind,value){
  if(typeof kind!=='string'||!dtmDashboardLayoutKinds.includes(kind))return 'Choose a supported DTM dashboard layout action.';
  const fields=['request_id','expected_version',...(kind==='save_dtm_dashboard_layout'?['blocks']:[])];
  if(!exact(value,fields))return 'Use exactly the approved dashboard layout fields.';
  if(!uuid(value.request_id)||!integer(value.expected_version,0,999999998))return 'Use a valid request identifier and dashboard version.';
  if(kind==='save_dtm_dashboard_layout'&&!validBlocks(value.blocks))return 'Provide all three dashboard blocks once, with valid visibility, region and weight.';
  return dtmDashboardLayoutPayloadBytes(value)>dtmDashboardLayoutMaxPayloadBytes?'The dashboard layout command exceeds its byte limit.':null;
}
export function parseDtmDashboardLayout(value){
  if(!exact(value,['version','blocks','updatedAt'])||!integer(value.version,0,999999999)||!validBlocks(value.blocks))throw malformed();
  if(value.version===0?value.updatedAt!==null||!sameBlocks(value.blocks,dtmDashboardLayoutDefaults().blocks):!instant(value.updatedAt))throw malformed();
  return {version:value.version,blocks:cloneBlocks(value.blocks),updatedAt:value.updatedAt};
}
const budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token
    ||typeof account.key!=='string'||!account.key||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))
    throw new DtmDashboardLayoutError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new DtmDashboardLayoutError('Invalid dashboard request deadline.');
  return {user:{id:account.user.id},url:account.url,key:account.key,token:account.token,requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>4096){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4096)throw malformed();text+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch{void reader.cancel().catch(()=>{});throw malformed();}finally{reader.releaseLock();}
}
async function request(account,body){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new DtmDashboardLayoutError('DTM dashboard request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/affairs_save_dtm_dashboard_layout':dtmDashboardLayoutReadSource.table));
  if(!body)for(const [key,value]of Object.entries({select:dtmDashboardLayoutReadSource.select,order:dtmDashboardLayoutReadSource.order,limit:'2',user_id:'eq.'+account.user.id}))url.searchParams.set(key,value);
  const signal=AbortSignal.timeout(Math.min(budgetMs,remaining));let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',cache:'no-store',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new DtmDashboardLayoutError('The DTM dashboard is temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new DtmDashboardLayoutError(status===401?'Sign in to School Affairs again.':status===403?'This dashboard operation is not available to your account.':status===409?'Your dashboard changed. Reload and compare before saving.':status===400?'Check the approved dashboard layout fields.':'The DTM dashboard is temporarily unavailable. Retry the same operation.',status);}
  return jsonWithin(response,signal);
}
export async function loadDtmDashboardLayout(account){
  account=boundedAccount(account);const rows=await request(account);
  if(!Array.isArray(rows)||rows.length>1)throw malformed();
  if(rows.length===0)return dtmDashboardLayoutDefaults();
  const row=rows[0];if(!exact(row,columns)||row.user_id!==account.user.id||!integer(row.version,1,999999999))throw malformed();
  return parseDtmDashboardLayout({version:row.version,blocks:row.blocks,updatedAt:row.updated_at});
}
export async function executeDtmDashboardLayoutAction(account,kind,value){
  const invalid=validateDtmDashboardLayoutPayload(kind,value);if(invalid)throw new DtmDashboardLayoutError(invalid,400);
  // Freeze caller and nested command values before the first asynchronous operation.
  const payload={request_id:value.request_id,expected_version:value.expected_version,...(kind==='save_dtm_dashboard_layout'?{blocks:cloneBlocks(value.blocks)}:{})};
  account=boundedAccount(account);const result=parseDtmDashboardLayout(await request(account,{p_kind:kind,p_payload:payload}));
  const expectedBlocks=kind==='save_dtm_dashboard_layout'?payload.blocks:dtmDashboardLayoutDefaults().blocks;
  if(result.version!==payload.expected_version+1||!sameBlocks(result.blocks,expectedBlocks))throw malformed();return result;
}
