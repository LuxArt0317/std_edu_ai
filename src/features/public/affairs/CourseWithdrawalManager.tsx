import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {adjustmentTerm} from '../../../../server/courseAdjustmentContract.js';
import {validWithdrawalTerm,validWithdrawalPayload,withdrawalTime,withdrawalTaipeiInput,withdrawalWindowChange,
  type WithdrawalTerm,type WithdrawalWindow,type WithdrawalWindowAction} from '../../../../server/courseWithdrawalContract.js';
import {CourseWithdrawalError,readCourseWithdrawal,saveWithdrawalWindow} from '@/services/courseWithdrawal';

export function CourseWithdrawalManager({userId,busy}:{userId:string;busy:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const [term,setTerm]=useState<WithdrawalTerm>(adjustmentTerm);
  return <section className="affairs-manager" aria-label="Course withdrawal window">
    <h3>Course withdrawal window</h3>
    <Button type="button" variant="outline" aria-expanded={expanded} disabled={busy} onClick={()=>setExpanded(value=>!value)}>
      {expanded?'Hide withdrawal window':'Manage withdrawal window'}
    </Button>
    {expanded&&<div className="space-y-3">
      <form className="affairs-record-form" onSubmit={event=>{
        event.preventDefault();
        const fields=new FormData(event.currentTarget);
        const academicYear=Number(fields.get('year')),semester=Number(fields.get('semester'));
        if(validWithdrawalTerm(academicYear,semester))setTerm({academicYear,semester});
      }}>
        <label>Academic year<Input type="number" name="year" min={100} max={999} required defaultValue={term.academicYear}/></label>
        <label>Semester<select name="semester" defaultValue={term.semester}><option value="1">1</option><option value="2">2</option></select></label>
        <Button type="submit" variant="outline" disabled={busy}>Load window</Button>
      </form>
      <WindowEditor key={`${userId}/${term.academicYear}/${term.semester}`} userId={userId}
        academicYear={term.academicYear} semester={term.semester} busy={busy}/>
    </div>}
  </section>;
}

function WindowEditor({userId,academicYear,semester,busy}:{userId:string;academicYear:number;semester:number;busy:boolean}) {
  const [window,setWindow]=useState<WithdrawalWindow|null>();
  const [opens,setOpens]=useState('');
  const [closes,setCloses]=useState('');
  const [pending,setPending]=useState<WithdrawalWindowAction|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const active=useRef<AbortController|null>(null);
  const inFlight=useRef(false);

  useEffect(()=>{
    const controller=new AbortController();
    active.current=controller;
    void readCourseWithdrawal(userId,controller.signal,{academicYear,semester}).then(data=>{
      if(controller.signal.aborted)return;
      setWindow(data.window);
      setOpens(data.window?withdrawalTaipeiInput(data.window.opensAt):'');
      setCloses(data.window?withdrawalTaipeiInput(data.window.closesAt):'');
    }).catch(()=>{
      if(!controller.signal.aborted)setError('The withdrawal window could not be loaded.');
    });
    return ()=>controller.abort();
  },[userId,academicYear,semester,attempt]);

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller=active.current;
    if(busy||inFlight.current||window===undefined||!controller||controller.signal.aborted)return;
    const payload=pending??{
      academic_year:academicYear,semester,opens_at:withdrawalTime(opens)??'',closes_at:withdrawalTime(closes)??'',
      expected_version:window?.version??0,request_id:crypto.randomUUID(),
    };
    if(!validWithdrawalPayload(withdrawalWindowChange,payload)){
      setError('Enter a valid Taipei date range of no more than 180 days.');
      return;
    }
    setError('');
    setMessage('');
    setPending(payload);
    setSaving(true);
    inFlight.current=true;
    try{
      const result=await saveWithdrawalWindow(userId,controller.signal,payload);
      if(controller.signal.aborted)return;
      setWindow(result.window);
      setPending(null);
      setMessage('Saved the stu.best withdrawal window.');
    }catch(reason){
      if(controller.signal.aborted)return;
      if(reason instanceof CourseWithdrawalError&&[400,401,403,409].includes(reason.status)){
        setPending(null);
        setWindow(undefined);
        setError(reason.status===409?'The window changed. Reload before editing.':'The window could not be saved.');
      }else setError('The save could not be confirmed. Retry uses the same request.');
    }finally{
      inFlight.current=false;
      if(!controller.signal.aborted)setSaving(false);
    }
  }
  return <div className="space-y-2">
    <h4>{academicYear}/{semester} · Taipei time</h4>
    <p>Use the course-selection record manager to add this term’s withdrawal-phase courses.</p>
    {error&&<p role="alert">{error}</p>}
    {message&&<p role="status">{message}</p>}
    {window===undefined&&(error?<Button type="button" variant="outline" disabled={busy} onClick={()=>{setError('');setAttempt(value=>value+1);}}>Reload window</Button>
      :<p role="status">Loading withdrawal window…</p>)}
    {window!==undefined&&<form className="affairs-record-form" onSubmit={event=>void save(event)}>
      <label>Opens at (Taipei)<Input required type="datetime-local" step="1" disabled={busy||saving||!!pending} value={opens} onChange={event=>setOpens(event.target.value)}/></label>
      <label>Closes at (Taipei)<Input required type="datetime-local" step="1" disabled={busy||saving||!!pending} value={closes} onChange={event=>setCloses(event.target.value)}/></label>
      <Button type="submit" disabled={busy||saving}>{saving?'Saving window…':pending?'Retry window save':'Save withdrawal window'}</Button>
    </form>}
  </div>;
}
