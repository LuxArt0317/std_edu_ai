import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {validateDormitoryConductPayload} from '../../../../server/dormitoryConduct.js';
import {dormitoryConductMaxVersion,type DormitoryConductAdminRecord,type DormitoryConductResult} from '@/services/dormitoryConduct';
import {dormitoryConductClient,DormitoryConductClientError,parseDormitoryConductAdmin,parseDormitoryConductReceipt,type DormitoryConductAction,type DormitoryConductAdminData,type DormitoryConductClient} from '@/services/dormitoryConductClient';

type Operation={fingerprint:string;action:DormitoryConductAction;confirmed:boolean;conflict:boolean};
export type DormConductManagerProps={managerId:string;userId:string;client?:Pick<DormitoryConductClient,'loadAdmin'|'manage'>;onSaved?:()=>void};
const failure=(reason:unknown)=>reason instanceof DormitoryConductClientError?reason.message:'住宿獎懲資料暫時無法確認，請保留草稿並重試。';
export function DormConductManager(props:DormConductManagerProps){return <AccountDormConductManager key={props.managerId+':'+props.userId} {...props}/>;}
function AccountDormConductManager({managerId,userId,client=dormitoryConductClient,onSaved}:DormConductManagerProps){
  const [data,setData]=useState<DormitoryConductAdminData|null>(null),[draft,setDraft]=useState<DormitoryConductResult>('unknown'),[baseline,setBaseline]=useState<DormitoryConductResult>('unknown');
  const [busy,setBusy]=useState(true),[stale,setStale]=useState(false),[missing,setMissing]=useState(false),[collision,setCollision]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(()=>({id:crypto.randomUUID() as string,version:0})),[pending,setPending]=useState<Operation|null>(null),[loadedClient,setLoadedClient]=useState<typeof client|null>(null);
  const task=useRef<AbortController|null>(null),inFlight=useRef(false),base=useRef(selected),operation=useRef<Operation|null>(null),dirtyRef=useRef(false);
  const dirty=draft!==baseline;
  useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  const live=(controller:AbortController)=>task.current===controller&&!controller.signal.aborted;
  function notifySaved(){try{onSaved?.();}catch{setMessage(current=>current+' 外層資料尚未更新，請稍後重新載入。');}}
  function choose(row:DormitoryConductAdminRecord|null){
    const next=row?.result??'unknown';base.current={id:row?.id??crypto.randomUUID(),version:row?.version??0};setSelected(base.current);operation.current=null;setPending(null);
    setDraft(next);setBaseline(next);setStale(false);setMissing(false);setCollision(false);setError('');setMessage('');
  }
  async function read(controller:AbortController){const next=parseDormitoryConductAdmin(await client.loadAdmin(managerId,userId,controller.signal),userId);controller.signal.throwIfAborted();return next;}
  function accept(next:DormitoryConductAdminData,discard=false){
    const row=next.record,current=operation.current;setData(next);setStale(false);setMissing(false);setCollision(false);
    if(discard){choose(row);return;}
    if(current?.confirmed){
      if(current.action.kind==='save_dormitory_conduct'&&(!row||row.id!==current.action.payload.id||row.version<current.action.payload.expected_version+1)
        ||current.action.kind==='delete_dormitory_conduct'&&row?.id===current.action.payload.id)throw new DormitoryConductClientError('已確認操作，但最新資料尚無法確認；請重新載入，勿重複儲存。');
      choose(row);return;
    }
    // An authoritative read does not replace an uncertain write's replay identity.
    if(current&&!current.conflict)return;
    operation.current=null;setPending(null);
    if(row?.id===base.current.id){base.current={id:row.id,version:row.version};setSelected(base.current);setBaseline(row.result);if(!dirtyRef.current)setDraft(row.result);}
    else if(base.current.version>0)setMissing(true);
    else if(row)setCollision(true);
  }
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.loadAdmin(managerId,userId,controller.signal);}).then(value=>{
      const next=parseDormitoryConductAdmin(value,userId);if(live(controller)){setData(next);choose(next.record);}
    }).catch(reason=>{if(live(controller)){setData(null);setError(failure(reason));}}).finally(()=>{if(live(controller)){inFlight.current=false;setLoadedClient(client);setBusy(false);}});
    return()=>{controller.abort();operation.current=null;};
  },[client,managerId,userId]);
  async function refresh(discard=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(controller);if(!live(controller))return;const recovered=Boolean(operation.current?.confirmed);accept(next,discard);
      setMessage(discard?'已載入儲存資料並放棄草稿；先前送出的操作不會因此撤銷。':'已重新載入儲存資料；尚未儲存的選擇保留供比較。');if(recovered)notifySaved();}
    catch(reason){if(live(controller)){setStale(true);if(reason instanceof DormitoryConductClientError&&[401,403].includes(reason.status))setData(null);setError(failure(reason));}}
    finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  function actionFor(deleting:boolean):DormitoryConductAction{
    const common={id:base.current.id,user_id:userId,request_id:crypto.randomUUID(),expected_version:base.current.version};
    return deleting?{kind:'delete_dormitory_conduct',payload:common}:{kind:'save_dormitory_conduct',payload:{...common,result:draft}};
  }
  const exhausted=selected.version>=dormitoryConductMaxVersion;
  async function mutate(deleting=false){
    const controller=task.current,current=operation.current;
    if(!controller||!live(controller)||inFlight.current||loadedClient!==client||!data||stale||missing||collision||exhausted||current?.confirmed
      ||current&&!current.conflict&&(current.action.kind==='delete_dormitory_conduct')!==deleting||deleting&&(base.current.version===0||dirty))return;
    const proposed=actionFor(deleting),invalid=validateDormitoryConductPayload(proposed.kind,proposed.payload);if(invalid){setError(invalid);return;}
    const {request_id:_request,...fields}=proposed.payload,fingerprint=JSON.stringify({kind:proposed.kind,payload:fields});
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,action:proposed,confirmed:false,conflict:false};
    const active=operation.current;setPending({...active});inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      parseDormitoryConductReceipt(await client.manage(managerId,active.action,controller.signal),active.action);controller.signal.throwIfAborted();if(!live(controller))return;
      active.confirmed=true;setPending({...active});const next=await read(controller);if(!live(controller))return;accept(next);
      setMessage(deleting?'已刪除站內住宿獎懲狀態；原識別碼仍保留。':'已儲存站內住宿獎懲狀態。');notifySaved();
    }catch(reason){if(live(controller)){
      if(reason instanceof DormitoryConductClientError&&reason.status===409){active.conflict=true;setPending({...active});setStale(true);}
      if(reason instanceof DormitoryConductClientError&&[401,403].includes(reason.status))setData(null);
      setError(active.confirmed?'操作已確認，但資料尚無法重新載入。請重新載入，勿重複儲存。':failure(reason));
    }}finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  const loading=busy||loadedClient!==client,writeBlocked=loading||stale||missing||collision||exhausted||Boolean(pending?.confirmed),uncertain=Boolean(pending&&!pending.conflict&&!pending.confirmed);
  return <section className="affairs-manager min-w-0" aria-label="住宿獎懲狀態管理" aria-busy={loading}>
    <h3>住宿獎懲狀態管理</h3><p>選定帳戶：<span className="[overflow-wrap:anywhere]">{userId}</span></p>
    <p>僅保存明確提供的站內「無紀錄」或「未知」狀態，不建立獎懲明細或辦理住宿申請。</p>
    {loading&&<p role="status">載入或儲存住宿獎懲狀態中…</p>}{loadedClient===client&&error&&<p role="alert" className="text-destructive">{error}</p>}{loadedClient===client&&message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={loading} onClick={()=>void refresh()}>重新載入住宿獎懲狀態</Button>
    {loadedClient===client&&data&&<>
      <p aria-label="已儲存住宿獎懲狀態">{data.record?`已儲存站內狀態 · 版本 ${data.record.version} · ${data.record.result==='empty'?'明確無紀錄':'未知'}`:'目前沒有站內狀態資料；住宿獎懲紀錄未知。'}</p>
      {(dirty||pending||missing||collision)&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>放棄草稿並重新載入</Button>}
      {stale&&<p role="status">儲存前請重新載入最新資料；草稿已保留。</p>}
      {missing&&<p role="status">原資料已無法取得；請放棄草稿後載入目前資料或新增。</p>}
      {collision&&<p role="status">此帳戶已有另一筆站內資料；請放棄草稿後載入該筆資料。</p>}
      {exhausted&&<p role="status">此資料已達版本上限，無法再次修改。</p>}
      {uncertain&&<p role="status">先前操作尚未確認；重試會使用相同操作識別碼。放棄草稿不會撤銷已送出的操作。</p>}
      <form className="affairs-record-form" onSubmit={(event:FormEvent)=>{event.preventDefault();void mutate();}}>
        <h4>{selected.version?'編輯':'新增'}站內住宿獎懲狀態{selected.version?` · 版本 ${selected.version}`:''}</h4>
        <fieldset disabled={busy||Boolean(pending?.confirmed)}><legend>明確提供的狀態</legend>
          <label>住宿獎懲狀態<select aria-label="住宿獎懲狀態" value={draft} disabled={uncertain} onChange={event=>{if(busy||uncertain)return;setDraft(event.target.value as DormitoryConductResult);setError('');setMessage('');}}>
            <option value="unknown">未知</option><option value="empty">明確記錄無住宿獎懲紀錄</option>
          </select></label>
          <Button type="submit" disabled={writeBlocked||uncertain&&pending?.action.kind==='delete_dormitory_conduct'}>儲存住宿獎懲狀態</Button>
          {selected.version>0&&<details><summary>刪除此站內狀態</summary><p>刪除後回到未知狀態；原識別碼保留，無法重建。不更動任何校方紀錄。</p><Button type="button" variant="destructive" disabled={writeBlocked||dirty||uncertain&&pending?.action.kind!=='delete_dormitory_conduct'} onClick={()=>void mutate(true)}>確認刪除住宿獎懲狀態</Button></details>}
        </fieldset>
      </form>
    </>}
  </section>;
}
