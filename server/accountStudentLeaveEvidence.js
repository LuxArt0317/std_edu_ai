import {
  isStudentLeaveDate, isStudentLeaveTitle, isStudentLeaveUuid, studentLeaveArchiveCutoff, studentLeaveBasePath, studentLeaveFieldNames,
} from './studentLeaveEvidenceIntent.js';
import {studentLeaveObservationDigest,studentLeaveRowsDigest} from './studentLeaveObservation.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
export const studentLeaveEvidenceLimits=Object.freeze({rows:80,responseBytes:12000,transportBytes:65536,deadlineMs:8000});
const views=['history','archive','periods','record'];
const categories=['personal','sick','official','bereavement','nursing','mental_health','maternity','menstrual','other'];
const status=['draft','filed','withdrawn'];
const reviewStatus=['open','in_review','resolved'];
const errors=new Set(['invalid_options','invalid_account','invalid_records','read_failed','access_denied','deadline_exceeded','reader_unavailable']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const arrayOf=(value,allowed)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=allowed.length
  &&Reflect.ownKeys(value).length===value.length+1&&Object.values(Object.getOwnPropertyDescriptors(value)).every(desc=>Object.hasOwn(desc,'value'))
  &&new Set(value).size===value.length&&value.every(item=>allowed.includes(item));
const fail=code=>{throw Object.assign(new Error('Saved leave records could not be verified.'),{code});};
const cancel=response=>{void response?.body?.cancel().catch(()=>{});};

function checkedFilter(value,allowed){
  if(!exact(value,['included','excluded'])||!arrayOf(value.included,allowed)||!arrayOf(value.excluded,allowed)
    ||value.included.some(item=>value.excluded.includes(item)))fail('invalid_options');
  return {included:[...value.included],excluded:[...value.excluded]};
}
function checkedSelection(input){
  if(!object(input)||!exact(input,['from','question','view','id','range','filters','fields','countOnly','reason',...(Object.hasOwn(input,'title')?['title']:[])])||input.reason!==null
    ||!['question','history','route'].includes(input.from)||typeof input.question!=='string'||!input.question
    ||!views.includes(input.view)||(input.view==='record'?!isStudentLeaveUuid(input.id):input.id!==null)
    ||Object.hasOwn(input,'title')&&!isStudentLeaveTitle(input.title))fail('invalid_options');
  if(input.range!==null&&(!exact(input.range,['from','through'])||!isStudentLeaveDate(input.range.from)
    ||!isStudentLeaveDate(input.range.through)||input.range.from>input.range.through))fail('invalid_options');
  const fields=input.fields;
  if(!arrayOf(fields,studentLeaveFieldNames)||typeof input.countOnly!=='boolean'||input.countOnly!==(fields.length===0)
    ||!exact(input.filters,['categories','statuses']))fail('invalid_options');
  return {
    view:input.view,id:input.id,range:input.range===null?null:{...input.range},countOnly:input.countOnly,title:input.title??null,
    filters:{categories:checkedFilter(input.filters.categories,categories),statuses:checkedFilter(input.filters.statuses,status)},
    fields:studentLeaveFieldNames.filter(field=>fields.includes(field)),
  };
}

function envelope(readState,selection,records,counts,reason=null){
  const view=selection?.view??'history';
  const url=view==='record'?studentLeaveBasePath+'/edit/'+selection.id:studentLeaveBasePath+'/'+view;
  const content={
    collection:'leaveRecords',readState,reason,checkedAt:new Date().toISOString(),
    selection:{view,range:selection?.range??null,filters:selection?.filters??null,fields:selection?.fields??[],countOnly:selection?.countOnly??false,
      ...(selection?.title?{title:selection.title}:{})},
    counts,records,complete:readState==='ok'||readState==='empty',
    provenance:{sourceMode:'saved_local',system:'stu.best School Affairs',officialUniversityData:false,synchronized:false},
    rules:[
      'The history and periods screens show saved stu.best leave rows. Archive adds a start date before 2019-08-01; a requested date range matches overlapping saved leave dates.',
      'The returned order is by saved leave start date, newest first. It does not establish which form was most recently filed.',
      'Saved row status and local review-request status are different fields. A filed row or resolved review does not establish approval, official filing, or an attendance mark.',
      'A null review status with reviewState no_request means no linked local review request. An unavailable review state means the linked request could not be verified.',
      'Only requested saved fields are included. No notes, reasons, phone, attachments, attendance, grades, review messages, school records or writes are available in this read.',
      'Unavailable is not empty. Compare partial counts to the reported subset before claiming how many records are present.',
    ].join(' '),
  };
  return {readState,reason,evidence:{id:'account:leaveRecords',title:'Saved student leave records',url,urls:[url],provenance:'saved_local',content:JSON.stringify(content)}};
}
const unknownCounts=()=>({matching:null,returned:null,included:0,unread:null,omitted:null,reviewUnavailable:null});
export function unavailableStudentLeaveEvidence(reason){
  return envelope('unavailable',null,[],unknownCounts(),errors.has(reason)?reason:'read_failed');
}

async function readBoundedJson(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>studentLeaveEvidenceLimits.transportBytes)fail('invalid_records');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  const stop=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',stop,{once:true});
  let text='',bytes=0,chunks=0;
  try{
    while(!signal.aborted){
      const {done,value}=await reader.read();
      if(signal.aborted)break;
      if(done)return JSON.parse(text+decoder.decode());
      bytes+=value.byteLength;
      if(bytes>studentLeaveEvidenceLimits.transportBytes||++chunks>4096)fail('invalid_records');
      text+=decoder.decode(value,{stream:true});
    }
    fail('deadline_exceeded');
  }catch(error){
    stop();
    fail(errors.has(error?.code)?error.code:'invalid_records');
  }finally{
    signal.removeEventListener('abort',stop);
    reader.releaseLock();
  }
}

async function readRows(account,table,query){
  const remaining=account.deadline-Date.now();
  if(remaining<=0)fail('deadline_exceeded');
  const url=new URL('/rest/v1/'+table,origin);
  for(const [name,value] of Object.entries(query))if(value!==null)url.searchParams.set(name,String(value));
  const controller=new AbortController();
  let timer,response;
  try{
    return await Promise.race([
      Promise.resolve().then(async()=>{
        response=await account.fetchImpl(url,{
          method:'GET',redirect:'error',signal:controller.signal,
          headers:{apikey:account.key,Authorization:'Bearer '+account.token,Prefer:'count=exact'},
        });
        if(controller.signal.aborted||Date.now()>=account.deadline){cancel(response);fail('deadline_exceeded');}
        if(![200,206].includes(response.status))
          fail([401,403].includes(response.status)?'access_denied':response.ok?'invalid_records':'read_failed');
        const range=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/u.exec(response.headers.get('content-range')??'');
        const total=range?Number(range[3]):NaN;
        if(!range||!Number.isSafeInteger(total)||total<0)fail('invalid_records');
        const rows=await readBoundedJson(response,controller.signal);
        if(controller.signal.aborted||Date.now()>=account.deadline)fail('deadline_exceeded');
        if(!Array.isArray(rows)||rows.length!==Math.min(total,query.limit)
          ||(rows.length?Number(range[1])!==0||Number(range[2])!==rows.length-1:range[1]!==undefined||total!==0))fail('invalid_records');
        if(account.observeRead)account.observeRead(studentLeaveObservationDigest({
          callerId:account.userId,method:'GET',url:url.href,prefer:'count=exact',statusCode:response.status,
          contentRange:range[0],rowsDigest:studentLeaveRowsDigest(rows),
        }));
        return {rows,total};
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        controller.abort();
        reject(Object.assign(new Error('Leave lookup deadline expired.'),{code:'deadline_exceeded'}));
      },remaining);}),
    ]);
  }catch(error){
    cancel(response);
    fail(errors.has(error?.code)?error.code:'read_failed');
  }finally{
    clearTimeout(timer);
  }
}

const physicalColumns={title:'title',status:'status',category:'leave_category',periods:'periods',reviewStatus:'review_request_id'};
const hasFilter=selection=>selection.included.length>0||selection.excluded.length>0;
const matchesFilter=(value,allowed,selection)=>allowed.includes(value)
  &&(!selection.included.length||selection.included.includes(value))&&!selection.excluded.includes(value);
async function leaveRows(account,selection){
  const {view,id,range,fields,title,filters:{categories:categoryFilter,statuses:statusFilter}}=selection;
  const categorySelected=fields.includes('category')||hasFilter(categoryFilter);
  const statusSelected=fields.includes('status')||hasFilter(statusFilter);
  const columns=['id','user_id','service_key','record_type','starts_on','ends_on',
    ...(title||fields.includes('title')?['title']:[]),
    ...(statusSelected?['status']:[]),...(categorySelected?['leave_category']:[]),
    ...fields.filter(field=>field==='periods'||field==='reviewStatus').map(field=>physicalColumns[field])];
  const filters=[];
  if(view==='archive')filters.push('starts_on.lt.'+studentLeaveArchiveCutoff);
  if(range)filters.push('starts_on.lte.'+range.through,'ends_on.gte.'+range.from);
  for(const [column,filter] of [['leave_category',categoryFilter],['status',statusFilter]]){
    if(filter.included.length)filters.push(column+'.in.('+filter.included.join(',')+')');
    if(filter.excluded.length)filters.push(column+'.not.in.('+filter.excluded.join(',')+')');
  }
  const result=await readRows(account,'affairs_service_records',{
    select:columns.join(','),user_id:'eq.'+account.userId,service_key:'eq.leave',record_type:'eq.leave',
    id:id?'eq.'+id:null,title:title?'eq.'+title:null,and:filters.length?'('+filters.join(',')+')':null,
    order:'starts_on.desc,id.asc',limit:id||selection.countOnly?1:studentLeaveEvidenceLimits.rows,
  });
  if(id&&result.total>1)fail('invalid_records');
  const seen=new Set(),reviewIds=new Set();
  let previous;
  for(const row of result.rows){
    if(!exact(row,columns)||row.user_id!==account.userId||row.service_key!=='leave'||row.record_type!=='leave'
      ||!isStudentLeaveUuid(row.id)||seen.has(row.id)||id&&row.id!==id||!isStudentLeaveDate(row.starts_on)||!isStudentLeaveDate(row.ends_on)
      ||row.starts_on>row.ends_on||view==='archive'&&row.starts_on>=studentLeaveArchiveCutoff
      ||range&&(row.starts_on>range.through||row.ends_on<range.from)
      ||previous&&(row.starts_on>previous.starts_on||row.starts_on===previous.starts_on&&row.id<=previous.id))fail('invalid_records');
    if(statusSelected&&!matchesFilter(row.status,status,statusFilter))fail('invalid_records');
    if(categorySelected&&!matchesFilter(row.leave_category,categories,categoryFilter))fail('invalid_records');
    if((title||fields.includes('title'))&&(!isStudentLeaveTitle(row.title)||title&&row.title!==title))fail('invalid_records');
    if(selection.fields.includes('periods')&&(typeof row.periods!=='string'||!row.periods.trim()
      ||[...row.periods].length>80||/[\p{Cc}\p{Cs}]/u.test(row.periods)))fail('invalid_records');
    if(selection.fields.includes('reviewStatus')&&row.review_request_id!==null){
      if(!isStudentLeaveUuid(row.review_request_id)||reviewIds.has(row.review_request_id))fail('invalid_records');
      reviewIds.add(row.review_request_id);
    }
    seen.add(row.id);
    previous=row;
  }
  return {...result,reviewIds};
}

async function readReviewStatuses(account,ids){
  const statuses=new Map();
  if(!ids.size)return statuses;
  const columns=['id','user_id','request_type','status'];
  const {rows,total}=await readRows(account,'affairs_service_requests',{
    select:columns.join(','),user_id:'eq.'+account.userId,request_type:'eq.general',
    id:'in.('+[...ids].sort().join(',')+')',order:'id.asc',limit:ids.size,
  });
  if(total>ids.size)fail('invalid_records');
  let previous='';
  for(const row of rows){
    if(!exact(row,columns)||!ids.has(row.id)||row.id<=previous||row.user_id!==account.userId||row.request_type!=='general'
      ||!reviewStatus.includes(row.status))fail('invalid_records');
    statuses.set(row.id,row.status);
    previous=row.id;
  }
  return statuses;
}

/** Uses only the verified caller JWT. The graph owns retries and all writes. */
export async function readStudentLeaveEvidence(account,options={},dependencies={}){
  let selection;
  try{
    if(!object(options)||Object.keys(options).some(key=>!['selection','deadline'].includes(key))
      ||!object(dependencies)||Object.keys(dependencies).some(key=>!['fetchImpl','observeRead'].includes(key))
      ||dependencies.fetchImpl!==undefined&&typeof dependencies.fetchImpl!=='function'
      ||dependencies.observeRead!==undefined&&typeof dependencies.observeRead!=='function')fail('invalid_options');
    selection=checkedSelection(options.selection);
    if(!object(account)||!object(account.user)||!isStudentLeaveUuid(account.user.id)||account.url!==origin
      ||typeof account.key!=='string'||!account.key.trim()||typeof account.token!=='string'||!account.token.trim()
      ||/[\p{Cc}]/u.test(account.key+account.token))fail('invalid_account');
    if(![options.deadline,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))fail('invalid_options');
    const captured=Object.freeze({
      userId:account.user.id,key:account.key,token:account.token,fetchImpl:dependencies.fetchImpl??globalThis.fetch,observeRead:dependencies.observeRead,
      deadline:Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+studentLeaveEvidenceLimits.deadlineMs),
    });
    const result=await leaveRows(captured,selection);
    let reviews;
    try{reviews=await readReviewStatuses(captured,result.reviewIds);}
    catch{reviews=new Map();}
    const records=(selection.countOnly?[]:result.rows).map(row=>{
      const record={};
      for(const field of selection.fields){
        if(field==='dates'){record.startsOn=row.starts_on;record.endsOn=row.ends_on;}
        else if(field==='reviewStatus'){
          record.reviewStatus=reviews.get(row.review_request_id)??null;
          record.reviewState=row.review_request_id===null?'no_request':record.reviewStatus===null?'unavailable':'saved';
        }else record[field]=row[physicalColumns[field]];
      }
      return record;
    });
    const counts={
      matching:result.total,returned:result.rows.length,included:records.length,unread:selection.countOnly?0:result.total-result.rows.length,
      omitted:0,reviewUnavailable:result.reviewIds.size-reviews.size,
    };
    const reply=()=>{
      const reason=counts.omitted?'response_budget':counts.unread?'row_limit':counts.reviewUnavailable?'review_unavailable':null;
      return envelope(reason?'partial':result.total?'ok':'empty',selection,records,counts,reason);
    };
    let evidence=reply();
    while(Buffer.byteLength(evidence.evidence.content)>studentLeaveEvidenceLimits.responseBytes){
      if(!records.length)fail('invalid_records');
      records.pop();
      counts.included=records.length;
      counts.omitted=counts.returned-records.length;
      evidence=reply();
    }
    return evidence;
  }catch(error){
    return envelope('unavailable',selection??null,[],unknownCounts(),errors.has(error?.code)?error.code:'read_failed');
  }
}
