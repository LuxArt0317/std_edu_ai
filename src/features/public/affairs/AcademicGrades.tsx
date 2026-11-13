import {Fragment} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import type {AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {academicGradeLinks,academicGradeMetadata,academicGradeNotes,academicGradePaths,academicGradeRankings,academicGradeTermLabel,academicGradeTerms,academicGradeTimestamp,academicGradeYearLabel,academicRankingColumns,academicSemesterLabel,academicTranscriptColumns,academicWarningColumns,academicWarningSummaryLabels,academicWarningTerm,type AcademicGradesRecords,type AcademicGradesView,type AcademicGradeTerm} from '@/services/academicGrades';
import {referenceAsset} from '../site/reference';
import './academicGrades.css';

export type AcademicGradesSnapshot=AffairsSnapshot&{academicGrades?:AcademicGradesRecords};
export type AcademicGradesProps={snapshot:AcademicGradesSnapshot|null;busy:boolean;error?:string;onReload:()=>void;onLogout:()=>void;view:AcademicGradesView};
const titleByView={index:'成績功能選項',transcript:'歷年成績查詢',warning:'預警成績查詢',ranking:'學期排名查詢',transfer:'抵免課程學分查詢',cycle:'循環式課程梯次成績查詢',current:'當學期成績查詢'};
const descriptionByView={index:'學生各項成績查詢',transcript:'查詢各學期成績',warning:'查詢期中預警成績',ranking:'查詢各學期班排名及系排名',transfer:'查詢核定抵免科目學分',cycle:'查詢各梯次分級考成績',current:'查詢老師上傳但未確認成績'};
const listIcon=<i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>;

function GradeIndex() {
  const rows=[{label:'課程成績',views:['current','transcript','warning','ranking']},{label:'抵免課程學分',views:['transfer']},{label:'循環式課程成績',views:['cycle']},{label:'畢業學分檢核',views:['graduation']}];
  return <>
    <div className="academic-grade-index-wrap"><table className="academic-grade-index-table" aria-label="成績功能選項"><colgroup><col style={{width:'14.2857%'}}/><col/></colgroup><tbody>{rows.map(row=><tr key={row.label}><th scope="row">{row.label}</th><td>{row.views.map(view=>{
      const item=academicGradeLinks.find(link=>link.view===view)!;
      return <span className={`academic-grade-index-badge ${view}`} key={view}><Link to={academicGradePaths[item.view]}>{item.label}</Link></span>;
    })}</td></tr>)}</tbody></table></div>
    <section className="academic-grade-notes academic-grade-index-notes" aria-label="功能說明"><hr/><ul>{academicGradeLinks.filter(link=>link.description).map(link=><li key={link.view}>{link.label}：{link.description}</li>)}</ul><hr/></section>
  </>;
}

function TranscriptTable({terms}:{terms:AcademicGradeTerm[]}) {
  return <div className="academic-grade-table-wrap" role="region" aria-label="學生歷年成績明細表，可左右捲動" tabIndex={0}><table className="academic-grade-table academic-grade-transcript-table" aria-label="學生歷年成績明細表">
    <colgroup>{[196.203125,273.71875,129.8125,104.8203125,78.28125,78.28125,78.28125].map((width,index)=><col key={index} style={{width:`${width/939.3984375*100}%`}}/>)}</colgroup>
    <thead><tr>{academicTranscriptColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>{terms.map(term=><Fragment key={`${term.academicYear}:${term.semester}`}>
      {term.records.map((record,index)=><tr key={record.id}><td>{index===0?academicGradeTermLabel(term.academicYear,term.semester):''}</td><td>{record.courseTitle}</td><td>{record.categoryText??''}</td><td>{record.moduleName??''}</td><td>{record.requiredElectiveText??''}</td><td>{record.credits??'—'}</td><td className={record.gradeText==='棄選'?'academic-grade-value withdrawn':'academic-grade-value'}>{record.gradeText??'—'}</td></tr>)}
      <tr className="academic-grade-term-summary"><td colSpan={7}>
        {!term.records.length&&<span className="academic-grade-summary-term">{academicGradeTermLabel(term.academicYear,term.semester)}</span>}
        <i className="portal-icon" aria-hidden="true">{'\uf101'}</i> 實得學分 <span className="academic-grade-number">{term.summary?.earnedCredits??'—'}</span>　平均成績 <span className="academic-grade-number">{term.summary?.averageGradeText??'—'}</span>
      </td></tr>
    </Fragment>)}</tbody>
  </table></div>;
}

function WarningTable({term}:{term:AcademicGradeTerm|null}) {
  return <>
    <div className="academic-grade-table-wrap" role="region" aria-label="預警成績明細表，可左右捲動" tabIndex={0}><table className="academic-grade-table academic-grade-warning-table" aria-label="預警成績明細表">
      <colgroup>{[275.1328125,361.375,114.4375,89.4765625,89.4921875].map((width,index)=><col key={index} style={{width:`${width/929.9140625*100}%`}}/>)}</colgroup>
      <thead><tr>{academicWarningColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{term?.records.map(record=><tr key={record.id}><td>{record.courseCode??'—'}</td><td>{record.courseTitle}</td><td>{record.credits??'—'}</td><td>{record.gradeText??'—'}</td><td>{record.remarkText??''}</td></tr>)}</tbody>
    </table></div>
    {term&&<div className="academic-grade-warning-totals" aria-label="預警學分統計"><i className="portal-icon" aria-hidden="true">{'\uf101'}</i>{[term.summary?.attemptedCredits,term.summary?.passedCredits,term.summary?.failedCredits].map((value,index)=><span key={academicWarningSummaryLabels[index]}>{academicWarningSummaryLabels[index]} <span className="academic-grade-number">{value??'—'}</span></span>)}</div>}
  </>;
}

export function AcademicGrades({snapshot,busy,error,onReload,onLogout,view}:AcademicGradesProps) {
  const userId=snapshot?.profile.userId??'',data=snapshot?.academicGrades;
  const terms=academicGradeTerms(data,userId,'transcript'),warning=academicWarningTerm(data,userId),rankings=academicGradeRankings(data,userId),metadata=academicGradeMetadata(data,userId);
  const isNotice=view==='transfer'||view==='cycle'||view==='current';
  const isResults=view==='transcript'||view==='warning'||view==='ranking';
  const name=snapshot?.student?.fullName||snapshot?.profile.displayName||'—';
  const hasRecords=view==='transcript'?terms.length>0:view==='warning'?Boolean(warning):rankings.length>0;
  const notice=view==='current'?'目前尚無可查詢的當學期成績。':`查無同學的${view==='transfer'?'抵免課程':'循環式課程梯次成績'}記錄，如有疑問，請洽教務處註冊課務組詢問，電話(07)6158000分機 2009、2010、2012、2016`;
  return <div className="academic-grades" id="academic-grades-top" lang="zh-Hant">
    <div className="academic-grades-shell">
      <header className="academic-grades-brand"><Link to={academicGradePaths.index}><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22.3" height="24" alt=""/>教務應用服務系統</Link><span>Shu-Te University</span></header>
      <nav className="academic-grades-nav" aria-label="學生成績選單">
        <DropdownMenu modal={false}><DropdownMenuTrigger className="academic-grades-menu">學生成績<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end">
          {academicGradeLinks.filter(link=>link.view!=='graduation').map(link=><DropdownMenuItem asChild key={link.view}><Link to={academicGradePaths[link.view]}>{link.label}</Link></DropdownMenuItem>)}
          <DropdownMenuSeparator/><DropdownMenuItem asChild><Link to={academicGradePaths.index}>成績功能選項</Link></DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <DropdownMenu modal={false}><DropdownMenuTrigger className="academic-grades-menu">Index<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={academicGradePaths.index}>Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </nav>
      <nav className="academic-grades-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to={academicGradePaths.index}>Index</Link>{!isNotice&&<><span aria-hidden="true">›</span><span>{titleByView[view]}</span></>}</nav>
      <main className={`academic-grades-main${isNotice?' academic-grades-notice-main':''}`} aria-busy={busy}>
        {!isNotice&&<h1 className="academic-grades-heading">{listIcon}{titleByView[view]} <small>» {descriptionByView[view]}</small></h1>}
        <div className={isNotice?'academic-grades-notice-content':'academic-grades-data'}>
          {busy&&<p role="status" className="academic-grades-state">載入成績資料中…</p>}
          {error&&<p role="alert" className="academic-grades-error">{error} <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}
          {view==='index'&&<GradeIndex/>}
          {isNotice&&snapshot&&!busy&&!error&&<>
            <div className="academic-grades-notice-message" role="status">{notice}</div>
            <p className="academic-grades-notice-contact">如有任何問題請與系統負責單位連絡 教務處註冊課務組 ext: 2009</p>
            <div className="academic-grades-notice-return"><Link to={academicGradePaths.index}><i className="portal-icon" aria-hidden="true">{'\uf060'}</i> 回到系統</Link></div>
          </>}
          {isResults&&snapshot&&<>
            <div className="academic-grades-grid-row"><section className={`academic-grades-result ${view}`} aria-label={titleByView[view]}>
              <h2 className="academic-grades-student">{listIcon}學籍基本資料【 學號：{snapshot.student?.studentNumber||'—'} ｜ 姓名：{name} ｜ 系科所：{snapshot.student?.program||'—'} ｜ 年級：{academicGradeYearLabel(snapshot.student?.yearLevel)} ｜ 班級：{metadata?.classLabel??'—'}】</h2>
              <h2>{listIcon}{view==='transcript'?'學生歷年成績明細表':view==='warning'?'預警成績明細表':'各學期排名明細表'}</h2>
              {view==='transcript'&&<TranscriptTable terms={terms}/>}
              {view==='warning'&&<WarningTable term={warning}/>}
              {view==='ranking'&&<div className="academic-grade-table-wrap" role="region" aria-label="各學期排名明細表，可左右捲動" tabIndex={0}><table className="academic-grade-table academic-grade-ranking-table" aria-label="各學期排名明細表"><colgroup>{[12.5533,12.5533,37.4458,37.4476].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr>{academicRankingColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{rankings.map(row=><tr key={row.id}><td>{row.academicYear}</td><td>{academicSemesterLabel(row.semester)}</td><td>{row.departmentRankingText??'—'}</td><td>{row.classRankingText??'—'}</td></tr>)}</tbody></table></div>}
              {!busy&&!error&&!hasRecords&&<p className="academic-grades-state" role="status">目前沒有站內{titleByView[view].replace('查詢','')}紀錄。</p>}
              {view==='transcript'&&<p className="academic-grade-english"><span>英文能力畢業門檻：{metadata?.englishRequirementText??'—'}</span></p>}
              <p className="academic-grades-datetime">Date/Time : {academicGradeTimestamp(snapshot.checkedAt)}</p>
              <div className="academic-grades-return"><i className="portal-icon" aria-hidden="true">{'\uf105'}</i> <Link to={academicGradePaths.index}>回成績功能選項</Link></div>
            </section></div>
            <section className="academic-grade-notes" aria-label="校方頁面說明（2026-11-12 擷取）"><hr/><ul>{academicGradeNotes[view].map(note=><li key={note}>{note}</li>)}</ul><hr/></section>
          </>}
        </div>
      </main>
      <footer className="academic-grades-footer">Copyright @2026 樹德科技大學</footer>
    </div>
    <div className="academic-grades-bottom"><a href="#academic-grades-top" aria-label="回到頁首"><i className="portal-icon" aria-hidden="true">{'\uf102'}</i></a></div>
  </div>;
}
