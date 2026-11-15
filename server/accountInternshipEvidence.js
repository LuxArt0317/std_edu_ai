import {internshipLookupContext} from './internshipEvidenceIntent.js';
import {internshipEnvelope,internshipEvidenceMaxBytes,internshipEvidenceRowLimit,internshipExact,
  internshipDataObject,internshipUuid,internshipReviewStatuses,validInternshipRecord,parseInternshipEvidence} from './internshipEvidenceContract.js';

export {internshipEvidenceMaxBytes,unavailableInternshipEvidence} from './internshipEvidenceContract.js';
const databaseOrigin='https://xiftudmvxphxcjtmfmib.supabase.co';
const wireLimit=255000;
const wireColumns={title:'title',status:'status',startsOn:'starts_on',endsOn:'ends_on',notes:'notes'};
const requiredColumns=['id','user_id','service_key','record_type'];
const joinedReview='site_review:affairs_service_requests!affairs_service_records_review_request_id_fkey(id,user_id,status)';
const readErrors=['invalid_records','deadline_exceeded','access_denied','read_failed'];
const fail=code=>{throw Object.assign(new Error('Internship records could not be verified.'),{code});};
const cancel=response=>{void response?.body?.cancel().catch(()=>{});};
const bytes=value=>new TextEncoder().encode(value).byteLength;

async function readBody(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>wireLimit)fail('invalid_records');
  const stream=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  const stop=()=>{void stream.cancel().catch(()=>{});};
  signal.addEventListener('abort',stop,{once:true});
  let result='',size=0;
  try{
    for(;;){
      const {value,done}=await stream.read();
      if(signal.aborted)fail('deadline_exceeded');
      if(done)return JSON.parse(result+decoder.decode());
      size+=value.byteLength;
      if(size>wireLimit)fail('invalid_records');
      result+=decoder.decode(value,{stream:true});
    }
  }catch(error){stop();if(readErrors.includes(error?.code))throw error;fail('invalid_records');}
  finally{signal.removeEventListener('abort',stop);stream.releaseLock();}
}

function verifyRange(header,length,limit){
  const range=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/u.exec(header??''),total=range?Number(range[3]):NaN;
  if(!Number.isSafeInteger(total)||total<0||length!==Math.min(total,limit)
    ||(length?Number(range[1])!==0||Number(range[2])!==length-1:range[1]!==undefined))fail('invalid_records');
  return total;
}

async function readSelectedRows(account,selection,deadline,fetchImpl,observeRead){
  const readReview=selection.fields.includes('reviewStatus');
  const keys=[...requiredColumns,...selection.fields.filter(field=>field!=='reviewStatus').map(field=>wireColumns[field])];
  const select=[...keys,...(readReview?['review_request_id',joinedReview]:[])].join(',');
  if(readReview)keys.push('review_request_id','site_review');
  const limit=selection.recordId?1:internshipEvidenceRowLimit;
  const url=new URL('/rest/v1/affairs_service_records',databaseOrigin);
  url.search=new URLSearchParams({select,service_key:'eq.internship',record_type:'eq.'+selection.recordType,
    user_id:'eq.'+account.userId,order:'id.asc',limit:String(limit),...(selection.recordId?{id:'eq.'+selection.recordId}:{})}).toString();
  const controller=new AbortController();
  let timer,response;
  try{
    const remaining=deadline-Date.now();
    if(remaining<=0)fail('deadline_exceeded');
    return await Promise.race([
      (async()=>{
        response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
          headers:{apikey:account.key,Authorization:'Bearer '+account.token,Prefer:'count=exact'},signal:controller.signal});
        if(controller.signal.aborted||Date.now()>=deadline)fail('deadline_exceeded');
        if(response.redirected||response.url&&response.url!==url.href)fail('read_failed');
        if(!response.ok)fail([401,403].includes(response.status)?'access_denied':'read_failed');
        if(![200,206].includes(response.status))fail('invalid_records');
        const value=await readBody(response,controller.signal);
        if(Date.now()>=deadline)fail('deadline_exceeded');
        if(!Array.isArray(value))fail('invalid_records');
        const available=verifyRange(response.headers.get('content-range'),value.length,limit);
        if(selection.recordId&&available>1)fail('invalid_records');
        observeRead?.({method:'GET',url:url.href,ownerId:account.userId,available,rows:value});
        return {rows:value,keys,available};
      })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('Internship read timed out.'),{code:'deadline_exceeded'}));},remaining);}),
    ]);
  }catch(error){cancel(response);if(readErrors.includes(error?.code))throw error;fail('read_failed');}
  finally{clearTimeout(timer);}
}

function rowReview(row,userId){
  const id=row.review_request_id,review=row.site_review;
  if(id===null&&review===null)return {reviewStatus:null,reviewState:'not_requested'};
  if(!internshipUuid(id))fail('invalid_records');
  if(review===null)return {reviewStatus:null,reviewState:'unavailable'};
  if(!internshipExact(review,['id','user_id','status'])||review.id!==id||review.user_id!==userId||!internshipReviewStatuses.includes(review.status))
    fail('invalid_records');
  return {reviewStatus:review.status,reviewState:'recorded'};
}

function projectRows(result,selection,userId){
  const {rows,keys}=result;
  let previous='';
  return rows.map(row=>{
    if(!internshipExact(row,keys)||!internshipUuid(row.id)||row.id<=previous
      ||selection.recordId!==null&&row.id!==selection.recordId||row.user_id!==userId
      ||row.service_key!=='internship'||row.record_type!==selection.recordType)fail('invalid_records');
    previous=row.id;
    const record={};
    for(const field of selection.fields){
      if(field==='reviewStatus')Object.assign(record,rowReview(row,userId));
      else record[field]=row[wireColumns[field]];
    }
    if(!validInternshipRecord(record,selection.fields))fail('invalid_records');
    return record;
  });
}
function boundedEvidence(selection,rows,available){
  const count={available,returned:rows.length,included:rows.length,omitted:available-rows.length};
  const make=()=>{
    const reason=count.omitted?'bounded_results':rows.some(row=>row.reviewState==='unavailable')?'linked_review_unavailable':null;
    return internshipEnvelope(reason?'partial':available?'ok':'empty',reason,selection,rows,count);
  };
  let answer=make();
  while(bytes(JSON.stringify(answer))>internshipEvidenceMaxBytes&&rows.length){
    rows.pop();count.included=rows.length;count.omitted=available-rows.length;answer=make();
  }
  if(!parseInternshipEvidence(answer)||bytes(JSON.stringify(answer))>internshipEvidenceMaxBytes)fail('invalid_records');
  return answer;
}

/** Single scoped read pass. Proof of identity is owned by the calling API. */
export async function readInternshipEvidence(account,options={},dependencies={}){
  let selection=null;
  const unavailable=reason=>internshipEnvelope('unavailable',reason,selection);
  try{
    if(!internshipDataObject(options)||Object.keys(options).some(key=>!['question','route','history','deadline'].includes(key))
      ||!internshipDataObject(dependencies)||Object.keys(dependencies).some(key=>!['fetchImpl','observeRead'].includes(key))
      ||dependencies.observeRead!==undefined&&typeof dependencies.observeRead!=='function'
      ||dependencies.fetchImpl!==undefined&&typeof dependencies.fetchImpl!=='function')return unavailable('invalid_context');
    if(!internshipDataObject(account)||!internshipDataObject(account.user)||!internshipUuid(account.user.id)
      ||typeof account.url!=='string'||account.url.replace(/\/$/u,'')!==databaseOrigin
      ||!['key','token'].every(key=>typeof account[key]==='string'&&account[key].trim()&&account[key].length<=8192&&!/[\p{Cc}\p{Cs}]/u.test(account[key])))
      return unavailable('access_denied');
    const context=internshipLookupContext(options.question,options.route,options.history);
    if(context.reason)return unavailable(context.reason);
    if(!context.selection)return unavailable('unrelated_question');
    selection=context.selection;
    if([options.deadline,account.requestDeadline].some(value=>value!==undefined&&!Number.isFinite(value)))return unavailable('invalid_deadline');
    const deadline=Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
    const captured={userId:account.user.id,key:account.key,token:account.token};
    const result=await readSelectedRows(captured,selection,deadline,dependencies.fetchImpl??fetch,dependencies.observeRead);
    return boundedEvidence(selection,projectRows(result,selection,captured.userId),result.available);
  }catch(error){return unavailable(readErrors.includes(error?.code)?error.code:'read_failed');}
}
