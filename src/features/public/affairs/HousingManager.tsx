import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {housingApplicantLabel,housingDate,type HousingAssignment,type HousingManagerAction,type HousingPeriod,type HousingRecords} from '@/services/housing';
import './housing.css';

type Admin={housing?:HousingRecords;profiles:Array<{user_id:string;email:string;display_name:string}>};
const localDate=(value:string)=>new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).replace(' ','T').slice(0,16);
const toIso=(value:string)=>new Date(value+':00+08:00').toISOString();
const localAgreement='我確認填寫的資料正確，並同意將本次住宿申請儲存於我的 stu.best 帳號。本申請不會送至校方，不代表校方住宿資格或床位保留。';

export function HousingManager({admin,busy,onManage}:{admin:Admin;busy:boolean;onManage:(action:HousingManagerAction)=>Promise<boolean>}) {
  const [period,setPeriod]=useState<HousingPeriod|null>(null);
  const [assignment,setAssignment]=useState<HousingAssignment|null>(null);
  const [periodId,setPeriodId]=useState(()=>crypto.randomUUID());
  const [assignmentId,setAssignmentId]=useState(()=>crypto.randomUUID());
  const [periodKey,setPeriodKey]=useState(0);
  const [assignmentKey,setAssignmentKey]=useState(0);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const receipt=useRef<{body:string;id:string}|null>(null);
  const records=admin.housing;
  if(!records)return null;
  const profiles=new Map(admin.profiles.map(row=>[row.user_id,housingApplicantLabel(row)]));
  const periods=new Map(records.periods.map(row=>[row.id,row]));
  const locked=busy||saving;
  function resetPeriod(){setPeriod(null);setPeriodId(crypto.randomUUID());setPeriodKey(value=>value+1);}
  function resetAssignment(){setAssignment(null);setAssignmentId(crypto.randomUUID());setAssignmentKey(value=>value+1);}
  async function send(kind:HousingManagerAction['kind'],payload:Record<string,string>){
    const body=JSON.stringify({kind,payload});
    if(receipt.current?.body!==body)receipt.current={body,id:crypto.randomUUID()};
    setSaving(true);setError('');
    try{const saved=await onManage({kind,payload:{...payload,request_id:receipt.current.id}});if(saved)receipt.current=null;return saved;}
    catch(reason){setError(reason instanceof Error?reason.message:'Housing records could not be saved.');return false;}
    finally{setSaving(false);}
  }
  async function savePeriod(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(locked)return;
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if(!values.opens_at||!values.closes_at||values.closes_at<=values.opens_at){setError('Closing time must be after opening time.');return;}
    if(await send('save_housing_period',{...values,id:period?.id||periodId,expected_version:String(period?.version||0),
      published:String(values.published==='on'),opens_at:toIso(values.opens_at),closes_at:toIso(values.closes_at)}))resetPeriod();
  }
  async function saveAssignment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(locked)return;
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if(await send('save_housing_assignment',{...values,id:assignment?.id||assignmentId,expected_version:String(assignment?.version||0),
      user_id:assignment?.userId||values.user_id,period_id:assignment?.periodId||values.period_id}))resetAssignment();
  }
  return <section className="housing-manager"><h3>Housing records · 住宿管理</h3>
    <p>Maintain local application periods and account-owned bed history. These records do not allocate university beds or process payments.</p>
    {error&&<p role="alert" className="housing-error">{error}</p>}
    <div className="housing-manager-grid"><section><h4>Housing application periods</h4>
      <ul className="housing-manager-list">{records.periods.map(row=><li key={row.id}><span><strong>{row.termLabel}</strong> · {row.published?'Published':'Draft'}<br/>{housingDate(row.opensAt)} – {housingDate(row.closesAt)}</span><Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>{setPeriod(row);setPeriodKey(value=>value+1);setError('');}}>Edit housing period</Button></li>)}</ul>
      <form key={periodKey} className="affairs-record-form" onSubmit={event=>void savePeriod(event)}><h4>{period?'Edit housing period':'Add housing period'}</h4>
        <label>Housing term<Input name="term_label" maxLength={80} required defaultValue={period?.termLabel||''}/></label>
        <label>Academic year · ROC<Input name="academic_year" type="number" min={1} max={300} step={1} required defaultValue={period?.academicYear}/></label>
        <label>Semester<select name="semester" required defaultValue={period?.semester||1}><option value="1">1</option><option value="2">2</option></select></label>
        <label>Housing opens · Taipei time<Input name="opens_at" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" required defaultValue={period?localDate(period.opensAt):''}/></label>
        <label>Housing closes · Taipei time<Input name="closes_at" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" required defaultValue={period?localDate(period.closesAt):''}/></label>
        <label>Housing instructions<Textarea name="instructions" maxLength={2000} defaultValue={period?.instructions||''}/></label>
        <label>Local application agreement<Textarea name="agreement_text" required maxLength={4000} rows={5} defaultValue={period?.agreementText||localAgreement}/></label>
        <label><input name="published" type="checkbox" defaultChecked={period?.published||false}/> Publish housing period</label>
        <div><Button type="submit" disabled={locked}>Save housing period</Button>{period&&<Button type="button" variant="outline" disabled={locked} onClick={resetPeriod}>Cancel housing period edit</Button>}</div>
      </form>
    </section><section><h4>Account bed assignments</h4>
      <ul className="housing-manager-list">{records.assignments.map(row=><li key={row.id}><span><strong>{profiles.get(row.userId)||row.userId}</strong> · {periods.get(row.periodId)?.termLabel||'Term unavailable'}<br/>{row.dormitory} · {row.bedNumber}</span><Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>{setAssignment(row);setAssignmentKey(value=>value+1);setError('');}}>Edit bed record</Button></li>)}</ul>
      <form key={assignmentKey} className="affairs-record-form" onSubmit={event=>void saveAssignment(event)}><h4>{assignment?'Edit bed record':'Add bed record'}</h4>
        <label>Housing account<select name="user_id" required disabled={Boolean(assignment)} defaultValue={assignment?.userId||''}><option value="">Choose an account</option>{admin.profiles.map(row=><option key={row.user_id} value={row.user_id}>{housingApplicantLabel(row)}</option>)}</select></label>
        <label>Housing period<select name="period_id" required disabled={Boolean(assignment)} defaultValue={assignment?.periodId||''}><option value="">Choose a published period</option>{records.periods.filter(row=>row.published).map(row=><option key={row.id} value={row.id}>{row.termLabel}</option>)}</select></label>
        <label>Bed number<Input name="bed_number" required pattern="[A-Za-z0-9-]{1,32}" maxLength={32} defaultValue={assignment?.bedNumber||''}/></label>
        <label>Dormitory name<Input name="dormitory" required maxLength={80} defaultValue={assignment?.dormitory||''}/></label>
        <label>Bunk<select name="bunk" defaultValue={assignment?.bunk||''}><option value="">Not recorded</option><option value="upper">Upper · 上舖</option><option value="lower">Lower · 下舖</option></select></label>
        <label>Accommodation fee · TWD<Input name="accommodation_fee" type="number" min={0} max={10000000} step="0.01" defaultValue={assignment?.accommodationFee??''}/></label>
        <label>Housing subsidy · TWD<Input name="subsidy_amount" type="number" min={0} max={10000000} step="0.01" defaultValue={assignment?.subsidyAmount??''}/></label>
        <label>Housing deposit · TWD<Input name="deposit" type="number" min={0} max={10000000} step="0.01" defaultValue={assignment?.deposit??''}/></label>
        <div><Button type="submit" disabled={locked}>Save bed record</Button>{assignment&&<Button type="button" variant="outline" disabled={locked} onClick={resetAssignment}>Cancel bed edit</Button>}</div>
      </form>
    </section></div>
    <section className="housing-manager-receipts"><h4>Submitted housing applications</h4>
      {records.applications.length?records.applications.map(row=><details key={row.id}><summary>{profiles.get(row.userId)||row.userId} · {periods.get(row.periodId)?.termLabel||'Term unavailable'} · {row.receiptNumber}</summary><p>Submitted {housingDate(row.submittedAt)} · Agreement version {row.agreementVersion}</p><p>{row.fullName} · {row.studentNumber}</p></details>):<p>No local housing applications have been submitted.</p>}
    </section>
  </section>;
}
