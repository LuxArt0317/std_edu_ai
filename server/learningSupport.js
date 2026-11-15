import {AffairsWorkspaceError,requestAffairsRpc} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';

export const learningSupportScope='learning-support';
export const learningSupportReviewScope='learning-support-review';
export const learningSupportStudentActions=['submit_learning_support','withdraw_learning_support'];
export const learningSupportReviewAction='review_learning_support';
export const learningSupportMaxPayloadBytes=7000;
export const learningSupportPageSize=25;
const maxPage=1000;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const actions={submit_learning_support:'submit',withdraw_learning_support:'withdraw',review_learning_support:'review'};
const statuses=['submitted','in_review','reviewed','withdrawn'];
const invalid=()=>new AffairsWorkspaceError('Check the learning support request fields.',400);
const malformed=()=>new AffairsWorkspaceError('The saved learning support response could not be checked.');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const isUuid=value=>typeof value==='string'&&uuid.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function boundedText(value,min,max){
  if(typeof value!=='string')return false;
  const text=value.trim();
  return ![...text].some(char=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(char))
    &&integer([...text].length,min,max);
}
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  &&Number.isFinite(Date.parse(value));
const denied='This learning support operation is unavailable to your account.';
const errors={400:'Check the learning support request fields.',401:'Sign in to School Affairs again.',403:denied,
  404:'The learning support request was not found.',409:'The learning support request changed. Refresh and retry when ready.'};

export function parseLearningSupportQuery(query){
  if(!plain(query)||!Object.hasOwn(query,'scope')||Object.keys(query).some(key=>!['scope','page'].includes(key)))return null;
  const view=query.scope===learningSupportScope?'mine':query.scope===learningSupportReviewScope?'review':null;
  const page=query.page===undefined&&!Object.hasOwn(query,'page')?1:
    typeof query.page==='string'&&/^[1-9]\d{0,3}$/u.test(query.page)?Number(query.page):null;
  return view&&integer(page,1,maxPage)?{view,page}:null;
}

function validVersion(status,version,note){
  return status==='submitted'?version===1&&note==='':status==='in_review'?version===2:
    status==='reviewed'?version===3:status==='withdrawn'&&[2,3].includes(version);
}

export async function readLearningSupport(account,selector){
  if(!exact(selector,['view','page'])||!['mine','review'].includes(selector.view)||!integer(selector.page,1,maxPage))throw invalid();
  const {view,page}=selector;
  const data=await requestAffairsRpc(account,'affairs_read_learning_support',{p_view:view,p_page:page},{
    readJson:response=>readFeeRemissionJson(response,224000),errorMessages:errors,
  });
  if(!exact(data,['userId','canReview','view','page','total','rows'])||data.userId!==account.user.id||typeof data.canReview!=='boolean'
    ||data.view!==view||data.page!==page||view==='review'&&!data.canReview||!integer(data.total,0,Number.MAX_SAFE_INTEGER)
    ||!Array.isArray(data.rows)||data.rows.length!==Math.min(learningSupportPageSize,Math.max(0,data.total-(page-1)*learningSupportPageSize)))
    throw malformed();
  const seen=new Set();
  for(const row of data.rows){
    if(!exact(row,['id','ownerId','topic','details','status','reviewNote','version','submittedAt','updatedAt'])
      ||!isUuid(row.id)||!isUuid(row.ownerId)||view==='mine'&&row.ownerId!==account.user.id||seen.has(row.id)
      ||!boundedText(row.topic,3,160)||!boundedText(row.details,5,1200)||!boundedText(row.reviewNote,0,600)
      ||!validVersion(row.status,row.version,row.reviewNote)||!timestamp(row.submittedAt)||!timestamp(row.updatedAt)
      ||Date.parse(row.updatedAt)<Date.parse(row.submittedAt))throw malformed();
    seen.add(row.id);
  }
  return data;
}

function validAction(action,payload){
  if(action==='submit')return exact(payload,['request_id','topic','details'])&&isUuid(payload.request_id)
    &&boundedText(payload.topic,3,160)&&boundedText(payload.details,5,1200);
  const review=action==='review';
  if(!exact(payload,review?['request_id','id','expected_version','status','note']:['request_id','id','expected_version'])
    ||!isUuid(payload.request_id)||!isUuid(payload.id)||!integer(payload.expected_version,1,3))return false;
  return !review||['in_review','reviewed'].includes(payload.status)&&boundedText(payload.note,0,600);
}

export async function changeLearningSupport(account,kind,payload){
  if(!Object.hasOwn(actions,kind)||!validAction(actions[kind],payload)
    ||Buffer.byteLength(JSON.stringify(payload),'utf8')>learningSupportMaxPayloadBytes)throw invalid();
  const action=actions[kind];
  const result=await requestAffairsRpc(account,'affairs_change_learning_support',{p_kind:action,p_payload:payload},{
    readJson:response=>readFeeRemissionJson(response,4096),errorMessages:errors,
  });
  const expectedStatus=action==='submit'?'submitted':action==='withdraw'?'withdrawn':payload.status;
  const expectedVersion=action==='submit'?1:payload.expected_version+1;
  if(!exact(result,['id','requestId','status','version'])||!isUuid(result.id)||result.requestId!==payload.request_id
    ||action!=='submit'&&result.id!==payload.id||!statuses.includes(result.status)||result.status!==expectedStatus
    ||result.version!==expectedVersion||!validVersion(result.status,result.version,''))throw malformed();
  return result;
}
