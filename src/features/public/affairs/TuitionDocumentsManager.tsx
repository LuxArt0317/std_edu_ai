import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {validateTuitionDocumentPayload,type TuitionDocumentReceipt} from '../../../../server/tuitionDocuments.js';
import {parseTuitionDocuments,tuitionDocumentsClient,TuitionDocumentsClientError,type TuitionDocumentsAction,type TuitionDocumentsAdminRecords,type TuitionDocumentsClient,type TuitionSettlement,type TuitionDocumentMetadata} from '../../../services/tuitionDocumentsClient';

type Family='settlement'|'metadata';
type Draft={periodLabel:string|null;statementText:string|null;rowOrder:string;kind:'summer'|'evening';noteText:string|null;status:'metadata_only'|'revoked'};
type Base={id:string;version:number;family:Family};
type Operation={fingerprint:string;action:TuitionDocumentsAction;confirmed:boolean;conflict:boolean};
export type TuitionDocumentsManagerProps={managerId:string;userId:string;client?:Pick<TuitionDocumentsClient,'loadAdmin'|'manage'>;onSaved?:()=>void};
const blank=(family:Family):Draft=>({periodLabel:family==='settlement'?'':null,statementText:null,rowOrder:'0',kind:'summer',noteText:null,status:'metadata_only'});
const fromRow=(row:TuitionSettlement|TuitionDocumentMetadata,family:Family):Draft=>family==='settlement'
  ?{...blank(family),periodLabel:row.periodLabel,statementText:(row as TuitionSettlement).text,rowOrder:String((row as TuitionSettlement).rowOrder)}
  :{...blank(family),periodLabel:row.periodLabel,kind:(row as TuitionDocumentMetadata).kind,noteText:(row as TuitionDocumentMetadata).noteText,status:(row as TuitionDocumentMetadata).status};
const failure=(reason:unknown)=>reason instanceof TuitionDocumentsClientError?reason.message:'Tuition records could not be confirmed. Keep your draft and retry.';
/** Independent local records only. Root supplies the authenticated manager and selected student. */
export function TuitionDocumentsManager(props:TuitionDocumentsManagerProps){return <AccountTuitionManager key={props.managerId+':'+props.userId} {...props}/>;}
function AccountTuitionManager({managerId,userId,client=tuitionDocumentsClient,onSaved}:TuitionDocumentsManagerProps){
  const [records,setRecords]=useState<TuitionDocumentsAdminRecords|null>(null),[family,setFamily]=useState<Family>('settlement');
  const [draft,setDraft]=useState<Draft>(()=>blank('settlement')),[baseline,setBaseline]=useState<Draft>(()=>blank('settlement'));
  const [busy,setBusy]=useState(true),[stale,setStale]=useState(false),[missing,setMissing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const task=useRef<AbortController|null>(null),inFlight=useRef(false),base=useRef<Base>({id:crypto.randomUUID(),version:0,family:'settlement'}),operation=useRef<Operation|null>(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline),dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const live=(controller:AbortController)=>task.current===controller&&!controller.signal.aborted;
  function choose(row:TuitionSettlement|TuitionDocumentMetadata|null,nextFamily:Family){
    const next=row?fromRow(row,nextFamily):blank(nextFamily);base.current={id:row?.id??crypto.randomUUID(),version:row?.version??0,family:nextFamily};
    operation.current=null;setFamily(nextFamily);setDraft(next);setBaseline(next);setStale(false);setMissing(false);setError('');setMessage('');
  }
  async function read(controller:AbortController){
    const next=parseTuitionDocuments(await client.loadAdmin(managerId,userId,controller.signal),userId,true);controller.signal.throwIfAborted();return next;
  }
  function selected(next:TuitionDocumentsAdminRecords){return (base.current.family==='settlement'?next.settlements:next.documentMetadata).find(row=>row.id===base.current.id)??null;}
  function accept(next:TuitionDocumentsAdminRecords,discard=false){
    const row=selected(next),pending=operation.current;
    setRecords(next);setStale(false);setMissing(false);
    if(discard||pending?.confirmed){choose(row,base.current.family);return;}
    if(pending?.conflict||!pending){
      if(row){base.current={...base.current,version:row.version};const saved=fromRow(row,base.current.family);setBaseline(saved);if(!dirtyRef.current)setDraft(saved);}
      else if(base.current.version>0)setMissing(true);
      operation.current=null;
    }
    // An unconfirmed transport retry keeps its original expected version and request ID.
  }
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;setBusy(true);setRecords(null);choose(null,'settlement');
    void read(controller).then(next=>{if(live(controller))accept(next);}).catch(reason=>{if(live(controller))setError(failure(reason));}).finally(()=>{if(live(controller)){inFlight.current=false;setBusy(false);}});
    return()=>{controller.abort();operation.current=null;};
    // Account changes remount. A different transport must establish authorization again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client,managerId,userId]);
  async function refresh(discard=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(controller);if(!live(controller))return;accept(next,discard);setMessage(discard?'Saved records loaded; the draft was discarded. No earlier request was reversed.':'Saved records refreshed. Unsaved values are retained for comparison.');}
    catch(reason){if(live(controller)){setStale(true);if(reason instanceof TuitionDocumentsClientError&&[401,403].includes(reason.status))setRecords(null);setError(failure(reason));}}
    finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  function change(patch:Partial<Draft>){if(busy)return;setDraft(current=>({...current,...patch}));setError('');setMessage('');}
  function actionFor(deleting:boolean):TuitionDocumentsAction{
    const common={id:base.current.id,user_id:userId,expected_version:base.current.version,request_id:crypto.randomUUID()};
    if(deleting)return {kind:family==='settlement'?'delete_tuition_settlement':'delete_tuition_document_metadata',payload:common};
    if(family==='settlement')return {kind:'save_tuition_settlement',payload:{...common,period_label:draft.periodLabel??'',statement_text:draft.statementText,row_order:/^(?:0|[1-9]\d{0,4})$/.test(draft.rowOrder)?Number(draft.rowOrder):-1}};
    return {kind:'save_tuition_document_metadata',payload:{...common,kind:draft.kind,period_label:draft.periodLabel,note_text:draft.noteText,status:draft.status,issuer:'stu.best'}};
  }
  const pendingMetadata=operation.current?.action.kind==='save_tuition_document_metadata'&&!operation.current.confirmed&&!operation.current.conflict?operation.current.action.payload:null;
  const exactCreateRetry=Boolean(pendingMetadata&&pendingMetadata.expected_version===0&&pendingMetadata.id===base.current.id&&pendingMetadata.user_id===userId&&pendingMetadata.kind===draft.kind&&pendingMetadata.period_label===draft.periodLabel&&pendingMetadata.note_text===draft.noteText&&pendingMetadata.status===draft.status);
  // A committed create with a lost response may appear in a refresh. Its retained
  // exact request still needs receipt replay; only other record IDs block creation.
  const duplicateKind=Boolean(records&&family==='metadata'&&base.current.version===0&&records.documentMetadata.some(row=>row.kind===draft.kind&&!(exactCreateRetry&&row.id===pendingMetadata?.id)));
  async function mutate(deleting=false){
    const controller=task.current;
    if(!controller||!live(controller)||inFlight.current||!records||stale||missing||operation.current?.confirmed||duplicateKind||deleting&&(base.current.version===0||dirty))return;
    if(!deleting&&family==='metadata'&&base.current.version>0&&baseline.status==='revoked'&&draft.status!=='revoked'){setError('Revocation is terminal. Discard the draft and reload the saved revoked status.');return;}
    const proposed=actionFor(deleting),invalid=validateTuitionDocumentPayload(proposed.kind,proposed.payload);
    if(invalid){setError(invalid);return;}
    const {request_id:_request,...fields}=proposed.payload,fingerprint=JSON.stringify({kind:proposed.kind,payload:fields});
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,action:proposed,confirmed:false,conflict:false};
    const pending=operation.current;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      const receipt:TuitionDocumentReceipt=await client.manage(managerId,pending.action,controller.signal);controller.signal.throwIfAborted();
      if(receipt.id!==pending.action.payload.id||receipt.kind!==pending.action.kind||receipt.version!==pending.action.payload.expected_version+1)throw new TuitionDocumentsClientError('The saved receipt could not be verified. Retry the unchanged operation.');
      pending.confirmed=true;
      const next=await read(controller);if(!live(controller))return;
      const current=selected(next);if(current&&current.version<receipt.version)throw new TuitionDocumentsClientError('The refreshed record is older than the confirmed receipt. Refresh again.');
      accept(next);setMessage(deleting?'Local tuition record deleted. Its identifier remains reserved.':'Local tuition record saved. No file or payment was created.');onSaved?.();
    }catch(reason){if(live(controller)){
      if(reason instanceof TuitionDocumentsClientError&&reason.status===409){pending.conflict=true;setStale(true);}
      if(reason instanceof TuitionDocumentsClientError&&[401,403].includes(reason.status))setRecords(null);
      setError(pending.confirmed?'The write was confirmed, but refreshed records are unavailable. Refresh records; do not submit a new write.':failure(reason));
    }}finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  const locked=busy||dirty||Boolean(operation.current),writeBlocked=busy||stale||missing||duplicateKind||Boolean(operation.current?.confirmed);
  return <section className="affairs-manager min-w-0" aria-label="Tuition records manager" aria-busy={busy}>
    <h3>Tuition statements and document metadata</h3><p>Local reference records for the selected account. Metadata does not issue a university document, enable printing, or establish a payment.</p>
    {busy&&<p role="status">Loading or saving tuition records…</p>}{error&&<p role="alert" className="text-destructive">{error}</p>}{message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh tuition records</Button>
    {records&&<>
      <ul className="my-4 grid gap-2 [overflow-wrap:anywhere]" aria-label="Saved tuition records">
        {records.settlements.map(row=><li key={'s:'+row.id}><span>{row.periodLabel} · revision {row.version}</span> <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>choose(row,'settlement')}>Edit settlement {row.periodLabel}</Button></li>)}
        {records.documentMetadata.map(row=><li key={'d:'+row.id}><span>{row.kind} · {row.status} · revision {row.version}</span> <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>choose(row,'metadata')}>Edit {row.kind} metadata</Button></li>)}
      </ul>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={locked} onClick={()=>choose(null,'settlement')}>New settlement</Button><Button type="button" variant="outline" disabled={locked} onClick={()=>choose(null,'metadata')}>New document metadata</Button></div>
      {(dirty||operation.current||missing)&&<Button className="my-2" type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>Discard draft and reload</Button>}
      {stale&&<p role="status">Refresh saved records before retrying. Your draft is retained.</p>}{missing&&<p role="status">This saved record is no longer available. Discard the draft before starting a new record.</p>}
      {duplicateKind&&<p role="status">This account already has {draft.kind} metadata. Select the existing record instead.</p>}
      <form className="affairs-record-form" onSubmit={(event:FormEvent)=>{event.preventDefault();void mutate();}}>
        <h4>{base.current.version?'Edit':'Add'} {family==='settlement'?'local settlement':'local document metadata'}</h4>
        <fieldset disabled={busy||Boolean(operation.current?.confirmed)}>
          <legend>{family==='settlement'?'Literal settlement statement':'Unverified document metadata'}</legend>
          {family==='metadata'&&<label>Document kind<select aria-label="Document kind" disabled={base.current.version>0} value={draft.kind} onChange={event=>change({kind:event.target.value as Draft['kind']})}><option value="summer">Summer · 暑修</option><option value="evening">Evening · 進修部</option></select></label>}
          <label>Period label<Input aria-label="Period label" required={family==='settlement'} maxLength={320} disabled={draft.periodLabel===null} value={draft.periodLabel??''} onChange={event=>change({periodLabel:event.target.value})}/></label>
          {family==='metadata'&&<label><input type="checkbox" checked={draft.periodLabel===null} onChange={event=>change({periodLabel:event.target.checked?null:''})}/>Period label not provided</label>}
          {family==='settlement'?<>
            <label>Statement text<Textarea aria-label="Statement text" maxLength={8000} disabled={draft.statementText===null} value={draft.statementText??''} onChange={event=>change({statementText:event.target.value})}/></label>
            <label><input type="checkbox" checked={draft.statementText===null} onChange={event=>change({statementText:event.target.checked?null:''})}/>Statement text not provided</label>
            <label>Display order<Input aria-label="Display order" type="number" min="0" max="10000" step="1" value={draft.rowOrder} onChange={event=>change({rowOrder:event.target.value})}/></label>
          </>:<>
            <label>Metadata status<select aria-label="Metadata status" disabled={base.current.version>0&&baseline.status==='revoked'} value={draft.status} onChange={event=>change({status:event.target.value as Draft['status']})}><option value="metadata_only">Metadata only</option><option value="revoked">Revoked</option></select></label>
            {base.current.version>0&&baseline.status==='revoked'&&<p>Revocation is terminal. This record stays revoked.</p>}
            <label>Metadata note<Textarea aria-label="Metadata note" maxLength={2000} disabled={draft.noteText===null} value={draft.noteText??''} onChange={event=>change({noteText:event.target.value})}/></label>
            <label><input type="checkbox" checked={draft.noteText===null} onChange={event=>change({noteText:event.target.checked?null:''})}/>Metadata note not provided</label><p>Issuer: stu.best. No file is available.</p>
          </>}
          <Button type="submit" disabled={writeBlocked}>{family==='settlement'?'Save tuition settlement':'Save tuition document metadata'}</Button>
          {base.current.version>0&&<details><summary>Delete this local record</summary><p>Deletion removes the local record from these views. It does not cancel a university document or payment.</p><Button type="button" variant="destructive" disabled={writeBlocked||dirty} onClick={()=>void mutate(true)}>Confirm tuition record deletion</Button></details>}
        </fieldset>
      </form>
    </>}
  </section>;
}
