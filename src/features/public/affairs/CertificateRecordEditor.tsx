import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {EnrollmentCertificateAssessment} from '@/services/enrollmentCertificate';
import type {EnrollmentCertificateAdminRecords} from '../../../../server/enrollmentCertificate.js';
import {CertificateRecordError,certificateAssessmentFields,createCertificateRecordClient,validCertificateAccount,
  type CertificateAssessmentInput,type CertificateRecordClient} from '@/services/certificateRecordEditor';

export type CertificateRecordEditorProps={managerId:string;userId:string;client?:CertificateRecordClient;onSaved?:()=>void};
type Draft=Omit<CertificateAssessmentInput,'id'|'user_id'|'request_id'|'expected_version'|'academic_year'|'status'>&{academic_year:string;status:EnrollmentCertificateAssessment['status']};
type Operation={key:string;payload:CertificateAssessmentInput;confirmed:boolean;conflict:boolean};
const blank=():Draft=>({academic_year:'',semester:null,has_pending_fees:null,status:'unknown',result_text:null,assessed_at:null,student_number:null,student_name:null,department_name:null,year_text:null,class_label:null});
const fromSaved=(row:EnrollmentCertificateAssessment|null):Draft=>row?{...certificateAssessmentFields(row),academic_year:row.academicYear===null?'':String(row.academicYear)}:blank();
const textFields=[['student_number','Student number',80],['student_name','Student name',160],['department_name','Department name',160],['year_text','Year label',30],['class_label','Class label',80]] as const;
const display=(value:unknown)=>value===null||value===undefined?'—':String(value);
function ScopedCertificateEditor({managerId,userId,client:provided,onSaved}:CertificateRecordEditorProps){
  const defaultClient=useMemo(()=>createCertificateRecordClient(managerId),[managerId]),client=provided??defaultClient;
  const [records,setRecords]=useState<EnrollmentCertificateAdminRecords|null>(null),[draft,setDraft]=useState<Draft>(blank),[busy,setBusy]=useState(true),[stale,setStale]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const controller=useRef<AbortController|null>(null),inFlight=useRef(false),dirty=useRef(false),base=useRef<{id:string;version:number}|null>(null),operation=useRef<Operation|null>(null);
  const live=(task:AbortController)=>controller.current===task&&!task.signal.aborted;
  async function read(task:AbortController){const next=await client.load(userId,task.signal);task.signal.throwIfAborted();
    if(next.assessments.length>1||next.assessments.some(row=>row.userId!==userId)||next.documentMetadata.some(row=>row.userId!==userId)||next.documents.length)
      throw new CertificateRecordError('Certificate records do not match this selected account.',403);
    return next;
  }
  function accept(next:EnrollmentCertificateAdminRecords){
    const saved=next.assessments[0]??null,pending=operation.current;
    // A matching row after a transport failure is not a receipt for our write.
    if(!pending||pending.conflict||pending.confirmed)base.current={id:saved?.id??base.current?.id??crypto.randomUUID(),version:saved?.version??0};
    if(!dirty.current||pending?.confirmed){setDraft(fromSaved(saved));dirty.current=false;}
    if(pending?.conflict||pending?.confirmed)operation.current=null;
    setRecords(next);setStale(false);
  }
  useEffect(()=>{
    const task=new AbortController();controller.current=task;inFlight.current=true;setBusy(true);setRecords(null);setError('');setMessage('');
    void read(task).then(next=>{if(live(task))accept(next);}).catch(reason=>{if(live(task))setError(reason instanceof CertificateRecordError?reason.message:'Certificate records could not be loaded.');}).finally(()=>{if(live(task)){inFlight.current=false;setBusy(false);}});
    return()=>{task.abort();operation.current=null;};
    // Account changes remount this scope. A replacement transport invalidates authorization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client]);
  async function refresh(){
    const task=controller.current;if(!task||!live(task)||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(task);if(live(task)){accept(next);setMessage('Saved records refreshed. Your unsaved assessment values are retained; compare before saving.');}}
    catch(reason){if(live(task)){if(reason instanceof CertificateRecordError&&[401,403].includes(reason.status))setRecords(null);setStale(true);setError(reason instanceof CertificateRecordError?reason.message:'Certificate records could not be refreshed. Your draft is retained.');}}
    finally{if(live(task)){inFlight.current=false;setBusy(false);}}
  }
  function change(patch:Partial<Draft>){if(busy)return;dirty.current=true;setDraft(prior=>({...prior,...patch}));setError('');setMessage('');}
  async function save(event:FormEvent){
    event.preventDefault();const task=controller.current;
    if(!task||!live(task)||inFlight.current||!records||!base.current||stale)return;
    if(draft.status==='local_eligible'){setError('Choose unknown or blocked before saving. The existing local_eligible value is read-only here.');return;}
    if(draft.academic_year!==''&&!/^[1-9]\d{0,3}$/.test(draft.academic_year)){setError('Academic year must be blank or a whole number from 1 to 9999.');return;}
    const body={...draft,academic_year:draft.academic_year===''?null:Number(draft.academic_year),status:draft.status,id:base.current.id,user_id:userId,expected_version:base.current.version};
    const key=JSON.stringify(body);
    if(operation.current?.key!==key)operation.current={key,payload:{...body,request_id:crypto.randomUUID()},confirmed:false,conflict:false};
    const pending=operation.current;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const receipt=await client.save(pending.payload,task.signal);task.signal.throwIfAborted();
      if(receipt.id!==pending.payload.id||receipt.kind!=='save_enrollment_certificate_assessment'||receipt.version!==pending.payload.expected_version+1)throw new CertificateRecordError('The saved receipt could not be verified. Retry this assessment.');
      pending.confirmed=true;const next=await read(task);if(!live(task))return;accept(next);setMessage('Local certificate assessment saved. No document was issued.');onSaved?.();
    }catch(reason){if(live(task)){
      if(reason instanceof CertificateRecordError&&reason.status===409){pending.conflict=true;setStale(true);}
      if(reason instanceof CertificateRecordError&&[401,403].includes(reason.status))setRecords(null);
      setError(reason instanceof CertificateRecordError?reason.message:'The assessment was not confirmed. Your draft is retained; retry the same values.');
    }}finally{if(live(task)){inFlight.current=false;setBusy(false);}}
  }
  const saved=records?.assessments[0]??null;
  return <section className="affairs-manager min-w-0" aria-label="Certificate assessment editor" aria-busy={busy}>
    <h3>Enrollment certificate assessment</h3>
    <p>These are local reference records. Stored fee flags and statuses do not establish official eligibility. This editor does not issue documents or download links.</p>
    {busy&&<p role="status">Loading or saving certificate records…</p>}{error&&<p role="alert" className="text-destructive">{error}</p>}{message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh certificate records</Button>
    {records&&<>
      <dl className="my-4 grid gap-1 [overflow-wrap:anywhere]" aria-label="Saved certificate assessment">
        <dt>Saved status</dt><dd>{saved?.status??'No assessment saved'}</dd><dt>Saved fee flag</dt><dd>{display(saved?.hasPendingFees)}</dd>
        <dt>Saved revision</dt><dd>{display(saved?.version)}</dd><dt>Saved result text</dt><dd className="whitespace-pre-wrap">{display(saved?.resultText)}</dd>
      </dl>
      {stale&&<p role="status">Refresh the changed assessment before saving. Your draft has not been replaced.</p>}
      <form className="affairs-record-form" aria-label="Edit certificate assessment" onSubmit={event=>void save(event)}>
        <fieldset disabled={busy} className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <label className="grid gap-1">Academic year<Input inputMode="numeric" maxLength={4} value={draft.academic_year} onChange={event=>change({academic_year:event.target.value})}/></label>
          <label className="grid gap-1">Semester<select aria-label="Certificate semester" value={draft.semester??''} onChange={event=>change({semester:event.target.value?Number(event.target.value) as 1|2|3:null})}><option value="">Not recorded</option><option value="1">1 · 一</option><option value="2">2 · 二</option><option value="3">3 · 暑</option></select></label>
          <label className="grid gap-1">Pending fee flag<select aria-label="Pending fee flag" value={draft.has_pending_fees??''} onChange={event=>change({has_pending_fees:event.target.value as 'N'|'Y'||null})}><option value="">Not recorded</option><option value="N">N</option><option value="Y">Y</option></select></label>
          <label className="grid gap-1">Local assessment status<select aria-label="Local assessment status" value={draft.status} onChange={event=>change({status:event.target.value as Draft['status']})}>
            <option value="unknown">unknown</option><option value="blocked">blocked</option>{draft.status==='local_eligible'&&<option value="local_eligible" disabled>local_eligible · existing value, read-only</option>}</select></label>
          {textFields.map(([field,label,max])=><label className="grid gap-1" key={field}>{label}<Input maxLength={max} value={draft[field]??''} onChange={event=>change({[field]:event.target.value===''?null:event.target.value})}/></label>)}
          <label className="grid gap-1">Assessed at (ISO timestamp, or blank)<Input value={draft.assessed_at??''} onChange={event=>change({assessed_at:event.target.value===''?null:event.target.value})}/></label>
          <label className="grid gap-1">Result text<Textarea maxLength={500} value={draft.result_text??''} onChange={event=>change({result_text:event.target.value===''?null:event.target.value})}/></label>
          <Button type="submit" disabled={stale||draft.status==='local_eligible'}>Save certificate assessment</Button>
        </fieldset>
      </form>
      <h4>Read-only document metadata</h4>
      {records.documentMetadata.length?<div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Certificate document metadata"><table><thead><tr><th>Document ID</th><th>Status</th><th>Assessment revision</th><th>Expires at</th><th>Updated at</th></tr></thead>
        <tbody>{records.documentMetadata.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.status}</td><td>{row.assessmentVersion}</td><td>{display(row.expiresAt)}</td><td>{row.updatedAt}</td></tr>)}</tbody></table></div>:<p>No document metadata is saved.</p>}
    </>}
  </section>;
}
export function CertificateRecordEditor(props:CertificateRecordEditorProps){
  if(!validCertificateAccount(props.managerId)||!validCertificateAccount(props.userId))return <p>Select a valid student account to manage certificate records.</p>;
  return <ScopedCertificateEditor key={props.managerId+':'+props.userId} {...props}/>;
}
