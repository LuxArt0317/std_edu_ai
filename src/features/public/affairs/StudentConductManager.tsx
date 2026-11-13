import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {studentConductMaxRecords,studentConductTextLimits,validateStudentConductPayload} from '../../../../server/studentConduct.js';
import {studentConductColumns} from '@/services/studentConduct';
import {parseStudentConduct,studentConductClient,StudentConductClientError,studentConductFieldMap,type StudentConductAction,type StudentConductCell,type StudentConductClient,type StudentConductRecord,type StudentConductRecords,type StudentConductSavePayload} from '@/services/studentConductClient';

type Draft=Record<StudentConductCell,string|null> & {rowOrder:string};
type Operation={fingerprint:string;action:StudentConductAction;confirmed:boolean;conflict:boolean};
export type StudentConductManagerProps={managerId:string;userId:string;client?:Pick<StudentConductClient,'loadAdmin'|'manage'>;onSaved?:()=>void};
const blank=():Draft=>({...Object.fromEntries(studentConductFieldMap.map(item=>[item.field,null])),rowOrder:'0'}) as Draft;
const fromRow=(row:StudentConductRecord):Draft=>({...Object.fromEntries(studentConductFieldMap.map(item=>[item.field,row[item.key]])),rowOrder:String(row.rowOrder)}) as Draft;
const failure=(reason:unknown)=>reason instanceof StudentConductClientError?reason.message:'獎懲紀錄暫時無法確認，請保留草稿並重試。';
export function StudentConductManager(props:StudentConductManagerProps){return <AccountConductManager key={props.managerId+':'+props.userId} {...props}/>;}
function AccountConductManager({managerId,userId,client=studentConductClient,onSaved}:StudentConductManagerProps){
  const [records,setRecords]=useState<StudentConductRecords|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState<Draft>(blank);
  const [busy,setBusy]=useState(true),[stale,setStale]=useState(false),[missing,setMissing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState<{id:string;version:number}>(()=>({id:crypto.randomUUID(),version:0})),[pending,setPending]=useState<Operation|null>(null);
  const [loadedClient,setLoadedClient]=useState<typeof client|null>(null);
  const task=useRef<AbortController|null>(null),inFlight=useRef(false),base=useRef(selected),operation=useRef<Operation|null>(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline),dirtyRef=useRef(dirty);
  useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  const live=(controller:AbortController)=>task.current===controller&&!controller.signal.aborted;
  function choose(row:StudentConductRecord|null){
    const next=row?fromRow(row):blank();base.current={id:row?.id??crypto.randomUUID(),version:row?.version??0};setSelected(base.current);operation.current=null;setPending(null);
    setDraft(next);setBaseline(next);setStale(false);setMissing(false);setError('');setMessage('');
  }
  async function read(controller:AbortController){const next=parseStudentConduct(await client.loadAdmin(managerId,userId,controller.signal),userId);controller.signal.throwIfAborted();return next;}
  function accept(next:StudentConductRecords,discard=false){
    const row=next.records.find(item=>item.id===base.current.id)??null,pending=operation.current;
    setRecords(next);setStale(false);setMissing(false);
    if(discard){choose(row);return;}
    if(pending?.confirmed){
      if(pending.action.kind==='save_student_conduct'&&(!row||row.version<pending.action.payload.expected_version+1)
        ||pending.action.kind==='delete_student_conduct'&&row)throw new StudentConductClientError('已確認操作，但重新載入的紀錄尚無法確認；請重新載入，勿重複儲存。');
      choose(row);return;
    }
    if(!pending||pending.conflict){
      if(row){base.current={id:row.id,version:row.version};setSelected(base.current);const saved=fromRow(row);setBaseline(saved);if(!dirtyRef.current)setDraft(saved);}
      else if(base.current.version>0)setMissing(true);
      operation.current=null;setPending(null);
    }
    // An uncertain transport response retains the exact request ID and expected version.
  }
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.loadAdmin(managerId,userId,controller.signal);}).then(value=>{
      const next=parseStudentConduct(value,userId);if(live(controller)){setRecords(next);choose(null);}
    }).catch(reason=>{if(live(controller)){setRecords(null);setError(failure(reason));}}).finally(()=>{if(live(controller)){inFlight.current=false;setLoadedClient(client);setBusy(false);}});
    return()=>{controller.abort();operation.current=null;};
  },[client,managerId,userId]);
  async function refresh(discard=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(controller);if(!live(controller))return;accept(next,discard);setMessage(discard?'已載入儲存紀錄並放棄草稿；先前送出的操作不會因此撤銷。':'已重新載入儲存紀錄；尚未儲存的內容保留供比較。');}
    catch(reason){if(live(controller)){setStale(true);if(reason instanceof StudentConductClientError&&[401,403].includes(reason.status))setRecords(null);setError(failure(reason));}}
    finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  function change(patch:Partial<Draft>){if(busy)return;setDraft(current=>({...current,...patch}));setError('');setMessage('');}
  function actionFor(deleting:boolean):StudentConductAction{
    const common={id:base.current.id,user_id:userId,request_id:crypto.randomUUID(),expected_version:base.current.version};
    if(deleting)return {kind:'delete_student_conduct',payload:common};
    const cells=Object.fromEntries(studentConductFieldMap.map(item=>[item.field,draft[item.field]]));
    return {kind:'save_student_conduct',payload:{...common,...cells,row_order:/^(?:0|[1-9]\d{0,4})$/.test(draft.rowOrder)?Number(draft.rowOrder):-1} as StudentConductSavePayload};
  }
  const retryCreated=Boolean(pending&&!pending.confirmed&&!pending.conflict&&pending.action.kind==='save_student_conduct'
    &&pending.action.payload.expected_version===0&&pending.action.payload.id===selected.id&&records?.records.some(row=>row.id===selected.id));
  const atLimit=Boolean(records&&selected.version===0&&records.records.length>=studentConductMaxRecords&&!retryCreated);
  async function mutate(deleting=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current||!records||stale||missing||operation.current?.confirmed||atLimit||deleting&&(base.current.version===0||dirty))return;
    const proposed=actionFor(deleting),invalid=validateStudentConductPayload(proposed.kind,proposed.payload);if(invalid){setError(invalid);return;}
    const {request_id:_request,...fields}=proposed.payload,fingerprint=JSON.stringify({kind:proposed.kind,payload:fields});
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,action:proposed,confirmed:false,conflict:false};
    const active=operation.current;setPending({...active});inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      const receipt=await client.manage(managerId,active.action,controller.signal);controller.signal.throwIfAborted();
      if(receipt.id!==active.action.payload.id||receipt.kind!==active.action.kind||receipt.version!==active.action.payload.expected_version+1)throw new StudentConductClientError('儲存回條尚無法確認，請重試原操作。');
      active.confirmed=true;setPending({...active});const next=await read(controller);if(!live(controller))return;accept(next);setMessage(deleting?'已刪除站內獎懲紀錄；原識別碼仍保留。':'已儲存站內獎懲紀錄。');onSaved?.();
    }catch(reason){if(live(controller)){
      if(reason instanceof StudentConductClientError&&reason.status===409){active.conflict=true;setPending({...active});setStale(true);}
      if(reason instanceof StudentConductClientError&&[401,403].includes(reason.status))setRecords(null);
      setError(active.confirmed?'操作已確認，但紀錄尚無法重新載入。請重新載入，勿重複儲存。':failure(reason));
    }}finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  const loading=busy||loadedClient!==client,locked=loading||dirty||Boolean(pending),writeBlocked=loading||stale||missing||atLimit||Boolean(pending?.confirmed);
  return <section className="affairs-manager min-w-0" aria-label="學生獎懲紀錄管理" aria-busy={loading}>
    <h3>學生獎懲紀錄管理</h3><p>選定帳戶：<span className="[overflow-wrap:anywhere]">{userId}</span></p>
    <p>依據輸入內容保存站內紀錄；不計算獎懲分數或產生校方證明。</p>
    {loading&&<p role="status">載入或儲存獎懲紀錄中…</p>}{loadedClient===client&&error&&<p role="alert" className="text-destructive">{error}</p>}{loadedClient===client&&message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={loading} onClick={()=>void refresh()}>重新載入獎懲紀錄</Button>
    {loadedClient===client&&records&&<>
      <ul className="my-4 grid gap-2 [overflow-wrap:anywhere]" aria-label="已儲存獎懲紀錄">{records.records.map((row,index)=><li key={row.id}>
        <span>{row.occurredOnText??'—'} · {row.conductName??'—'} · 版本 {row.version}</span>{' '}
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>choose(row)}>編輯第 {index+1} 筆</Button>
      </li>)}</ul>
      <Button type="button" variant="outline" disabled={locked} onClick={()=>choose(null)}>新增獎懲紀錄</Button>
      {(dirty||pending||missing)&&<Button className="ml-2" type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>放棄草稿並重新載入</Button>}
      {stale&&<p role="status">儲存前請重新載入最新紀錄；草稿已保留。</p>}{missing&&<p role="status">原紀錄已無法取得；請放棄草稿後再新增紀錄。</p>}
      {atLimit&&<p role="status">此帳戶已達 1000 筆紀錄上限，請編輯或刪除既有紀錄。</p>}
      <form className="affairs-record-form" onSubmit={(event:FormEvent)=>{event.preventDefault();void mutate();}}>
        <h4>{selected.version?'編輯':'新增'}站內獎懲紀錄{selected.version?` · 版本 ${selected.version}`:''}</h4>
        <fieldset disabled={busy||Boolean(pending?.confirmed)}><legend>原文欄位</legend>
          {studentConductFieldMap.map(({field,key})=>{const label=studentConductColumns.find(column=>column.key===key)!.label,Control=field==='reason_text'?Textarea:Input;return <div key={field}>
            <label>{label}<Control aria-label={label} maxLength={studentConductTextLimits[field]*2} disabled={draft[field]===null} value={draft[field]??''} onChange={event=>change({[field]:event.target.value})}/></label>
            <label><input type="checkbox" aria-label={label+'未提供'} checked={draft[field]===null} onChange={event=>change({[field]:event.target.checked?null:''})}/>{label}未提供</label>
          </div>;})}
          <label>顯示順序<Input aria-label="顯示順序" type="number" min="0" max="10000" step="1" value={draft.rowOrder} onChange={event=>change({rowOrder:event.target.value})}/></label>
          <Button type="submit" disabled={writeBlocked}>儲存獎懲紀錄</Button>
          {selected.version>0&&<details><summary>刪除此站內紀錄</summary><p>刪除後不再顯示此紀錄；原識別碼保留，無法重建。</p><Button type="button" variant="destructive" disabled={writeBlocked||dirty} onClick={()=>void mutate(true)}>確認刪除獎懲紀錄</Button></details>}
        </fieldset>
      </form>
    </>}
  </section>;
}
