import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogTitle} from '@/components/ui/dialog';
import {ClearanceError,loadGraduationClearance,writeGraduationClearance} from '@/services/graduationClearance';
import {withdrawalTaipeiInput,withdrawalTime} from '../../../../server/courseWithdrawalContract.js';
import {clearanceOffices,clearancePaths,clearanceStatuses,validClearanceAction,type ClearanceAction,type ClearanceApplication,
  type ClearanceDecision,type ClearancePage,type ClearancePeriod,type ClearanceReview} from '../../../../server/graduationClearanceContract.js';
import './graduationClearance.css';

const trackNames={undergraduate:'學士或副學士',graduate:'碩博士'};
const states={scheduled:'尚未開放',open:'開放中',closed:'已結束'};
const dates=new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei',hourCycle:'h23'});
const displayDate=(value:string)=>dates.format(new Date(value));
const requestId=()=>crypto.randomUUID();
function useClearance(userId:string,scope:'student'|'manage',term='',target=''){
  const [state,setState]=useState<{key:string;data?:Awaited<ReturnType<typeof loadGraduationClearance>>;error?:string}>();
  const [version,setVersion]=useState(0);
  const [saving,setSaving]=useState(false);
  const [actionError,setActionError]=useState('');
  const [pending,setPending]=useState<ClearanceAction|null>(null);
  const [success,setSuccess]=useState(false);
  const lifetime=useRef<AbortController|null>(null);
  const writing=useRef(false);
  const key=[userId,scope,term,target,version].join('/');
  useEffect(()=>{
    const controller=new AbortController();
    lifetime.current=controller;
    void loadGraduationClearance(userId,scope,controller.signal,term,target).then(data=>{
      if(!controller.signal.aborted)setState({key,data});
    }).catch(()=>{if(!controller.signal.aborted)setState({key,error:'無法讀取離校申請紀錄。'});});
    return ()=>controller.abort();
  },[key,userId,scope,term,target]);
  function reload(){
    if(writing.current)return;
    setPending(null);setActionError('');setVersion(value=>value+1);
  }
  async function save(action:ClearanceAction){
    const controller=lifetime.current;
    if(!controller||controller.signal.aborted||writing.current)return false;
    if(!validClearanceAction(action.kind,action.payload)){setActionError('請確認欄位後再送出。');return false;}
    writing.current=true;setPending(action);setSaving(true);setActionError('');setSuccess(false);
    try{
      await writeGraduationClearance(userId,action,controller.signal);
      if(controller.signal.aborted)return false;
      setPending(null);setSuccess(true);setVersion(value=>value+1);
      return true;
    }catch(reason){
      if(!controller.signal.aborted){
        const rejected=reason instanceof ClearanceError&&[400,401,403,409].includes(reason.status);
        if(rejected)setPending(null);
        setActionError(rejected?'資料或申請期間可能已變更，請重新載入。':'尚未確認是否儲存。可重試同一筆請求。');
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

function ClearanceApplicationStatus({application,review}:{application:ClearanceApplication;review?:(row:ClearanceReview)=>void}){
  const cleared=application.reviews.filter(row=>row.status==='cleared').length;
  return <section aria-label={application.term+' 離校審核'}>
    <h2>{application.term} · {trackNames[application.track]}</h2>
    <p>申請時間 {displayDate(application.submittedAt)} · {cleared}/{application.reviews.length} 項符合</p>
    <div className="graduation-clearance-scroll" role="region" tabIndex={0} aria-label={application.term+' 審核結果表'}>
      <table><thead><tr>{['審核單位','審核結果','說明','更新時間'].map(label=><th key={label} scope="col">{label}</th>)}{review&&<th scope="col">操作</th>}</tr></thead>
        <tbody>{application.reviews.map(row=><tr key={row.office}>
          <th scope="row">{clearanceOffices[row.office][0]}</th><td>{clearanceStatuses[row.status][0]}</td>
          <td className="graduation-clearance-note">{row.note||'—'}</td><td>{row.reviewedAt?displayDate(row.reviewedAt):'—'}</td>
          {review&&<td><Button type="button" variant="outline" onClick={()=>review(row)}>編輯{clearanceOffices[row.office][0]}審核</Button></td>}
        </tr>)}</tbody>
      </table>
    </div>
    {application.track==='graduate'&&<p>碩博士生請依所屬系所及教務處公告辦理論文與紙本簽核。</p>}
  </section>;
}

function ClearanceConfirmation({model,title,description,onClose,onConfirm,children,disabled=false}:{model:ReturnType<typeof useClearance>;title:string;
  description:string;onClose:()=>void;onConfirm:()=>void;children?:ReactNode;disabled?:boolean}){
  function close(){if(model.actionError)model.reload();onClose();}
  return <Dialog open onOpenChange={open=>{if(!open&&!model.saving&&!model.pending)close();}}>
    <DialogContent showCloseButton={false}>
      <DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>
      {children}
      {model.actionError&&<p role="alert">{model.actionError}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={model.saving} onClick={close}>返回</Button>
        <Button type="button" disabled={disabled||model.saving||!!model.actionError&&!model.pending} onClick={onConfirm}>
          {model.pending&&!model.saving?'重試儲存':'確認儲存'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function GraduationClearanceWorkspace({userId,page}:{userId:string;page:ClearancePage}){
  const model=useClearance(userId,'student');
  const [selection,setSelection]=useState<ClearancePeriod|null>(null);
  const [acknowledged,setAcknowledged]=useState(false);
  const title=page==='apply'?'畢業離校申請':'離校申請狀態查詢';
  async function submit(){
    if(!selection?.candidate||!acknowledged)return;
    const action:ClearanceAction=model.pending??{kind:'submit_graduation_clearance',payload:{term_id:selection.termId,request_id:requestId(),
      period_version:selection.version,candidate_version:selection.candidate.version,acknowledged:true}};
    if(await model.save(action))setSelection(null);
  }
  return <main className="graduation-clearance" lang="zh-Hant">
    <header><Link to="/school-affairs/menu/aca/all">教務系統</Link><span>{title}</span></header>
    <div className="graduation-clearance-body">
      <nav aria-label="畢業離校"><Link to={clearancePaths.apply} aria-current={page==='apply'?'page':undefined}>畢業離校申請</Link>
        <Link to={clearancePaths.status} aria-current={page==='status'?'page':undefined}>離校申請狀態查詢</Link></nav>
      <h1>{title}</h1>
      {model.loadError?<p role="alert">{model.loadError} <Button type="button" variant="outline" onClick={model.reload}>重新載入</Button></p>:!model.data&&<p role="status">載入中…</p>}
      {model.success&&<p role="status">已儲存站內離校申請。<Link to={clearancePaths.status}>查看審核結果</Link></p>}
      {page==='apply'&&model.data&&<>
        <section className="graduation-clearance-notice" aria-label="離校申請注意事項">
          <h2>注意事項</h2>
          <p>申請前請確認已準備離校，並處理借閱物品及未結費用。送出後可查詢各單位審核進度。</p>
          <p>以下為 stu.best 站內申請。正式學籍及學位證書由校方核發。</p>
        </section>
        {!model.data.periods.length&&<p>目前沒有分配給您的申請期間。</p>}
        {model.data.periods.map(period=>{
          const existing=model.data?.applications.some(row=>row.termId===period.termId);
          return <section className="graduation-clearance-notice" key={period.termId}><h2>{period.term}</h2>
            <p>{states[period.state]} · {displayDate(period.opensAt)} 至 {displayDate(period.closesAt)}（台北時間）</p>
            {existing?<Link to={clearancePaths.status}>已送出，查看審核結果</Link>:period.state==='open'&&period.candidate&&
              <Button type="button" onClick={()=>{setAcknowledged(false);setSelection(period);}}>開始離校申請</Button>}
          </section>;
        })}
      </>}
      {page==='status'&&model.data&&(!model.data.applications.length?<p>目前無已送出的站內離校申請。</p>:
        model.data.applications.map(application=><ClearanceApplicationStatus key={application.id} application={application}/>))}
    </div>
    {selection&&<ClearanceConfirmation model={model} title="確認離校申請" description={`${selection.term} · ${trackNames[selection.candidate!.track]}`}
      onClose={()=>setSelection(null)} onConfirm={()=>void submit()} disabled={!acknowledged}>
      <label className="graduation-clearance-check"><input type="checkbox" checked={acknowledged} disabled={model.saving||!!model.pending}
        onChange={event=>setAcknowledged(event.target.checked)}/>我已詳閱注意事項，並確認要送出站內離校申請。</label>
    </ClearanceConfirmation>}
  </main>;
}

function ClearanceAdminPanel({userId,term,target,profiles,busy,onSelect}:{userId:string;term:string;target:string;busy:boolean;
  profiles:{user_id:string;display_name:string;email:string}[];onSelect:(term:string,target:string)=>void}){
  const model=useClearance(userId,'manage',term,target);
  const [action,setAction]=useState<ClearanceAction|null>(null);
  const [selectedReview,setSelectedReview]=useState<{applicationId:string;row:ClearanceReview}|null>(null);
  const data=model.data,period=data?.periods[0],application=data?.applications[0],candidate=period?.candidate;
  const disabled=busy||model.saving||!!model.pending;
  function setPeriod(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const fields=new FormData(event.currentTarget);
    setAction({kind:'set_clearance_period',payload:{request_id:requestId(),term_id:term,expected_version:period?.version??0,
      opens_at:withdrawalTime(String(fields.get('opens')))??'',closes_at:withdrawalTime(String(fields.get('closes')))??''}});
  }
  function setCandidate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const fields=new FormData(event.currentTarget),track=fields.get('track');
    if(track==='graduate'||track==='undergraduate')setAction({kind:'set_clearance_candidate',payload:{request_id:requestId(),term_id:term,user_id:target,
      track,international:fields.has('international'),expected_version:candidate?.version??0}});
  }
  function setReview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selectedReview)return;
    const fields=new FormData(event.currentTarget),decision=String(fields.get('decision')) as ClearanceDecision;
    setAction({kind:'review_clearance_office',payload:{request_id:requestId(),application_id:selectedReview.applicationId,office:selectedReview.row.office,
      decision,note:String(fields.get('note')??'').trim(),expected_version:selectedReview.row.version}});
  }
  async function confirm(){
    if(action&&await model.save(model.pending??action)){setAction(null);setSelectedReview(null);}
  }
  return <div className="graduation-clearance-admin" lang="zh-Hant">
    {model.loadError?<p role="alert">{model.loadError} <Button type="button" variant="outline" onClick={model.reload}>重新載入</Button></p>:!data&&<p role="status">載入中…</p>}
    {model.success&&<p role="status">已儲存。</p>}
    {data&&<>
      <label>學期 <select aria-label="學期" value={term} disabled={disabled} onChange={event=>onSelect(event.target.value,'')}>
        <option value="">選擇學期</option>{data.terms.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      {term&&<label>學生帳戶 <select aria-label="學生帳戶" value={target} disabled={disabled} onChange={event=>onSelect(term,event.target.value)}>
        <option value="">管理申請期間</option>{profiles.map(row=><option key={row.user_id} value={row.user_id}>{row.display_name} · {row.email}</option>)}
      </select></label>}
      {term&&!target&&<form className="affairs-record-form" onSubmit={setPeriod}>
        <label>開放時間（台北）<Input name="opens" type="datetime-local" required defaultValue={period?withdrawalTaipeiInput(period.opensAt).slice(0,16):''} disabled={disabled}/></label>
        <label>截止時間（台北）<Input name="closes" type="datetime-local" required defaultValue={period?withdrawalTaipeiInput(period.closesAt).slice(0,16):''} disabled={disabled}/></label>
        <Button type="submit" disabled={disabled}>儲存離校申請期間</Button>
      </form>}
      {term&&target&&!period&&<p>請先設定該學期的申請期間。</p>}
      {target&&period&&!application&&<form className="affairs-record-form" onSubmit={setCandidate}>
        <label>學制 <select name="track" defaultValue={candidate?.track??'undergraduate'} disabled={disabled}>
          <option value="undergraduate">學士或副學士</option><option value="graduate">碩博士</option>
        </select></label>
        <label className="graduation-clearance-check"><input name="international" type="checkbox" defaultChecked={candidate?.international} disabled={disabled}/>需境外生審核</label>
        <Button type="submit" disabled={disabled}>儲存申請資格</Button>
      </form>}
      {application&&<ClearanceApplicationStatus application={application} review={row=>{if(!disabled)setSelectedReview({applicationId:application.id,row});}}/>}
      {selectedReview&&<form key={selectedReview.row.office+':'+selectedReview.row.version} className="affairs-record-form" onSubmit={setReview}>
        <h4>{clearanceOffices[selectedReview.row.office][0]}</h4>
        <label>審核結果 <select name="decision" defaultValue={selectedReview.row.status} disabled={disabled}>
          {Object.entries(clearanceStatuses).map(([key,label])=><option key={key} value={key}>{label[0]}</option>)}
        </select></label>
        <label>說明 <Textarea name="note" maxLength={1000} defaultValue={selectedReview.row.note} disabled={disabled}/></label>
        <Button type="submit" disabled={disabled}>儲存審核結果</Button>
      </form>}
    </>}
    {action&&<ClearanceConfirmation model={model} title="確認變更" description={action.kind==='review_clearance_office'
      ?`${clearanceOffices[action.payload.office][0]} · ${clearanceStatuses[action.payload.decision][0]}`:'這項變更將儲存至 stu.best。'}
      onClose={()=>setAction(null)} onConfirm={()=>void confirm()} disabled={busy}/> }
  </div>;
}

export function GraduationClearanceManager({userId,profiles,busy}:{userId:string;profiles:{user_id:string;display_name:string;email:string}[];busy:boolean}){
  const [open,setOpen]=useState(false);
  const [selection,setSelection]=useState({term:'',target:''});
  return <section className="affairs-manager" aria-label="Graduation clearance management">
    <h3>Graduation clearance</h3>
    <Button type="button" variant="outline" aria-expanded={open} disabled={busy} onClick={()=>setOpen(value=>!value)}>{open?'Hide graduation clearance':'Manage graduation clearance'}</Button>
    {open&&<ClearanceAdminPanel key={selection.term+':'+selection.target} userId={userId} {...selection} profiles={profiles} busy={busy}
      onSelect={(term,target)=>setSelection({term,target})}/>}
  </section>;
}
