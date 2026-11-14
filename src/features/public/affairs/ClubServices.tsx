import { ClubOfficer,clubOfficerHeading } from './ClubOfficer';
import { clubOfficerMenu } from '../../../../server/clubOfficerContract.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { loadClubServices, writeClubEquipment } from '@/services/clubServices';
import {
  clubCategories, clubEquipmentCategories, clubMonth, clubPath, clubPurposes, clubRequestStatuses,
  type ClubAction, type ClubActivity, type ClubEquipmentRequest, type ClubWorkspace, type EquipmentCategory,
} from '../../../../server/clubServicesContract.js';
import { referenceAsset } from '../site/reference';
import './student-services.css';
import './clubServices.css';

const original = 'https://infosys.stu.edu.tw/StuCorp';
const clubStudentLinks = [['activities','學生社團活動資訊'],['equipment','器材借用申請填單']] as const;
const administration = [
  ['器材借用單審核','/ToolBorrowByAdm/Index'],['器材類別維護','/ToolType/Index'],['器材項目維護','/ToolItem/Index'],
  ['器材借用統計報表','/ToolBorrowStatic/Index'],['器材借用查詢','/ToolBorrowHistory/Index'],
] as const;
const reportLink = original+'/Doc/'+encodeURIComponent('線上借用器材教學.pdf');
type View = ''|'activities'|'equipment'|'equipment/new'|'equipment/review';
const headings:Record<string,[string,string?]> = {
  '':['Index','學生校園活動管理系統 Index'], activities:['學生社團活動清單'],
  equipment:['課指組器材借用記錄清單','器材借用記錄首頁'],
  'equipment/new':['課外組器材借用記錄清單','器材借用記錄新增'],
  'equipment/review':['器材借用單審核'],
};
const taipeiDate = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
const activityTime = new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'});
const dayMs = 24*60*60*1000;
const weekdays = ['日','一','二','三','四','五','六'];

export function ClubServices({userId,view}:{userId:string;view:string}) {
  const [params]=useSearchParams();
  const editId=params.get('edit')??undefined;
  const currentMonth=taipeiDate.format(new Date()).slice(0,7);
  const raw=params.get('month') ?? '';
  const month=clubMonth.test(raw)?raw:currentMonth;
  const queryView=view==='activities'?'activities':view==='equipment/review'?'review':'equipment';
  const officer=clubOfficerHeading(view);
  const heading=officer??headings[view];
  if(!heading)return null;
  const title=officer?.[0]??(view==='activities'?'社團活動系統':'器材借用');
  return <div className="student-internship student-clubs" lang="zh-Hant">
    <div className="club-shell">
      <header className="internship-brand">
        <Link to={clubPath}>
          <img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="24" height="24" alt="" />
          課外活動組-學生社團活動管理系統
        </Link>
        <span lang="en">Shu-Te University</span>
      </header>
      <nav className="internship-menu" aria-label="社團活動選單">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost">學生 <span aria-hidden="true">⌄</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {clubStudentLinks.map(([path,label])=><DropdownMenuItem asChild key={path}><Link to={clubPath+'/'+path}>{label}</Link></DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost">社團幹部 <span aria-hidden="true">⌄</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {clubOfficerMenu.map(([path,label])=><DropdownMenuItem asChild key={path}><Link to={clubPath+'/'+path}>{label}</Link></DropdownMenuItem>)}
            <DropdownMenuItem asChild><Link to={clubPath+'/equipment'}>2-A器材借用</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost">Index <span aria-hidden="true">⌄</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to={clubPath}>系統首頁</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/school-affairs/menu/sao/all">校務資訊系統</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <nav className="internship-breadcrumb" aria-label="頁面位置">
        <i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to={clubPath}>Index</Link>
        {view&&<><span aria-hidden="true">›</span><Link to={clubPath+'/'+(officer?view:queryView.replace('review','equipment/review'))}>{title}</Link></>}
      </nav>
      <main className="internship-content">
        <h1><i className="portal-icon" aria-hidden="true">{view==='equipment/new'?'\uf044':'\uf19c'}</i>
          {heading[0]} {heading[1]&&<small>» {heading[1]}</small>}
        </h1>
        {!view?<ClubIndex/>:officer?<ClubOfficer userId={userId} path={view}/>:<ClubRecords key={userId+':'+view+':'+(view==='activities'?month:editId??'')}
          userId={userId} view={view as Exclude<View,''>} editId={editId} queryView={queryView} month={month} currentMonth={currentMonth}/>}
      </main>
      <footer><Link to="/school-affairs">校務資訊系統</Link></footer>
    </div>
  </div>;
}

function ClubIndex() {
  return <>
    <h2>系統功能說明</h2>
    <section className="internship-block"><h3>學生</h3>
      <ul>{clubStudentLinks.map(([path,label])=><li key={path}><Link to={clubPath+'/'+path}>{label}</Link></li>)}</ul>
    </section>
    <section className="internship-block"><h3>管理者</h3>
      <ul>{administration.map(([label,path],index)=><li key={path}>{index===0
        ? <Link to={clubPath+'/equipment/review'}>{label}</Link>
        : <a href={original+path}>{label}</a>}</li>)}<li><Link to={clubPath+'/officer/review'}>活動申請審核</Link></li></ul>
    </section>
    <section className="internship-block"><h3>備註</h3></section>
  </>;
}

function ClubRecords({userId,view,editId,queryView,month,currentMonth}:{
  userId:string;view:Exclude<View,''>;editId?:string;queryView:'activities'|'equipment'|'review';month:string;currentMonth:string;
}) {
  const [data,setData]=useState<ClubWorkspace|null>(null);
  const [error,setError]=useState('');
  const [attempt,retry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void loadClubServices(userId,queryView,controller.signal,queryView==='activities'?month:undefined).then(
      value=>{if(!controller.signal.aborted)setData(value);},
      reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'無法讀取資料。');},
    );
    return ()=>controller.abort();
  },[userId,queryView,month,attempt]);
  const reload=()=>{setError('');setData(null);retry(value=>value+1);};
  const editing=data?.view==='equipment'&&editId
    ? data.rows.find(row=>row.id===editId&&row.status==='submitted'&&row.pickup_on>=data.today) : undefined;
  return <>
    {!data&&!error&&<p role="status">讀取資料中…</p>}
    {error&&<p role="alert">{error} <button type="button" onClick={reload}>重試</button></p>}
    {view==='activities'
      ? <ClubCalendar month={month} currentMonth={currentMonth} rows={data?.view==='activities'?data.rows:[]} />
      : data&&data.view!=='activities'&&(view==='equipment/new'
        ? editId&&!editing
          ? <p role="alert">此借用紀錄無法編輯。 <Link to={clubPath+'/equipment'}>回列表</Link></p>
          : <EquipmentForm userId={userId} data={data} editing={editing}/>
        : <EquipmentList userId={userId} data={data} reload={reload}/>)}
    {view!=='equipment/review'&&<Instructions calendar={view==='activities'}/>}
  </>;
}

function ClubCalendar({month,currentMonth,rows}:{month:string;currentMonth:string;rows:ClubActivity[]}) {
  const [selected,setSelected]=useState<ClubActivity|null>(null);
  const [year,number]=month.split('-').map(Number);
  const first=new Date(Date.UTC(year,number-1,1));
  const dateIso=(date:Date)=>date.toISOString().slice(0,10);
  const start=first.getTime()-first.getUTCDay()*dayMs;
  const change=(offset:number)=>dateIso(new Date(Date.UTC(year,number-1+offset,1))).slice(0,7);
  const link=(next:string)=>clubPath+'/activities'+(next===currentMonth?'':'?month='+next);
  const events=rows.map(event=>({event,first:taipeiDate.format(new Date(event.starts_at)),last:taipeiDate.format(new Date(Date.parse(event.ends_at)-1))}));
  return <>
    <div className="club-calendar" role="region" aria-label="社團活動月曆" tabIndex={0}>
      <div className="club-calendar-toolbar">
        <nav aria-label="切換月份">
          {clubMonth.test(change(-1))&&<Link to={link(change(-1))} aria-label="上個月">‹</Link>}
          {clubMonth.test(change(1))&&<Link to={link(change(1))} aria-label="下個月">›</Link>}
          <Link to={link(currentMonth)}>回到本月</Link>
        </nav>
        <h2>{year}年 {new Intl.DateTimeFormat('zh-TW',{month:'long',timeZone:'UTC'}).format(first)}</h2>
      </div>
      <table>
        <caption className="sr-only">學生社團活動月曆</caption>
        <thead><tr>{weekdays.map(day=><th scope="col" key={day}>星期{day}</th>)}</tr></thead>
        <tbody>{Array.from({length:6},(_,week)=><tr key={week}>{weekdays.map((day,index)=>{
          const date=new Date(start+(week*7+index)*dayMs);
          const iso=dateIso(date);
          return <td key={day} className={iso.startsWith(month)?undefined:'outside'}>
            <time dateTime={iso}>{date.getUTCDate()}</time>
            {events.filter(item=>item.first<=iso&&item.last>=iso).map(({event})=>
              <button type="button" data-category={event.category} key={event.id} onClick={()=>setSelected(event)}>{event.title}</button>)}
          </td>;
        })}</tr>)}</tbody>
      </table>
    </div>
    <ul className="club-legend">{Object.entries(clubCategories).map(([key,label])=><li key={key} data-category={key}>{label}</li>)}</ul>
    <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}}>
      {selected&&<DialogContent>
        <DialogHeader><DialogTitle>{selected.title}</DialogTitle><DialogDescription>{selected.club_name} · {clubCategories[selected.category]}</DialogDescription></DialogHeader>
        <p>{activityTime.format(new Date(selected.starts_at))} – {activityTime.format(new Date(selected.ends_at))}</p>
        {selected.location&&<p>{selected.location}</p>}
        {selected.description&&<p className="whitespace-pre-wrap">{selected.description}</p>}
      </DialogContent>}
    </Dialog>
  </>;
}

function Instructions({calendar}:{calendar:boolean}) {
  return <section className="club-instructions">
    <h2>ⓘ 說明</h2>
    {calendar?<p>1. 點選月曆上的活動，可查看活動詳情。</p>:<ol>
      <li>新增器材借用紀錄。</li>
      <li>請至少提前三天申請。</li>
      <li>領取時間為上班日 09:00–16:00，地點為學務處課外活動組。</li>
      <li>週末及公告休假日無法領取或歸還。</li>
      <li>超過領取日後無法取消申請。</li>
      <li><a href={reportLink}>操作說明</a></li>
    </ol>}
  </section>;
}

function useEquipmentWrite(userId:string) {
  const pending=useRef<AbortController|null>(null);
  const previous=useRef<{fingerprint:string;id:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function send(action:ClubAction,done:()=>void) {
    if(pending.current)return;
    const fingerprint=JSON.stringify(action);
    if(previous.current?.fingerprint!==fingerprint)previous.current={fingerprint,id:crypto.randomUUID()};
    const controller=new AbortController();
    pending.current=controller;
    setBusy(true);
    setError('');
    try {
      await writeClubEquipment(userId,{...action,payload:{...action.payload,request_id:previous.current.id}} as ClubAction,controller.signal);
      if(!controller.signal.aborted){previous.current=null;done();}
    } catch(reason) {
      if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'器材借用操作未完成。');
    } finally {
      pending.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  return {busy,error,send};
}

function EquipmentList({userId,data,reload}:{userId:string;data:ClubWorkspace & {view:'equipment'|'review'};reload:()=>void}) {
  const review=data.view==='review';
  const {busy,error,send}=useEquipmentWrite(userId);
  const [selected,setSelected]=useState<ClubEquipmentRequest|null>(null);
  const columns=['學號','姓名','社團名稱','電話','物品領取日','預計歸還日','借用細項','借用目的','抵押品','簽核狀態','資料操作'];
  return <>
    {!review&&<Link className="club-primary" to={clubPath+'/equipment/new'}>新增</Link>}
    {error&&!selected&&<p role="alert">{error}</p>}
    <div className="club-request-table" role="region" aria-label="器材借用記錄" tabIndex={0}>
      <table><thead><tr>{columns.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{!data.rows.length&&<tr><td colSpan={columns.length}>查無資料</td></tr>}
      {data.rows.map(row=><tr key={row.id}>
        <td>{row.student_number}</td><td>{row.student_name}</td><td>{row.club_name}</td><td>{row.phone}</td>
        <td>{row.pickup_on}</td><td>{row.return_on}</td><td>{row.items.map(item=>item.label).join('、')}</td>
        <td>{row.purpose==='other'?row.other_purpose:clubPurposes[row.purpose]}</td>
        <td>{row.collateral}</td><td>{clubRequestStatuses[row.status]}</td>
        <td>{review?(row.status==='submitted'||row.pickup_on<=data.today)&&<button type="button" disabled={busy} onClick={()=>setSelected(row)}>審核</button>
          : row.status==='submitted'&&row.pickup_on>=data.today&&<div className="club-table-actions">
            <Link to={clubPath+'/equipment/new?edit='+row.id}>編輯</Link>
            <button type="button" disabled={busy} onClick={()=>setSelected(row)}>取消</button>
          </div>}</td>
      </tr>)}</tbody></table>
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}>
      {selected&&<DialogContent>
        <DialogHeader><DialogTitle>{review?'器材借用單審核':'取消器材借用'}</DialogTitle>
          <DialogDescription>{selected.club_name} · {selected.pickup_on} – {selected.return_on}</DialogDescription></DialogHeader>
        <form className="club-review-form" onSubmit={event=>{
          event.preventDefault();
          const values=new FormData(event.currentTarget);
          const target={id:selected.id,expected_version:selected.version,request_id:''};
          const status=values.get('status') as 'approved'|'declined'|'returned';
          const action:ClubAction=review
            ? {kind:'review_club_equipment',payload:{...target,status,collateral:String(values.get('collateral')??'')}}
            : {kind:'cancel_club_equipment',payload:target};
          void send(action,()=>{setSelected(null);reload();});
        }}>
          {review&&<>
            <label>簽核狀態 <select name="status" required defaultValue="">
              <option value="" disabled>請選擇</option>
              {selected.status==='submitted'?<>
                {selected.pickup_on>=data.today&&<option value="approved">核准</option>}
                <option value="declined">退回</option>
              </>:<option value="returned">已歸還</option>}
            </select></label>
            <label>抵押品 <input name="collateral" maxLength={160} defaultValue={selected.collateral}/></label>
          </>}
          {error&&<p role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>{review?'送出':'確認取消'}</Button>
        </form>
      </DialogContent>}
    </Dialog>
  </>;
}

function EquipmentForm({userId,data,editing}:{userId:string;data:ClubWorkspace;editing?:ClubEquipmentRequest}) {
  const navigate=useNavigate();
  const {busy,error,send}=useEquipmentWrite(userId);
  const [category,setCategory]=useState<EquipmentCategory|'A00'|''>('');
  const [details,setDetails]=useState<string[]>(()=>editing?.items.map(item=>item.id)??[]);
  const [purpose,setPurpose]=useState<string>(editing?.purpose??'');
  const canApply=Boolean(data.student&&data.clubs.length&&data.equipment.length);
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
    const application={
      request_id:'',club_id:payload.club_id,phone:payload.phone.trim(),pickup_on:payload.pickup_on,
      return_on:payload.return_on,items:details,purpose,other_purpose:purpose==='other'?payload.other_purpose.trim():'',
    };
    const action:ClubAction=editing
      ? {kind:'edit_club_equipment',payload:{...application,id:editing.id,expected_version:editing.version}}
      : {kind:'submit_club_equipment',payload:application};
    void send(action,()=>navigate(clubPath+'/equipment'));
  }
  function reset() {setCategory('');setDetails(editing?.items.map(item=>item.id)??[]);setPurpose(editing?.purpose??'');}
  return <form className="club-equipment-form" onSubmit={submit} onReset={reset}>
    <label htmlFor="club-student-id">學號</label>
    <div className="club-student-fields">
      <input id="club-student-id" value={data.student?.student_number??''} readOnly/>
      <input aria-label="姓名" value={data.student?.student_name??''} readOnly/>
    </div>
    <label htmlFor="club-membership">社團名稱</label>
    <select id="club-membership" name="club_id" defaultValue={editing?.club_id??''} required>
      <option value="">{data.clubs.length?'請選擇':'無對應資料'}</option>
      {data.clubs.map(club=><option key={club.id} value={club.id}>{club.name}</option>)}
    </select>
    <label htmlFor="club-phone">電話</label><input id="club-phone" name="phone" type="tel" defaultValue={editing?.phone??''} maxLength={24} required/>
    <label htmlFor="club-pickup">物品領取日</label><input id="club-pickup" type="date" name="pickup_on" defaultValue={editing?.pickup_on??''} required/>
    <label htmlFor="club-return">預計歸還日</label><input id="club-return" type="date" name="return_on" defaultValue={editing?.return_on??''} required/>
    <label htmlFor="club-category">器材類別</label>
    <select id="club-category" value={category} onChange={event=>setCategory(event.target.value as typeof category)}>
      <option value="">請點選器材類別</option><option value="A00">A00-搜尋全部器材項目</option>
      {Object.entries(clubEquipmentCategories).map(([id,label])=><option key={id} value={id}>{id}-{label}</option>)}
    </select>
    <label htmlFor="club-equipment">借用細項</label>
    <div className="club-equipment-details">
      <select id="club-equipment" value="" onChange={event=>{
        const item=event.target.value;
        if(item)setDetails(previous=>previous.length===10||previous.includes(item)?previous:[...previous,item]);
      }}>
        <option value="">{category?'請點選器材項目':'請先點選器材類別'}</option>
        {data.equipment.filter(item=>(category==='A00'||item.category===category)&&!details.includes(item.id))
          .map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <button type="button" onClick={()=>setDetails([])}>清空明細</button>
      <textarea aria-label="已選器材" value={details.map(id=>(data.equipment.find(item=>item.id===id)??editing?.items.find(item=>item.id===id))?.label).join('\n')} readOnly/>
    </div>
    <label htmlFor="club-purpose">借用目的</label>
    <div className="club-purpose">
      <select id="club-purpose" value={purpose} onChange={event=>setPurpose(event.target.value)} required>
        <option value="">請點選器材借用目的</option>
        {Object.entries(clubPurposes).map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select>
      <label>其他目的說明 <input name="other_purpose" defaultValue={editing?.other_purpose??''} maxLength={200} required={purpose==='other'} disabled={purpose!=='other'}/></label>
    </div>
    {error&&<p className="club-form-message" role="alert">{error}</p>}
    <div className="club-form-actions">
      <button className="club-primary" type="submit" disabled={busy||!canApply||!details.length}>送出</button>
      <button type="reset" disabled={busy}>取消</button>
      {busy?<span aria-disabled="true">回列表</span>:<Link to={clubPath+'/equipment'}>回列表</Link>}
    </div>
  </form>;
}
