import {useCallback,useEffect,useState} from 'react';
import {dtmCourseContentClient,type DtmCourseContentClient} from '@/services/dtmCourseContent';
import type {DtmAssignment} from '@/services/schoolAffairsWorkspace';

type Client=Pick<DtmCourseContentClient,'loadAssignment'>;
type State={key:string;client:Client|null;assignment:DtmAssignment|null;loading:boolean;failed:boolean};

/** Read the exact activity, even when it is outside the general workspace's first page. */
export function useDtmCourseAssignment(userId:string,courseId:string|undefined,assignmentId:string|undefined,
  refreshKey:string|undefined,client:Client=dtmCourseContentClient){
  const [attempt,setAttempt]=useState(0);
  const key=JSON.stringify([userId,courseId,assignmentId,refreshKey,attempt]);
  const enabled=Boolean(userId&&courseId&&assignmentId);
  const [state,setState]=useState<State>({key:'',client:null,assignment:null,loading:false,failed:false});
  const retry=useCallback(()=>setAttempt(value=>value+1),[]);
  useEffect(()=>{
    if(!enabled||!courseId||!assignmentId)return;
    const controller=new AbortController();
    void Promise.resolve().then(()=>{
      controller.signal.throwIfAborted();
      return client.loadAssignment(userId,courseId,assignmentId,controller.signal);
    }).then(result=>{
      if(controller.signal.aborted)return;
      const row=result.assignment;
      if(row&&(row.userId!==userId||row.courseId!==courseId||row.id!==assignmentId))throw Error('Activity scope mismatch.');
      setState({key,client,loading:false,failed:false,assignment:row?{
        id:row.id,title:row.title,details:row.details,dueAt:row.dueAt,status:row.status,
        submittedAt:row.submittedAt,sourceMode:row.sourceMode,enrollmentId:null,dtmCourseId:row.courseId,
        course:'',meetingId:row.meetingId,origin:row.origin,
      }:null});
    }).catch(()=>{
      if(!controller.signal.aborted)setState({key,client,assignment:null,loading:false,failed:true});
    });
    return()=>controller.abort();
  },[client,userId,courseId,assignmentId,enabled,key]);
  // Identity/route changes clear content during render, before the effect cleanup runs.
  return {...(enabled&&state.key===key&&state.client===client?state:{key,client,assignment:null,loading:enabled,failed:false}),retry};
}
