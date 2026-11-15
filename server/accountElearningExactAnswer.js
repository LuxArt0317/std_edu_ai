import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {answerLinksSupported} from './answerVerificationModel.js';
import {readElearningEvidence} from './accountElearningEvidence.js';
import {loadDtmAssignmentList} from './dtmCourseResource.js';
import {selectElearningEvidence} from './elearningEvidenceIntent.js';
import {formatSupplementalAccountAnswers,supplementalAnswerLanguage} from './supplementalAccountAnswers.js';

const coursePath='/elearning/my-courses';
const assignmentPath='/dtm/assignments';
const enrollment=/^(?:(?:what are|list|show(?: me)?) my (?:saved )?(?:remote[- ]learning Moodle )?(?:enrollments|courses)|which remote[- ]learning Moodle courses am i enrolled in|(?:請)?(?:顯示|列出|查詢)我的(?:數位學園|遠距教學)(?:選課紀錄|課程))$/iu;
const remoteGrades=/^(?:what are my grades in remote[- ]learning Moodle|(?:show(?: me)?|list) my remote[- ]learning Moodle grades|(?:請)?(?:顯示|列出|查詢)我的(?:數位學園|遠距教學)成績)$/iu;
const unfinished=/^(?:(?:also )?(?:show(?: me)?|list) my (?:unfinished|open) DTM assignments|(?:也)?(?:請)?(?:顯示|列出|查詢)我(?:的)?(?:未完成(?:的)?數位教材作業|數位教材(?:未完成|待繳交)作業))$/iu;
const clauseSplitter=/[?？。;；]+|\.(?=\s|$)|\s+(?:and also|also|and)\s+|以及|還有/iu;
const literal=value=>value.replace(/[&<>"'\x60*_[\]()#!~|]/gu,character=>'&#'+character.codePointAt(0)+';');

/** Keep richer requests, references and extra clauses in the normal account graph. */
export function selectExactElearningReply(question,route,history=[]){
  if(typeof question!=='string'||question.length>320||history.length||typeof route!=='string')return null;
  const parts=question.normalize('NFKC').split(clauseSplitter).map(part=>part.trim().replace(/[.!！]+$/u,'')).filter(Boolean);
  if(!parts.length||parts.length>2)return null;
  const isCoursePage=route.replace(/\/$/u,'')===coursePath;
  const enrollIndex=parts.findIndex(part=>enrollment.test(part)&&(isCoursePage||/remote[- ]learning Moodle|數位學園|遠距教學/iu.test(part))
    &&selectElearningEvidence(part,route)?.enrollment===true);
  if(parts.length===1&&remoteGrades.test(parts[0])&&selectElearningEvidence(parts[0],route)?.unsupported===true)
    return {question:parts[0],enrollment:false,assignments:false,assignmentFirst:false};
  if(enrollIndex<0||parts.length===2&&!unfinished.test(parts[1-enrollIndex]))return null;
  return {question:parts[enrollIndex],enrollment:true,assignments:parts.length===2,assignmentFirst:enrollIndex===1};
}

function buildExactReply(question,plan,remote,assignments){
  const zh=supplementalAnswerLanguage(question)==='zh-TW',say=(en,cn)=>zh?cn:en;
  const answer=formatSupplementalAccountAnswers([remote],{question});
  const {selection}=JSON.parse(remote.evidence.content);
  if(remote.evidence.id!=='account:elearningEnrollments'||remote.evidence.url!==coursePath
    ||!isDeepStrictEqual(selection,{enrollment:plan.enrollment,unsupported:!plan.enrollment}))return null;
  const sections=[answer.answer],citations=[...answer.citations],sources=[remote.evidence];
  let assignmentComplete=true;
  if(plan.assignments){
    const list=assignments?.rows??[],total=assignments?.total??null;
    const heading=say('Unfinished DTM assignments','未完成的數位教材作業');
    const title=say('Open saved DTM assignments','開啟已儲存的數位教材作業');
    const url=assignmentPath;
    const lines=[];
    let remaining=4000;
    for(const row of list){
      const line='- '+literal(row.title);
      remaining-=line.length+1;
      if(remaining<0)break;
      lines.push(line);
    }
    const shown=lines.length;
    assignmentComplete=total!==null&&total===shown;
    if(!assignments)lines.push(say('The saved DTM assignment list could not be checked.','目前無法核對已儲存的數位教材作業清單。'));
    if(total===0)lines.push(say('No unfinished DTM assignments are saved in this view.','此頁沒有已儲存的未完成數位教材作業。'));
    if(total!==null&&total>shown)lines.push(say(`Showing ${shown} of ${total} matching assignments.`,`顯示 ${total} 筆中的 ${shown} 筆。`));
    if(assignments?.courseScope==='sample')lines.push(say('This view shows sample assignments.','此頁顯示範例作業。'));
    const section=['**'+heading+'**',lines.join('\n'),'['+title+']('+url+')'].join('\n\n');
    if(plan.assignmentFirst)sections.unshift(section);else sections.push(section);
    citations.push({chunkId:'account:assignments',title,url});
    sources.push({id:'account:assignments',title,url,content:JSON.stringify({rows:list.slice(0,shown).map(({title,sourceMode})=>({title,sourceMode})),total})});
  }
  const candidate={...answer,answer:sections.join('\n\n'),citations,sourceIds:sources.map(source=>source.id),
    complete:answer.complete&&assignmentComplete,
    status:assignments&&answer.status==='abstained'?'answered':answer.status};
  return answerLinksSupported(candidate.answer,sources)?{candidate,sources}:null;
}

export async function answerExactElearning({account,question,route,plan,deadline,onProgress,read=readElearningEvidence}){
  if(!isDeepStrictEqual(plan,selectExactElearningReply(question,route)))throw new TypeError('Invalid remote-learning selection.');
  const caller=Object.freeze({...account,requestDeadline:Math.min(deadline,account.requestDeadline??Infinity)});
  const asOf=Date.now(),activity=new Map();
  let remote,assignments=null;
  const emit=step=>{activity.set(step.kind,step);onProgress?.(step);};
  const tool=(name,label,attempt,complete)=>emit({kind:'account-read:'+name+':'+attempt,label,
    detail:complete?'Checked the selected saved source.':'The selected source could not be read.',status:complete?'complete':'unavailable'});
  async function acquire(attempt){
    await Promise.all([
      !remote||remote.readState==='unavailable'?(async()=>{
        remote=await read(caller,{question:plan.question,route,deadline});
        tool('elearningEnrollments',plan.enrollment?'Checked remote-learning enrollments':'Checked remote-learning capabilities',
          attempt,remote.readState!=='unavailable');
      })():null,
      plan.assignments&&!assignments?(async()=>{
        assignments=await loadDtmAssignmentList(caller,{courseId:null,mode:'open',period:null,dates:false,statuses:false,countOnly:false,asOf}).catch(()=>null);
        tool('dtm','Checked the saved DTM course scope',attempt,Boolean(assignments));
        tool('assignments','Checked unfinished DTM assignments',attempt,Boolean(assignments));
      })():null,
    ]);
    return buildExactReply(question,plan,remote,assignments);
  }
  let observed=await acquire(1),attemptNumber=1;
  const fallback={status:'abstained',answer:'',citations:[],views:[]};
  const checked=await runAnswerVerification({question,deadline,onProgress:emit,initialAnswer:observed?.candidate??fallback,
    async loadEvidence({attempt}){
      attemptNumber=attempt;
      if(attempt>1)observed=await acquire(attempt);
      return observed?.sources??[];
    },
    verify({candidate,evidence}){
      const failed=remote.readState==='unavailable'||plan.assignments&&!assignments;
      if(failed&&attemptNumber===1)return {ok:false,reason:'evidence_unavailable'};
      if(!observed||!isDeepStrictEqual(evidence,observed.sources)||!isDeepStrictEqual(candidate,observed.candidate))
        return {ok:false,reason:'source_exhausted'};
      emit({kind:'elearning-evidence-check',label:'Verified the saved sources',
        detail:failed?'Kept the verified details and identified the source that could not be read.':
          'Matched the reply and links to the selected source contents.',status:'complete'});
      return {ok:true};
    },
    repair:async()=>observed?.candidate??fallback,
  });
  return {...checked,views:checked.views??[],suggestedQuestions:[],activity:[...activity.values()],
    grounding:{source:'account',webSearched:false,checkedAt:new Date(asOf).toISOString(),
      degraded:remote.readState==='unavailable'||remote.readState==='partial'||plan.assignments&&!assignments||undefined}};
}
