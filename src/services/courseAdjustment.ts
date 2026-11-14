import {affairsClient} from '../features/public/affairs/authClient';
import {
  adjustmentAction,adjustmentNoticeScope,adjustmentScope,parseAdjustmentRow,validAdjustmentSelector,
  summerNoticeScope,type SummerNotice,type AdjustmentNotice,type AdjustmentPayload,type AdjustmentPhase,type AdjustmentRow,
} from '../../server/courseAdjustmentContract.js';

type Term = {academicYear:number;semester:number};
type Selection = Term & {userId:string};
export class CourseAdjustmentError extends Error {
  readonly status:number;
  constructor(status:number) {
    super('Course adjustment request failed.');
    this.status=status;
  }
}

async function sessionToken(userId:string,signal:AbortSignal) {
  signal.throwIfAborted();
  const session=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!session||session.error||session.data.session?.user.id!==userId)throw new CourseAdjustmentError(401);
  return session.data.session.access_token;
}

async function accountRequest(userId:string,signal:AbortSignal|undefined,query:URLSearchParams,payload?:AdjustmentPayload) {
  const timeout=AbortSignal.timeout(18000);
  const bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const token=await sessionToken(userId,bounded);
  const response=await fetch(payload?'/api/affairs-manage':'/api/affairs-data?'+query,{
    method:payload?'POST':'GET',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify({kind:adjustmentAction,payload})}:{}),
    cache:'no-store',credentials:'omit',redirect:'error',signal:bounded,
  });
  if(!response.ok)throw new CourseAdjustmentError(response.status);
  const result=await response.json();
  await sessionToken(userId,bounded);
  return result;
}

export async function readCourseAdjustment(userId:string,phase:AdjustmentPhase,signal:AbortSignal,selection?:Selection,summerYear?:number):Promise<{term:Term;record:AdjustmentRow|null}> {
  const query=new URLSearchParams({scope:adjustmentScope+(selection?'-admin':''),phase});
  if(summerYear!==undefined)query.set('year',String(summerYear));
  if(selection){query.set('user_id',selection.userId);query.set('year',String(selection.academicYear));query.set('semester',String(selection.semester));}
  const data=await accountRequest(userId,signal,query);
  const target=selection?.userId??userId;
  if(data?.userId!==target||!validAdjustmentSelector(phase,data.term?.academicYear,data.term?.semester)||
     (summerYear!==undefined&&data.term.academicYear!==summerYear)||
     (selection&&(data.term.academicYear!==selection.academicYear||data.term.semester!==selection.semester)))throw new CourseAdjustmentError(503);
  const record=data.record===null?null:parseAdjustmentRow(data.record,target,phase,data.term.academicYear,data.term.semester);
  return {term:data.term,record};
}

export async function saveCourseAdjustment(userId:string,signal:AbortSignal,payload:AdjustmentPayload) {
  const result=await accountRequest(userId,signal,new URLSearchParams(),payload);
  const row=parseAdjustmentRow(result,payload.user_id,payload.phase,payload.academic_year,payload.semester);
  if(row.version!==payload.expected_version+1||row.decision!==payload.decision)throw new CourseAdjustmentError(503);
  return row;
}

export function readCourseAdjustmentAnswer(userId:string,phase:AdjustmentPhase,question:string,signal?:AbortSignal,summerYear?:number) {
  const query=new URLSearchParams({scope:adjustmentScope,phase,answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en'});
  if(summerYear!==undefined)query.set('year',String(summerYear));
  return accountRequest(userId,signal,query);
}

export async function readLateAddNotice(signal:AbortSignal):Promise<AdjustmentNotice> {
  const response=await fetch('/api/affairs-data?scope='+adjustmentNoticeScope,{signal,redirect:'error',credentials:'omit',cache:'no-store'});
  if(!response.ok)throw new CourseAdjustmentError(response.status);
  return response.json();
}

export async function readSummerNotice(year:number,signal:AbortSignal):Promise<SummerNotice|null> {
  const query=new URLSearchParams({scope:summerNoticeScope,year:String(year)});
  const response=await fetch('/api/affairs-data?'+query,{
    signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),redirect:'error',credentials:'omit',cache:'no-store',
  });
  if(!response.ok)throw new CourseAdjustmentError(response.status);
  const data=await response.json();
  if(data?.academicYear!==year||!(data.notice===null||data.notice?.academic_year===year))throw new CourseAdjustmentError(503);
  return data.notice;
}
