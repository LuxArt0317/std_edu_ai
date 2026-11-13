import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {createDtmSubmissionsClient,DtmSubmissionClientError,validDtmSubmissionAssignment,
  type DtmSubmissionAssignment,type DtmSubmissionReview as SavedReview,type DtmSubmissionReviewInput,
  type DtmSubmissionWorkspaceData,type DtmSubmissionsClient} from '../../../services/dtmSubmissions';

export type DtmSubmissionReviewProps={
  userId:string;assignment:DtmSubmissionAssignment|null;
  client?:DtmSubmissionsClient;onSaved?:()=>void;
  onDownloaded?:(download:{blob:Blob;filename:string})=>void;
};
type Draft={status:'graded'|'not_graded';gradeText:string|null;feedback:string|null;version:number;dirty:boolean};
type Operation={key:string;payload:DtmSubmissionReviewInput;confirmed:boolean;conflict:boolean};
const fromSaved=(review:SavedReview|undefined):Draft=>({status:review?.status??'not_graded',gradeText:review?.gradeText??null,
  feedback:review?.feedback??null,version:review?.version??0,dirty:false});
const display=(value:string|null|undefined)=>value??'—';
const statusLabel=(value:'graded'|'not_graded')=>value==='graded'?'Graded · 已評分':'Not graded · 尚未評分';
function downloadBlob({blob,filename}:{blob:Blob;filename:string}){
  const href=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=href;anchor.download=filename;
  try{anchor.style.display='none';document.body.append(anchor);anchor.click();}
  finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);}
}
function validText(value:string|null,max:number){return value===null||[...value].length<=max&&![...value].some(char=>{const code=char.codePointAt(0)!;return code===0||code>=0xd800&&code<=0xdfff;});}
function ScopedReview(props:DtmSubmissionReviewProps&{assignment:DtmSubmissionAssignment}){
  const defaultClient=useMemo(()=>createDtmSubmissionsClient(props.userId),[props.userId]),client=props.client??defaultClient;
  const [workspace,setWorkspace]=useState<DtmSubmissionWorkspaceData|null>(null),[selected,setSelected]=useState('');
  const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[stale,setStale]=useState(false);
  const controller=useRef<AbortController|null>(null),inFlight=useRef(false),operations=useRef(new Map<string,Operation>());
  const {assignment}=props;
  const live=(task:AbortController)=>controller.current===task&&!task.signal.aborted;
  async function read(task:AbortController){
    const next=await client.load(assignment,task.signal,true);
    task.signal.throwIfAborted();
    if(next.userId!==assignment.userId||next.assignmentId!==assignment.id||next.courseId!==assignment.courseId)
      throw new DtmSubmissionClientError('The returned submission does not match this account.',403);
    return next;
  }
  function accept(next:DtmSubmissionWorkspaceData){
    setWorkspace(next);
    const available=next.files.filter(file=>file.state==='current'||file.state==='retired'&&next.reviews.some(review=>review.uploadId===file.id));
    setSelected(prior=>available.some(file=>file.id===prior)?prior:next.submission?.currentUploadId??available[0]?.id??'');
    const confirmed=new Set<string>();
    for(const file of available){const operation=operations.current.get(file.id);
      // Only a verified write receipt confirms our operation. Equal saved text
      // could come from another reviewer and must not replace its request ID.
      if(operation?.confirmed){confirmed.add(file.id);operations.current.delete(file.id);}}
    setDrafts(prior=>{
      const updated={...prior};
      for(const file of available){
        const saved=next.reviews.find(review=>review.uploadId===file.id);
        if(confirmed.has(file.id))updated[file.id]=fromSaved(saved);
        else {const pending=operations.current.get(file.id);
          updated[file.id]=prior[file.id]?.dirty?{...prior[file.id],version:pending&&!pending.conflict?prior[file.id].version:saved?.version??0}:fromSaved(saved);}
      }
      return updated;
    });
    setStale(false);
  }
  useEffect(()=>{
    const task=new AbortController(),operationMap=operations.current;controller.current=task;inFlight.current=true;
    setBusy(true);setWorkspace(null);setError('');setMessage('');
    void read(task).then(next=>{if(live(task))accept(next);}).catch(reason=>{
      if(live(task))setError(reason instanceof DtmSubmissionClientError?reason.message:'Submission reviews could not be loaded.');
    }).finally(()=>{if(live(task)){inFlight.current=false;setBusy(false);}});
    return()=>{task.abort();operationMap.clear();};
    // Identity/assignment changes remount this scope; an injected client change
    // also invalidates its prior authorization and aborts every pending request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client]);
  async function refresh(){
    const task=controller.current;if(!task||inFlight.current||!live(task))return;
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(task);if(live(task)){accept(next);setMessage('Saved reviews refreshed. Unsaved feedback is retained; compare it before saving.');}}
    catch(reason){if(live(task)){
      if(reason instanceof DtmSubmissionClientError&&[401,403].includes(reason.status))setWorkspace(null);
      setStale(true);setError(reason instanceof DtmSubmissionClientError?reason.message:'Reviews could not be refreshed. Your draft is retained.');
    }}finally{if(live(task)){inFlight.current=false;setBusy(false);}}
  }
  const revisions=workspace?.files.filter(file=>file.state==='current'||file.state==='retired'&&workspace.reviews.some(review=>review.uploadId===file.id))??[];
  const revision=revisions.find(file=>file.id===selected),saved=workspace?.reviews.find(review=>review.uploadId===selected),draft=drafts[selected];
  const current=Boolean(revision?.state==='current'&&workspace?.submission?.currentUploadId===revision.id);
  function change(patch:Partial<Draft>){
    if(busy||!current)return;
    setDrafts(prior=>({...prior,[selected]:{...prior[selected],...patch,dirty:true}}));setError('');setMessage('');
  }
  async function submit(event:FormEvent){
    event.preventDefault();const task=controller.current;
    if(!task||!live(task)||inFlight.current||!workspace||!revision||!current||!draft||stale)return;
    setError('');setMessage('');
    if(!validText(draft.gradeText,80)||!validText(draft.feedback,2000)){setError('Use at most 80 characters for a grade and 2,000 for feedback, without invalid characters.');return;}
    const body={assignment_id:assignment.id,upload_id:revision.id,expected_version:draft.version,status:draft.status,
      grade_text:draft.status==='not_graded'?null:draft.gradeText,feedback:draft.feedback};
    const key=JSON.stringify(body);let operation=operations.current.get(revision.id);
    if(operation?.key!==key){operation={key,payload:{...body,request_id:crypto.randomUUID()},confirmed:false,conflict:false};operations.current.set(revision.id,operation);}
    const jsonb='{'+Object.entries(operation.payload).map(([name,value])=>JSON.stringify(name)+': '+JSON.stringify(value)).join(', ')+'}';
    if(new TextEncoder().encode(jsonb).byteLength>12000){setError('This review exceeds the metadata size limit. Shorten the feedback before saving.');return;}
    inFlight.current=true;setBusy(true);
    try{
      const receipt=await client.review(operation.payload,task.signal);task.signal.throwIfAborted();
      if(receipt.uploadId!==revision.id||receipt.assignmentId!==assignment.id||receipt.version!==draft.version+1)
        throw new DtmSubmissionClientError('The review receipt could not be verified. Retry the same review.');
      operation.confirmed=true;
      const next=await read(task);if(!live(task))return;
      accept(next);setMessage('Local submission review saved.');props.onSaved?.();
    }catch(reason){if(live(task)){
      if(reason instanceof DtmSubmissionClientError&&reason.status===409){operation.conflict=true;setStale(true);}
      if(reason instanceof DtmSubmissionClientError&&[401,403].includes(reason.status))setWorkspace(null);
      setError(reason instanceof DtmSubmissionClientError?reason.message:'The review was not confirmed. Your draft is retained; retry the same review.');
    }}finally{if(live(task)){inFlight.current=false;setBusy(false);}}
  }
  async function download(){
    const task=controller.current;if(!task||!live(task)||inFlight.current||!revision)return;
    inFlight.current=true;setBusy(true);setError('');
    try{const blob=await client.download(assignment,revision,task.signal);if(live(task))(props.onDownloaded??downloadBlob)({blob,filename:revision.filename});}
    catch(reason){if(live(task)){
      if(reason instanceof DtmSubmissionClientError&&[401,403].includes(reason.status))setWorkspace(null);
      setError(reason instanceof DtmSubmissionClientError?reason.message:'The file could not be downloaded. Retry to obtain a new link.');
    }}
    finally{if(live(task)){inFlight.current=false;setBusy(false);}}
  }
  return <section className="dtm-submission-review affairs-manager min-w-0" aria-label="DTM submission review manager" aria-busy={busy}>
    <h3>Submission review · 作業評分</h3>
    {workspace&&<p className="[overflow-wrap:anywhere]">{assignment.title}</p>}
    {busy&&<p role="status">Loading or saving submission review…</p>}
    {error&&<p role="alert" className="text-destructive">{error}</p>}{message&&<p role="status">{message}</p>}
    {stale&&<p role="status">The saved review or submitted file changed. Refresh before saving; your draft has not been replaced.</p>}
    <div className="affairs-manager-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh submission reviews</Button></div>
    {workspace&&revisions.length===0&&<p>No saved submission is available for review.</p>}
    {workspace&&revisions.length>0&&<>
      <label className="mt-4 grid gap-1">Submission revision<select aria-label="Submission revision" value={selected} disabled={busy} onChange={event=>{setSelected(event.target.value);setError('');setMessage('');}}>
        {revisions.map(file=><option value={file.id} key={file.id}>{file.filename} · {file.state==='current'?'Current':'Reviewed earlier revision'}</option>)}</select></label>
      {revision&&<>
        <dl className="my-4 grid min-w-0 gap-1 [overflow-wrap:anywhere]" aria-label="Saved submission review">
          <dt>Saved status</dt><dd>{saved?statusLabel(saved.status):'No saved review'}</dd>
          <dt>Saved grade</dt><dd>{display(saved?.gradeText)}</dd>
          <dt>Saved feedback</dt><dd className="whitespace-pre-wrap">{display(saved?.feedback)}</dd>
        </dl>
        <Button type="button" variant="outline" disabled={busy} onClick={()=>void download()}>Download selected revision</Button>
        {!current&&<p role="status">This earlier revision is read-only.</p>}
        {!current&&draft?.dirty&&<dl className="my-4 grid gap-1 [overflow-wrap:anywhere]" aria-label="Retained unsaved review draft">
          <dt>Unsaved grade</dt><dd>{display(draft.gradeText)}</dd><dt>Unsaved feedback</dt><dd className="whitespace-pre-wrap">{display(draft.feedback)}</dd>
        </dl>}
        {current&&draft&&<form className="affairs-record-form mt-4" onSubmit={event=>void submit(event)} aria-label="Edit current submission review">
          <fieldset disabled={busy} className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <label className="grid gap-1">Review status<select aria-label="Review status" value={draft.status} onChange={event=>change({status:event.target.value as Draft['status']})}>
              <option value="not_graded">Not graded · 尚未評分</option><option value="graded">Graded · 已評分</option></select></label>
            <label className="grid gap-1">Grade text<Input aria-label="Grade text" value={draft.gradeText??''} maxLength={80} disabled={draft.status!=='graded'} onChange={event=>change({gradeText:event.target.value===''?null:event.target.value})}/></label>
            <label className="grid gap-1">Feedback<Textarea aria-label="Feedback" value={draft.feedback??''} maxLength={2000} onChange={event=>change({feedback:event.target.value===''?null:event.target.value})}/></label>
            <Button type="submit" disabled={stale}>Save submission review</Button>
          </fieldset>
        </form>}
      </>}
    </>}
  </section>;
}

/** Only mount inside the verified manager area. RPC authorization remains
 * authoritative; neither a personal-course role nor a tracker grade grants it. */
export function DtmSubmissionReview(props:DtmSubmissionReviewProps){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(props.userId)||
    !props.assignment||!validDtmSubmissionAssignment(props.assignment,props.assignment.userId))
    return <section className="dtm-submission-review affairs-manager" aria-label="DTM submission review manager"><h3>Submission review · 作業評分</h3><p>Choose a student assignment to review.</p></section>;
  return <ScopedReview key={`${props.userId}:${props.assignment.userId}:${props.assignment.courseId}:${props.assignment.id}`} {...props} assignment={props.assignment}/>;
}
