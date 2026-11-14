import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {loadRepairDetail,loadRepairList,RepairError,writeRepair,type RepairAction,type RepairDetail,type RepairFields,type RepairList} from '@/services/facilityRepair';
import {repairId,repairPaths,repairStatuses} from './facilityRepair.js';
import './facilityRepair.css';

const fields: Array<[keyof RepairFields,string,number]>=[['building','棟別',100],['location','樓層及地點',120],['item','報修項目',100],['description','故障說明',1000]];
const empty={building:'',location:'',item:'',description:''};
const errorText=(error:unknown)=>error instanceof Error?error.message:'報修資料暫時無法載入。';
const localDate=(value:string)=>new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

function useWrite(userId:string,onSuccess:(result:Awaited<ReturnType<typeof writeRepair>>)=>void){
  const active=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  useEffect(()=>()=>active.current?.abort(),[]);
  function clear(){setError('');setConflict(false);}
  async function send(action:RepairAction){
    if(active.current)return;
    const controller=new AbortController();
    active.current=controller;clear();setBusy(true);
    try{
      const result=await writeRepair(userId,action,controller.signal);
      if(!controller.signal.aborted)onSuccess(result);
    }catch(error){
      if(!controller.signal.aborted){setError(errorText(error));setConflict(error instanceof RepairError&&error.status===409);}
    }finally{
      active.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  return {busy,error,conflict,send,clear};
}

function RepairForm({userId}:{userId:string}){
  const [values,setValues]=useState<RepairFields>(empty);
  const [request,setRequest]=useState<{key:string;fields:RepairFields}|null>(null);
  const lastRequest=useRef<typeof request>(null);
  const navigate=useNavigate();
  const write=useWrite(userId,result=>navigate(repairPaths.history+'/'+result.id));
  function confirm(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const trimmed={building:values.building.trim(),location:values.location.trim(),item:values.item.trim(),description:values.description.trim()};
    if(Object.values(trimmed).some(value=>!value))return;
    write.clear();
    if(!lastRequest.current||JSON.stringify(lastRequest.current.fields)!==JSON.stringify(trimmed)){
      lastRequest.current={key:crypto.randomUUID(),fields:trimmed};
    }
    setRequest(lastRequest.current);
  }
  return <><p>此表單將報修紀錄送至 stu.best 管理端。校方派工請使用校方報修系統。</p>
    <form className="repair-form" onSubmit={confirm}>
      {fields.map(([name,label,max])=><label key={name}>{label}{name==='description'?
        <textarea required maxLength={max} value={values[name]} onChange={event=>setValues({...values,[name]:event.target.value})}/>:
        <input required maxLength={max} value={values[name]} onChange={event=>setValues({...values,[name]:event.target.value})}/>}</label>)}
      <button type="submit" disabled={Object.values(values).some(value=>!value.trim())}>確認報修</button>
    </form>
    <Dialog open={Boolean(request)} onOpenChange={open=>{if(!open&&!write.busy)setRequest(null);}}>
      <DialogContent className="repair-dialog"><DialogTitle>送出站內報修</DialogTitle>
        <DialogDescription>{request?.fields.building} · {request?.fields.location} · {request?.fields.item}</DialogDescription>
        {request&&<p className="repair-wrap">{request.fields.description}</p>}
        {write.error&&<p role="alert">{write.error}</p>}
        <footer><DialogClose type="button" disabled={write.busy}>返回</DialogClose>
          <button type="button" disabled={write.busy} onClick={()=>{if(request)void write.send({kind:'submit_facility_repair',
            payload:{...request.fields,request_id:request.key,confirmed:true}});}}>送出報修</button></footer>
      </DialogContent>
    </Dialog></>;
}

function RepairListView({userId,manage}:{userId:string;manage:boolean}){
  const [params,setParams]=useSearchParams();
  const rawPage=params.get('page')??'0',status=params.get('status')??'';
  const page=/^\d{1,3}$/.test(rawPage)?Number(rawPage):0;
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<{key:string;data?:RepairList;error?:string}|null>(null);
  const filter=Object.hasOwn(repairStatuses,status)?status:'';
  const key=[page,filter,revision].join(':');
  const current=result?.key===key?result:null;
  useEffect(()=>{
    const controller=new AbortController();
    void loadRepairList(userId,manage,page,filter,controller.signal)
      .then(data=>{if(!controller.signal.aborted)setResult({key,data});})
      .catch(error=>{if(!controller.signal.aborted)setResult({key,error:errorText(error)});});
    return ()=>controller.abort();
  },[userId,manage,page,filter,key]);
  const base=manage?repairPaths.manage:repairPaths.history;
  const go=(newPage:number,newStatus:string)=>setParams({...newPage&&{page:String(newPage)},...newStatus&&{status:newStatus}});
  const data=current?.data;
  return <>
    <label className="repair-filter">狀態 <select value={filter} onChange={event=>go(0,event.target.value)}>
      <option value="">全部</option>{Object.entries(repairStatuses).map(([value,labels])=><option key={value} value={value}>{labels[0]}</option>)}</select></label>
    {!current&&<p role="status">載入報修紀錄…</p>}
    {current?.error&&<p role="alert">{current.error} <button type="button" onClick={()=>setRevision(value=>value+1)}>重試</button></p>}
    {data&&<><div className="repair-table" tabIndex={0} role="region" aria-label="報修紀錄"><table>
      <thead><tr>{['報修時間','編號','棟別及地點','報修項目','處理情形'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.rows.map(row=><tr key={row.id}><td>{localDate(row.created_at)}</td>
        <td><Link to={base+'/'+row.id}>{row.id.slice(0,8).toUpperCase()}</Link></td><td>{row.building} · {row.location}</td>
        <td>{row.item}</td><td>{repairStatuses[row.status][0]}</td></tr>)}
        {!data.rows.length&&<tr><td colSpan={5}>沒有報修紀錄。</td></tr>}</tbody>
    </table></div><nav aria-label="報修分頁" className="repair-pages">
      <button type="button" onClick={()=>go(page-1,filter)} disabled={page===0}>上一頁</button>
      <span>共 {data.total} 筆</span>
      <button type="button" onClick={()=>go(page+1,filter)} disabled={(page+1)*data.pageSize>=data.total||page===999}>下一頁</button>
    </nav></>}
  </>;
}

function RepairDetailView({userId,manage,id}:{userId:string;manage:boolean;id:string}){
  const [result,setResult]=useState<{key:number;data?:RepairDetail;error?:string}|null>(null),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState<{type:'cancel'|'in_progress'|'resolved';key:string;note:string}|null>(null);
  const write=useWrite(userId,()=>{setDraft(null);setRevision(value=>value+1);});
  const current=result?.key===revision?result:null;
  useEffect(()=>{
    const controller=new AbortController();
    void loadRepairDetail(userId,manage,id,controller.signal)
      .then(data=>{if(!controller.signal.aborted)setResult({key:revision,data});})
      .catch(error=>{if(!controller.signal.aborted)setResult({key:revision,error:errorText(error)});});
    return ()=>controller.abort();
  },[userId,manage,id,revision]);
  if(!current)return <p role="status">載入報修紀錄…</p>;
  if(current.error||!current.data)return <p role="alert">{current.error} <button type="button" onClick={()=>setRevision(value=>value+1)}>重試</button></p>;
  const {detail,events}=current.data;
  const open=(type:'cancel'|'in_progress'|'resolved')=>{write.clear();setDraft({type,key:crypto.randomUUID(),note:''});};
  const canCancel=!manage&&detail.status==='submitted';
  const canStart=manage&&(detail.status==='submitted'||detail.status==='resolved');
  const canResolve=manage&&detail.status==='in_progress';
  function confirm(){
    if(!draft)return;
    const payload={id:detail.id,version:detail.version,request_id:draft.key};
    void write.send(draft.type==='cancel'?{kind:'cancel_facility_repair',payload}:
      {kind:'review_facility_repair',payload:{...payload,status:draft.type,note:draft.note.trim()}});
  }
  return <>
    <p><strong>{detail.id.slice(0,8).toUpperCase()} · {repairStatuses[detail.status][0]}</strong></p>
    <dl className="repair-detail">{fields.map(([name,label])=><div key={name}><dt>{label}</dt><dd>{detail[name]}</dd></div>)}</dl>
    <h2>{detail.version>events.length?'最近的處理紀錄':'處理紀錄'}</h2>
    <ol className="repair-events">{events.map(event=><li key={event.version}>
      <span>{localDate(event.occurred_at)} · {repairStatuses[event.status][0]}</span>{event.note&&<p>{event.note}</p>}</li>)}</ol>
    {canCancel&&<button type="button" onClick={()=>open('cancel')}>取消報修</button>}
    {canStart&&<button type="button" onClick={()=>open('in_progress')}>{detail.status==='resolved'?'重新處理':'開始處理'}</button>}
    {canResolve&&<button type="button" onClick={()=>open('resolved')}>完成報修</button>}
    <Dialog open={Boolean(draft)} onOpenChange={open=>{if(!open&&!write.busy)setDraft(null);}}>
      <DialogContent className="repair-dialog"><DialogTitle>確認變更</DialogTitle>
        <DialogDescription>{draft?.type==='cancel'?'取消此報修':draft?repairStatuses[draft.type][0]:''}</DialogDescription>
        {draft&&draft.type!=='cancel'&&<label>處理備註 <textarea maxLength={600} value={draft.note} disabled={write.busy}
          onChange={event=>{setDraft({...draft,key:crypto.randomUUID(),note:event.target.value});write.clear();}}/></label>}
        {write.error&&<p role="alert">{write.error}</p>}
        <footer><DialogClose type="button" disabled={write.busy}>返回</DialogClose>
          {write.conflict?<button type="button" onClick={()=>{setDraft(null);setRevision(value=>value+1);}}>重新載入</button>:
            <button type="button" disabled={write.busy} onClick={confirm}>確認變更</button>}</footer>
      </DialogContent>
    </Dialog>
  </>;
}

export function FacilityRepairWorkspace({userId,view,id}:{userId:string;view:'report'|'history'|'manage';id?:string}){
  const manage=view==='manage',title=view==='report'?'線上報修':manage?'報修管理':'報修紀錄';
  useEffect(()=>{document.title=title+' · stu.best';},[title]);
  return <div className="facility-repair-page" lang="zh-Hant"><main className="facility-repair">
    <header><b>Campus Information Services</b><b>Shu-Te University</b></header>
    <section>
      <h1><img src="/stu-reference/ee1f2bb8f7f5a9dd.svg" alt=""/>{title}</h1>
      <nav aria-label="報修選單"><Link to="/school-affairs/menu/swd/all">總務資訊</Link>
        {manage?<Link to={repairPaths.manage}>報修管理</Link>:<><Link to={repairPaths.report}>線上報修</Link><Link to={repairPaths.history}>報修紀錄</Link></>}
      </nav>
      {view==='report'?<RepairForm userId={userId}/>:id?
        repairId(id)?<RepairDetailView key={id} userId={userId} manage={manage} id={id}/>:<p role="alert">找不到報修紀錄。</p>:
        <RepairListView userId={userId} manage={manage}/>}
    </section>
  </main></div>;
}
