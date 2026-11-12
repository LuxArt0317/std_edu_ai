import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {studentAidTimestamp} from '@/services/studentAid';
import {campusAssistantOpenEvent} from '../PublicAssistant';
import {referenceAsset} from '../site/reference';
import {useAffairsRecords} from './useAffairsRecords';
import {officialStudentAidUrl,studentAidInstructionsPath,studentAidPath} from './studentAidLinks.js';
import './studentAid.css';

export function StudentAidWorkspace({userId}:{userId:string}) {
  const {snapshot,loading,error,refresh}=useAffairsRecords(userId);
  const records=(snapshot?.studentAid?.records ?? []).filter(record=>record.userId===userId);
  return <div className="student-aid" lang="zh-Hant">
    <div className="student-aid-frame">
      <header className="student-aid-brand">
        <Link to={studentAidPath}><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22" height="24" alt=""/>生活輔導組不利處境學生助學管理系統</Link>
        <span>Shu-Te University</span>
      </header>
      <nav className="student-aid-nav" aria-label="助學系統選單">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost">學生<ChevronDown size={11} aria-hidden="true"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={studentAidPath}>不利處境學生助學申請</Link></DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" data-campus-assistant-menu>Index<ChevronDown size={11} aria-hidden="true"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to="/school-affairs">校務資訊系統</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>window.dispatchEvent(new Event(campusAssistantOpenEvent))}>校園助理</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to={studentAidInstructionsPath}>115-1 辦理須知（2026-11-03 擷取）</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><a href={officialStudentAidUrl} target="_blank" rel="noopener noreferrer">校方助學系統</a></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/school-affairs/signed-out">登出</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <nav className="student-aid-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to={studentAidPath}>Index</Link><span aria-hidden="true">›</span><span>不利處境學生助學申請</span></nav>
      <main className="student-aid-main">
        <header className="student-aid-heading"><h1><i className="portal-icon" aria-hidden="true">{'\uf19c'}</i>不利處境學生助學申請 <small>» 記錄清單</small></h1></header>
        <details className="student-aid-query"><summary><i className="portal-icon" aria-hidden="true">{'\uf002'}</i>查詢條件輸入</summary><div><h2>查詢條件輸入</h2></div></details>
        <p className="student-aid-query-hint"><i className="portal-icon" aria-hidden="true">{'\uf129'}</i>輸入關鍵字查詢符合條件記錄</p>
        <div className="student-aid-query-rule"/>
        {loading && !snapshot && <p role="status">載入紀錄中…</p>}
        {error && <p className="student-aid-error" role="alert">{error} <Button type="button" variant="outline" size="sm" onClick={refresh}>重新載入</Button></p>}
        <div className="student-aid-table-wrap" role="region" aria-label="不利處境學生助學紀錄" tabIndex={0}>
          <table><caption className="student-aid-sr-only">{records.length?`stu.best 站內示範助學紀錄，共 ${records.length} 筆`:'尚無助學紀錄'}</caption>
            <colgroup>{[56.46875,95.7890625,82.6875,69.578125,43.3671875,69.578125,82.6875,95.7890625,122.0078125,95.7890625,108.890625,43.3671875,43.3671875,69.6328125].map((width,index)=><col key={index} style={{width:width+'px'}}/>)}</colgroup>
            <thead><tr>{['申請者','學生中文姓名','身分證字號','科系名稱','手機','申請類型','關係人數量','實際補助金額','學生紀錄鎖住狀態','學校審核狀態','教育部審核狀態','學年','學期','資料操作'].map(title=><th scope="col" key={title}>{title}</th>)}</tr></thead>
            <tbody>{records.map(record=><tr key={record.id}>
              <td>{record.applicantLabel}</td><td>{record.studentName}</td><td>{record.maskedIdentityNumber ?? '—'}</td>
              <td>{record.departmentName ?? '—'}</td><td>{record.phone ?? '—'}</td><td>{record.applicationKind}</td>
              <td>{record.relativeCount ?? '—'}</td><td>{record.subsidyAmount==null?'—':record.subsidyAmount.toLocaleString('zh-TW',{maximumFractionDigits:2})}</td>
              <td>{record.studentRecordLocked==null?'—':record.studentRecordLocked?'已鎖定':'未鎖定'}</td>
              <td>{record.schoolReviewStatus ?? '—'}</td><td>{record.ministryReviewStatus ?? '—'}</td>
              <td>{record.academicYear}</td><td>{record.semester}</td><td>—</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="student-aid-datetime">Date/Time：{snapshot?studentAidTimestamp(snapshot.checkedAt):'—'}</p>
        <section className="student-aid-eligibility" aria-label="校方頁面說明（2026-11-12 擷取）">
          <h2><i className="portal-icon" aria-hidden="true">{'\uf129'}</i>申請資格說明</h2>
          <ol><li>延修生或碩士在職專班學生，不具備申請資格!(若有問題，請洽生活輔導組-2126-)</li>
            <li>前一學期學業成績平均未達60分以上之學生，不具備申請資格!!!</li></ol>
        </section>
      </main>
    </div>
    <footer className="student-aid-footer">stu.best · 站內示範紀錄</footer>
  </div>;
}
