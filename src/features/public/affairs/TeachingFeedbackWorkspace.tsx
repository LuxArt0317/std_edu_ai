import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogTitle} from '@/components/ui/dialog';
import {loadTeachingFeedback,TeachingFeedbackError,writeTeachingFeedback} from '@/services/teachingFeedback';
import {withdrawalTaipeiInput,withdrawalTime} from '../../../../server/courseWithdrawalContract.js';
import {validTeachingFeedbackAction,type FeedbackAction,type FeedbackScope,type FeedbackStudentScope,type FeedbackRecord,type SurveyPhase,type TeachingSurvey}
  from '../../../../server/teachingFeedbackContract.js';
import './teachingFeedback.css';

const phaseNames={midterm:'期中',final:'期末'};
const windowNames={scheduled:'尚未開始',open:'開放中',closed:'已結束'};
const dateFormat=new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei',hourCycle:'h23'});
const taipei=(value:string)=>dateFormat.format(new Date(value));

function useFeedback(userId:string,scope:FeedbackScope,term='',survey='',section=''){
  const [state,setState]=useState<{key:string;data?:Awaited<ReturnType<typeof loadTeachingFeedback>>;error?:string}>();
  const [version,setVersion]=useState(0);
  const [saving,setSaving]=useState(false);
  const [actionError,setActionError]=useState('');
  const [pending,setPending]=useState<FeedbackAction|null>(null);
  const [success,setSuccess]=useState(false);
  const lifetime=useRef<AbortController|null>(null);
  const writing=useRef(false);
  const key=[userId,scope,term,survey,section,version].join('/');
  useEffect(()=>{
    const controller=new AbortController();
    lifetime.current=controller;
    const filters:Record<string,string>={};
    if(term)filters.term=term;
    if(survey&&section){filters.survey=survey;filters.section=section;}
    void loadTeachingFeedback(userId,scope,controller.signal,filters).then(data=>{
      if(!controller.signal.aborted)setState({key,data});
    }).catch(()=>{if(!controller.signal.aborted)setState({key,error:'無法讀取教學意見紀錄。'});});
    return ()=>controller.abort();
  },[key,userId,scope,term,survey,section]);
  function reload(){
    if(writing.current)return;
    setPending(null);setActionError('');setVersion(value=>value+1);
  }
  async function save(action:FeedbackAction){
    const controller=lifetime.current;
    if(!controller||controller.signal.aborted||writing.current)return false;
    if(!validTeachingFeedbackAction(action.kind,action.payload)){setActionError('請確認欄位後再送出。');return false;}
    writing.current=true;setPending(action);setSaving(true);setActionError('');setSuccess(false);
    try{
      await writeTeachingFeedback(userId,action,controller.signal);
      if(controller.signal.aborted)return false;
      setPending(null);setSuccess(true);setVersion(value=>value+1);
      return true;
    }catch(reason){
      if(!controller.signal.aborted){
        const rejected=reason instanceof TeachingFeedbackError&&[400,401,403,409].includes(reason.status);
        if(rejected)setPending(null);
        setActionError(rejected?'資料或填答期間可能已變更，請重新載入。':'尚未確認是否儲存。可重試同一筆請求。');
      }
      return false;
    }finally{
      writing.current=false;
      if(!controller.signal.aborted)setSaving(false);
    }
  }
  const current=state?.key===key?state:undefined;
  return {data:current?.data,loadError:current?.error,actionError,pending,saving,success,reload,save};
}

function FeedbackHistory({records,review}:{records:FeedbackRecord[];review?:(record:FeedbackRecord)=>void}){
  return <section aria-label={review?'待檢閱教學意見':'即時教學意見紀錄'}>
    <h2>{review?'待檢閱教學意見':'意見紀錄'}</h2>
    {!records.length?<p>{review?'目前無待檢閱意見。':'目前無意見紀錄。'}</p>:<div className="teaching-feedback-scroll" role="region" aria-label="意見紀錄表" tabIndex={0}>
      <table><thead><tr>{['課程','教學意見','送出時間','狀態'].map(label=><th key={label} scope="col">{label}</th>)}{review&&<th scope="col">操作</th>}</tr></thead>
        <tbody>{records.map(record=><tr key={record.id}>
          <td>{record.code} · {record.course}<br/>{record.term}</td><td className="teaching-feedback-comment">{record.comment}</td>
          <td>{taipei(record.submittedAt)}</td><td>{record.status==='reviewed'?'已檢閱':'已送出'}</td>
          {review&&<td><Button type="button" variant="outline" onClick={()=>review(record)}>標記已檢閱</Button></td>}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function SurveyForm({survey,section,selectAction}:{survey:TeachingSurvey;section:string;selectAction:(action:FeedbackAction)=>void}){
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    selectAction({kind:'submit_teaching_survey',payload:{survey_id:survey.id,section_id:section,request_id:crypto.randomUUID(),version:survey.version,
      ratings:survey.questions.map((_,index)=>Number(fields.get(`rating-${index}`))),comment:String(fields.get('comment')??'').trim()}});
  }
  return <form className="teaching-feedback-form" onSubmit={submit}>
    <p>請以 1 至 5 分評分。1 為非常不同意，5 為非常同意。</p>
    {survey.questions.map((question,index)=><fieldset key={question}><legend>{question}</legend><div className="teaching-feedback-ratings">
      {[1,2,3,4,5].map(rating=><label key={rating}><input type="radio" name={`rating-${index}`} value={rating} required/>{rating}</label>)}
    </div></fieldset>)}
    <label>其他意見（選填）<Textarea name="comment" maxLength={2000}/></label>
    <p>請勿在意見中填寫姓名、學號或其他可辨識您的資訊。</p>
    <Button type="submit">檢查並送出問卷</Button>
  </form>;
}

export function TeachingFeedbackWorkspace({userId,view}:{userId:string;view:FeedbackStudentScope}){
  const model=useFeedback(userId,view);
  const [selection,setSelection]=useState<{surveyId:string;sectionId:string}|null>(null);
  const [action,setAction]=useState<FeedbackAction|null>(null);
  const survey=model.data?.surveys.find(row=>row.id===selection?.surveyId);
  const selected=survey?.courses.find(course=>course.id===selection?.sectionId);
  const title=view==='survey'?'教學意見問卷調查':'即時反應教學意見';
  function immediate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    setAction({kind:'submit_teaching_feedback',payload:{section_id:String(fields.get('section')),request_id:crypto.randomUUID(),comment:String(fields.get('comment')??'').trim()}});
  }
  async function confirm(){
    if(action&&await model.save(model.pending??action)){setAction(null);setSelection(null);}
  }
  return <main className="teaching-feedback" lang="zh-Hant">
    <header><Link to="/school-affairs/menu/aca/input">教務系統</Link><span>{title}</span></header>
    <div className="teaching-feedback-body">
      <h1>{title}</h1>
      <p>{view==='survey'?'期中及期末問卷依各自開放期間填答。':'選擇本學期課程，提出教學建議。'}</p>
      {model.loadError?<p role="alert">{model.loadError} <Button type="button" variant="outline" onClick={model.reload}>重新載入</Button></p>:!model.data&&<p role="status">載入中…</p>}
      {model.success&&<p role="status">已送出。</p>}
      {view==='survey'&&model.data&&<>
        {!model.data.surveys.length&&<p>目前沒有適用於您課程的問卷。</p>}
        {model.data.surveys.map(item=><section key={item.id}>
          <h2>{item.term} · {phaseNames[item.phase]}問卷</h2>
          <p>{windowNames[item.state]} · {taipei(item.opensAt)} 至 {taipei(item.closesAt)}（台北時間）</p>
          <div className="teaching-feedback-scroll" role="region" aria-label={`${item.term} ${phaseNames[item.phase]}課程`} tabIndex={0}>
            <table><thead><tr><th scope="col">課程</th><th scope="col">班別</th><th scope="col">填答狀態</th></tr></thead>
              <tbody>{item.courses.map(course=><tr key={course.id}><td>{course.code} · {course.course}</td><td>{course.section}</td>
                <td>{course.completed?'已填答':item.state==='open'?<Button type="button" variant="outline" onClick={()=>setSelection({surveyId:item.id,sectionId:course.id})}>填答 {course.code}</Button>:'未填答'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>)}
        {survey?.state==='open'&&selected&&!selected.completed&&<section aria-label="問卷填答">
          <h2>{selected.course}</h2><SurveyForm key={survey.id+selected.id} survey={survey} section={selected.id} selectAction={setAction}/>
        </section>}
      </>}
      {view==='immediate'&&model.data&&<>
        {model.data.courses.length?<form className="teaching-feedback-form" onSubmit={immediate}>
          <label>課程<select name="section" required defaultValue=""><option value="">請選擇課程</option>{model.data.courses.map(course=><option key={course.id} value={course.id}>{course.code} · {course.course} · {course.section}</option>)}</select></label>
          <label>教學意見<Textarea name="comment" required minLength={5} maxLength={2000}/></label>
          <Button type="submit">檢查並送出意見</Button>
        </form>:<p>本學期無可填寫意見的課程。</p>}
        <FeedbackHistory records={model.data.feedback}/>
      </>}
    </div>
    <Dialog open={action!==null} onOpenChange={open=>{if(!open&&!model.saving&&!model.pending){setAction(null);if(model.actionError)model.reload();}}}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>確認送出</DialogTitle>
        <DialogDescription>送出後會儲存至 stu.best。</DialogDescription>
        {action?.kind==='submit_teaching_feedback'&&<p className="teaching-feedback-comment">{action.payload.comment}</p>}
        {model.actionError&&<p role="alert">{model.actionError}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={model.saving} onClick={()=>{setAction(null);if(model.actionError)model.reload();}}>返回</Button>
          <Button type="button" disabled={model.saving||!!model.actionError&&!model.pending} onClick={()=>void confirm()}>{model.pending&&!model.saving?'重試儲存':'確認送出'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}

function SurveySettings({term,survey,phase,disabled,selectAction}:{term:string;survey?:TeachingSurvey;phase:SurveyPhase;disabled:boolean;selectAction:(action:FeedbackAction)=>void}){
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    selectAction({kind:'save_teaching_survey',payload:{term_id:term,phase,expected_version:survey?.version??0,
      opens_at:withdrawalTime(String(data.get('opens')))??'',closes_at:withdrawalTime(String(data.get('closes')))??'',
      questions:String(data.get('questions')).split(/\r?\n/u).map(question=>question.trim()).filter(Boolean)}});
  }
  return <section aria-label={`${phaseNames[phase]}問卷設定`}>
    <h4>{phaseNames[phase]}問卷</h4>
    {survey?.released?<p>結果已發布。</p>:<form className="affairs-record-form" onSubmit={submit}>
      <label>開放時間（台北）<Input name="opens" type="datetime-local" required defaultValue={survey?withdrawalTaipeiInput(survey.opensAt).slice(0,16):''} disabled={disabled}/></label>
      <label>截止時間（台北）<Input name="closes" type="datetime-local" required defaultValue={survey?withdrawalTaipeiInput(survey.closesAt).slice(0,16):''} disabled={disabled}/></label>
      <label>題目（每行一題）<Textarea name="questions" required maxLength={2576} defaultValue={survey?.questions.join('\n')??''} disabled={disabled}/></label>
      <Button type="submit" disabled={disabled}>儲存{phaseNames[phase]}問卷</Button>
    </form>}
    {survey?.state==='closed'&&!survey.released&&<Button type="button" variant="outline" disabled={disabled} onClick={()=>selectAction({kind:'release_teaching_survey',
      payload:{survey_id:survey.id,expected_version:survey.version,confirm_release:true,grades_published:false}})}>發布{phaseNames[phase]}結果</Button>}
  </section>;
}

function ReleasedComments({userId,term,surveyId,sectionId}:{userId:string;term:string;surveyId:string;sectionId:string}){
  const model=useFeedback(userId,'manage',term,surveyId,sectionId);
  const comments=model.data?.results[0]?.comments;
  if(model.loadError)return <p role="alert">{model.loadError} <Button type="button" variant="outline" onClick={model.reload}>重新載入</Button></p>;
  if(!model.data)return <p role="status">載入意見中…</p>;
  return comments?.length?<ul>{comments.map((comment,index)=><li className="teaching-feedback-comment" key={index}>{comment}</li>)}</ul>:<p>無已發布的文字意見。</p>;
}

function FeedbackAdminPanel({userId,term,busy,onChooseTerm}:{userId:string;term:string;busy:boolean;onChooseTerm:(term:string)=>void}){
  const model=useFeedback(userId,'manage',term);
  const [action,setAction]=useState<FeedbackAction|null>(null);
  const [gradesPublished,setGradesPublished]=useState(false);
  const [showComments,setShowComments]=useState('');
  const release=action?.kind==='release_teaching_survey'&&model.data?.surveys.find(row=>row.id===action.payload.survey_id);
  const disabled=busy||model.saving||!!model.pending;
  function selectAction(next:FeedbackAction){setGradesPublished(false);setAction(next);}
  async function confirm(){
    if(!action)return;
    const confirmed=action.kind==='release_teaching_survey'?{...action,payload:{...action.payload,grades_published:gradesPublished}}:action;
    if(await model.save(model.pending??confirmed))setAction(null);
  }
  function close(){setAction(null);if(model.actionError)model.reload();}
  return <div className="teaching-feedback-admin" lang="zh-Hant">
    {model.loadError?<p role="alert">{model.loadError} <Button type="button" variant="outline" onClick={model.reload}>重新載入</Button></p>:!model.data&&<p role="status">載入設定中…</p>}
    {model.success&&<p role="status">已儲存。</p>}
    {model.data&&<>
      <label>學期 <select aria-label="學期" value={term} disabled={disabled} onChange={event=>onChooseTerm(event.target.value)}>
        <option value="">選擇學期</option>{model.data.terms.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      {term&&(['midterm','final'] as const).map(phase=>{
        const survey=model.data?.surveys.find(row=>row.phase===phase);
        return <SurveySettings key={phase+':'+(survey?.version??0)} term={term} survey={survey} phase={phase} disabled={disabled} selectAction={selectAction}/>;
      })}
      {term&&<section aria-label="已發布問卷結果"><h4>已發布問卷結果</h4>
        {!model.data.results.length&&<p>無可顯示的問卷結果。每班至少五份填答才會顯示。</p>}
        {model.data.results.map(result=>{
          const survey=model.data?.surveys.find(row=>row.id===result.surveyId);
          const key=result.surveyId+':'+result.sectionId;
          return <section key={key}><h5>{result.code} · {result.course} · {result.section}</h5>
            <p>{survey?phaseNames[survey.phase]+' · ':''}{result.count} 份填答</p>
            <ul>{result.averages.map((average,index)=><li key={index}>{survey?.questions[index]}：{average}</li>)}</ul>
            <Button type="button" variant="outline" aria-expanded={showComments===key} onClick={()=>setShowComments(value=>value===key?'':key)}>文字意見</Button>
            {showComments===key&&<ReleasedComments userId={userId} term={term} surveyId={result.surveyId} sectionId={result.sectionId}/>}
          </section>;
        })}
      </section>}
      <FeedbackHistory records={model.data.feedback} review={record=>selectAction({kind:'review_teaching_feedback',payload:{feedback_id:record.id}})}/>
    </>}
    <Dialog open={action!==null} onOpenChange={open=>{if(!open&&!disabled)close();}}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>確認儲存</DialogTitle>
        <DialogDescription>{release?'發布後即可檢視符合人數門檻的問卷結果。':'儲存這項教學意見設定或檢閱狀態。'}</DialogDescription>
        {release&&release.phase==='final'&&<label><input type="checkbox" checked={gradesPublished} disabled={disabled} onChange={event=>setGradesPublished(event.target.checked)}/> 已確認期末成績公布</label>}
        {model.actionError&&<p role="alert">{model.actionError}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={model.saving} onClick={close}>返回</Button>
          <Button type="button" disabled={busy||model.saving||!!model.actionError&&!model.pending||!!release&&release.phase==='final'&&!gradesPublished}
            onClick={()=>void confirm()}>{model.pending&&!model.saving?'重試儲存':'確認儲存'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

export function TeachingFeedbackManager({userId,busy}:{userId:string;busy:boolean}){
  const [open,setOpen]=useState(false);
  const [term,setTerm]=useState('');
  return <section className="affairs-manager" aria-label="Teaching feedback management">
    <h3>Teaching evaluations and feedback</h3>
    <Button type="button" variant="outline" aria-expanded={open} onClick={()=>setOpen(value=>!value)} disabled={busy}>{open?'Hide teaching feedback':'Manage teaching feedback'}</Button>
    {open&&<FeedbackAdminPanel key={term} userId={userId} term={term} busy={busy} onChooseTerm={setTerm}/>}
  </section>;
}
