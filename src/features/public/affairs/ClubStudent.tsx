import { useEffect,useRef,useState,type FormEvent,type ReactNode } from 'react';
import { Link,useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { loadStudentClubs,saveClubFoundation } from '@/services/clubStudent';
import { clubCategories,clubPath } from '../../../../server/clubServicesContract.js';
import {
  clubFoundationStatuses,clubSearchViews,type ClubFoundationAction,type ClubStudentView,type ClubStudentWorkspace,type FoundationRow,
} from '../../../../server/clubStudentContract.js';

const time=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'});
const formatTime=(value:string)=>time.format(new Date(value));
const readError=(value:unknown)=>value instanceof Error?value.message:'暫時無法完成操作，請重試。';

export function ClubStudent({userId,view}:{userId:string;view:ClubStudentView}) {
  const [params]=useSearchParams();
  const search=clubSearchViews.includes(view)?(params.get('q')??'').slice(0,100):'';
  const pageText=params.get('page')??'1';
  const page=/^([1-9][0-9]{0,2}|1000)$/u.test(pageText)?Number(pageText):1;
  return <ClubStudentPage key={JSON.stringify([search,page])} userId={userId} view={view} search={search} page={page}/>;
}

function ClubStudentPage({userId,view,search,page}:{userId:string;view:ClubStudentView;search:string;page:number}) {
  const [,setParams]=useSearchParams();
  const [data,setData]=useState<ClubStudentWorkspace|null>(null);
  const [error,setError]=useState('');
  const [nonce,setNonce]=useState(0);
  function reload() {setData(null);setError('');setNonce(value=>value+1);}
  useEffect(()=>{
    const controller=new AbortController();
    void loadStudentClubs(userId,view,search,page,controller.signal).then(
      value=>{if(!controller.signal.aborted)setData(value);},
      reason=>{if(!controller.signal.aborted)setError(readError(reason));},
    );
    return ()=>controller.abort();
  },[userId,view,search,page,nonce]);

  function submitSearch(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search=String(new FormData(event.currentTarget).get('q')??'').trim();
    setParams(search?{q:search}:{});
  }
  function go(nextPage:number) {setParams({...search?{q:search}:{},...nextPage>1?{page:String(nextPage)}:{}});}

  return <>
    {clubSearchViews.includes(view)&&<form className="club-student-search" onSubmit={submitSearch}>
      <label htmlFor="club-search">{view==='directory'?'社團名稱':'活動或社團名稱'}</label>
      <input id="club-search" name="q" maxLength={100} defaultValue={search} type="search" />
      <Button type="submit" className="club-primary">查詢</Button>
      {search&&<Button variant="outline" type="button" onClick={()=>setParams({})}>清除</Button>}
    </form>}
    {error?<p role="alert">{error} <button type="button" onClick={reload}>重試</button></p>:
      !data?<p role="status">讀取紀錄中…</p>:
        data.view==='foundation'||data.view==='foundation/review'?<FoundationRecords userId={userId} data={data} reload={reload}/>:
          <StudentRecords data={data}/>}
    {data&&(data.hasMore||page>1)&&<nav className="club-student-search" aria-label="紀錄分頁">
      <Button type="button" variant="outline" onClick={()=>go(page-1)} disabled={page<=1}>上一頁</Button>
      <span>第 {page} 頁</span>
      <Button type="button" variant="outline" onClick={()=>go(page+1)} disabled={!data.hasMore}>下一頁</Button>
    </nav>}
  </>;
}

function StudentTable({headings,rows}:{headings:string[];rows:Array<{id:string;cells:ReactNode[]}>}) {
  return <div className="club-request-table club-student-table" role="region" tabIndex={0} aria-label="紀錄清單">
    <table><thead><tr>{headings.map(value=><th key={value} scope="col">{value}</th>)}</tr></thead>
      <tbody>{rows.length?rows.map(row=><tr key={row.id}>{row.cells.map((cell,index)=><td key={headings[index]}>{cell}</td>)}</tr>):
        <tr><td colSpan={headings.length}>查無資料</td></tr>}</tbody></table>
  </div>;
}

function StudentRecords({data}:{data:Exclude<ClubStudentWorkspace,{view:'foundation'|'foundation/review'}>}) {
  if(data.view==='directory')return <StudentTable headings={['社團名稱','社團位置','社團指導老師']}
    rows={data.rows.map(row=>({id:row.id,cells:[row.name,row.location,row.advisor]}))}/>;
  if(data.view==='my-memberships')return <StudentTable headings={['社團名稱','角色','學年','學期','社團狀態']}
    rows={data.rows.map(row=>({id:row.id,cells:[row.name,row.role_label,row.academic_year,row.term,row.active?'開放':'已停用']}))}/>;
  if(data.view==='my-attendance')return <StudentTable headings={['活動名稱','社團名稱','活動開始時間','活動地點','學年','學期','登錄時間']}
    rows={data.rows.map(row=>({id:row.id,cells:[row.title,row.club_name,formatTime(row.starts_at),row.location,row.academic_year,row.term,formatTime(row.recorded_at)]}))}/>;
  return <StudentTable headings={['活動名稱','社團名稱','活動類別','活動開始時間','活動結束時間','活動地點','活動說明']}
    rows={data.rows.map(row=>({id:row.id,cells:[row.title,row.club_name,clubCategories[row.category],formatTime(row.starts_at),
      formatTime(row.ends_at),row.location,row.description]}))}/>;
}

function FoundationRecords({userId,data,reload}:{userId:string;data:Extract<ClubStudentWorkspace,{view:'foundation'|'foundation/review'}>;reload:()=>void}) {
  const reviewing=data.view==='foundation/review';
  const [selection,setSelection]=useState<FoundationRow|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const pending=useRef<AbortController|null>(null);
  const retry=useRef<{text:string;id:string}|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);

  async function save(action:ClubFoundationAction) {
    if(pending.current?.signal.aborted)pending.current=null;
    if(pending.current)return;
    const text=JSON.stringify(action);
    if(retry.current?.text!==text)retry.current={text,id:crypto.randomUUID()};
    const controller=new AbortController();
    pending.current=controller;
    setError('');
    setBusy(true);
    try {
      await saveClubFoundation(userId,{...action,payload:{...action.payload,request_id:retry.current.id}} as ClubFoundationAction,controller.signal);
      if(!controller.signal.aborted)reload();
    } catch(reason) {
      if(!controller.signal.aborted)setError(readError(reason));
    } finally {
      if(pending.current===controller){
        pending.current=null;
        if(!controller.signal.aborted)setBusy(false);
      }
    }
  }

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    void save({kind:'submit_club_foundation',payload:{request_id:'',name:String(form.get('name')??'').trim(),
      description:String(form.get('description')??'').trim()}});
  }
  function decide(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!selection||selection.version!==1)return;
    const target={id:selection.id,expected_version:selection.version,request_id:''};
    if(!reviewing){void save({kind:'withdraw_club_foundation',payload:target});return;}
    const form=new FormData(event.currentTarget);
    const status=form.get('decision')==='declined'?'declined':'approved';
    void save({kind:'review_club_foundation',payload:{...target,status,note:String(form.get('note')??'').trim()}});
  }

  const headings=['社團名稱',...(reviewing?['申請人']:[]),'成立宗旨','審核狀態','審核備註','更新時間','資料操作'];
  return <>
    {!reviewing&&(data.eligible?<form className="club-foundation-form" onSubmit={submit}>
      <label htmlFor="foundation-name">社團名稱</label>
      <input id="foundation-name" name="name" required minLength={2} maxLength={120} disabled={busy}/>
      <label htmlFor="foundation-purpose">成立宗旨</label>
      <textarea id="foundation-purpose" name="description" rows={3} required minLength={10} maxLength={1000} disabled={busy}/>
      <Button className="club-primary" type="submit" disabled={busy}>送出申請</Button>
    </form>:<p>請先完成學生基本資料。</p>)}
    {error&&!selection&&<p role="alert">{error} <button type="button" onClick={reload}>重新載入</button></p>}
    <StudentTable headings={headings} rows={data.rows.map(row=>({id:row.id,cells:[row.name,...(reviewing?[row.student_name]:[]),
      row.description,clubFoundationStatuses[row.status],row.review_note,formatTime(row.updated_at),
      row.status==='submitted'?<button key="action" type="button" disabled={busy} onClick={()=>{setError('');setSelection(row);}}>
        {reviewing?'審核':'撤回'}</button>:row.club_id&&<Link key="club" to={clubPath+'/directory?'+new URLSearchParams({q:row.name})}>查看社團</Link>,
    ]}))}/>
    <Dialog open={Boolean(selection)} onOpenChange={open=>{if(!open&&!busy){setSelection(null);setError('');}}}>
      {selection&&<DialogContent>
        <DialogHeader><DialogTitle>{reviewing?'審核新社團申請':'確認撤回申請'}</DialogTitle>
          <DialogDescription>{selection.name}</DialogDescription></DialogHeader>
        <form className="club-review-form" onSubmit={decide}>
          {reviewing&&<><label htmlFor="foundation-decision">審核結果</label>
            <select id="foundation-decision" name="decision" disabled={busy}><option value="approved">核准</option><option value="declined">不核准</option></select>
            <label htmlFor="foundation-note">審核備註（不核准時必填）</label>
            <textarea id="foundation-note" name="note" maxLength={500} disabled={busy}/></>}
          {error&&<p role="alert">{error} <button type="button" onClick={reload}>重新載入</button></p>}
          <Button className="club-primary" type="submit" disabled={busy}>{reviewing?'確認送出':'確認撤回'}</Button>
        </form>
      </DialogContent>}
    </Dialog>
  </>;
}
