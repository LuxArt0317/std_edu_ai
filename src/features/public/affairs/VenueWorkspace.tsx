import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {loadVenueRequests,loadVenueWeek,searchVenues,writeVenueRequest,type Venue,type VenueAction,type VenueRequest,type VenueSchedule} from '@/services/venueBooking';
import {moveVenueDate,venueDate,venuePaths,venuePeriods,venueScheduleSelection,venueWeek} from './venueContract.js';
import './venueWorkspace.css';

const days=['一','二','三','四','五','六','日'];
const statusLabels={submitted:'已送出',approved:'已核准',declined:'未核准',cancelled:'已取消'};
const errorText=(error:unknown)=>error instanceof Error?error.message:'場地資料暫時無法載入。';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function WeeklySchedule({week,schedule,canApply,onSelect}:{week:string;schedule:VenueSchedule|null;canApply:boolean;onSelect:(date:string,period:string)=>void}){
  const occupied=new Set(schedule?.occupied),local=new Set(schedule?.local);
  return <div className="venue-table-scroll" role="region" aria-label="每週場地時段" tabIndex={0}>
    <table><thead>
      <tr><th colSpan={8}>{schedule?`場地: ${schedule.venue} - ${schedule.description}`:'\u00a0'}</th></tr>
      <tr><th scope="row">日期</th>{days.map((day,index)=><th key={day}>{moveVenueDate(week,index).replaceAll('-','/').replace(/\/0/g,'/')}</th>)}</tr>
      <tr><th>節次時段＼星期</th>{days.map(day=><th scope="col" key={day}>星期{day}</th>)}</tr>
    </thead><tbody>{venuePeriods.map(([period,time])=><tr key={period}><th scope="row">{period} ({time})</th>
      {days.map((day,index)=>{
        const slot='T'+(index+1)+period,date=moveVenueDate(week,index),booked=occupied.has(slot),approved=local.has(slot);
        return <td key={day}>{booked?'使用中':approved?'站內核准':
          canApply&&schedule?.fresh&&date>=today()&&date<=moveVenueDate(today(),90)?
            <button type="button" aria-label={date+' '+period+' 申請'} onClick={()=>onSelect(date,period)}>申請</button>:null}</td>;
      })}
    </tr>)}</tbody></table>
  </div>;
}

function VenueRequests({rows,manage,onAction}:{rows:VenueRequest[];manage:boolean;onAction:(row:VenueRequest,operation:'cancel'|'approved'|'declined')=>void}){
  if(!rows.length)return <p>{manage?'沒有待審核申請。':'沒有場地申請。'}</p>;
  return <div className="venue-table-scroll" role="region" aria-label="場地申請紀錄" tabIndex={0}><table>
    <thead><tr>{['場地','日期','節次','用途','狀態','審核備註','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.id}>
      <td>{row.venue}</td><td>{row.booking_date}</td><td>{row.period}</td><td>{row.purpose}</td>
      <td>{statusLabels[row.status]}</td><td>{row.review_note}</td><td>
        {manage?<><button type="button" onClick={()=>onAction(row,'approved')}>核准</button> <button type="button" onClick={()=>onAction(row,'declined')}>不核准</button></>:
          ['approved','submitted'].includes(row.status)&&row.booking_date>=today()&&<button type="button" onClick={()=>onAction(row,'cancel')}>取消申請</button>}
      </td>
    </tr>)}</tbody></table></div>;
}

type Draft={type:'submit';date:string;period:string;room:string}|{type:'cancel'|'approved'|'declined';row:VenueRequest};
export function VenueWorkspace({userId,view}:{userId:string;view:'apply'|'schedule'|'manage'}){
  const manage=view==='manage',canApply=view==='apply';
  const [params]=useSearchParams();
  const initial=view==='schedule'?venueScheduleSelection(params):null;
  const [input,setInput]=useState(initial?.code??'');
  const [selected,setSelected]=useState<Venue|null>(()=>initial?{code:initial.code,label:initial.code,description:''}:null);
  const [venues,setVenues]=useState<Venue[]>([]),[suggestions,setSuggestions]=useState(false),[searchError,setSearchError]=useState('');
  const [week,setWeek]=useState(()=>initial?.week??venueWeek()),[expanded,setExpanded]=useState(true);
  const [result,setResult]=useState<{key:string;data?:VenueSchedule;error?:string}|null>(null);
  const [list,setList]=useState<{rows?:VenueRequest[];error?:string}|null>(null);
  const [revision,setRevision]=useState(0),[draft,setDraft]=useState<Draft|null>(null);
  const [actionError,setActionError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState('');
  const [requestId,setRequestId]=useState(''),[fields,setFields]=useState({note:'',confirmed:false});
  const activeWrite=useRef<AbortController|null>(null);
  const queryKey=selected?selected.code+':'+week+':'+revision:'';
  const current=result?.key===queryKey?result:null;
  const schedule=current?.data??null;
  useEffect(()=>()=>activeWrite.current?.abort(),[]);
  useEffect(()=>{
    if(!suggestions||input.trim().length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void searchVenues(input.trim(),controller.signal).then(data=>{
        if(!controller.signal.aborted)setVenues(data.venues);
      }).catch(error=>{if(!controller.signal.aborted)setSearchError(errorText(error));});
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[input,suggestions]);
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();
    void loadVenueWeek(selected.code,week,controller.signal).then(data=>{
      if(!controller.signal.aborted)setResult({key:queryKey,data});
    }).catch(error=>{if(!controller.signal.aborted)setResult({key:queryKey,error:errorText(error)});});
    return ()=>controller.abort();
  },[queryKey,selected,week]);
  useEffect(()=>{
    if(!canApply&&!manage)return;
    const controller=new AbortController();
    void loadVenueRequests(userId,manage,controller.signal).then(rows=>{
      if(!controller.signal.aborted)setList({rows});
    }).catch(error=>{if(!controller.signal.aborted)setList({error:errorText(error)});});
    return ()=>controller.abort();
  },[canApply,manage,userId,revision]);
  useEffect(()=>{document.title=(manage?'場地申請審核':canApply?'場地借用申請及查詢':'場地借用狀態')+' · stu.best';},[manage,canApply]);
  function open(next:Draft){
    setDraft(next);setRequestId(crypto.randomUUID());setFields({note:'',confirmed:false});setActionError('');setSaved('');
  }
  function edit(next:typeof fields){
    setFields(next);setRequestId(crypto.randomUUID());setActionError('');
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!draft||activeWrite.current)return;
    let action:VenueAction;
    if(draft.type==='submit'){
      if(!fields.confirmed||!fields.note.trim())return;
      action={kind:'submit_venue_request',payload:{request_id:requestId,venue:draft.room,booking_date:draft.date,period:draft.period,purpose:fields.note.trim(),confirmed:true}};
    }else if(draft.type==='cancel')action={kind:'cancel_venue_request',payload:{request_id:requestId,id:draft.row.id,version:draft.row.version}};
    else action={kind:'review_venue_request',payload:{request_id:requestId,id:draft.row.id,version:draft.row.version,status:draft.type,note:fields.note.trim()}};
    const controller=new AbortController();
    activeWrite.current=controller;
    setBusy(true);setActionError('');
    try{
      // Approval uses the same verified schedule as the application.
      if(draft.type==='approved')await loadVenueWeek(draft.row.venue,venueWeek(draft.row.booking_date),controller.signal);
      await writeVenueRequest(userId,action,controller.signal);
      setDraft(null);setSaved('已儲存。');setList(null);setRevision(value=>value+1);
    }catch(error){if(!controller.signal.aborted)setActionError(errorText(error));}
    finally{activeWrite.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  const title=manage?'場地申請審核':canApply?'場地借用申請及查詢':'場地借用狀態';
  return <div className="venue-page" lang="zh-Hant"><main className="venue-workspace">
    <header><b>Campus Information Services</b><b>Shu-Te University</b></header>
    <h1><img src="/stu-reference/ee1f2bb8f7f5a9dd.svg" alt=""/>{title}</h1>
    {!manage&&<>
      <div className="venue-instructions"><span>▪　請選擇場地以查詢場地借用狀態</span>
        <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'收合':'展開'}</button></div>
      {expanded&&<section className="venue-query">
        <div className="venue-inputs"><label htmlFor="venue-code">場地：</label><div className="venue-search">
          <input id="venue-code" value={input} maxLength={10} autoComplete="off" onChange={event=>{
            setInput(event.target.value);setVenues([]);setSearchError('');setSelected(null);setSuggestions(true);
          }} onKeyDown={event=>{if(event.key==='Escape')setSuggestions(false);}}/>
          {suggestions&&venues.length>0&&<ul aria-label="符合的場地">{venues.map(venue=><li key={venue.code}>
            <button type="button" onClick={()=>{setSelected(venue);setInput(venue.code);setSuggestions(false);}}>{venue.label}</button>
          </li>)}</ul>}
        </div><input aria-label="場地說明" value={schedule?.description??selected?.description??''} readOnly/></div>
        <div className="venue-week-buttons">
          <button type="button" onClick={()=>setWeek(value=>moveVenueDate(value,-7))}>上週</button>
          <button type="button" onClick={()=>setWeek(value=>moveVenueDate(value,7))}>下週</button>
          <button type="button" onClick={()=>setWeek(venueWeek())}>本週</button>
        </div>
        {searchError&&<p role="alert">{searchError}</p>}
        {selected&&!current&&<p role="status">查詢時段中…</p>}
        {current?.error&&<p role="alert">{current.error} <button type="button" onClick={()=>setRevision(value=>value+1)}>重試</button></p>}
        {schedule&&!schedule.fresh&&<p role="status">上次查詢：{new Date(schedule.checked_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</p>}
        <WeeklySchedule week={week} schedule={schedule} canApply={canApply}
          onSelect={(date,period)=>{if(schedule&&venueDate(date))open({type:'submit',date,period,room:schedule.venue});}}/>
      </section>}
    </>}
    {(canApply||manage)&&<section className="venue-requests"><h2>{manage?'待審核申請':'我的站內申請'}</h2>
      {canApply&&<p>此處送出的申請由 stu.best 審核。校方場地仍須依校方程序確認。</p>}
      {saved&&<p role="status">{saved}</p>}
      {!list&&<p role="status">載入申請中…</p>}
      {list?.error&&<p role="alert">{list.error} <button type="button" onClick={()=>setRevision(value=>value+1)}>重試</button></p>}
      {list?.rows&&<VenueRequests rows={list.rows} manage={manage} onAction={(row,type)=>open({type,row})}/>}
    </section>}
    <footer><Link to="/school-affairs/menu/swd/all">總務資訊</Link> · <Link to={canApply?venuePaths.schedule:venuePaths.apply}>{canApply?'場地使用狀況查詢':'場地借用申請'}</Link></footer>
    <Dialog open={Boolean(draft)} onOpenChange={open=>{if(!open&&!busy)setDraft(null);}}>
      <DialogContent className="venue-request-dialog"><DialogTitle>{draft?.type==='submit'?'確認站內場地申請':'確認申請狀態'}</DialogTitle>
        <DialogDescription>{draft?.type==='submit'?`${draft.room} · ${draft.date} · ${draft.period}`:
          draft?`${draft.row.venue} · ${draft.row.booking_date} · ${draft.row.period}`:''}</DialogDescription>
        <form onSubmit={submit}>
          {draft?.type!=='cancel'&&<label>{draft?.type==='submit'?'用途':'審核備註'}
            <textarea required={draft?.type==='submit'} maxLength={600} value={fields.note} disabled={busy}
              onChange={event=>edit({...fields,note:event.target.value})}/></label>}
          {draft?.type==='submit'&&<label><input type="checkbox" required checked={fields.confirmed} disabled={busy}
            onChange={event=>edit({...fields,confirmed:event.target.checked})}/> 確認送出 stu.best 申請</label>}
          {actionError&&<p role="alert">{actionError}</p>}
          <div><DialogClose type="button" disabled={busy}>返回</DialogClose>
            <button type="submit" disabled={busy||draft?.type==='submit'&&(!fields.confirmed||!fields.note.trim())}>
              {draft?.type==='cancel'?'確認取消':draft?.type==='approved'?'確認核准':draft?.type==='declined'?'確認不核准':'送出申請'}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </main></div>;
}
