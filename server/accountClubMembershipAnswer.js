import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {composeCurrentStudyEvidence} from './affairsAnswer.js';
import {studyCalendar} from './affairsSchedule.js';
import {loadOwnAffairsTimetable} from './ownAffairsTimetable.js';
import {readClubStudent} from './clubStudent.js';
import {clubStudentScope} from './clubStudentContract.js';
import {clubMembershipPath,clubMembershipSelection} from './clubMembershipIntent.js';
import {schoolSubjectRecordsPath} from '../src/features/public/affairs/studentServices.js';

const membershipId='account:clubMemberships';
const courseId='account:courses';
const chinese=question=>/\p{Script=Han}/u.test(question);
const source=(id,value)=>({id,content:JSON.stringify(value)});
const text=value=>typeof value==='string'&&value.length<=320&&value.trim().length>0&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
const escape=value=>value.trim().replace(/[\\`*_~{}[\]()<>#!|]/gu,'\\$&');

export function clubMembershipBoundary(question,{foreign=false}={}){
  const zh=chinese(question);
  const title=zh?'登入查看你的社團參與紀錄':'Sign in to view your club memberships';
  const url='/school-affairs/login?next='+encodeURIComponent(clubMembershipPath);
  return {status:'handoff',answer:foreign?(zh?'我無法查閱其他學生的社團參與紀錄。':'I can’t access another student’s club records.'):`[${title}](${url})`,
    citations:foreign?[]:[{chunkId:'directory:club-memberships',title,url}],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

async function readMemberships(account,deadline){
  const value=await readClubStudent({...account,requestDeadline:Math.min(deadline,Date.now()+6500)},
    {scope:clubStudentScope,view:'my-memberships',page:'1'});
  if(Date.now()>=deadline||value.eligible||new Set(value.rows.map(row=>row.id)).size!==value.rows.length||value.rows.some(row=>
    !text(row.name)||!text(row.role_label)||(row.academic_year!==null&&(row.academic_year<89||row.academic_year>199))
    ||(row.term!==null&&(row.term<1||row.term>3))))throw Error('The selected club memberships could not be checked.');
  return source(membershipId,{checkedAt:new Date().toISOString(),pageCount:value.rows.length,hasMore:value.hasMore,
    rows:value.rows.slice(0,12).map(({name,role_label,active})=>({name,role:role_label,active}))});
}

async function readCourses(account,deadline){
  const timetable=await loadOwnAffairsTimetable(account,{deadline});
  const records=studyCalendar(timetable.courses,timetable.checkedAt).current;
  return source(courseId,{collection:'courses',checkedAt:timetable.checkedAt,studentRecordFound:timetable.studentRecordFound,
    selection:{scope:'current_enrolled_term',matchingRows:records.length},records:records.slice(0,12)});
}

function compose(question,selection,evidence){
  if(!evidence.length)return null;
  const zh=chinese(question),t=(en,cn)=>zh?cn:en;
  const membership=evidence.find(row=>row.id===membershipId),courses=evidence.find(row=>row.id===courseId);
  const exact=membership?JSON.parse(membership.content):null;
  const title=t('My club memberships','我的社團參與紀錄');
  const rows=exact?.rows.map(({name,role,active})=>[name,role,active?t('Active','運作中'):t('Inactive','已停用')])??[];
  const clubStatus=t('Club status','社團狀態');
  const note=t('The status is for the club itself. The saved membership gives your role.','狀態反映社團本身，已儲存的參與紀錄則列出你的角色。');
  const clubText=exact?[rows.length?rows.map(([name,role,status])=>`- ${escape(name)} · ${escape(role)} · ${clubStatus}: ${status}`).join('\n')
      :t('I found no club memberships saved for your account.','此帳戶沒有已儲存的社團參與紀錄。'),
    ...(rows.length?[note]:[]),...(exact.hasMore||exact.pageCount>rows.length?[t('More records are available on the memberships page.','更多紀錄請見社團參與紀錄頁面。')]:[]),
    `[${title}](${clubMembershipPath})`].join('\n\n')
    :t('I couldn’t verify your saved club memberships right now.','目前無法查證你的社團參與紀錄。');
  const courseText=selection.courses?(courses?composeCurrentStudyEvidence(question,[courses],{includeYear:false,requireReadStates:true}):null)
    ??t('I couldn’t verify your current subjects because the saved timetable couldn’t be read.','目前無法讀取已儲存的課表以查證本學期課程。'):null;
  const clubCitation=exact?{chunkId:membershipId,title,url:clubMembershipPath,sourceName:'School Affairs'}:null;
  const courseCitation=courses?{chunkId:courseId,title:t('Current subjects','本學期修課'),url:schoolSubjectRecordsPath,sourceName:'School Affairs'}:null;
  const parts=selection.courseFirst?[courseText,clubText]:[clubText,courseText];
  if(selection.partial)parts.push(t('The other details you asked about need a separate lookup.','你詢問的其他資料需另外查詢。'));
  return {status:'answered',answer:parts.filter(Boolean).join('\n\n'),
    citations:(selection.courseFirst?[courseCitation,clubCitation]:[clubCitation,courseCitation]).filter(Boolean),suggestedQuestions:[],
    grounding:{source:'account',webSearched:false,checkedAt:exact?.checkedAt??JSON.parse(courses.content).checkedAt,
      ...(!membership||(selection.courses&&!courses)?{degraded:true}:{})},
    ...(rows.length?{views:[{id:'club-memberships',title,url:clubMembershipPath,columns:[t('Club','社團'),t('Your role','你的角色'),clubStatus],
      rows,total:exact.pageCount,checkedAt:exact.checkedAt,note}]}:{})};
}

export async function answerClubMemberships({account,question,route,selection,deadline,onProgress}){
  if(selection.reason||!isDeepStrictEqual(selection,clubMembershipSelection(question,route)))throw Error('Invalid club membership selection.');
  const retained=new Map(),readsActivity=[];
  const reads=[{id:membershipId,tool:'clubMemberships',label:'Checked club memberships',read:readMemberships}];
  if(selection.courses)reads.push({id:courseId,tool:'courses',label:'Checked current subjects',read:readCourses});
  const read=async attempt=>{
    await Promise.all(reads.map(async ({id,tool,label,read:fetchEvidence})=>{
      if(retained.has(id))return;
      const evidence=await fetchEvidence(account,deadline).catch(()=>null);
      if(evidence)retained.set(id,evidence);
      const step={kind:`account-read:${tool}:${attempt}`,label,status:evidence?'complete':'unavailable',
        detail:evidence?'Read the selected saved records for this account.':'The selected record source could not be read.'};
      readsActivity.push(step);
      onProgress?.(step);
    }));
    return reads.map(({id})=>retained.get(id)).filter(Boolean);
  };
  const initial=await read(1);
  const empty={status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const format=evidence=>compose(question,selection,evidence)??empty;
  const result=await runAnswerVerification({question,initialAnswer:format(initial),deadline,onProgress,
    loadEvidence:({attempt})=>attempt===1?initial:read(attempt),repair:async({evidence})=>format(evidence),
    verify:async({candidate,evidence,attempt})=>!evidence.length||attempt===1&&evidence.length<reads.length
      ?{ok:false,reason:'evidence_unavailable'}:{ok:isDeepStrictEqual(candidate,format(evidence))}});
  const activity=[...readsActivity,...(result.activity??[])];
  if(!retained.size&&result.verification?.status==='unverified'){
    const zh=chinese(question);
    const answer=selection.courses?(zh?'目前無法查證你的社團參與紀錄或本學期課程。':'I couldn’t verify your saved club memberships or current subjects.')
      :(zh?'目前無法查證你的社團參與紀錄。':'I couldn’t verify your saved club memberships.');
    return {...result,answer,activity};
  }
  if(result.verification?.status==='verified'&&retained.size<reads.length){
    const step={kind:'partial-verification',label:'Verified the available records',status:'complete',
      detail:'A requested record source is still unavailable.'};
    onProgress?.(step);
    return {...result,activity:[...activity,step],verification:{...result.verification,status:'unverified',reason:'requested_record_source_unavailable'}};
  }
  return {...result,activity};
}
