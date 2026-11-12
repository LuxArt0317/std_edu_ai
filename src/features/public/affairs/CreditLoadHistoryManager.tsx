import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {creditLoadApplicantLabel,creditLoadCategoryLabels,type CreditLoadHistoryProfile,type CreditLoadHistoryRecord,type CreditLoadHistorySaveAction} from '@/services/creditLoadHistory';

export function CreditLoadHistoryManager({records,profiles,busy,onSave}:{
  records:CreditLoadHistoryRecord[];profiles:CreditLoadHistoryProfile[];busy:boolean;onSave:(action:CreditLoadHistorySaveAction)=>Promise<boolean>;
}) {
  const [editing,setEditing]=useState<CreditLoadHistoryRecord|null>(null),[id,setId]=useState(()=>crypto.randomUUID());
  const [formKey,setFormKey]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const receipt=useRef<{body:string;requestId:string}|null>(null),inFlight=useRef(false);
  const profileMap=new Map(profiles.map(profile=>[profile.user_id,creditLoadApplicantLabel(profile)])),locked=busy || saving;
  function reset(){setEditing(null);setId(crypto.randomUUID());setFormKey(value=>value+1);receipt.current=null;setError('');}
  function edit(record:CreditLoadHistoryRecord){setEditing(record);setFormKey(value=>value+1);receipt.current=null;setError('');setMessage('');}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(locked || inFlight.current)return;
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    const payload={...values,id:editing?.id ?? id,user_id:editing?.userId ?? values.user_id,expected_version:String(editing?.version ?? 0)};
    const body=JSON.stringify(payload);
    if(receipt.current?.body!==body)receipt.current={body,requestId:crypto.randomUUID()};
    inFlight.current=true;setSaving(true);setError('');setMessage('');
    try {
      const saved=await onSave({kind:'save_credit_load_history',payload:{...payload,request_id:receipt.current.requestId}});
      if(saved){reset();setMessage('Local credit-load history saved.');}
      else setError('The record was not saved. Review the error and retry, or reload if its version changed.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Credit-load history could not be saved.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  return <section className="credit-load-manager">
    <h3>Credit-load history · 超減修申請紀錄</h3>
    <p>Maintain local demonstration records. Enter progress and result labels without determining eligibility, submitting university applications or changing enrollments.</p>
    {error && <p className="credit-load-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <ul>{records.map(record=><li key={record.id}><span><strong>{profileMap.get(record.userId) ?? record.userId}</strong> · {record.academicYear}-{record.semester} · {creditLoadCategoryLabels[record.category]} {record.requestedCredits} 學分<br/>{record.processText ?? 'No progress label'} · {record.resultText ?? 'No result label'}</span><Button type="button" size="sm" variant="outline" disabled={locked} onClick={()=>edit(record)}>Edit credit-load record</Button></li>)}</ul>
    {profiles.length===0?<p>No account profiles are available.</p>:<form key={formKey} className="affairs-record-form" onSubmit={event=>void submit(event)}>
      <h4>{editing?'Edit local credit-load history':'Add local credit-load history'}</h4>
      <fieldset disabled={locked}>
        <label>Student account<select name="user_id" required defaultValue={editing?.userId ?? ''} disabled={Boolean(editing)}><option value="">Choose an account</option>{profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{creditLoadApplicantLabel(profile)}</option>)}</select></label>
        <div className="credit-load-manager-grid">
          <label>Academic year · 申請學年<Input name="academic_year" type="number" min="1" max="9999" step="1" required defaultValue={editing?.academicYear ?? ''}/></label>
          <label>Semester · 申請學期<Input name="semester" type="number" min="1" max="3" step="1" required defaultValue={editing?.semester ?? ''}/></label>
          <label>Category · 類別<select name="category" required defaultValue={editing?.category ?? ''}><option value="">Choose a category</option><option value="over">超修</option><option value="under">減修</option></select></label>
          <label>Requested credits · 申請超修或減修學分數<Input name="requested_credits" type="number" min="0" max="9999.99" step="0.01" required defaultValue={editing?.requestedCredits ?? ''}/></label>
          <label>Progress label · 申請進度<Input name="process_text" maxLength={300} defaultValue={editing?.processText ?? ''}/></label>
          <label>Result label · 審核結果<Input name="result_text" maxLength={300} defaultValue={editing?.resultText ?? ''}/></label>
        </div>
        <div className="credit-load-manager-actions"><Button type="submit">{saving?'Saving credit-load history…':'Save credit-load history'}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}</div>
      </fieldset>
    </form>}
  </section>;
}
