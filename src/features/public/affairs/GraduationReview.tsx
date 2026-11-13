import {Fragment,useId,useState,type ReactNode} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import type {AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {academicGradeLinks,academicGradePaths} from '@/services/academicGrades';
import {graduationCategoryColumns,graduationDetailIds,graduationLanguageColumns,graduationOtherCourseColumns,graduationRequirementColumns,graduationReviewNotes,graduationReviewTimestamp,ownGraduationReview,type GraduationRequirementCategory,type GraduationReviewRecords,type GraduationReviewReport,type GraduationStatusIndicator,type GraduationStatusValue} from '@/services/graduationReview';
import {referenceAsset} from '../site/reference';
import './academicGrades.css';
import './graduationReview.css';

export type GraduationReviewSnapshot=AffairsSnapshot&{graduationReview?:GraduationReviewRecords};
export type GraduationReviewProps={snapshot:GraduationReviewSnapshot|null;busy:boolean;error?:string;onReload:()=>void;onLogout:()=>void};
const pageTitle='學生畢業學分檢核表';

function Indicator({value}:{value:GraduationStatusIndicator}) {
  if(value===null)return null;
  return <span className={`graduation-review-indicator ${value}`} role="img" aria-label={value==='passed'?'通過指示':'注意指示'}><i className="portal-icon" aria-hidden="true">{value==='passed'?'\uf058':'\uf071'}</i></span>;
}
function Status({value,iconOnly=false}:{value:GraduationStatusValue;iconOnly?:boolean}) {
  return <span className="graduation-review-status"><span className={iconOnly&&value.indicator?'graduation-review-sr-only':undefined}>{value.text??(value.indicator&&iconOnly?'':'—')}</span><Indicator value={value.indicator}/></span>;
}
function ScrollTable({label,children}:{label:string;children:ReactNode}) {
  return <div className="graduation-review-scroll" role="region" aria-label={`${label}，可左右捲動`} tabIndex={0}>{children}</div>;
}
function GraduateIcon() {
  return <i className="graduation-review-graduate" aria-hidden="true">{'\uf501'}</i>;
}
function ReportIdentity({report}:{report:GraduationReviewReport}) {
  const identity=report.identity;
  const rows:readonly [string,ReactNode,string,ReactNode][]=[
    ['學號',identity.studentNumber??'—','姓名',identity.studentName??'—'],
    ['系所',identity.departmentName??'—','年級',identity.yearText??'—'],
    ['就學狀態',identity.enrollmentStatusText??'—','適用課程屆別',identity.curriculumCohortText??'—'],
    ['雙主修',identity.doubleMajorText??'—','輔系',identity.minorText??'—'],
    ['是否修習教育學程',<Status key="education" value={report.educationProgram}/>,'是否修畢專業英文或實用外語課程',<Status key="foreign-language" value={report.foreignLanguageCompletion}/>],
    ['英文能力畢業門檻',<Status key="english" value={report.englishRequirement}/>,'是否通過畢業學分檢核',<Fragment key="review"><Status value={report.graduationReview}/>{report.graduationReview.note!==null&&<div className="graduation-review-status-note">{report.graduationReview.note}</div>}</Fragment>],
  ];
  return <ScrollTable label="畢業檢核學籍資料"><table className="graduation-review-table graduation-review-identity" aria-label="畢業檢核學籍資料"><colgroup><col style={{width:'16.6666667%'}}/><col style={{width:'33.3333333%'}}/><col style={{width:'16.6666667%'}}/><col style={{width:'33.3333333%'}}/></colgroup><tbody>{rows.map(([firstLabel,firstValue,secondLabel,secondValue])=><tr key={firstLabel}><th scope="row">{firstLabel}</th><td>{firstValue}</td><th scope="row">{secondLabel}</th><td>{secondValue}</td></tr>)}</tbody></table></ScrollTable>;
}
function RequirementTable({category}:{category:GraduationRequirementCategory}) {
  return <div className="graduation-review-detail-panel"><table className="graduation-review-table graduation-review-requirements" aria-label={`${category.label} ${category.requiredElectiveText??''}應修與實際修習課程`}>
    <thead><tr>{graduationRequirementColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>{category.requirements.map(requirement=><Fragment key={requirement.id}>
      <tr className="graduation-review-required"><td>{requirement.sequenceText??''}</td><td>{requirement.title}<Indicator value={requirement.indicator}/></td><td>{requirement.moduleText??''}</td><td>{requirement.credits??'—'}</td><td>{requirement.requiredElectiveText??''}</td><td>{requirement.yearText??''}</td><td>{requirement.transferText??''}</td></tr>
      {requirement.matchedCourses.map(course=><tr className="graduation-review-matched" key={course.id}><td>{course.sequenceText??''}</td><td><i className="portal-icon" aria-hidden="true">{'\uf02d'}</i>{course.title}</td><td/><td>{course.credits??'—'}</td><td>{course.requiredElectiveText??''}</td><td>{course.yearText??''}</td><td>{course.transferText??''}</td></tr>)}
    </Fragment>)}
      {category.detailSubtotalCredits!==null&&<tr className="graduation-review-subtotal"><td colSpan={3}>學分小計</td><td>{category.detailSubtotalCredits}</td><td colSpan={3}/></tr>}
    </tbody>
  </table></div>;
}
function ReportBody({report}:{report:GraduationReviewReport}) {
  const [expanded,setExpanded]=useState<ReadonlySet<string>>(()=>new Set());
  const prefix=useId(),detailIds=graduationDetailIds(report),available=new Set(detailIds);
  const allExpanded=detailIds.length>0&&detailIds.every(id=>expanded.has(id));
  const toggle=(id:string)=>setExpanded(previous=>{const next=new Set([...previous].filter(key=>available.has(key)));if(next.has(id))next.delete(id);else next.add(id);return next;});
  return <div className="graduation-review-data-row"><div className="graduation-review-data">
    <ReportIdentity report={report}/><hr/>
    <ScrollTable label="外語課程檢核"><table className="graduation-review-table graduation-review-language" aria-label="外語課程檢核"><colgroup><col style={{width:'36%'}}/>{[0,1,2,3].map(index=><col key={index} style={{width:'16%'}}/>)}</colgroup><thead><tr>{graduationLanguageColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{report.languageRequirements.map(row=><tr key={row.id}><td>{row.label}</td><td>{row.status.text??'—'}</td><td>{row.requiredCredits??'—'}</td><td>{row.matchedCredits??'—'}</td><td>{row.missingCredits??'—'}</td></tr>)}</tbody></table></ScrollTable><hr/>
    <ScrollTable label="編程學分檢核"><table className="graduation-review-table graduation-review-categories" aria-label="編程學分檢核">
      <colgroup>{[148.34375,84.6796875,103.15625,103.15625,103.15625,158.578125,66.34375,60].map((width,index)=><col key={index} style={{width:`${width/827.4140625*100}%`}}/>)}</colgroup>
      <thead><tr>{graduationCategoryColumns.map(column=><th scope="col" key={column}>{column}</th>)}<th scope="col"><button type="button" className="graduation-review-disclosure" aria-label={allExpanded?'收合全部資料明細':'展開全部資料明細'} aria-expanded={allExpanded} disabled={!detailIds.length} onClick={()=>setExpanded(allExpanded?new Set():new Set(detailIds))}><i className="portal-icon" aria-hidden="true">{allExpanded?'\uf102':'\uf103'}</i></button></th></tr></thead>
      <tbody>{report.categories.map((category,index)=>{
        const canExpand=available.has(category.id),open=canExpand&&expanded.has(category.id),id=`${prefix}-category-${index}`;
        return <Fragment key={category.id}><tr className="graduation-review-category"><td>{category.label}</td><td>{category.requiredElectiveText??''}</td><td>{category.requiredCredits??'—'}</td><td>{category.completedCredits??'—'}</td><td>{category.matchedCredits??'—'}</td><td>{category.excludedCredits??'—'}</td><td><Status value={category.status} iconOnly/></td><td>{canExpand&&<button type="button" className="graduation-review-disclosure" aria-label={`${open?'收合':'展開'}${category.label}${category.requiredElectiveText?` ${category.requiredElectiveText}`:''}資料明細`} aria-expanded={open} aria-controls={id} onClick={()=>toggle(category.id)}><i className="portal-icon" aria-hidden="true">{open?'\uf102':'\uf103'}</i></button>}</td></tr>
          {canExpand&&<tr className="graduation-review-detail-row" hidden={!open} id={id}><td colSpan={8}>{open&&<RequirementTable category={category}/>}</td></tr>}
        </Fragment>;
      })}</tbody>
    </table></ScrollTable><hr/>
    <h2 className="graduation-review-other-heading"><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>其他修習課程（含多修、待對應及不採計）</h2>
    <ScrollTable label="其他修習課程"><table className="graduation-review-table graduation-review-other" aria-label="其他修習課程"><colgroup>{[54.921875,448.984375,75.1015625,98.1953125,75.1015625,75.109375].map((width,index)=><col key={index} style={{width:`${width/827.4140625*100}%`}}/>)}</colgroup><thead><tr>{graduationOtherCourseColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{report.otherCourses.map(course=><tr key={course.id}><td>{course.sequenceText??''}</td><td>{course.title}</td><td>{course.credits??'—'}</td><td>{course.requiredElectiveText??''}</td><td>{course.yearText??''}</td><td>{course.transferText??''}</td></tr>)}</tbody></table></ScrollTable>
    <p className="academic-grades-datetime">Date/Time : {graduationReviewTimestamp(report.reportedAt)}</p>
    <section className="graduation-review-notes" aria-label="系統說明"><h2><i className="portal-icon" aria-hidden="true">{'\uf05a'}</i>系統說明</h2><ul>{graduationReviewNotes.map(note=><li key={note}>{note}</li>)}<li><span className="graduation-review-asterisk">*</span> 表示全學年課程。</li><li>請點選 <i className="portal-icon graduation-review-notes-chevron" aria-hidden="true">{'\uf103'}</i><span className="graduation-review-sr-only">展開按鈕</span> 開啟資料明細內容。</li></ul></section>
  </div></div>;
}

export function GraduationReview({snapshot,busy,error,onReload,onLogout}:GraduationReviewProps) {
  const report=ownGraduationReview(snapshot?.graduationReview,snapshot?.profile.userId??'');
  return <div className="academic-grades graduation-review" id="graduation-review-top" lang="zh-Hant"><div className="academic-grades-shell">
    <header className="academic-grades-brand"><Link to={academicGradePaths.index}><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22.3" height="24" alt=""/>教務應用服務系統</Link><span>Shu-Te University</span></header>
    <nav className="academic-grades-nav" aria-label="學生成績選單"><DropdownMenu modal={false}><DropdownMenuTrigger className="academic-grades-menu">學生成績<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end">{academicGradeLinks.filter(link=>link.view!=='graduation').map(link=><DropdownMenuItem asChild key={link.view}><Link to={academicGradePaths[link.view]}>{link.label}</Link></DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem asChild><Link to={academicGradePaths.index}>成績功能選項</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu><DropdownMenu modal={false}><DropdownMenuTrigger className="academic-grades-menu">Index<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={academicGradePaths.index}>Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu></nav>
    <nav className="academic-grades-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to={academicGradePaths.index}>Index</Link><span aria-hidden="true">›</span><span>{pageTitle}</span></nav>
    <main className="academic-grades-main graduation-review-main" aria-busy={busy}><div className="graduation-review-content">
      <header className="graduation-review-heading"><div><GraduateIcon/><h1>{pageTitle}</h1></div><p><span><i className="portal-icon" aria-hidden="true">{'\uf017'}</i>資料最後更新於</span><br/>{graduationReviewTimestamp(report?.reportedAt)}</p></header>
      {busy&&<p className="academic-grades-state" role="status">載入畢業檢核資料中…</p>}
      {error&&<p className="academic-grades-error" role="alert">{error} <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}
      {!busy&&!error&&snapshot&&!report&&<p className="graduation-review-empty" role="status">目前沒有站內畢業學分檢核紀錄。</p>}
      {report&&<ReportBody key={`${report.userId}:${report.id}`} report={report}/>}
    </div></main>
    <footer className="academic-grades-footer">Copyright @2026 樹德科技大學</footer>
  </div><div className="academic-grades-bottom"><a href="#graduation-review-top" aria-label="回到頁首"><i className="portal-icon" aria-hidden="true">{'\uf102'}</i></a></div></div>;
}
