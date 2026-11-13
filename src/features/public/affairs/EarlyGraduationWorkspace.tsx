import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {referenceAsset} from '../site/reference';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogTitle} from '@/components/ui/dialog';
import {EarlyGraduationError,loadEarlyGraduation,writeEarlyGraduation} from '@/services/earlyGraduation';
import {adjustmentTerm} from '../../../../server/courseAdjustmentContract.js';
import {validWithdrawalTerm,withdrawalTaipeiInput,withdrawalTime} from '../../../../server/courseWithdrawalContract.js';
import {validEarlyGraduationAction,type GraduationAction,type GraduationData,type GraduationTerm}
  from '../../../../server/earlyGraduationContract.js';
import './earlyGraduation.css';

const columns=['申請學年','申請學期','學制','學系','學號','預定畢業學年','預定畢業學期','申請日期','審核結果'];
const statuses={submitted:'待審查',cancelled:'已取消',approved:'站內通過',rejected:'站內未通過'};
const eligibility={unverified:'未確認',eligible:'符合',ineligible:'不符合'};
const time=(value:string)=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',hourCycle:'h23'}).format(new Date(value));
const base=(data:GraduationData,expected_version:number)=>({
  academic_year:data.academicYear,semester:data.semester,expected_version,request_id:crypto.randomUUID(),
});

function useGraduation(userId:string,term?:GraduationTerm,target?:string){
  const [data,setData]=useState<GraduationData>();
  const [attempt,setAttempt]=useState(0);
  const [error,setError]=useState('');
  const [pending,setPending]=useState<GraduationAction|null>(null);
  const [saving,setSaving]=useState(false);
  const active=useRef<AbortController|null>(null);
  const inFlight=useRef(false);
  const academicYear=term?.academicYear,semester=term?.semester;
  useEffect(()=>{
    const controller=new AbortController();
    active.current=controller;
    void loadEarlyGraduation(userId,controller.signal,academicYear&&semester?{academicYear,semester}:undefined,target)
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(()=>{if(!controller.signal.aborted)setError('無法載入提前畢業紀錄。');});
    return ()=>controller.abort();
  },[userId,academicYear,semester,target,attempt]);
  function reload(){
    if(inFlight.current)return;
    setPending(null);setError('');setData(undefined);setAttempt(value=>value+1);
  }
  async function save(action:GraduationAction){
    const controller=active.current;
    if(!controller||controller.signal.aborted||inFlight.current)return false;
    if(!validEarlyGraduationAction(action.kind,action.payload)){setError('請確認欄位與日期。');return false;}
    inFlight.current=true;setPending(action);setSaving(true);setError('');
    try{
      await writeEarlyGraduation(userId,controller.signal,action);
      if(controller.signal.aborted)return false;
      setPending(null);setData(undefined);setAttempt(value=>value+1);
      return true;
    }catch(reason){
      if(controller.signal.aborted)return false;
      if(reason instanceof EarlyGraduationError&&[400,401,403,409].includes(reason.status)){
        setPending(null);
        setError(reason.status===409?'申請期間或紀錄已變更，請重新載入。':'無法儲存這項變更。');
      }else setError('尚未確認是否儲存成功。重試會使用同一筆請求。');
      return false;
    }finally{
      inFlight.current=false;
      if(!controller.signal.aborted)setSaving(false);
    }
  }
  return {data,error,pending,saving,save,reload};
}

function History({data}:{data:GraduationData}){
  return <section aria-label="申請紀錄狀態">
    <h2>申請紀錄狀態</h2>
    <div className="early-graduation-table" tabIndex={0} role="region" aria-label="提前畢業申請紀錄">
      <table><thead><tr>{columns.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data.records.map(row=><tr key={row.academic_year+'/'+row.semester}>
          <td>{row.academic_year}</td><td>{row.semester}</td><td>{row.study_track}</td><td>{row.department}</td><td>{row.student_number}</td>
          <td>{row.graduation_year}</td><td>{row.graduation_semester}</td><td>{time(row.applied_at)}</td><td>{statuses[row.status]}</td>
        </tr>)}
          {!data.records.length&&<tr><td colSpan={9}>無申請紀錄</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

export function EarlyGraduationWorkspace({userId}:{userId:string}){
  const model=useGraduation(userId);
  const {data}=model;
  const [confirm,setConfirm]=useState<'apply'|'cancel'|null>(null);
  const [notice,setNotice]=useState('');
  const trigger=useRef<HTMLButtonElement|null>(null);
  const main=useRef<HTMLElement|null>(null);
  const current=data?.records.find(row=>row.academic_year===data.academicYear&&row.semester===data.semester);
  const candidate=data?.candidate;
  async function save(action:GraduationAction){
    if(await model.save(action)){
      setConfirm(null);
      setNotice(action.kind==='cancel_early_graduation'?'已取消站內申請。':'已送出站內申請。');
    }
  }
  function confirmAction(){
    if(model.pending){void save(model.pending);return;}
    if(!data||data.state!=='open')return;
    if(confirm==='apply'&&candidate?.eligibility==='eligible'&&!current)
      void save({kind:'submit_early_graduation',payload:{...base(data,0),candidate_version:candidate.version}});
    if(confirm==='cancel'&&current?.status==='submitted')
      void save({kind:'cancel_early_graduation',payload:base(data,current.version)});
  }
  return <div className="early-graduation" lang="zh-Hant">
    <div className="early-graduation-frame">
      <header><Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} alt="" width="21" height="24"/>提前畢業申請</Link><span>Shu-Te University</span></header>
      <div className="early-graduation-bar"/>
      <nav aria-label="頁面位置"><Link to="/school-affairs/menu/aca/all">教務處</Link> <span aria-hidden="true">›</span> 提前畢業申請</nav>
      <main ref={main} tabIndex={-1}>
        <section className="early-graduation-instructions" aria-labelledby="graduation-notice">
          <h1 id="graduation-notice">注意事項</h1>
          <p>申請時間依教務處公告。申請前請確認已修畢規定科目及學分，並達到校、系畢業門檻。</p>
          <p>學士及副學士學生須符合下列成績或專案條件之一：</p>
          <ol>
            <li>歷年總平均名次在同系同年級前 3%。</li>
            <li>同系同年級前三名，且歷年總平均至少 80 分。</li>
            <li>已錄取並報到本校碩士班，取得指導教授同意，且歷年總平均至少 75 分。</li>
            <li>符合特殊返國情形的境外學生，可附證明提出專案申請，歷年總平均須達 80 分。</li>
          </ol>
          <p>副學士僅可提前一學期。轉學生及曾就讀本校的重考生須在本校修業至少一年。</p>
          <p>送出後可在申請期間取消。請依教務處公告查詢正式審查結果。</p>
        </section>
        {notice&&<p role="status">{notice}</p>}
        {model.error&&!confirm&&<p role="alert">{model.error} <Button type="button" variant="outline" onClick={model.reload}>重新載入</Button></p>}
        {!data&&!model.error&&<p role="status">載入申請紀錄中…</p>}
        {data&&<>
          <p className="early-graduation-state">{data.state==='open'?'站內申請期間已開放。':data.state==='scheduled'?'站內申請期間尚未開始。':'目前非申請時間！'}</p>
          {data.window&&<p>站內申請期間（台北） {time(data.window.opens_at)} 至 {time(data.window.closes_at)}</p>}
          {data.state==='open'&&<>
            <p>站內資格：{eligibility[candidate?.eligibility??'unverified']}</p>
            {!current&&candidate?.eligibility==='eligible'&&<Button type="button" onClick={event=>{trigger.current=event.currentTarget;setConfirm('apply');}}>我已詳閱注意事項，進入申請</Button>}
            {current?.status==='submitted'&&<Button type="button" variant="outline" onClick={event=>{trigger.current=event.currentTarget;setConfirm('cancel');}}>我要取消</Button>}
          </>}
          <History data={data}/>
        </>}
      </main>
      <footer>stu.best 校務資訊系統</footer>
    </div>
    <Dialog open={confirm!==null} onOpenChange={open=>{if(!open&&!model.saving&&!model.pending)setConfirm(null);}}>
      <DialogContent showCloseButton={false} onCloseAutoFocus={event=>{event.preventDefault();(trigger.current?.isConnected?trigger.current:main.current)?.focus();}}>
        <DialogTitle>{confirm==='cancel'?'取消提前畢業申請':'確認提前畢業申請'}</DialogTitle>
        <DialogDescription>{confirm==='cancel'?'取消此學期的站內申請。':'請確認學籍資料。送出後由 stu.best 審查。'}</DialogDescription>
        {confirm==='apply'&&candidate&&<p>{candidate.study_track} · {candidate.department} · {candidate.student_number}<br/>預定畢業 {candidate.graduation_year} 學年度第 {candidate.graduation_semester} 學期</p>}
        {model.error&&<p role="alert">{model.error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={model.saving} onClick={()=>{setConfirm(null);model.reload();}}>返回</Button>
          <Button type="button" disabled={model.saving||!!model.error&&!model.pending} onClick={confirmAction}>
            {model.saving?'儲存中…':model.pending?'重試儲存':confirm==='cancel'?'取消申請':'送出申請'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function ManagerEditor({userId,term,target,busy}:{userId:string;term:GraduationTerm;target?:string;busy:boolean}){
  const model=useGraduation(userId,term,target);
  const {data}=model;
  const disabled=busy||model.saving||!!model.pending;
  const current=data?.records.find(row=>row.academic_year===term.academicYear&&row.semester===term.semester);
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!data||disabled)return;
    const fields=new FormData(event.currentTarget);
    if(!target){
      void model.save({kind:'set_graduation_window',payload:{...base(data,data.window?.version??0),
        opens_at:withdrawalTime(String(fields.get('opens')))??'',closes_at:withdrawalTime(String(fields.get('closes')))??''}});
    }else if(fields.has('decision')){
      const decision=fields.get('decision');
      if(current&&(decision==='approved'||decision==='rejected'))
        void model.save({kind:'review_early_graduation',payload:{...base(data,current.version),user_id:target,decision}});
    }else{
      const choice=fields.get('eligibility');
      if(choice==='eligible'||choice==='ineligible'||choice==='unverified')
        void model.save({kind:'set_graduation_candidate',payload:{...base(data,data.candidate?.version??0),user_id:target,
          study_track:String(fields.get('study_track')).trim(),department:String(fields.get('department')).trim(),student_number:String(fields.get('student_number')).trim(),
          graduation_year:Number(fields.get('graduation_year')),graduation_semester:Number(fields.get('graduation_semester')),eligibility:choice}});
    }
  }
  return <div>
    {model.error&&<p role="alert">{model.error}</p>}
    {model.error&&!model.pending&&<Button type="button" variant="outline" onClick={model.reload}>Reload record</Button>}
    {model.pending&&!model.saving&&<Button type="button" disabled={busy} onClick={()=>{if(model.pending)void model.save(model.pending);}}>Retry save</Button>}
    {!data&&!model.error&&<p role="status">Loading early graduation…</p>}
    {data&&!target&&<form className="affairs-record-form" onSubmit={submit}>
      <p>Application window · {data.state}</p>
      <label>Opens at (Taipei)<Input name="opens" type="datetime-local" step="1" defaultValue={data.window?withdrawalTaipeiInput(data.window.opens_at):''} required disabled={disabled}/></label>
      <label>Closes at (Taipei)<Input name="closes" type="datetime-local" step="1" defaultValue={data.window?withdrawalTaipeiInput(data.window.closes_at):''} required disabled={disabled}/></label>
      <Button type="submit" disabled={disabled}>Save early graduation window</Button>
    </form>}
    {data&&target&&<>
      <form className="affairs-record-form" onSubmit={submit}>
        <p>Candidate · {data.candidate?.eligibility??'unverified'}</p>
        {([['study_track','Study track',100],['department','Department',160],['student_number','Student number',40]] as const).map(([key,label,max])=>
          <label key={key}>{label}<Input name={key} defaultValue={data.candidate?.[key]} required maxLength={max} disabled={disabled}/></label>)}
        <label>Graduation year<Input name="graduation_year" type="number" min={term.academicYear} max="999" defaultValue={data.candidate?.graduation_year??term.academicYear} required disabled={disabled}/></label>
        <label>Graduation semester<select name="graduation_semester" defaultValue={data.candidate?.graduation_semester??term.semester} disabled={disabled}><option value="1">1</option><option value="2">2</option></select></label>
        <label>Local eligibility<select name="eligibility" defaultValue={data.candidate?.eligibility??'unverified'} disabled={disabled}>
          <option value="unverified">Unverified</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option>
        </select></label>
        <Button type="submit" disabled={disabled}>Save candidate</Button>
      </form>
      {current&&<p>Application · {statuses[current.status]}</p>}
      {current?.status==='submitted'&&<form className="affairs-record-form" onSubmit={submit}>
        <label>Local review result<select name="decision" defaultValue="" required disabled={disabled}>
          <option value="">Choose a result</option><option value="approved">Approve</option><option value="rejected">Reject</option>
        </select></label>
        <Button type="submit" disabled={disabled}>Save early graduation review</Button>
      </form>}
    </>}
  </div>;
}

export function EarlyGraduationManager({userId,profiles,busy}:{userId:string;profiles:{user_id:string;display_name:string;email:string}[];busy:boolean}){
  const [open,setOpen]=useState(false);
  const [term,setTerm]=useState<GraduationTerm>(adjustmentTerm);
  const [target,setTarget]=useState('');
  return <section className="affairs-manager" aria-label="Early graduation management">
    <h3>Early graduation</h3>
    <Button type="button" variant="outline" disabled={busy} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Hide early graduation':'Manage early graduation'}</Button>
    {open&&<>
      <form className="affairs-record-form" onSubmit={event=>{
        event.preventDefault();
        const fields=new FormData(event.currentTarget);
        const academicYear=Number(fields.get('year')),semester=Number(fields.get('semester'));
        if(validWithdrawalTerm(academicYear,semester)){setTerm({academicYear,semester});setTarget(String(fields.get('student')??''));}
      }}>
        <label>Academic year<Input name="year" type="number" min="100" max="999" defaultValue={term.academicYear} required disabled={busy}/></label>
        <label>Semester<select name="semester" defaultValue={term.semester} disabled={busy}><option value="1">1</option><option value="2">2</option></select></label>
        <label>Student account<select name="student" defaultValue={target} disabled={busy}><option value="">Manage term window</option>
          {profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{profile.display_name} · {profile.email}</option>)}</select></label>
        <Button type="submit" variant="outline" disabled={busy}>Load early graduation</Button>
      </form>
      <ManagerEditor key={term.academicYear+'/'+term.semester+'/'+target} userId={userId} term={term} target={target||undefined} busy={busy}/>
    </>}
  </section>;
}
