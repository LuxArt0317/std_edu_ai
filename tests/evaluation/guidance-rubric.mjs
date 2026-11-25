/** Offline independent helpfulness review. No model, runtime verdict, I/O or automatic reviewer. */
import {createHash} from 'node:crypto';

export const GUIDANCE_RUBRIC_VERSION='stu-guidance-v1';
export const GUIDANCE_CRITERIA=Object.freeze([
  'requested_parts','usable_help','next_step','honest_separation',
  'proportionate_clarification','missing_data','language_relevance',
]);
export const GUIDANCE_REASON_CODES=Object.freeze([
  'criterion_met','missing_requested_part','unhelpful_response','missing_next_step',
  'unsupported_assertion','unnecessary_clarification','missing_data_misrepresented',
  'language_mismatch','irrelevant_response','other',
]);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exactKeys=(value,required,optional=[])=>object(value)
  &&required.every(key=>Object.hasOwn(value,key))
  &&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const text=(value,maximum)=>typeof value==='string'&&value.length>0&&value.length<=maximum
  &&value.trim()===value&&![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const identityKeys=['rubricVersion','runId','finalSuiteHash','sourceRevision','caseId','inputHash','responseHash','fixtureKey'];
const invalid=code=>({status:'invalid',passed:false,criteria:[],failures:[{id:code,detail:'The independent review contract is invalid or does not match this response.'}]});

/** Canonical JSON object keys only: preserve array order, exact strings and primitive types. */
function canonicalJson(value){
  let nodes=0;
  const ancestors=new Set();
  function visit(item,depth){
    if(++nodes>200000||depth>50)throw new TypeError('Review binding input exceeds its structural limit.');
    if(item===null||typeof item==='string'||typeof item==='boolean')return JSON.stringify(item);
    if(typeof item==='number'&&Number.isFinite(item))return JSON.stringify(item);
    if(typeof item!=='object'||item===null||ancestors.has(item))throw new TypeError('Review binding requires finite JSON data.');
    if(!Array.isArray(item)&&!object(item))throw new TypeError('Review binding requires plain JSON objects.');
    if(Object.getOwnPropertySymbols(item).length)throw new TypeError('Review binding requires JSON keys.');
    ancestors.add(item);
    const descriptors=Object.getOwnPropertyDescriptors(item);
    if(Object.values(descriptors).some(row=>Object.hasOwn(row,'get')||Object.hasOwn(row,'set')))throw new TypeError('Review binding cannot invoke accessors.');
    let output;
    if(Array.isArray(item)){
      if(Object.keys(item).some(key=>!/^\d+$/u.test(key)||Number(key)>=item.length))throw new TypeError('Review binding requires ordinary JSON arrays.');
      output='['+Array.from({length:item.length},(_,i)=>visit(item[i]===undefined?null:item[i],depth+1)).join(',')+']';
    }else output='{'+Object.keys(item).sort().filter(key=>item[key]!==undefined)
      .map(key=>JSON.stringify(key)+':'+visit(item[key],depth+1)).join(',')+'}';
    ancestors.delete(item);
    return output;
  }
  const result=visit(value,0);
  if(Buffer.byteLength(result,'utf8')>8*1024*1024)throw new TypeError('Review binding input exceeds its byte limit.');
  return result;
}
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Caller binds the immutable run/suite. Optional fixtureStateHash must already exist; no new read is made. */
export function buildGuidanceReviewBinding({runId,finalSuiteHash,sourceRevision,testCase,envelope,fixtureStateHash}={}){
  if(!text(runId,200)||!digest(finalSuiteHash)||!text(sourceRevision,200)||!object(testCase)||!object(envelope)
    ||!text(testCase.id,300)||!text(testCase.fixtureKey,300)||typeof testCase.question!=='string'||!testCase.question.trim()
    ||!text(testCase.route,3100)||!object(testCase.expected)||!Number.isInteger(envelope.statusCode)
    ||envelope.fixtureKey!==testCase.fixtureKey||envelope.sourceRevision!==sourceRevision
    ||(fixtureStateHash!==undefined&&!digest(fixtureStateHash)))throw new TypeError('Invalid independent review binding input.');
  if(testCase.history!==undefined&&!Array.isArray(testCase.history))throw new TypeError('Invalid independent review history.');
  if(envelope.events!==undefined&&!Array.isArray(envelope.events))throw new TypeError('Invalid independent review telemetry.');
  const inputHash=hash({question:testCase.question,history:testCase.history??[],route:testCase.route,
    language:testCase.language??null,mode:testCase.mode??null,expected:testCase.expected,fixtureKey:testCase.fixtureKey});
  // Bind all final telemetry, including timing, integrity and action readback
  // fields used by other acceptance gates, rather than an answer-only projection.
  const responseHash=hash(envelope);
  return Object.freeze({rubricVersion:GUIDANCE_RUBRIC_VERSION,runId,finalSuiteHash,sourceRevision,
    caseId:testCase.id,inputHash,responseHash,fixtureKey:testCase.fixtureKey,
    ...(fixtureStateHash!==undefined?{fixtureStateHash}:{})});
}

function rubricContract(testCase){
  const rubric=testCase?.expected?.guidanceRubric;
  if(rubric===undefined)return null;
  if(!exactKeys(rubric,['version','criteria'])||rubric.version!==GUIDANCE_RUBRIC_VERSION
    ||!Array.isArray(rubric.criteria)||!rubric.criteria.length||rubric.criteria.length>GUIDANCE_CRITERIA.length)return false;
  const seen=new Set();
  for(const row of rubric.criteria){
    if(!exactKeys(row,['id','proof'])||!GUIDANCE_CRITERIA.includes(row.id)||seen.has(row.id)
      ||!['spans','whole_answer'].includes(row.proof))return false;
    seen.add(row.id);
  }
  return rubric;
}
function isBoundary(answer,index){
  return index===0||index===answer.length||!(answer.charCodeAt(index-1)>=0xd800&&answer.charCodeAt(index-1)<=0xdbff
    &&answer.charCodeAt(index)>=0xdc00&&answer.charCodeAt(index)<=0xdfff);
}
function validSpan(span,answer){
  return exactKeys(span,['start','end','text'])&&Number.isSafeInteger(span.start)&&Number.isSafeInteger(span.end)
    &&span.start>=0&&span.end>span.start&&span.end<=answer.length&&isBoundary(answer,span.start)&&isBoundary(answer,span.end)
    &&typeof span.text==='string'&&span.text.trim().length>0&&answer.slice(span.start,span.end)===span.text;
}
function fullRange(range,answer){
  return exactKeys(range,['start','end'])&&range.start===0&&range.end===answer.length;
}

/**
 * Validates an externally supplied assessment, not the truth of a reviewer's judgment.
 * Runner/operator authenticates reviewer identity. Model-produced answer fields are never artifacts.
 * Independent helpfulness passing is additive: factual, privacy, action and release gates still apply.
 */
export function validateGuidanceReview({testCase,envelope,binding,artifact}={}){
  const rubric=rubricContract(testCase);
  if(rubric===null)return {status:'not_required',passed:false,criteria:[],failures:[]};
  if(!rubric)return invalid('guidance.rubric');
  let expected;
  try{
    if(!exactKeys(binding,identityKeys,['fixtureStateHash']))return invalid('guidance.binding');
    expected=buildGuidanceReviewBinding({...binding,testCase,envelope});
    if(canonicalJson(binding)!==canonicalJson(expected))return invalid('guidance.binding');
  }catch{return invalid('guidance.binding');}
  if(artifact===undefined||artifact===null)return {status:'pending',passed:false,binding:expected,criteria:[],
    failures:[{id:'guidance.review_missing',detail:'An independent review of this exact response is required.'}]};
  if(!exactKeys(artifact,['binding','reviewer','criteria'])||!exactKeys(artifact.binding,identityKeys,['fixtureStateHash']))return invalid('guidance.artifact');
  try{if(canonicalJson(artifact.binding)!==canonicalJson(expected))return invalid('guidance.binding');}catch{return invalid('guidance.binding');}
  if(!exactKeys(artifact.reviewer,['id','method'])||!text(artifact.reviewer.id,200)
    ||!['manual','separate-evaluator'].includes(artifact.reviewer.method))return invalid('guidance.reviewer');
  const answer=envelope?.body?.answer;
  if(envelope.statusCode!==200||envelope.executed===false||['setup','infrastructure'].includes(envelope.failureKind)
    ||typeof answer!=='string'||!answer.trim()||answer.length>64000)return invalid('guidance.response');
  if(!Array.isArray(artifact.criteria)||artifact.criteria.length!==rubric.criteria.length)return invalid('guidance.criteria');
  const byId=new Map(rubric.criteria.map(row=>[row.id,row])),seen=new Set(),criteria=[];
  for(const row of artifact.criteria){
    if(!exactKeys(row,['id','passed','answerSpans'],['examinedRange','reasonCode','note'])||!byId.has(row.id)||seen.has(row.id)
      ||typeof row.passed!=='boolean'||!Array.isArray(row.answerSpans)||row.answerSpans.length>16
      ||(row.reasonCode!==undefined&&!GUIDANCE_REASON_CODES.includes(row.reasonCode))
      ||(row.passed&&row.reasonCode!==undefined&&row.reasonCode!=='criterion_met')
      ||(!row.passed&&(row.reasonCode===undefined||row.reasonCode==='criterion_met'))
      ||(row.note!==undefined&&(typeof row.note!=='string'||row.note.length>2000||row.note.includes('\u0000')||row.note.includes('\u007f'))))return invalid('guidance.criteria');
    seen.add(row.id);
    if(row.answerSpans.some(span=>!validSpan(span,answer)))return invalid('guidance.span');
    const proof=byId.get(row.id).proof;
    if((row.examinedRange!==undefined&&!fullRange(row.examinedRange,answer))
      ||(proof==='whole_answer'&&!fullRange(row.examinedRange,answer))
      ||(row.passed&&proof==='spans'&&!row.answerSpans.length)
      ||(!row.passed&&!row.answerSpans.length&&!fullRange(row.examinedRange,answer)))return invalid('guidance.proof');
    criteria.push({id:row.id,passed:row.passed,proof,reasonCode:row.reasonCode??'criterion_met'});
  }
  const failures=criteria.filter(row=>!row.passed).map(row=>({id:'guidance.'+row.id,detail:row.reasonCode}));
  return {status:failures.length?'failed':'passed',passed:failures.length===0,binding:expected,
    reviewer:{...artifact.reviewer},criteria:rubric.criteria.map(row=>criteria.find(item=>item.id===row.id)),failures};
}
