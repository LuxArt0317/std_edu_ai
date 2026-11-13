import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {DtmGradeReportClientError,dtmGradeLiteral,dtmGradeReportClient,dtmGradeUuid,parseDtmGradeReportOverviewData,
  type DtmGradeReportClient,type DtmGradeReportOverviewData} from '@/services/dtmGradeReport';
import type {DtmTranslate} from './locale';
import './dtmGradeOverview.css';

type OverviewClient=Pick<DtmGradeReportClient,'loadOverview'>;
export type DtmGradeOverviewProps={userId:string;client?:OverviewClient;t?:DtmTranslate};
type State={userId:string;client:OverviewClient;courses:DtmGradeReportOverviewData['courses'];nextCursor:string|null;loaded:boolean;pending:boolean;failed:boolean};
type Scope={controller:AbortController;state:State;pending:boolean;notify:(state:State)=>void};
const chinese:DtmTranslate=zh=>zh;

function publish(scope:Scope,patch:Partial<State>){
  if(scope.controller.signal.aborted)return;
  scope.state={...scope.state,...patch};scope.notify(scope.state);
}
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{
      signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);
    },error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function loadNext(scope:Scope){
  if(scope.controller.signal.aborted||scope.pending||(scope.state.loaded&&scope.state.nextCursor===null))return;
  if(!dtmGradeUuid(scope.state.userId)){publish(scope,{pending:false,failed:true});return;}
  scope.pending=true;publish(scope,{pending:true,failed:false});
  const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(new DOMException('Overview request timed out.','TimeoutError')),30000);
  const signal=AbortSignal.any([scope.controller.signal,deadline.signal]);
  const afterId=scope.state.loaded?scope.state.nextCursor??undefined:undefined;
  try{
    const raw=await within(()=>scope.state.client.loadOverview(scope.state.userId,afterId?{afterId}:{},signal),signal);
    const page=parseDtmGradeReportOverviewData(raw,scope.state.userId,afterId);signal.throwIfAborted();
    // The page parser enforces a strict cursor, ordering and exact ownership. Keep
    // the cross-page invariant explicit before accepting any additional rows.
    const courses=[...scope.state.courses,...page.courses];
    if(new Set(courses.map(course=>course.id)).size!==courses.length)throw Error('Repeated course page.');
    publish(scope,{courses,nextCursor:page.nextCursor,loaded:true,pending:false,failed:false});
  }catch(reason){
    // A later-page failure keeps only previously verified rows and the same cursor.
    // Authentication/permission loss instead invalidates the retained account view.
    const denied=reason instanceof DtmGradeReportClientError&&[401,403].includes(reason.status);
    publish(scope,{...(denied?{courses:[],nextCursor:null,loaded:false}:{}),pending:false,failed:true});
  }finally{clearTimeout(timer);scope.pending=false;}
}

/** The overview lists owned courses and literal saved totals, never tracker arithmetic. */
export function DtmGradeOverview({userId,client=dtmGradeReportClient,t=chinese}:DtmGradeOverviewProps){
  const [state,setState]=useState<State>();
  const lifetime=useRef<Scope|null>(null);
  useEffect(()=>{
    const scope:Scope={controller:new AbortController(),pending:false,notify:setState,
      state:{userId,client,courses:[],nextCursor:null,loaded:false,pending:false,failed:false}};
    lifetime.current=scope;void loadNext(scope);
    return()=>{scope.controller.abort();if(lifetime.current===scope)lifetime.current=null;};
  },[userId,client]);
  const current=state?.userId===userId&&state.client===client?state:undefined;
  const pending=!current||current.pending;
  const more=()=>{const scope=lifetime.current;if(scope?.state.userId===userId&&scope.state.client===client)void loadNext(scope);};
  return <div className="dtm-grade-overview" aria-busy={pending}>
    {current?.loaded&&<div className="dtm-grade-overview-scroll" role="region" aria-label={t('課程成績綜覽','Course grade overview')} tabIndex={0}>
      <table className="dtm-grade-overview-table">
        <colgroup><col className="dtm-grade-overview-course-column"/><col/></colgroup>
        <thead><tr><th scope="col">{t('課程名稱','Course name')}</th><th scope="col">{t('成績','Grade')}</th></tr></thead>
        <tbody>{current.courses.map(course=><tr key={course.id}>
          <td><Link to={'/dtm/course/'+course.id+'/grades'}>{course.title}</Link></td><td>{dtmGradeLiteral(course.gradeText)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {pending&&<p role="status">{t('載入課程成績綜覽中…','Loading the course grade overview…')}</p>}
    {current?.failed&&<p role="alert">{current.loaded
      ?t(`尚有課程未完成載入；目前僅顯示已確認的 ${current.courses.length} 門課程。請重試。`,`More courses could not be loaded. Only ${current.courses.length} verified courses are shown. Please retry.`)
      :t('課程成績綜覽暫時無法確認，請重試。','The course grade overview could not be verified. Please retry.')}</p>}
    {current?.loaded&&!current.pending&&!current.failed&&current.nextCursor!==null&&<p role="status">{t(`已載入 ${current.courses.length} 門課程，尚有更多課程。`,`Loaded ${current.courses.length} courses; more courses remain.`)}</p>}
    {current?.loaded&&!current.courses.length&&current.nextCursor===null&&!current.failed&&<p role="status">{t('目前沒有已儲存的課程。','No saved courses are available.')}</p>}
    {current?.failed&&!pending&&<button className="dtm-grade-overview-more" type="button" onClick={more}>{t('重試','Retry')}</button>}
    {current?.loaded&&current.nextCursor!==null&&!current.failed&&<button className="dtm-grade-overview-more" type="button" disabled={pending} onClick={more}>{t('載入更多課程','Load more courses')}</button>}
  </div>;
}
