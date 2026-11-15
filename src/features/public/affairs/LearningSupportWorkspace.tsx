import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {changeLearningSupport,LearningSupportError,learningSupportLabels,loadLearningSupport,type LearningSupportAction} from '@/services/learningSupport';
import type {LearningSupportRow,LearningSupportView} from '../../../../server/learningSupport.js';
import {learningSupportPath,studentServiceByKey} from './studentServices.js';
import './student-services.css';

const date=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'});
const source=studentServiceByKey('27-1')?.officialUrl;
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'暫時無法完成操作。';
const titles={
  submit_learning_support:'確認送出 · Confirm submission',
  withdraw_learning_support:'確認撤回 · Confirm withdrawal',
  review_learning_support:'確認審查變更 · Confirm review change',
};
type Draft={action:LearningSupportAction;topic:string};
type ViewResult={key:string;view?:LearningSupportView;error?:string};

export function LearningSupportWorkspace({userId,review}:{userId:string;review:boolean}){
  const [page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [result,setResult]=useState<ViewResult|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [sent,setSent]=useState(false),[busy,setBusy]=useState(false),[conflict,setConflict]=useState(false);
  const [failure,setFailure]=useState(''),[notice,setNotice]=useState('');
  const form=useRef<HTMLFormElement|null>(null),pending=useRef<AbortController|null>(null);
  const key=review+':'+page+':'+revision;
  const current=result?.key===key?result:null;
  const view=current?.view;
  useEffect(()=>{
    const controller=new AbortController();
    void loadLearningSupport(userId,review,page,controller.signal)
      .then(view=>{if(!controller.signal.aborted)setResult({key,view});})
      .catch(error=>{if(!controller.signal.aborted)setResult({key,error:errorMessage(error)});});
    return ()=>controller.abort();
  },[userId,review,page,key]);
  useEffect(()=>()=>pending.current?.abort(),[]);

  function open(next:Draft){
    setSent(false);setConflict(false);setFailure('');setNotice('');setDraft(next);
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const topic=String(fields.get('topic')??'').trim(),details=String(fields.get('details')??'').trim();
    if([...topic].length<3||[...details].length<5){setNotice('請填寫主題和學習需求。 Enter a topic and the support you need.');return;}
    open({topic,action:{kind:'submit_learning_support',payload:{request_id:crypto.randomUUID(),topic,details}}});
  }
  function change(row:LearningSupportRow){
    const payload={request_id:crypto.randomUUID(),id:row.id,expected_version:row.version};
    open({topic:row.topic,action:review?
      {kind:'review_learning_support',payload:{...payload,status:row.status==='submitted'?'in_review':'reviewed',note:row.reviewNote}}:
      {kind:'withdraw_learning_support',payload}});
  }
  function refresh(){
    setDraft(null);setRevision(value=>value+1);
  }
  async function confirm(){
    if(!draft||pending.current||conflict)return;
    const controller=new AbortController(),action=draft.action;
    pending.current=controller;setSent(true);setBusy(true);setFailure('');
    try{
      const receipt=await changeLearningSupport(userId,action,controller.signal);
      if(!controller.signal.aborted){
        if(action.kind==='submit_learning_support'){form.current?.reset();setPage(1);}
        setNotice(learningSupportLabels[receipt.status]);refresh();
        window.dispatchEvent(new Event('school-affairs:updated'));
      }
    }catch(error){
      if(!controller.signal.aborted){setFailure(errorMessage(error));setConflict(error instanceof LearningSupportError&&error.status===409);}
    }finally{
      pending.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }

  return <section className="student-service">
    <Link className="student-service-back" to="/school-affairs/menu/sao/all">返回學務資訊 · Student Affairs</Link>
    <header className="student-service-title"><h1>{review?'站內學習輔導審查 · Learning support review':'學習輔導申請 · Learning support request'}</h1></header>
    <div className="student-service-bar"><nav aria-label="Learning support">
      <Link to={learningSupportPath} aria-current={review?undefined:'page'}>我的申請 · My requests</Link>
      <Link to={learningSupportPath+'/notes'}>追蹤備註 · Tracking notes</Link>
      {view?.canReview&&<Link to={learningSupportPath+'/review'} aria-current={review?'page':undefined}>站內審查 · Review requests</Link>}
    </nav></div>
    <div className="student-service-body">
      {!review&&<p>此表單送交 stu.best 站內審查。{source&&<>校方勵學金申請請使用 <a href={source} target="_blank" rel="noopener noreferrer">校方申請系統</a>。</>}<br/>This form opens a request for review on stu.best.</p>}
      {!current&&<p role="status">載入申請紀錄… · Loading requests…</p>}
      {current?.error&&<p role="alert" className="student-service-error">{current.error} <Button type="button" variant="outline" onClick={refresh}>重試 · Retry</Button></p>}
      {notice&&<p role="status" className="student-service-status">{notice}</p>}
      {view&&!review&&<form ref={form} className="student-service-form" onSubmit={submit}>
        <label>學習主題 · Topic<Input name="topic" minLength={3} maxLength={160} required /></label>
        <label>需要的輔導 · Support needed<Textarea name="details" rows={4} minLength={5} maxLength={1200} required /></label>
        <div><Button type="submit">準備送出 · Review submission</Button></div>
      </form>}
      {view&&<>
        <h2>{review?'申請紀錄 · Requests for review':'申請紀錄 · Saved requests'}</h2>
        {view.rows.length===0?<p>此頁沒有申請紀錄。 · No requests on this page.</p>:
          <div className="student-service-table-scroll" role="region" aria-label="Learning support requests" tabIndex={0}>
            <table className="student-service-table">
              <thead><tr><th scope="col">主題與需求 · Request</th><th scope="col">站內狀態 · Site status</th><th scope="col">更新 · Updated</th><th scope="col">操作 · Actions</th></tr></thead>
              <tbody>{view.rows.map(row=><tr key={row.id}>
                <td><strong>{row.topic}</strong><small>{row.details}</small>{row.reviewNote&&<small>審查備註 · Review note: {row.reviewNote}</small>}</td>
                <td>{learningSupportLabels[row.status]}</td><td>{date.format(new Date(row.updatedAt))}</td>
                <td>{['submitted','in_review'].includes(row.status)&&<Button variant="outline" type="button" onClick={()=>change(row)}>
                  {review?row.status==='submitted'?'開始審查 · Start review':'完成審查 · Complete review':'撤回 · Withdraw'}
                </Button>}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        <nav aria-label="Request pages" className="student-service-actions">
          <Button type="button" variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>上一頁 · Previous</Button>
          <span>共 {view.total} 筆</span>
          <Button type="button" variant="outline" disabled={page>=1000||page*25>=view.total} onClick={()=>setPage(page+1)}>下一頁 · Next</Button>
        </nav>
      </>}
    </div>
    <Dialog open={Boolean(draft)} onOpenChange={open=>{if(!open&&!busy&&!sent)setDraft(null);}}>
      <DialogContent>
        <DialogHeader><DialogTitle>{draft?titles[draft.action.kind]:''}</DialogTitle><DialogDescription>{draft?.topic}</DialogDescription></DialogHeader>
        {draft?.action.kind==='submit_learning_support'&&<p>{draft.action.payload.details}</p>}
        {draft?.action.kind==='review_learning_support'&&<label>審查備註 · Review note
          <Textarea maxLength={600} value={draft.action.payload.note} disabled={sent||busy}
            onChange={event=>{if(draft.action.kind==='review_learning_support')
              setDraft({...draft,action:{...draft.action,payload:{...draft.action.payload,note:event.target.value}}});}} />
        </label>}
        {failure&&<p role="alert" className="student-service-error">{failure}</p>}
        <DialogFooter>
          <Button variant="outline" type="button" disabled={busy} onClick={()=>sent?refresh():setDraft(null)}>
            {sent?'重新載入 · Refresh requests':'返回 · Back'}
          </Button>
          {!conflict&&<Button type="button" disabled={busy} onClick={()=>void confirm()}>
            {busy?'處理中…':sent?'重試 · Retry':'確認 · Confirm'}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
