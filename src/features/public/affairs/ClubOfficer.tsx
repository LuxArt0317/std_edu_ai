import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadClubOfficer, writeClubOfficer } from '@/services/clubServices';
import { clubCategories, clubPath, clubUuid } from '../../../../server/clubServicesContract.js';
import {
  clubApplicationChoices,clubApplicationStatus,clubOfficerMenu,clubOfficerViews,
  type ClubApplication,type ClubApplicationInput,type OfficerAction,type OfficerChoice,type OfficerView,type OfficerWorkspace,
} from '../../../../server/clubOfficerContract.js';
import './clubOfficer.css';

const base=clubPath+'/officer/';
const times=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short'});
const headings=Object.fromEntries(clubOfficerMenu.map(([path,,title])=>[path,title]));
export function clubOfficerHeading(path:string) {
  if(path==='officer/new')return ['活動申請','新增記錄'];
  if(path==='officer/review')return ['活動申請審核','記錄清單'];
  return Object.hasOwn(headings,path)?[headings[path],'記錄清單']:null;
}
const applicationColumns=['社團名稱','活動名稱','主辦單位','活動期間','活動小時','活動地點','活動總召','活動總召-電話',
  '活動企劃書附件','結案報告附件','審核狀態','學年','學期','資料操作'];

export function ClubOfficer({userId,path}:{userId:string;path:string}) {
  const [params]=useSearchParams();
  const view=path.slice('officer/'.length);
  const queryView=clubOfficerViews.find(option=>option===view)??'applications';
  const rawClub=params.get('club')??'';
  const club=(queryView==='members'||queryView==='participation')&&clubUuid.test(rawClub)?rawClub:undefined;
  const edit=path==='officer/new'?params.get('edit'):null;
  return <OfficerRecords key={[userId,path,club,edit].join(':')} userId={userId} view={queryView}
    club={club} editingId={edit} create={path==='officer/new'}/>;
}
function OfficerRecords({userId,view,club,editingId,create}:{
  userId:string;view:OfficerView;club?:string;editingId:string|null;create:boolean;
}) {
  const [data,setData]=useState<OfficerWorkspace|null>(null);
  const [error,setError]=useState('');
  const [attempt,retry]=useState(0);
  const reload=()=>{setData(null);setError('');retry(value=>value+1);};
  useEffect(()=>{
    const controller=new AbortController();
    void loadClubOfficer(userId,view,controller.signal,club).then(
      value=>{if(!controller.signal.aborted)setData(value);},
      reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'無法讀取社團資料。');},
    );
    return ()=>controller.abort();
  },[userId,view,club,attempt]);
  if(error)return <p role="alert">{error} <Button variant="outline" onClick={reload}>重試</Button></p>;
  if(!data)return <p role="status">讀取資料中…</p>;
  if(data.view==='profiles')return <OfficerTable headers={['社團名稱','社團人數','社團負責人','社團負責人-信箱','社團負責人-電話','社團負責人-手機',
    '社團指導老師-姓名','社團位置','記錄審核狀態','器材借用狀態','學年','學期','資料操作']}
    rows={data.rows.map(row=>[row.name,row.member_count,row.lead_name,row.lead_email,row.lead_phone,row.lead_mobile,row.advisor,row.location,
      row.review_status,row.lending_status,row.academic_year,row.term,''])}/>;
  if(data.view==='members'||data.view==='participation')return <ClubRoster data={data} selected={club}/>;
  if(create){
    const editing=editingId?data.rows.find(row=>row.id===editingId&&row.can_edit&&row.status==='submitted'):undefined;
    return editingId&&!editing?<p role="alert">此申請無法編輯。 <Link to={base+'applications'}>回列表</Link></p>
      :<ActivityForm userId={userId} clubs={data.clubs} editing={editing}/>;
  }
  return <ActivityList userId={userId} rows={data.rows} view={view} reload={reload}/>;
}

function OfficerTable({headers,rows}:{headers:string[];rows:ReactNode[][]}) {
  return <div className="club-request-table club-officer-table" role="region" aria-label="記錄清單" tabIndex={0}>
    <table><thead><tr>{headers.map(title=><th scope="col" key={title}>{title}</th>)}</tr></thead>
      <tbody>{rows.length?rows.map((row,index)=><tr key={index}>{row.map((value,column)=><td key={column}>{value}</td>)}</tr>)
        :<tr><td colSpan={headers.length}>查無資料</td></tr>}</tbody></table>
  </div>;
}

function ClubRoster({data,selected}:{data:Extract<OfficerWorkspace,{view:'members'|'participation'}>;selected?:string}) {
  const navigate=useNavigate();
  return <>
    <form className="club-roster-search" onSubmit={event=>{
      event.preventDefault();
      const club=new FormData(event.currentTarget).get('club');
      navigate(base+data.view+(typeof club==='string'&&clubUuid.test(club)?'?club='+club:''));
    }}>
      <label htmlFor="officer-roster-club">社團名稱</label><select id="officer-roster-club" name="club" defaultValue={selected??''} required>
        <option value="">{data.clubs.length?'請選擇':'無對應資料'}</option>
        {data.clubs.map(club=><option key={club.id} value={club.id}>{club.name}</option>)}
      </select>
      <button className="club-primary" type="submit">查詢</button>
      {selected&&<Link to={base+data.view}>回列表</Link>}
    </form>
    {data.view==='members'?<OfficerTable headers={['社團名稱','樹德編號','姓名','角色','可否維護社團資訊','電子信箱','連絡電話','學年','學期','資料操作']}
      rows={data.rows.map(row=>[row.club_name,row.student_number,row.student_name,row.role_label,row.officer?'Y':'N',row.contact_email,row.contact_phone,row.academic_year,row.term,''])}/>
      :<OfficerTable headers={['學號','姓名','活動名稱','活動開始時間','社團名稱','學年','學期','資料操作']}
        rows={data.rows.map(row=>[row.student_number,row.student_name,row.title,times.format(new Date(row.starts_at)),row.club_name,row.academic_year,row.term,''])}/>}
  </>;
}

function useOfficerWrite(userId:string) {
  const pending=useRef<AbortController|null>(null);
  const retry=useRef<{payload:string;id:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function send(action:OfficerAction,done:()=>void) {
    if(pending.current)return;
    const payload=JSON.stringify(action);
    if(retry.current?.payload!==payload)retry.current={payload,id:crypto.randomUUID()};
    const controller=new AbortController();
    pending.current=controller;
    setBusy(true);
    setError('');
    try {
      await writeClubOfficer(userId,{...action,payload:{...action.payload,request_id:retry.current.id}} as OfficerAction,controller.signal);
      if(!controller.signal.aborted){retry.current=null;done();}
    } catch(reason) {
      if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'操作未完成。');
    } finally {
      pending.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  return {busy,error,send};
}

function ActivityList({userId,rows,view,reload}:{userId:string;rows:ClubApplication[];view:OfficerView;reload:()=>void}) {
  const [selected,setSelected]=useState<{row:ClubApplication;mode:'withdraw'|'complete'|'review'|'details'}|null>(null);
  const {busy,error,send}=useOfficerWrite(userId);
  return <>
    {view==='applications'&&<Link className="club-primary" to={base+'new'}>新增</Link>}
    <OfficerTable headers={applicationColumns} rows={rows.map(row=>[
      row.club_name,row.title,row.organizer,times.format(new Date(row.starts_at))+' – '+times.format(new Date(row.ends_at)),
      row.hours,row.location,row.details.coordinator,row.details.coordinator_phone,'','',clubApplicationStatus[row.status],row.academic_year,row.term,
      <div className="club-table-actions">
        <button type="button" onClick={()=>setSelected({row,mode:'details'})}>查看</button>
        {view==='applications'&&row.status==='submitted'&&row.can_edit&&<>
          <Link to={base+'new?edit='+row.id}>編輯</Link>
          <button type="button" onClick={()=>setSelected({row,mode:'withdraw'})}>撤回</button>
        </>}
        {view==='completion'&&row.status==='approved'&&row.can_edit&&Date.parse(row.ends_at)<=Date.now()&&
          <button type="button" onClick={()=>setSelected({row,mode:'complete'})}>結案</button>}
        {view==='review'&&<button type="button" onClick={()=>setSelected({row,mode:'review'})}>審核</button>}
      </div>,
    ])}/>
    <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}>
      {selected&&<DialogContent>
        <DialogHeader><DialogTitle>{selected.mode==='withdraw'?'撤回活動申請':selected.mode==='complete'?'成果結案':
          selected.mode==='review'?'活動申請審核':'活動資料'}</DialogTitle><DialogDescription>{selected.row.title}</DialogDescription></DialogHeader>
        {selected.mode==='details'?<dl className="club-officer-details">
          <dt>社團名稱</dt><dd>{selected.row.club_name}</dd><dt>主辦單位</dt><dd>{selected.row.organizer}</dd>
          <dt>活動地點</dt><dd>{selected.row.location}</dd><dt>審核狀態</dt><dd>{clubApplicationStatus[selected.row.status]}</dd>
          {selected.row.review_note&&<><dt>審核備註</dt><dd>{selected.row.review_note}</dd></>}
          {selected.row.completion_note&&<><dt>成果說明</dt><dd>{selected.row.completion_note}</dd></>}
        </dl>:<form className="club-review-form" onSubmit={event=>{
          event.preventDefault();
          const values=new FormData(event.currentTarget);
          const record={id:selected.row.id,expected_version:selected.row.version,request_id:''};
          const note=String(values.get('note')??'').trim();
          const action:OfficerAction=selected.mode==='withdraw'?{kind:'withdraw_club_application',payload:record}:
            selected.mode==='complete'?{kind:'complete_club_application',payload:{...record,note}}:
            {kind:'review_club_application',payload:{...record,status:values.get('status')==='approved'?'approved':'declined',
              category:String(values.get('category')??'uncategorized'),note}};
          void send(action,()=>{setSelected(null);reload();});
        }}>
          {selected.mode==='review'&&<>
            <label>結果 <select name="status" required defaultValue=""><option value="">請選擇</option><option value="approved">核准並發布至月曆</option><option value="declined">退回</option></select></label>
            <label>活動類別 <select name="category" defaultValue="uncategorized">
              {Object.entries(clubCategories).map(([id,label])=><option key={id} value={id}>{label}</option>)}
            </select></label>
          </>}
          {selected.mode!=='withdraw'&&<label>{selected.mode==='complete'?'成果說明':'審核備註'}
            <textarea name="note" maxLength={selected.mode==='complete'?2000:1000} required={selected.mode==='complete'}/></label>}
          {error&&<p role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>{selected.mode==='withdraw'?'確認撤回':'送出'}</Button>
        </form>}
      </DialogContent>}
    </Dialog>
    <div className="club-instructions"><h2>ⓘ 說明</h2><p>列出社團活動記錄。</p></div>
  </>;
}

const choiceLabels:Record<OfficerChoice,string>={natures:'活動性質',audiences:'參加對象',sdgs:'永續發展目標SDGs指標',education:'活動類別(EDU)'};
const fields=[
  ['title','活動名稱',true],['organizer','主辦單位',true],['co_organizer','協辦單位',false],
  ['starts_at','開始時間',true],['ends_at','結束時間',true],['hours','活動小時',true],['location','活動地點',true],
] as const;
function ActivityForm({userId,clubs,editing}:{userId:string;clubs:OfficerWorkspace['clubs'];editing?:ClubApplication}) {
  const navigate=useNavigate();
  const {busy,error,send}=useOfficerWrite(userId);
  const details=editing?.details;
  const initial=(key:keyof ClubApplicationInput)=>details?.[key]??'';
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const value=(key:string)=>String(form.get(key)??'').trim();
    const application:ClubApplicationInput={
      club_id:value('club_id'),title:value('title'),organizer:value('organizer'),co_organizer:value('co_organizer'),
      starts_at:value('starts_at')+'+08:00',ends_at:value('ends_at')+'+08:00',hours:value('hours'),location:value('location'),
      advisor:value('advisor'),advisor_phone:value('advisor_phone'),coordinator:value('coordinator'),coordinator_phone:value('coordinator_phone'),
      area:value('area'),campus_location:value('campus_location'),offsite_location:value('offsite_location'),
      natures:form.getAll('natures').map(String),audiences:form.getAll('audiences').map(String),sdgs:form.getAll('sdgs').map(String),
      education:form.getAll('education').map(String),education_other:value('education_other'),
    };
    const action:OfficerAction=editing
      ? {kind:'edit_club_application',payload:{application,id:editing.id,expected_version:editing.version,request_id:''}}
      : {kind:'submit_club_application',payload:{application,request_id:''}};
    void send(action,()=>navigate(base+'applications'));
  }
  return <form className="club-officer-form" onSubmit={submit}>
    <label htmlFor="officer-club-id">社團名稱</label>
    <select name="club_id" id="officer-club-id" defaultValue={editing?.club_id??''} required>
      <option value="">{clubs.length?'請選擇':'無對應資料'}</option>
      {clubs.filter(club=>!editing||editing.club_id===club.id).map(club=><option key={club.id} value={club.id}>{club.name}</option>)}
    </select>
    {fields.map(([name,label,required])=>{
      const time=name==='starts_at'||name==='ends_at';
      const hour=name==='hours';
      return <div className="club-officer-fields" key={name}><label htmlFor={'officer-'+name}>{label}</label>
        <input id={'officer-'+name} name={name} required={required} type={time?'datetime-local':hour?'number':'text'}
          className={time||hour?'club-short-field':undefined} min={hour?'0.01':undefined} max={hour?'744':undefined}
          step={hour?'0.01':undefined} maxLength={160}
          defaultValue={time?String(initial(name)).slice(0,16):String(initial(name))}/>
      </div>;
    })}
    <label htmlFor="officer-advisor">指導老師</label><div className="club-officer-pair">
      <input id="officer-advisor" name="advisor" maxLength={160} defaultValue={String(initial('advisor'))}/>
      <label>電話 <input type="tel" name="advisor_phone" maxLength={160} defaultValue={String(initial('advisor_phone'))}/></label>
    </div>
    <label htmlFor="officer-coordinator">活動總召</label><div className="club-officer-pair">
      <input id="officer-coordinator" name="coordinator" maxLength={160} defaultValue={String(initial('coordinator'))}/>
      <label>手機 <input type="tel" name="coordinator_phone" maxLength={160} defaultValue={String(initial('coordinator_phone'))}/></label>
    </div>
    <span id="officer-area-label">活動區域</span><div role="group" aria-labelledby="officer-area-label" className="club-officer-choices">
      {([['campus','校內'],['offsite','校外'],['both','皆有']] as const).map(([id,label])=>
        <label key={id}><input type="radio" name="area" value={id} required defaultChecked={(details?.area??'campus')===id}/> {label}</label>)}
    </div>
    <label htmlFor="officer-internal-place">校內地點</label><div className="club-officer-pair">
      <input id="officer-internal-place" name="campus_location" maxLength={160} defaultValue={String(initial('campus_location'))}/>
      <label>校外地點 <input name="offsite_location" maxLength={160} defaultValue={String(initial('offsite_location'))}/></label>
    </div>
    {(Object.keys(clubApplicationChoices) as OfficerChoice[]).map(key=><div key={key} className="club-officer-fields">
      <span id={'club-choice-'+key}>{choiceLabels[key]}</span>
      <div className="club-officer-choices" role="group" aria-labelledby={'club-choice-'+key}>
        {clubApplicationChoices[key].map(choice=>{
          const [id,label]=choice.split(':');
          return <label key={id}><input type="checkbox" name={key} value={id} defaultChecked={details?.[key].includes(id)}/> {label}</label>;
        })}
        {key==='education'&&<label>其他說明 <input name="education_other" maxLength={160} defaultValue={String(initial('education_other'))}/></label>}
      </div>
    </div>)}
    {error&&<p className="club-form-message" role="alert">{error}</p>}
    <div className="club-form-actions">
      <button className="club-primary" type="submit" disabled={busy||!clubs.length}>送出</button>
      <button type="reset" disabled={busy}>取消</button><Link to={base+'applications'}>回列表</Link>
    </div>
  </form>;
}
