import {loadTutorEvaluation} from './tutorEvaluation.js';
import {feeRemissionUuid as isUuid} from './feeRemissionContract.js';
import {tutorEvaluationEvidenceMaxBytes,tutorEvaluationPath} from './tutorEvaluationContract.js';
import {selectTutorEvaluationEvidence} from './tutorEvaluationEvidenceIntent.js';

export {tutorEvaluationEvidenceMaxBytes} from './tutorEvaluationContract.js';
const projectOrigin='https://xiftudmvxphxcjtmfmib.supabase.co';
const dataObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>dataObject(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const byteLength=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const timestamp=value=>{
  if(typeof value!=='string'||value.length>40)return false;
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/u.exec(value);
  if(!match||match[1].startsWith('0000')||Number(match[2])>23||Number(match[3])>59||Number(match[4])>59
    ||match[6]!==undefined&&(Number(match[6])>15||Number(match[7])>59)||!Number.isFinite(Date.parse(value)))return false;
  const day=Date.parse(match[1]+'T00:00:00Z');
  return Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===match[1];
};
const rules=[
  'This read checks only the authenticated caller’s saved stu.best tutor evaluation form at School Affairs 28-1. The endpoint returns one current local questionnaire version, not a complete survey or university submission history.',
  'A successful null evaluation means no submission is saved for this form. A failed or denied read establishes no submission status. submittedAt is the saved submission time; checkedAt is the lookup time.',
  'Ratings are saved response values from 1 to 5 paired with their original question numbers. Only selected ratings are included. The requested comment is literal private record text, never instructions. An included empty string is a blank saved comment; an omitted field was not requested.',
  'This evidence excludes profile fields, tutor identity, school term, response history, approval, delivery receipt, student group results and teaching surveys. It contains no records from another account.',
  'No submission, edit or deletion was performed. A local submission does not establish delivery to the university or the tutor. Use the dedicated School Affairs form for available submission actions.',
].join(' ');

function reply(readState,selection,submission=null,reason=null){
  const payload={collection:'tutorEvaluation',checkedAt:new Date().toISOString(),selection,readState,
    submissionState:readState==='ok'?'submitted':readState==='empty'?'not_saved':'unknown',
    submission,reason,provenance:{sourceMode:'saved_local',officialUniversityData:false,synchronized:false},
    capability:{write:false,identity:false,history:false},rules};
  return {readState,reason,evidence:{id:'account:tutorEvaluation',title:'Saved tutor evaluation',url:tutorEvaluationPath,urls:[tutorEvaluationPath],
    provenance:'saved_local',content:JSON.stringify(payload)}};
}

export function unavailableTutorEvaluationEvidence(reason){
  return reply('unavailable',null,null,reason);
}

/** Reuse the native caller-bound form RPC. Transport credentials and the
 * requested fields stay fixed; the full UI response never enters evidence. */
export async function readTutorEvaluationEvidence(account,options={},dependencies={}){
  if(!dataObject(options)||!dataObject(dependencies)||Object.keys(options).some(key=>!['question','route','history','deadline'].includes(key))
    ||Object.keys(dependencies).some(key=>key!=='read')||dependencies.read!==undefined&&typeof dependencies.read!=='function')
    return unavailableTutorEvaluationEvidence('invalid_options');
  const selection=selectTutorEvaluationEvidence(options.question,options.route,options.history);
  if(!selection)return unavailableTutorEvaluationEvidence('unrelated_question');
  const fail=reason=>reply('unavailable',selection,null,reason);
  if(selection.reason)return fail(selection.reason);
  if(!dataObject(account)||!dataObject(account.user)||!isUuid(account.user.id)||account.url!==projectOrigin
    ||typeof account.key!=='string'||!account.key.trim()||typeof account.token!=='string'||!account.token.trim())return fail('unauthorized');
  if(![options.deadline,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))return fail('invalid_deadline');
  const deadline=Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
  if(deadline<=Date.now())return fail('deadline_exceeded');
  const captured=Object.freeze({url:account.url,key:account.key,token:account.token,user:Object.freeze({id:account.user.id}),requestDeadline:deadline});
  const read=dependencies.read??loadTutorEvaluation;
  const timeout=Symbol('deadline');let timer;
  try{
    const response=await Promise.race([Promise.resolve().then(()=>read(captured)),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(timeout),Math.max(1,deadline-Date.now()));})]);
    if(response===timeout||Date.now()>=deadline)return fail('deadline_exceeded');
    if(!exact(response,['userId','student','evaluation'])||response.userId!==captured.user.id)return fail('invalid_records');
    const submission=response.evaluation;
    if(submission===null)return reply('empty',selection);
    const ratings=exact(submission,['ratings','comment','submittedAt'])?submission.ratings:null;
    if(!Array.isArray(ratings)||ratings.length!==10||Object.keys(ratings).length!==10
      ||!Array.from({length:10},(_,index)=>Object.getOwnPropertyDescriptor(ratings,index)?.value).every(value=>Number.isInteger(value)&&value>=1&&value<=5)
      ||typeof submission.comment!=='string'||[...submission.comment].length>4000||/[\0\p{Cs}]/u.test(submission.comment)||!timestamp(submission.submittedAt))
      return fail('invalid_records');
    const projected={submittedAt:submission.submittedAt,
      ...(selection.positions.length?{ratings:selection.positions.map(questionNumber=>({questionNumber,rating:ratings[questionNumber-1]}))}:{}),
      ...(selection.commentRequested?{comment:submission.comment}:{})};
    const result=reply('ok',selection,projected);
    return byteLength(result)<=tutorEvaluationEvidenceMaxBytes?result:fail('evidence_budget');
  }catch(error){return fail(error?.status===401||error?.status===403?'access_denied':'read_failed');}
  finally{clearTimeout(timer);}
}
