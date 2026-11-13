import {useEffect,useState} from 'react';
import {dtmCourseContentClient,dtmCourseContentSections,dtmCourseMaterial,loadAllDtmCourseContent,orderedDtmCourseSections,type DtmCourseContentClient,type DtmCourseContentSnapshot,type DtmCourseContentActivity} from '@/services/dtmCourseContent';
import type {DtmMaterial} from '@/services/schoolAffairsWorkspace';
import {deadlineLabel,taipeiDateTimeInput,type DtmTranslate} from './locale';

export type DtmCourseContentProps={userId:string;courseId:string;t:DtmTranslate;refreshKey:string;onOpenAssignment:(id:string)=>void;onOpenMaterial:(material:DtmMaterial)=>void;client?:Pick<DtmCourseContentClient,'load'>};
type State={userId:string;courseId:string;refreshKey:string;client:Pick<DtmCourseContentClient,'load'>;data:DtmCourseContentSnapshot|null;error:boolean};
function CourseActivity({activity,t,open}:{activity:DtmCourseContentActivity;t:DtmTranslate;open:()=>void}){
 const deadline=activity.kind==='assignment'?activity.dueAt:null,details=activity.kind==='assignment'?activity.details:'';
 const localDeadline=deadline?taipeiDateTimeInput(deadline):'';
 const dateLabel=localDeadline?t(localDeadline.slice(0,4)+'年'+localDeadline.slice(5,7)+'月'+localDeadline.slice(8,10)+'日,'+localDeadline.slice(11),deadlineLabel(deadline||null,t)):'';
 return <li id={activity.kind+'-'+activity.id} className="dtm-course-activity">
  <div className="dtm-activity-link"><img src={'/dtm-theme/'+(activity.kind==='assignment'?'assign':'url')+'.svg'} width="24" height="24" alt=""/><button type="button" onClick={open}>{activity.title}</button></div>
  {details&&<p className="dtm-activity-description">{details}</p>}
  {deadline&&<p className="dtm-activity-deadline">{t('至','Due ')}<time dateTime={deadline} title={t('臺灣時間','Taipei time')}>{dateLabel}</time></p>}
 </li>;
}
/** The normal student view contains only observed sections and existing activities. */
export function DtmCourseContent({userId,courseId,t,refreshKey,onOpenAssignment,onOpenMaterial,client=dtmCourseContentClient}:DtmCourseContentProps){
 const [state,setState]=useState<State>(),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController(),scope={userId,courseId,refreshKey,client};
  void Promise.resolve().then(()=>{controller.signal.throwIfAborted();setState({...scope,data:null,error:false});return loadAllDtmCourseContent((options,signal)=>client.load(userId,courseId,options,signal),userId,courseId,controller.signal);}).then(data=>{if(!controller.signal.aborted)setState({...scope,data,error:false});},()=>{if(!controller.signal.aborted)setState({...scope,data:null,error:true});});
  return()=>controller.abort();
 },[userId,courseId,refreshKey,client,retry]);
 const current=state?.userId===userId&&state.courseId===courseId&&state.refreshKey===refreshKey&&state.client===client?state:undefined;
 const data=current?.data,loading=!data&&!current?.error;
 if(!data)return <div className="dtm-course-content" aria-busy={loading}>
  <p className="dtm-empty" role={current?.error?'alert':'status'}>{current?.error?t('課程內容暫時無法確認，請重試。','Course content could not be verified. Please retry.'):t('載入課程內容中…','Loading course content…')}</p>
  {current?.error&&<button type="button" className="dtm-record-title" onClick={()=>setRetry(value=>value+1)}>{t('重新載入課程內容','Reload course content')}</button>}
 </div>;
 const sections=orderedDtmCourseSections(data);
 return <div className="dtm-course-content">{dtmCourseContentSections.map(section=><section key={section.key} className="dtm-course-section"><h3>{t(section.zh,section.en)}</h3>
  {sections[section.key].length?<ul className="dtm-course-activities">{sections[section.key].map(activity=><CourseActivity key={activity.kind+':'+activity.id} activity={activity} t={t} open={()=>{if(activity.kind==='assignment')onOpenAssignment(activity.id);else onOpenMaterial(dtmCourseMaterial(activity));}}/>)}</ul>
   :<p className="dtm-activity-empty">{section.key==='assignments'?t('尚無作業。','No assignments saved.'):section.key==='quizzes'?t('尚無測驗紀錄。','No quiz records saved.'):t('尚無教材。','No course materials saved.')}</p>}
 </section>)}</div>;
}
