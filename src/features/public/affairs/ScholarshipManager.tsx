import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {AffairsManagerAction,AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {scholarshipApplicantLabel,scholarshipDate,scholarshipStatusLabels,type ScholarshipApplication,type ScholarshipPeriod} from '@/services/scholarship';
import './student-scholarship.css';

type Admin=NonNullable<AffairsSnapshot['admin']>;
const localDate=(value:string)=>new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).replace(' ','T').slice(0,16);
const toIso=(value:string)=>new Date(`${value}:00+08:00`).toISOString();

export function ScholarshipManager({admin,busy,onManage}:{admin:Admin;busy:boolean;onManage:(action:AffairsManagerAction)=>Promise<boolean>}) {
  const [period,setPeriod]=useState<ScholarshipPeriod|null>(null);
  const [periodKey,setPeriodKey]=useState(0);
  const [newId,setNewId]=useState(()=>crypto.randomUUID());
  const [review,setReview]=useState<ScholarshipApplication|null>(null);
  const [decision,setDecision]=useState('approved');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const receipt=useRef<{body:string;id:string}|null>(null);
  const records=admin.scholarship;
  if (!records) return null;
  const periodNames=new Map(records.periods.map(item=>[item.id,item.termLabel]));
  const profiles=new Map(admin.profiles.map(item=>[item.user_id,scholarshipApplicantLabel(item)]));
  const locked=busy||saving;
  async function send(kind:AffairsManagerAction['kind'],payload:Record<string,string>) {
    const body=JSON.stringify({kind,payload});
    if (receipt.current?.body!==body) receipt.current={body,id:crypto.randomUUID()};
    setSaving(true);setError('');
    try {
      const ok=await onManage({kind,payload:{...payload,request_id:receipt.current.id}});
      if (ok) receipt.current=null;
      return ok;
    } catch(reason) {setError(reason instanceof Error?reason.message:'Unable to save scholarship records.');return false;}
    finally {setSaving(false);}
  }
  function clearPeriod() {setPeriod(null);setPeriodKey(value=>value+1);setNewId(crypto.randomUUID());}
  async function savePeriod(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(locked)return;
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if (!values.opens_at || !values.closes_at || values.closes_at<=values.opens_at) {
      setError('Closing time must be after opening time.');return;
    }
    const ok=await send('save_scholarship_period',{id:period?.id ?? newId,expected_version:String(period?.version ?? 0),
      term_label:values.term_label,opens_at:toIso(values.opens_at),closes_at:toIso(values.closes_at),
      published:String(values.published==='on'),instructions:values.instructions});
    if(ok)clearPeriod();
  }
  async function saveReview(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(locked||!review)return;
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    const ok=await send('review_scholarship_application',{...values,id:review.id,expected_version:String(review.version),status:decision});
    if(ok)setReview(null);
  }
  return <section className="scholarship-manager">
    <h3>Scholarship applications · 獎助學金管理</h3>
    <p>Publish local demonstration periods and review applications submitted by stu.best accounts. All changes are audited.</p>
    {error && <p role="alert" className="scholarship-error">{error}</p>}
    <div className="scholarship-manager-grid">
      <section><h4>Application periods</h4>
        <ul className="scholarship-manager-list">{records.periods.map(item=><li key={item.id}>
          <span><strong>{item.termLabel}</strong> · {item.published?'Published':'Draft'}<br/>{scholarshipDate(item.opensAt)} – {scholarshipDate(item.closesAt)}</span>
          <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>{setPeriod(item);setPeriodKey(value=>value+1);setError('');}}>Edit period</Button>
        </li>)}</ul>
        <form key={periodKey} onSubmit={event=>void savePeriod(event)} className="affairs-record-form">
          <h4>{period?'Edit period':'Add local demonstration period'}</h4>
          <label>Scholarship term<Input name="term_label" required maxLength={80} defaultValue={period?.termLabel ?? ''} placeholder="Local demonstration · 115-1"/></label>
          <label>Opens · Taipei time<Input name="opens_at" type="datetime-local" required min="2000-01-01T00:00" max="2100-12-31T23:59" defaultValue={period?localDate(period.opensAt):''}/></label>
          <label>Closes · Taipei time<Input name="closes_at" type="datetime-local" required min="2000-01-01T00:00" max="2100-12-31T23:59" defaultValue={period?localDate(period.closesAt):''}/></label>
          <label>Instructions<Textarea name="instructions" maxLength={2000} defaultValue={period?.instructions ?? ''}/></label>
          <label><input type="checkbox" name="published" defaultChecked={period?.published ?? false}/> Published to student accounts</label>
          <div><Button type="submit" disabled={locked}>Save period</Button>{period && <Button type="button" variant="outline" disabled={locked} onClick={clearPeriod}>Cancel edit</Button>}</div>
        </form>
      </section>
      <section><h4>Application reviews</h4>
        {records.applications.length===0 && <p>No applications have been submitted.</p>}
        <ul className="scholarship-manager-list">{records.applications.map(item=><li key={item.id}>
          <span><strong>{profiles.get(item.userId) ?? item.userId}</strong> · {periodNames.get(item.periodId)}<br/>{scholarshipStatusLabels[item.status]} · {scholarshipDate(item.submittedAt)}</span>
          {item.status!=='cancelled' && <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>{setReview(item);setDecision(item.status==='rejected'?'rejected':'approved');setError('');}}>Review application</Button>}
        </li>)}</ul>
        {review && <form key={review.id+':'+review.version} onSubmit={event=>void saveReview(event)} className="affairs-record-form">
          <h4>{profiles.get(review.userId) ?? review.userId} · {periodNames.get(review.periodId)}</h4>
          <label>Review decision<select value={decision} onChange={event=>setDecision(event.target.value)}><option value="approved">Approved · 審核通過</option><option value="rejected">Rejected · 審核未通過</option></select></label>
          {decision==='approved' && <>
            <label>Award amount · TWD<Input name="award_amount" type="number" min="0" max="10000000" step="0.01" required defaultValue={review.awardAmount ?? ''}/></label>
            <label>Required service hours<Input name="required_hours" type="number" min="0" max="10000" step="0.01" required defaultValue={review.requiredHours ?? ''}/></label>
            <label>Actual service hours<Input name="actual_hours" type="number" min="0" max="10000" step="0.01" required defaultValue={review.actualHours ?? ''}/></label>
          </>}
          <label>Explanation visible to the applicant<Textarea name="review_note" maxLength={2000} defaultValue={review.reviewNote}/></label>
          <div><Button type="submit" disabled={locked}>Save review</Button><Button type="button" variant="outline" disabled={locked} onClick={()=>setReview(null)}>Cancel edit</Button></div>
        </form>}
      </section>
    </div>
  </section>;
}
