import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {CourseAdjustmentError,readCourseAdjustment,saveCourseAdjustment} from '@/services/courseAdjustment';
import {adjustmentDecisions,adjustmentTerm,type AdjustmentDecision,type AdjustmentPayload,type AdjustmentPhase,type AdjustmentRow} from '../../../../server/courseAdjustmentContract.js';

type Profile = {user_id:string;display_name:string;email:string};
type Selection = {userId:string;academicYear:number;semester:number;phase:AdjustmentPhase};

export function CourseAdjustmentManager({managerId,profiles,busy}:{managerId:string;profiles:Profile[];busy:boolean}) {
  const current=adjustmentTerm();
  const [selection,setSelection]=useState<Selection>();
  const [open,setOpen]=useState(false);
  if(!profiles.length)return null;
  function load(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const userId=String(data.get('student')),academicYear=Number(data.get('year')),semester=Number(data.get('semester'));
    const phase=data.get('phase');
    if(!profiles.some(profile=>profile.user_id===userId)||!Number.isInteger(academicYear)||academicYear<100||academicYear>999||
       ![1,2].includes(semester)||(phase!=='add_drop'&&phase!=='late_add'))return;
    setSelection({userId,academicYear,semester,phase});
  }
  return <section className="affairs-manager" aria-label="Course adjustment eligibility">
    <h3>Course adjustment eligibility</h3>
    {!open?<Button variant="outline" type="button" disabled={busy} onClick={()=>setOpen(true)}>Manage eligibility</Button>:<>
      <form onSubmit={load} className="affairs-record-form">
        <label>Student account<select name="student" required disabled={busy} defaultValue="">
          <option value="" disabled>Select student</option>
          {profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{profile.display_name} · {profile.email}</option>)}
        </select></label>
        <label>Academic year<input name="year" type="number" min="100" max="999" required disabled={busy} defaultValue={current.academicYear}/></label>
        <label>Semester<select name="semester" disabled={busy} defaultValue={current.semester}><option value="1">1</option><option value="2">2</option></select></label>
        <label>Phase<select name="phase" disabled={busy}><option value="add_drop">Add/drop</option><option value="late_add">Late add</option></select></label>
        <Button variant="outline" type="submit" disabled={busy}>Load decision</Button>
      </form>
      {selection&&<DecisionEditor key={[managerId,selection.userId,selection.academicYear,selection.semester,selection.phase].join(':')}
        managerId={managerId} selection={selection} label={profiles.find(profile=>profile.user_id===selection.userId)?.email??selection.userId} busy={busy}/>}
    </>}
  </section>;
}

function DecisionEditor({managerId,selection:{userId,academicYear,semester,phase},label,busy}:{managerId:string;selection:Selection;label:string;busy:boolean}) {
  const [record,setRecord]=useState<AdjustmentRow|null>();
  const [decision,setDecision]=useState<AdjustmentDecision>('unverified');
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [saving,setSaving]=useState(false);
  const [retrying,setRetrying]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const active=useRef<AbortController|null>(null);
  const pending=useRef<AdjustmentPayload|null>(null);
  const inFlight=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    active.current=controller;
    void readCourseAdjustment(managerId,phase,controller.signal,{userId,academicYear,semester}).then(result=>{
      if(controller.signal.aborted)return;
      setRecord(result.record);
      setDecision(result.record?.decision??'unverified');
    }).catch(()=>{if(!controller.signal.aborted)setError('The decision could not be loaded.');});
    return ()=>controller.abort();
  },[managerId,userId,academicYear,semester,phase,attempt]);
  function reload() {
    setRecord(undefined);
    pending.current=null;
    setRetrying(false);
    setError('');
    setStatus('');
    setAttempt(value=>value+1);
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller=active.current;
    if(busy||inFlight.current||record===undefined||!controller||controller.signal.aborted)return;
    const action=pending.current??{
      user_id:userId,phase,academic_year:academicYear,semester,
      decision,expected_version:record?.version??0,request_id:crypto.randomUUID(),
    };
    pending.current=action;
    inFlight.current=true;
    setSaving(true);setError('');setStatus('');
    try {
      const result=await saveCourseAdjustment(managerId,controller.signal,action);
      if(controller.signal.aborted)return;
      pending.current=null;
      setRetrying(false);
      setRecord(result);
      setStatus('Saved the local eligibility decision.');
    } catch(reason) {
      if(controller.signal.aborted)return;
      if(reason instanceof CourseAdjustmentError && [400,401,403,409].includes(reason.status)) {
        pending.current=null;
        setRetrying(false);
        setRecord(undefined);
        setError(reason.status===409?'This decision changed. Reload it before saving.':'This account could not save the decision.');
      } else {
        setRetrying(true);
        setError('The save could not be confirmed. Retry sends the same request.');
      }
    } finally {
      inFlight.current=false;
      if(!controller.signal.aborted)setSaving(false);
    }
  }
  return <section aria-label="Selected eligibility decision">
    <h4>{label} · {academicYear}/{semester} · {phase==='add_drop'?'Add/drop':'Late add'}</h4>
    {error&&<p role="alert">{error} {record===undefined&&<Button variant="outline" type="button" onClick={reload}>Reload decision</Button>}</p>}
    {status&&<p role="status">{status}</p>}
    {record===undefined&&!error&&<p role="status">Loading eligibility…</p>}
    {record!==undefined&&<form onSubmit={save} className="affairs-record-form">
      <label>Eligibility decision<select value={decision} disabled={busy||saving||retrying} onChange={event=>setDecision(event.target.value as AdjustmentDecision)}>
        {adjustmentDecisions.map(value=><option key={value} value={value}>{value==='eligible'?'Eligible':value==='ineligible'?'Ineligible':'Unverified'}</option>)}
      </select></label>
      <Button type="submit" disabled={busy||saving}>{retrying?'Retry save':'Save decision'}</Button>
    </form>}
  </section>;
}
