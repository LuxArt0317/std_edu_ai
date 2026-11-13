import {useCallback,useEffect,useState} from 'react';
import {dtmCourseContentClient,parseDtmCourseContentData,type DtmCourseContentClient,type DtmCourseContentCourse} from '@/services/dtmCourseContent';

type Client=Pick<DtmCourseContentClient,'load'>;
type State={key:string;client:Client|null;course:DtmCourseContentCourse|null;loading:boolean;failed:boolean};

/** Resolve only the scoped header; the course-content view owns the complete inventory. */
export function useDtmCourseHeader(userId:string,courseId?:string,refreshKey?:string,client:Client=dtmCourseContentClient){
  const [attempt,setAttempt]=useState(0);
  const key=JSON.stringify([userId,courseId,refreshKey,attempt]);
  const enabled=Boolean(userId&&courseId);
  const [state,setState]=useState<State>({key:'',client:null,course:null,loading:false,failed:false});
  const retry=useCallback(()=>setAttempt(value=>value+1),[]);
  useEffect(()=>{
    if(!enabled||!courseId)return;
    const controller=new AbortController();
    void Promise.resolve().then(()=>{
      controller.signal.throwIfAborted();
      // The existing client bounds the entire first-page request to 30s/196608 bytes.
      return client.load(userId,courseId,{},controller.signal);
    }).then(value=>{
      if(controller.signal.aborted)return;
      const {course}=parseDtmCourseContentData(value,userId,courseId);
      setState({key,client,course,loading:false,failed:false});
    }).catch(()=>{if(!controller.signal.aborted)setState({key,client,course:null,loading:false,failed:true});});
    return()=>controller.abort();
  },[client,userId,courseId,enabled,key]);
  const current=enabled&&state.key===key&&state.client===client?state:{course:null,loading:enabled,failed:false};
  return {course:current.course,loading:current.loading,failed:current.failed,retry};
}
