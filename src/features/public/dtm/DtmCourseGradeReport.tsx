import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router';
import {dtmGradeReportClient,DtmGradeReportClientError,type DtmGradeReportClient,type DtmGradeReportData} from '@/services/dtmGradeReport';
import {DtmGradeReport} from './DtmGradeReport';
import type {DtmTranslate} from './locale';

/** Read the selected owner's report independently of the personal score tracker. */
export function DtmCourseGradeReport({userId,course,t,client=dtmGradeReportClient}:{
  userId:string;course:{id:string;title:string};t:DtmTranslate;client?:Pick<DtmGradeReportClient,'load'>;
}) {
  const key=userId+':'+course.id;
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{key:string;data:DtmGradeReportData|null;busy:boolean;error:string}>({key:'',data:null,busy:true,error:''});
  const {hash}=useLocation(),root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    setState({key,data:null,busy:true,error:''});
    void client.load(userId,course.id,controller.signal).then(data=>{
      if(!controller.signal.aborted)setState({key,data,busy:false,error:''});
    },reason=>{
      if(!controller.signal.aborted)setState({key,data:null,busy:false,error:reason instanceof DtmGradeReportClientError?reason.message:'Could not load the grade report. Please retry.'});
    });
    return()=>controller.abort();
  },[client,userId,course.id,key,revision]);
  const current=state.key===key?state:{key,data:null,busy:true,error:''};
  useEffect(()=>{
    if(current.busy||current.error||!current.data?.report||!/^#report-item-[0-9a-f-]{36}$/.test(hash))return;
    const id=hash.slice(1);
    const frame=requestAnimationFrame(()=>{
      const item=document.getElementById(id);
      if(item&&root.current?.contains(item))item.scrollIntoView({block:'nearest'});
    });
    return()=>cancelAnimationFrame(frame);
  },[current.busy,current.error,current.data,hash]);
  return <div ref={root}><DtmGradeReport userId={userId} course={{...course,userId}} data={current.data}
    busy={current.busy} error={current.error} onReload={()=>setRevision(value=>value+1)} t={t}/></div>;
}
