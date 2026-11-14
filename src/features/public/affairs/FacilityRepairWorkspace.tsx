import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ChevronDown,House,Wrench} from 'lucide-react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {loadRepairCatalog,loadRepairDetail,loadRepairList,RepairError,writeRepair,type RepairAction,type RepairDetail,type RepairFields,type RepairList,type RepairArea,type RepairCatalog,type RepairInput} from '@/services/facilityRepair';
import {repairId,repairPaths,repairStatuses} from './facilityRepair.js';
import './facilityRepair.css';

const fields: Array<[keyof RepairFields,string,number]>=[['building','棟別',100],['location','樓層及地點',120],['item','報修項目',100],['description','故障說明',1000]];
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

const floors=[...Array.from({length:11},(_,i)=>`${i+1}樓`),'地下1樓','地下2樓','地下3樓'];

function RepairAreaPicker({catalog}:{catalog:RepairCatalog}){
  return <>
    <h2 className="repair-area-title">請選擇報修項目所在位置：</h2>
    {[false,true].map(outdoor=><details key={String(outdoor)} open className="repair-area-group">
      <summary>{outdoor?'非建築物一般戶外場地':'建築物、大樓、宿舍等'}</summary>
      <div>{catalog.areas.filter(area=>area.outdoor===outdoor).map(area=><Link key={area.code}
        to={repairPaths.report+'/area/'+area.code}><span aria-hidden="true">➦ </span>{area.label}</Link>)}</div>
    </details>)}
  </>;
}

function RepairForm({userId,catalog,area,applicantName,applicantCode}:{userId:string;catalog:RepairCatalog;area:RepairArea;applicantName?:string;applicantCode?:string}){
  const [values,setValues]=useState<RepairInput>({area_code:area.code,equipment_code:'',contact_phone:'',room:'',
    floor_label:'',bed:'',location_remark:'',other_item:'',description:''});
  const [picker,setPicker]=useState(false),[keyword,setKeyword]=useState('');
  const [request,setRequest]=useState<{key:string;fields:RepairInput}|null>(null);
  const lastRequest=useRef<typeof request>(null);
  const navigate=useNavigate();
  const write=useWrite(userId,result=>navigate(repairPaths.history+'/'+result.id));
  const item=catalog.items.find(row=>row.code===values.equipment_code);
  const valid=item&&/^[+0-9() -]{3,32}$/.test(values.contact_phone.trim())&&values.description.trim()&&
    (item.code!=='RI9999'||values.other_item.trim());
  function field(name:keyof RepairInput,value:string){setValues(previous=>({...previous,[name]:value}));}
  function confirm(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!valid)return;
    const trimmed={...values,contact_phone:values.contact_phone.trim(),room:values.room.trim(),location_remark:values.location_remark.trim(),
      other_item:values.other_item.trim(),description:values.description.trim()};
    write.clear();
    if(!lastRequest.current||JSON.stringify(lastRequest.current.fields)!==JSON.stringify(trimmed)){
      lastRequest.current={key:crypto.randomUUID(),fields:trimmed};
    }
    setRequest(lastRequest.current);
  }
  const matching=catalog.items.filter(row=>[row.category,row.category_label,row.code,row.label].join(' ').toLowerCase().includes(keyword.trim().toLowerCase()));
  return <>
    <p className="repair-network">宿舍網路報修請至電算中心 B1 櫃台填寫詳細資料。</p>
    <form className="repair-form" onSubmit={confirm}>
      <label>申請人姓名<input value={applicantName??''} readOnly className="repair-wide"/></label>
      <label>申請人電話<span className="repair-field-with-help"><input required type="tel" maxLength={32} value={values.contact_phone}
        onChange={event=>field('contact_phone',event.target.value)}/><small>輸入分機或連絡電話</small></span></label>
      <label>申請人代碼<input value={applicantCode??''} readOnly/></label>
      <label>報修區域<select className="repair-wide" value={area.code} onChange={event=>navigate(repairPaths.report+'/area/'+event.target.value)}>
        {catalog.areas.map(choice=><option key={choice.code} value={choice.code}>{choice.label}</option>)}
      </select></label>
      <label>請修房間<input maxLength={30} value={values.room} onChange={event=>field('room',event.target.value)}/></label>
      <label>請修樓層<select value={values.floor_label} onChange={event=>field('floor_label',event.target.value)}>
        <option value="">請選擇</option>{floors.map(floor=><option key={floor}>{floor}</option>)}</select></label>
      <label>請修床位<select value={values.bed} onChange={event=>field('bed',event.target.value)}>
        <option value="">請選擇</option>{[...'ABCDEFG'].map(bed=><option key={bed}>{bed}</option>)}</select></label>
      <label>其他位置<input className="repair-location" maxLength={100} placeholder="字數限制100字以內" value={values.location_remark}
        onChange={event=>field('location_remark',event.target.value)}/></label>
      <div className="repair-form-row"><label htmlFor="repair-item">請修物品</label><div className="repair-field-with-help">
        <input id="repair-item" className="repair-wide" value={item?.label??''} readOnly/>
        <button type="button" onClick={()=>{setKeyword('');setPicker(true);}}>選擇</button>
      </div></div>
      <label>其他損壞項目<textarea disabled={item?.code!=='RI9999'} maxLength={250} placeholder="字數限制250字以內"
        value={values.other_item} onChange={event=>field('other_item',event.target.value)}/></label>
      <label>損壞情形<textarea required maxLength={1000} value={values.description} onChange={event=>field('description',event.target.value)}/></label>
      <label>資產編號<input disabled/></label>
      <div className="repair-form-actions">
        <button type="submit" disabled={!valid}>送出</button>
        <Link to={repairPaths.report}>回列表</Link>
      </div>
    </form>
    <div className="repair-notes"><h2>注意事項</h2><ol><li>報修申請請以中文填寫。</li><li>報修紀錄將送至 stu.best 管理端。</li></ol></div>
    <Dialog open={picker} onOpenChange={setPicker}>
      <DialogContent className="repair-dialog repair-item-picker">
        <DialogTitle>項目清單</DialogTitle>
        <DialogDescription>輸入類別、名稱、項目編號或項目名稱查詢。</DialogDescription>
        <label>關鍵字<input value={keyword} onChange={event=>setKeyword(event.target.value)}/></label>
        <div className="repair-table"><table><thead><tr>{['類別代碼','類別名稱','項目代碼','項目名稱','選取'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{matching.map(row=><tr key={row.code}><td>{row.category}</td><td>{row.category_label}</td><td>{row.code}</td><td>{row.label}</td>
            <td><button type="button" aria-label={`選取 ${row.label}`} onClick={()=>{setValues(previous=>({...previous,equipment_code:row.code,other_item:''}));setPicker(false);}}>選取</button></td></tr>)}
            {!matching.length&&<tr><td colSpan={5}>沒有符合的項目。</td></tr>}</tbody>
        </table></div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(request)} onOpenChange={open=>{if(!open&&!write.busy)setRequest(null);}}>
      <DialogContent className="repair-dialog"><DialogTitle>送出站內報修</DialogTitle>
        <DialogDescription>{area.label} · {item?.label}</DialogDescription>
        {request&&<p className="repair-wrap">{request.fields.description}</p>}
        {write.error&&<p role="alert">{write.error}</p>}
        <footer><DialogClose type="button" disabled={write.busy}>返回</DialogClose>
          <button type="button" disabled={write.busy} onClick={()=>{if(request)void write.send({kind:'submit_facility_repair',
            payload:{...request.fields,request_id:request.key,confirmed:true}});}}>送出報修</button></footer>
      </DialogContent>
    </Dialog>
  </>;
}

function RepairApplication({userId,areaCode,applicantName,applicantCode}:{userId:string;areaCode?:string;applicantName?:string;applicantCode?:string}){
  const [catalog,setCatalog]=useState<RepairCatalog|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void loadRepairCatalog(userId,controller.signal).then(data=>{
      if(!controller.signal.aborted)setCatalog(data);
    },error=>{
      if(!controller.signal.aborted)setError(errorText(error));
    });
    return ()=>controller.abort();
  },[userId,attempt]);
  if(error)return <p role="alert">{error} <button type="button" onClick={()=>{setError('');setAttempt(value=>value+1);}}>重試</button></p>;
  if(!catalog)return <p role="status">載入報修選項…</p>;
  if(!areaCode)return <RepairAreaPicker catalog={catalog}/>;
  const area=catalog.areas.find(option=>option.code===areaCode);
  if(!area)return <p role="alert">找不到報修區域。 <Link to={repairPaths.report}>回列表</Link></p>;
  return <RepairForm key={area.code} userId={userId} catalog={catalog} area={area} applicantName={applicantName} applicantCode={applicantCode}/>;
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
      <thead><tr>{['序號','報修日','單號','報修地點','報修項目及處理情形','處理人員','預定完成日期','資料操作'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.rows.map((row,index)=><tr key={row.id}><td>{page*data.pageSize+index+1}</td><td>{localDate(row.created_at)}</td>
        <td>{row.id.slice(0,8).toUpperCase()}</td><td>{row.building}{row.location!==row.building&&' · '+row.location}</td>
        <td>{row.item} · {repairStatuses[row.status][0]}</td><td>—</td><td>—</td>
        <td><Link aria-label={row.id.slice(0,8).toUpperCase()} to={base+'/'+row.id}>查看</Link></td></tr>)}
        {!data.rows.length&&<tr><td colSpan={8}>沒有報修紀錄。</td></tr>}</tbody>
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
    {detail.area_code&&<dl className="repair-detail">
      {([['contact_phone','申請人電話'],['room','請修房間'],['floor_label','請修樓層'],['bed','請修床位'],
        ['location_remark','其他位置'],['other_item','其他損壞項目']] as const).filter(([key])=>detail[key])
        .map(([key,label])=><div key={key}><dt>{label}</dt><dd>{detail[key]}</dd></div>)}
    </dl>}
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

export function FacilityRepairWorkspace({userId,view,id,areaCode,applicantName,applicantCode}:{
  userId:string;view:'report'|'history'|'manage';id?:string;areaCode?:string;applicantName?:string;applicantCode?:string;
}){
  const manage=view==='manage',report=view==='report';
  const title=report?'線上報修':manage?'報修管理':'報修進度查詢';
  useEffect(()=>{document.title=title+' · stu.best';},[title]);
  return <div className="facility-repair-page" lang="zh-Hant"><div className="facility-repair">
    <header><span><img src="/stu-reference/ee1f2bb8f7f5a9dd.svg" alt=""/>線上報修管理系統</span><span>Shu-Te University</span></header>
    <nav aria-label="報修選單" className="repair-navigation">
      <Link to={repairPaths.report}>線上報修 <ChevronDown size={12}/></Link>
      <Link to={manage?repairPaths.manage:repairPaths.history}>查詢 <ChevronDown size={12}/></Link>
      <details><summary>Index <ChevronDown size={12}/></summary><div>
        <Link to="/school-affairs/menu/swd/all">總務資訊</Link><Link to="/school-affairs/signed-out">Logout</Link>
      </div></details>
    </nav>
    <nav className="repair-breadcrumbs" aria-label="目前位置"><House size={15}/><Link to={repairPaths.history}>Index</Link>
      <span aria-hidden="true">›</span><span>{title}</span></nav>
    <main className="repair-body">
      <h1><Wrench size={17}/>{report?'報修申請':manage?'報修管理':'處理情形'}
        <small>» {report?areaCode?'填寫報修單':'區域選擇':id?'報修明細':'申請清單'}</small></h1>
      {report?<RepairApplication userId={userId} areaCode={areaCode} applicantName={applicantName} applicantCode={applicantCode}/>:id?
        repairId(id)?<RepairDetailView key={id} userId={userId} manage={manage} id={id}/>:<p role="alert">找不到報修紀錄。</p>:
        <RepairListView userId={userId} manage={manage}/>}
    </main>
    <footer className="repair-footer">stu.best · 線上報修管理系統</footer>
  </div></div>;
}
