import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {studentLoanHistoryCountMax,studentLoanTextLimits,validateStudentLoanPayload} from '../../../../server/studentLoan.js';
import {parseStudentLoan,studentLoanClient,StudentLoanClientError,studentLoanFieldMap,type StudentLoanAction,type StudentLoanCell,type StudentLoanClient,type StudentLoanRecord,type StudentLoanSnapshot} from '@/services/studentLoanClient';

type Draft=Record<StudentLoanCell,string|null> & {applicationState:StudentLoanRecord['currentApplicationState'];historyCount:string|null};
type Operation={fingerprint:string;action:StudentLoanAction;confirmed:boolean;conflict:boolean};
export type StudentLoanManagerProps={managerId:string;userId:string;client?:Pick<StudentLoanClient,'loadAdmin'|'manage'>;onSaved?:()=>void};
const blank=():Draft=>({current_term_label:null,current_application_text:null,progress_text:null,history_text:null,applicationState:'unknown',historyCount:null});
const fromRow=(row:StudentLoanRecord):Draft=>({current_term_label:row.currentTermLabel,current_application_text:row.currentApplicationText,progress_text:row.progressText,history_text:row.historyText,
  applicationState:row.currentApplicationState,historyCount:row.historyCount===null?null:String(row.historyCount)});
const failure=(reason:unknown)=>reason instanceof StudentLoanClientError?reason.message:'就學貸款原文紀錄暫時無法確認，請保留草稿並重試。';
export function StudentLoanManager(props:StudentLoanManagerProps){return <AccountLoanManager key={props.managerId+':'+props.userId} {...props}/>;}
function AccountLoanManager({managerId,userId,client=studentLoanClient,onSaved}:StudentLoanManagerProps){
  const [snapshot,setSnapshot]=useState<StudentLoanSnapshot|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState<Draft>(blank);
  const [busy,setBusy]=useState(true),[stale,setStale]=useState(false),[missing,setMissing]=useState(false),[collision,setCollision]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState<{id:string;version:number}>(()=>({id:crypto.randomUUID(),version:0})),[pending,setPending]=useState<Operation|null>(null);
  const [loadedClient,setLoadedClient]=useState<typeof client|null>(null);
  const task=useRef<AbortController|null>(null),inFlight=useRef(false),base=useRef(selected),operation=useRef<Operation|null>(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline),dirtyRef=useRef(dirty);
  useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  const live=(controller:AbortController)=>task.current===controller&&!controller.signal.aborted;
  function choose(row:StudentLoanRecord|null){
    const next=row?fromRow(row):blank();base.current={id:row?.id??crypto.randomUUID(),version:row?.version??0};setSelected(base.current);operation.current=null;setPending(null);
    setDraft(next);setBaseline(next);setStale(false);setMissing(false);setCollision(false);setError('');setMessage('');
  }
  async function read(controller:AbortController){const next=parseStudentLoan(await client.loadAdmin(managerId,userId,controller.signal),userId);controller.signal.throwIfAborted();return next;}
  function accept(next:StudentLoanSnapshot,discard=false){
    const row=next.record,pending=operation.current;setSnapshot(next);setStale(false);setMissing(false);setCollision(false);
    if(discard){choose(row);return;}
    if(pending?.confirmed){
      if(pending.action.kind==='save_student_loan'&&(!row||row.id!==pending.action.payload.id||row.version<pending.action.payload.expected_version+1)
        ||pending.action.kind==='delete_student_loan'&&row?.id===pending.action.payload.id)throw new StudentLoanClientError('已確認操作，但最新紀錄尚無法確認；請重新載入，勿重複儲存。');
      choose(row);return;
    }
    // A refresh after a lost response must retain the exact request and old version.
    if(pending&&!pending.conflict)return;
    operation.current=null;setPending(null);
    if(row?.id===base.current.id){base.current={id:row.id,version:row.version};setSelected(base.current);const saved=fromRow(row);setBaseline(saved);if(!dirtyRef.current)setDraft(saved);}
    else if(base.current.version>0)setMissing(true);
    else if(row)setCollision(true);
  }
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.loadAdmin(managerId,userId,controller.signal);}).then(value=>{
      const next=parseStudentLoan(value,userId);if(live(controller)){setSnapshot(next);choose(next.record);}
    }).catch(reason=>{if(live(controller)){setSnapshot(null);setError(failure(reason));}}).finally(()=>{if(live(controller)){inFlight.current=false;setLoadedClient(client);setBusy(false);}});
    return()=>{controller.abort();operation.current=null;};
  },[client,managerId,userId]);
  async function refresh(discard=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(controller);if(!live(controller))return;accept(next,discard);setMessage(discard?'已載入儲存紀錄並放棄草稿；先前送出的操作不會因此撤銷。':'已重新載入儲存紀錄；尚未儲存的內容保留供比較。');}
    catch(reason){if(live(controller)){setStale(true);if(reason instanceof StudentLoanClientError&&[401,403].includes(reason.status))setSnapshot(null);setError(failure(reason));}}
    finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  function change(patch:Partial<Draft>){if(busy)return;setDraft(current=>({...current,...patch}));setError('');setMessage('');}
  function actionFor(deleting:boolean):StudentLoanAction{
    const common={id:base.current.id,user_id:userId,request_id:crypto.randomUUID(),expected_version:base.current.version};
    if(deleting)return {kind:'delete_student_loan',payload:common};
    return {kind:'save_student_loan',payload:{...common,current_term_label:draft.current_term_label,current_application_text:draft.current_application_text,progress_text:draft.progress_text,history_text:draft.history_text,
      current_application_state:draft.applicationState,history_count:draft.historyCount===null?null:/^(?:0|[1-9]\d{0,6})$/.test(draft.historyCount)?Number(draft.historyCount):-1}};
  }
  const exhausted=selected.version>=999999999;
  async function mutate(deleting=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current||!snapshot||stale||missing||collision||exhausted||operation.current?.confirmed||deleting&&(base.current.version===0||dirty))return;
    const proposed=actionFor(deleting),invalid=validateStudentLoanPayload(proposed.kind,proposed.payload);if(invalid){setError(invalid);return;}
    const {request_id:_request,...fields}=proposed.payload,fingerprint=JSON.stringify({kind:proposed.kind,payload:fields});
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,action:proposed,confirmed:false,conflict:false};
    const active=operation.current;setPending({...active});inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      const receipt=await client.manage(managerId,active.action,controller.signal);controller.signal.throwIfAborted();
      if(receipt.id!==active.action.payload.id||receipt.kind!==active.action.kind||receipt.version!==active.action.payload.expected_version+1)throw new StudentLoanClientError('儲存回條尚無法確認，請重試原操作。');
      active.confirmed=true;setPending({...active});const next=await read(controller);if(!live(controller))return;accept(next);setMessage(deleting?'已刪除站內就學貸款紀錄；原識別碼仍保留。':'已儲存站內就學貸款原文紀錄。');onSaved?.();
    }catch(reason){if(live(controller)){
      if(reason instanceof StudentLoanClientError&&reason.status===409){active.conflict=true;setPending({...active});setStale(true);}
      if(reason instanceof StudentLoanClientError&&[401,403].includes(reason.status))setSnapshot(null);
      setError(active.confirmed?'操作已確認，但紀錄尚無法重新載入。請重新載入，勿重複儲存。':failure(reason));
    }}finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  const loading=busy||loadedClient!==client,writeBlocked=loading||stale||missing||collision||exhausted||Boolean(pending?.confirmed);
  return <section className="affairs-manager min-w-0" aria-label="就學貸款原文紀錄管理" aria-busy={loading}>
    <h3>就學貸款原文紀錄管理</h3><p>選定帳戶：<span className="[overflow-wrap:anywhere]">{userId}</span></p>
    <p>僅保存明確提供的站內原文及狀態，不辦理貸款申請、核准、付款或文件製作。</p>
    {loading&&<p role="status">載入或儲存就學貸款紀錄中…</p>}{loadedClient===client&&error&&<p role="alert" className="text-destructive">{error}</p>}{loadedClient===client&&message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={loading} onClick={()=>void refresh()}>重新載入就學貸款紀錄</Button>
    {loadedClient===client&&snapshot&&<>
      <p aria-label="已儲存就學貸款紀錄">{snapshot.record?`已儲存站內紀錄 · 版本 ${snapshot.record.version}`:'目前沒有站內原文紀錄；申請狀態與歷史筆數未知。'}</p>
      {(dirty||pending||missing||collision)&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>放棄草稿並重新載入</Button>}
      {stale&&<p role="status">儲存前請重新載入最新紀錄；草稿已保留。</p>}
      {missing&&<p role="status">原紀錄已無法取得；請放棄草稿後載入目前紀錄或新增。</p>}
      {collision&&<p role="status">此帳戶已有另一筆站內紀錄；請放棄草稿後載入該筆紀錄。</p>}
      {exhausted&&<p role="status">此紀錄已達版本上限，無法再次修改。</p>}
      <form className="affairs-record-form" onSubmit={(event:FormEvent)=>{event.preventDefault();void mutate();}}>
        <h4>{selected.version?'編輯':'新增'}站內就學貸款紀錄{selected.version?` · 版本 ${selected.version}`:''}</h4>
        <fieldset disabled={busy||Boolean(pending?.confirmed)}><legend>明確提供的原文與狀態</legend>
          {studentLoanFieldMap.map(({field,label})=>{const Control=field==='current_term_label'?Input:Textarea;return <div key={field}>
            <label>{label}<Control aria-label={label} maxLength={studentLoanTextLimits[field]*2} disabled={draft[field]===null} value={draft[field]??''} onChange={event=>change({[field]:event.target.value})}/></label>
            <label><input type="checkbox" aria-label={label+'未提供'} checked={draft[field]===null} onChange={event=>change({[field]:event.target.checked?null:''})}/>{label}未提供</label>
          </div>;})}
          <label>當期申請狀態<select aria-label="當期申請狀態" value={draft.applicationState} onChange={event=>change({applicationState:event.target.value as Draft['applicationState']})}>
            <option value="unknown">未知</option><option value="not_applied">明確記錄尚未申請</option><option value="recorded">已有原文紀錄</option>
          </select></label>
          <label>歷年申請筆數<Input aria-label="歷年申請筆數" type="number" min="0" max={studentLoanHistoryCountMax} step="1" disabled={draft.historyCount===null} value={draft.historyCount??''} onChange={event=>change({historyCount:event.target.value})}/></label>
          <label><input type="checkbox" aria-label="歷年申請筆數未提供" checked={draft.historyCount===null} onChange={event=>change({historyCount:event.target.checked?null:''})}/>歷年申請筆數未提供</label>
          <Button type="submit" disabled={writeBlocked}>儲存就學貸款紀錄</Button>
          {selected.version>0&&<details><summary>刪除此站內紀錄</summary><p>刪除後不再顯示此紀錄；原識別碼保留，無法重建。此操作不會撤銷任何校方申請。</p><Button type="button" variant="destructive" disabled={writeBlocked||dirty} onClick={()=>void mutate(true)}>確認刪除就學貸款紀錄</Button></details>}
        </fieldset>
      </form>
    </>}
  </section>;
}
