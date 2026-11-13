import {useCallback,useEffect,useState} from 'react';
import {dtmCourseResourceClient,parseDtmCourseResourceData,type DtmCourseResourceClient,type DtmCourseResourceData} from '@/services/dtmCourseResource';

type State={key:string;client:DtmCourseResourceClient|null;data:DtmCourseResourceData|null;loading:boolean;failed:boolean};
export function useDtmCourseResource(userId:string,courseId?:string,materialId?:string,refreshKey?:string,client:DtmCourseResourceClient=dtmCourseResourceClient){
  const [attempt,setAttempt]=useState(0);
  const key=JSON.stringify([userId,courseId,materialId,refreshKey,attempt]);
  const enabled=Boolean(userId&&courseId&&materialId);
  const [state,setState]=useState<State>({key:'',client:null,data:null,loading:false,failed:false});
  const retry=useCallback(()=>setAttempt(value=>value+1),[]);
  useEffect(()=>{
    if(!enabled||!courseId||!materialId)return;
    const controller=new AbortController();
    void Promise.resolve().then(()=>{
      controller.signal.throwIfAborted();return client.load(userId,courseId,materialId,controller.signal);
    }).then(value=>{
      if(controller.signal.aborted)return;
      const data=parseDtmCourseResourceData(value,userId,courseId,materialId);
      setState({key,client,data,loading:false,failed:false});
    }).catch(()=>{if(!controller.signal.aborted)setState({key,client,data:null,loading:false,failed:true});});
    return()=>controller.abort();
  },[client,userId,courseId,materialId,enabled,key]);
  // Hide the old account/route/client result during render, before effect cleanup.
  const current=enabled&&state.key===key&&state.client===client?state:{data:null,loading:enabled,failed:false};
  return {data:current.data,loading:current.loading,failed:current.failed,retry};
}
