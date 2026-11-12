import {useId,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import type {AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {courseSelectionHistoryNotes,courseSelectionPeriods,courseSelectionSchedule,courseSelectionSlotKey,courseSelectionYears,defaultCourseSelectionFilter,filterCourseSelection,selectionPhaseOptions,semesterOptions,type CourseSelectionFilter} from '@/services/courseSelection';
import {referenceAsset} from '../site/reference';
import './courseSelection.css';

const menus=[
  {title:'選課資訊',links:[['選課記錄查詢','/school-affairs/services/11-1'],['我的課表','/school-affairs/services/11-2'],['選課確認','/school-affairs/services/6-6'],['棄選','/school-affairs/services/6-4'],['即時教學反應','/school-affairs/services/7-6']]},
  {title:'超、減修學分',links:[['超減修學分申請','/school-affairs/services/7-1'],['歷年超減修申請紀錄','/school-affairs/services/11-3']]},
  {title:'抵免學分',links:[['抵免學分申請','/school-affairs/services/7-2'],['已抵免學分記錄查詢','https://infosys.stu.edu.tw/WebSelectCourse/StuCcredit/GetCreditTransfer']]},
];
const historyColumns=['序號','當期課程代碼','課程名稱','必選修','學分','教師一','備註'];
const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
type Props={snapshot:AffairsSnapshot|null;busy:boolean;error?:string;onReload:()=>void;onLogout:()=>void;view:'history'|'timetable'};
type DraftFilter={academicYear:string;semester:string;selectionPhase:string};
const draftFrom=(filter:CourseSelectionFilter):DraftFilter=>({academicYear:String(filter.academicYear),semester:String(filter.semester),selectionPhase:filter.selectionPhase});

export function CourseSelection({snapshot,busy,error,onReload,onLogout,view}:Props) {
  const records=snapshot?.courseSelection?.records??[],userId=snapshot?.profile.userId??'';
  const [filterOwner,setFilterOwner]=useState(userId);
  const [applied,setApplied]=useState(()=>defaultCourseSelectionFilter(records,userId));
  const [draft,setDraft]=useState(()=>draftFrom(applied));
  const [expanded,setExpanded]=useState(false);
  const criteriaId=useId();
  // Initialize once when the account arrives, and never carry a previous account's filter forward.
  if(filterOwner!==userId){
    const next=defaultCourseSelectionFilter(records,userId);
    setFilterOwner(userId);setApplied(next);setDraft(draftFrom(next));setExpanded(false);
  }
  const title=view==='history'?'選課記錄查詢':'我的課表';
  const name=snapshot?.student?.fullName||snapshot?.profile.displayName||'—';
  const filtered=filterCourseSelection(records,userId,applied);
  const schedule=courseSelectionSchedule(records,userId,applied);
  const query=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const semester=semesterOptions.find(option=>String(option.value)===draft.semester);
    const phase=selectionPhaseOptions.find(option=>option.value===draft.selectionPhase);
    const academicYear=Number(draft.academicYear);
    if(!semester||!phase||!courseSelectionYears(records,userId).includes(academicYear))return;
    setApplied({academicYear,semester:semester.value,selectionPhase:phase.value});setExpanded(false);
  };
  return <div className="course-selection" lang="zh-Hant">
    <div className="course-selection-frame">
      <header className="course-selection-brand"><Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22" height="24" alt=""/>校務資訊管理系統</Link><span>Shu-Te University</span></header>
      <nav className="course-selection-nav" aria-label="選課系統選單">
        {menus.map(menu=><DropdownMenu key={menu.title}><DropdownMenuTrigger asChild><Button variant="ghost">{menu.title}<ChevronDown aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          {menu.links.map(([label,path])=><DropdownMenuItem asChild key={path}>{path.startsWith('https:')?<a href={path} target="_blank" rel="noopener noreferrer">{label}</a>:<Link to={path}>{label}</Link>}</DropdownMenuItem>)}
        </DropdownMenuContent></DropdownMenu>)}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost">Index<ChevronDown aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>Logout</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </nav>
      <nav className="course-selection-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to="/school-affairs">Index</Link><span aria-hidden="true">›</span><span>{title}</span></nav>
      <main className="course-selection-main" aria-busy={busy}>
        <header className="course-selection-heading"><h1><i className="portal-icon" aria-hidden="true">{'\uf19c'}</i>{title} <small>» {name}</small></h1></header>
        <div className="course-selection-toggle-line"><button type="button" className="course-selection-toggle" aria-expanded={expanded} aria-controls={criteriaId} onClick={()=>setExpanded(!expanded)}><i className="portal-icon" aria-hidden="true">{'\uf002'}</i> 查詢條件輸入 <i className="portal-icon" aria-hidden="true">{expanded?'\uf102':'\uf103'}</i></button></div>
        {expanded&&<section id={criteriaId} className="course-selection-criteria" aria-label="查詢條件輸入">
          <form onSubmit={query}>
            <div className="course-selection-term-fields">
              <label>學年:<select aria-label="學年" required value={draft.academicYear} disabled={!snapshot||busy} onChange={event=>setDraft({...draft,academicYear:event.target.value})}><option value="">請選擇學年</option>{courseSelectionYears(records,userId).map(year=><option key={year} value={year}>{year}</option>)}</select></label>
              <label>學期:<select aria-label="學期" required value={draft.semester} disabled={!snapshot||busy} onChange={event=>setDraft({...draft,semester:event.target.value})}><option value="">請選擇學期</option>{semesterOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            <label className="course-selection-phase-field">選課階段:<select aria-label="選課階段" required value={draft.selectionPhase} disabled={!snapshot||busy} onChange={event=>setDraft({...draft,selectionPhase:event.target.value})}><option value="">請選擇階段</option>{selectionPhaseOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <button className="course-selection-query" type="submit" disabled={!snapshot||busy}>查詢 <i className="portal-icon" aria-hidden="true">{'\uf002'}</i></button>
          </form>
          <h2><i className="portal-icon" aria-hidden="true">{'\uf129'}</i> 輸入關鍵字查詢符合條件記錄</h2>
        </section>}
        <section className={`course-selection-results${expanded?' expanded':''}`} aria-label={title}>
          <h2 className="course-selection-record-heading"><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>{view==='history'?'選課清單:':'條件查詢:'}</h2>
          {busy&&!snapshot&&<p role="status">載入紀錄中…</p>}
          {error&&<p role="alert" className="course-selection-error">{error} <Button type="button" variant="outline" size="sm" onClick={onReload} disabled={busy}>重新載入</Button></p>}
          {snapshot&&<>
            <div className="course-selection-summary" aria-live="polite"><div>學號：{snapshot.student?.studentNumber||'—'}　│　姓名：{name}　│　學年：{applied.academicYear}　│　學期：{semesterOptions.find(option=>option.value===applied.semester)?.label}</div><h3>選課階段：<span>{selectionPhaseOptions.find(option=>option.value===applied.selectionPhase)?.label}</span></h3></div>
            <div className="course-selection-table-wrap" role="region" aria-label={view==='history'?'選課清單，可左右捲動':'每週課表，可左右捲動'} tabIndex={0}>
              {view==='history'?<table className="course-selection-history-table" aria-label={`選課清單，計 ${filtered.length} 筆課程資料`}>
                <colgroup>{[5,25.46,33.68,10.15,7.775,10.15,7.785].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup>
                <thead><tr>{historyColumns.map(column=><th key={column} scope="col">{column}</th>)}</tr></thead>
                {filtered.length>0&&<tbody>{filtered.map((record,index)=><tr key={record.id}><td className="course-selection-row-number">{index+1}</td><td>{record.termCourseCode}</td><td>{record.courseTitle}</td><td>{record.requiredElectiveText??'—'}</td><td>{record.credits}</td><td>{record.instructorOne??'—'}</td><td>{record.remarkText??'—'}</td></tr>)}</tbody>}
                <tfoot><tr><td colSpan={7}>計 {filtered.length} 筆課程資料</td></tr></tfoot>
              </table>:<table className="course-selection-timetable" aria-label="每週課表，共十四節次">
                <colgroup><col style={{width:'4.0927%'}}/><col style={{width:'9.9517%'}}/>{weekdays.map(day=><col key={day} style={{width:'12.27937%'}}/>)}</colgroup>
                <thead><tr>{['節次','時間',...weekdays].map(column=><th key={column} scope="col">{column}</th>)}</tr></thead>
                <tbody>{courseSelectionPeriods.map(period=><tr key={period.key} data-period={period.key}><th scope="row">{period.key}</th><td>{period.start}~{period.end}</td>{weekdays.map((day,index)=><td key={day} data-weekday={index+1}>{(schedule.entries.get(courseSelectionSlotKey(index+1,period.key))??[]).map(entry=><div className="course-selection-meeting" key={entry.record.id}>{entry.record.courseTitle}{entry.rooms.length>0&&<><br/>{entry.rooms.join('、')}</>}</div>)}</td>)}</tr>)}</tbody>
              </table>}
            </div>
            {view==='timetable'&&schedule.unscheduled.length>0&&<div className="course-selection-unscheduled">無上課時段課程：{schedule.unscheduled.map(record=><span key={record.id}>{record.courseTitle} | </span>)}</div>}
          </>}
        </section>
        <section className="course-selection-notes" aria-label="校方頁面說明（2026-11-12 擷取）"><h2><i className="portal-icon" aria-hidden="true">{'\uf129'}</i>說明</h2><ol>{(view==='history'?courseSelectionHistoryNotes:['提供查詢階段，一周課表。']).map(note=><li key={note}>{note}</li>)}</ol></section>
      </main>
    </div>
    <footer className="course-selection-footer">Copyright © 2026 樹德科技大學電算中心<small className="course-selection-provenance">stu.best · 站內示範紀錄，非校方選課結果 · 畫面與說明擷取於 2026-11-12</small></footer>
  </div>;
}
