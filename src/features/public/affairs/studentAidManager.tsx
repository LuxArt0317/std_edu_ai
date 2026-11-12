import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {isMaskedStudentAidIdentity,studentAidApplicantLabel,type StudentAidProfile,type StudentAidRecord,type StudentAidSaveAction} from '@/services/studentAid';
import './studentAid.css';

export function StudentAidManager({records,profiles,busy,onSave}:{
  records:StudentAidRecord[];profiles:StudentAidProfile[];busy:boolean;onSave:(action:StudentAidSaveAction)=>Promise<boolean>;
}) {
  const [editing,setEditing]=useState<StudentAidRecord|null>(null);
  const [id,setId]=useState(()=>crypto.randomUUID());
  const [formKey,setFormKey]=useState(0);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const receipt=useRef<{body:string;requestId:string}|null>(null);
  const profileMap=new Map(profiles.map(profile=>[profile.user_id,studentAidApplicantLabel(profile)]));
  const locked=busy || saving;
  function reset() {setEditing(null);setId(crypto.randomUUID());setFormKey(key=>key+1);receipt.current=null;}
  function edit(record:StudentAidRecord) {setEditing(record);setFormKey(key=>key+1);setError('');setMessage('');receipt.current=null;}
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(locked)return;
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if(!isMaskedStudentAidIdentity(values.masked_identity_number)) {
      setError('Use at least three consecutive mask characters (*, • or ●) and at most four visible letters/digits.');return;
    }
    const payload={...values,id:editing?.id ?? id,user_id:editing?.userId ?? values.user_id,expected_version:String(editing?.version ?? 0)};
    const body=JSON.stringify(payload);
    if(receipt.current?.body!==body)receipt.current={body,requestId:crypto.randomUUID()};
    setSaving(true);setError('');setMessage('');
    try {
      const saved=await onSave({kind:'save_student_aid_record',payload:{...payload,request_id:receipt.current.requestId}});
      if(saved){reset();setMessage('Local student aid record saved.');}
    } catch(reason) {setError(reason instanceof Error?reason.message:'The student aid record could not be saved.');}
    finally {setSaving(false);}
  }
  return <section className="student-aid-manager">
    <h3>Student aid records · 不利處境學生助學紀錄</h3>
    <p>Maintain illustrative records for stu.best accounts. Enter the displayed review labels and amount; the site does not determine eligibility or awards.</p>
    {message && <p role="status">{message}</p>}{error && <p className="student-aid-error" role="alert">{error}</p>}
    <ul className="student-aid-manager-list">{records.map(record=><li key={record.id}>
      <span><strong>{profileMap.get(record.userId) ?? record.userId}</strong> · {record.academicYear}-{record.semester}<br/>{record.applicationKind} · {record.schoolReviewStatus ?? 'No review label'}</span>
      <Button type="button" size="sm" variant="outline" disabled={locked} onClick={()=>edit(record)}>Edit aid record</Button>
    </li>)}</ul>
    {profiles.length===0?<p>No account profiles are available.</p>:<form key={formKey} onSubmit={event=>void submit(event)} className="affairs-record-form">
      <h4>{editing?'Edit local aid record':'Add local aid record'}</h4>
      <label>Student account<select name="user_id" required defaultValue={editing?.userId ?? ''} disabled={Boolean(editing)}>
        <option value="">Choose an account</option>{profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{studentAidApplicantLabel(profile)}</option>)}
      </select></label>
      <div className="student-aid-manager-grid">
        <label>Academic year · 學年<Input name="academic_year" type="number" required min="1" max="999" step="1" defaultValue={editing?.academicYear ?? ''}/></label>
        <label>Semester · 學期<Input name="semester" type="number" required min="1" max="3" step="1" defaultValue={editing?.semester ?? ''}/></label>
        <label>Application type · 申請類型<Input name="application_kind" required maxLength={120} defaultValue={editing?.applicationKind ?? ''}/></label>
        <label>Student name · 學生中文姓名<Input name="student_name" maxLength={160} defaultValue={editing?.studentName ?? ''} placeholder="Use the account student name when blank"/></label>
        <label>Masked identity number<Input name="masked_identity_number" maxLength={24} defaultValue={editing?.maskedIdentityNumber ?? ''} aria-describedby="aid-masked-id-help"/><small id="aid-masked-id-help">Optional. For example, ******1234. Full identity numbers are not accepted.</small></label>
        <label>Department · 科系名稱<Input name="department_name" maxLength={160} defaultValue={editing?.departmentName ?? ''}/></label>
        <label>Phone · 手機<Input name="phone" type="tel" maxLength={40} defaultValue={editing?.phone ?? ''}/></label>
        <label>Relative count · 關係人數量<Input name="relative_count" type="number" min="0" max="1000" step="1" defaultValue={editing?.relativeCount ?? ''}/></label>
        <label>Subsidy amount · 實際補助金額 (TWD)<Input name="subsidy_amount" type="number" min="0" max="10000000" step="0.01" defaultValue={editing?.subsidyAmount ?? ''}/></label>
        <label>Student record locked · 學生紀錄鎖住狀態<select name="student_record_locked" defaultValue={editing?.studentRecordLocked==null?'':String(editing.studentRecordLocked)}>
          <option value="">Not recorded · 未記錄</option><option value="true">Locked · 已鎖定</option><option value="false">Unlocked · 未鎖定</option>
        </select></label>
        <label>School review label · 學校審核狀態<Input name="school_review_status" maxLength={160} defaultValue={editing?.schoolReviewStatus ?? ''}/></label>
        <label>Ministry review label · 教育部審核狀態<Input name="ministry_review_status" maxLength={160} defaultValue={editing?.ministryReviewStatus ?? ''}/></label>
      </div>
      <div><Button type="submit" disabled={locked}>{saving?'Saving aid record…':'Save aid record'}</Button>{editing && <Button type="button" variant="outline" disabled={locked} onClick={reset}>Cancel edit</Button>}</div>
    </form>}
  </section>;
}
