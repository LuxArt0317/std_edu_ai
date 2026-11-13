import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import type {AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {academicAttendanceCourseDate,academicAttendanceDetailColumns,academicAttendanceNotes,academicAttendancePaths,academicAttendanceRollCall,academicAttendanceStatisticColumns,academicAttendanceTimestamp,academicAttendanceTitles,currentAcademicAttendance,type AcademicAttendanceRecords,type AcademicAttendanceView} from '@/services/academicAttendance';
import {referenceAsset} from '../site/reference';
import './academicAttendance.css';

export type AcademicAttendanceSnapshot=AffairsSnapshot&{academicAttendance?:AcademicAttendanceRecords};
export type AcademicAttendanceProps={snapshot:AcademicAttendanceSnapshot|null;busy:boolean;error?:string;onReload:()=>void;onLogout:()=>void;view:AcademicAttendanceView};
const statisticWidths=[85.234375,58.09375,146.0390625,187.15625,126.421875,112.75,112.75,99.0859375,99.1328125];
const detailWidths=[190.109375,243.6328125,93.421875,57.8359375,126.796875,57.8359375,257.03125];

export function AcademicAttendance({snapshot,busy,error,onReload,onLogout,view}:AcademicAttendanceProps){
  const current=currentAcademicAttendance(snapshot?.academicAttendance,snapshot?.profile.userId??''),detail=view==='detail';
  const title=academicAttendanceTitles[view],other=detail?'statistics':'detail',hasRows=detail?current.details.length>0:current.statistics.length>0;
  const widths=detail?detailWidths:statisticWidths,columns=detail?academicAttendanceDetailColumns:academicAttendanceStatisticColumns;
  return <div className={`academic-attendance ${view}`} id="academic-attendance-top" lang="zh-Hant"><div className="academic-attendance-shell">
    <header className="academic-attendance-brand"><Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22.3" height="24" alt=""/>學生缺曠課記錄查詢</Link><span>Shu-Te University</span></header>
    <nav className="academic-attendance-nav" aria-label="缺曠課查詢選單"><DropdownMenu modal={false}><DropdownMenuTrigger className="academic-attendance-menu">查詢<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="academic-attendance-dropdown" align="end"><DropdownMenuItem asChild><Link to={academicAttendancePaths.statistics}>學生缺曠課查詢</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu><DropdownMenu modal={false}><DropdownMenuTrigger className="academic-attendance-menu">Index<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="academic-attendance-dropdown" align="end"><DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu></nav>
    <nav className="academic-attendance-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to="/school-affairs">Index</Link><span aria-hidden="true">›</span><Link to={academicAttendancePaths[view]}>{title}</Link></nav>
    <main className="academic-attendance-main" aria-busy={busy}>
      <h1 className="academic-attendance-heading"><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>{title} <small>» {detail?'缺曠課明細資料':'查詢當學期缺曠課之統計資料'}</small></h1>
      <div className="academic-attendance-data">
        <div className="academic-attendance-switch"><Link to={academicAttendancePaths[other]}>查詢當學期缺曠課{detail?'統計':'明細'} <i className="portal-icon" aria-hidden="true">{'\uf0a9'}</i></Link></div>
        {busy&&<p className="academic-attendance-state" role="status">載入缺曠課資料中…</p>}{error&&<p className="academic-attendance-error" role="alert">{error} <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}
        <div className="academic-attendance-scroll" role="region" aria-label={`${title}，可左右捲動`} tabIndex={0}><table className={`academic-attendance-table academic-attendance-${view}-table`} aria-label={title}>
          <colgroup>{widths.map((width,index)=><col key={index} style={{width:`${width/1026.6640625*100}%`}}/>)}</colgroup><thead><tr>{columns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{detail?current.details.map(row=><tr key={row.id}><td>{row.courseCode}</td><td>{row.courseTitle}</td><td>{row.teacherName??'—'}</td><td>{row.absenceTypeText??'—'}</td><td>{academicAttendanceCourseDate(row.courseDate)}</td><td>{row.periodText??'—'}</td><td>{academicAttendanceRollCall(row.rollCalledAt)}</td></tr>):current.statistics.map(row=><tr key={row.id}><td>{row.studentNumber??'—'}</td><td>{row.studentName??'—'}</td><td>{row.courseCode}</td><td>{row.courseTitle}</td><td>{row.totalTeachingHours??'—'}</td><td>{row.currentTeachingWeeks??'—'}</td><td>{row.currentTeachingHours??'—'}</td><td>{row.absenceHours??'—'}</td><td>{row.unexcusedAbsenceHours??'—'}</td></tr>)}</tbody>
        </table></div>
        {!busy&&!error&&snapshot&&!hasRows&&<p className="academic-attendance-state" role="status">{current.term?'目前沒有站內當學期缺曠課'+(detail?'明細':'統計')+'紀錄。':'尚未設定當學期。'}</p>}
        <p className="academic-attendance-datetime">Date/Time : {academicAttendanceTimestamp(snapshot?.checkedAt)}</p>
        <section className="academic-attendance-notes" aria-label="校方頁面說明（2026-11-13 擷取）"><hr/><ul>{academicAttendanceNotes[view].map(note=><li key={note}>{note}</li>)}</ul><hr/></section>
      </div>
    </main><footer className="academic-attendance-footer">Copyright @2026 樹德科技大學</footer>
  </div><div className="academic-attendance-bottom"><a href="#academic-attendance-top" aria-label="回到頁首"><i className="portal-icon" aria-hidden="true">{'\uf102'}</i></a></div></div>;
}
