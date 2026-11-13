import {Fragment,useId,useState,type ReactNode} from 'react';
import {Link} from 'react-router';
import type {AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {graduationDetailIds,graduationLanguageColumns,ownGraduationReview,type GraduationRequirementCategory,type GraduationReviewRecords,type GraduationReviewReport,type GraduationStatusIndicator,type GraduationStatusValue} from '@/services/graduationReview';
import './legacyGraduationReview.css';

export type LegacyGraduationReviewSnapshot=AffairsSnapshot&{graduationReview?:GraduationReviewRecords};
export type LegacyGraduationReviewProps={snapshot:LegacyGraduationReviewSnapshot|null;busy:boolean;error?:string;onReload:()=>void};
const assets={logo:'/school-assets/03599fb12dbe1c0d2b5c.png',attention:'/school-assets/ba103f41fe0ee059b99b.gif',passed:'/school-assets/01b600b441302c9b892f.gif',actual:'/school-assets/4bd0c7cd8dc640cface9.png'} as const;
const categoryColumns=['課程類別','必/選','應修學分','已修學分','符合學分','不計入此類學分','通過'];
const requirementColumns=['#','應修習課程','模組','學分','必/選修','年級','抵免'];
const otherColumns=['#','實際修習課程','學分','必/選修','年級','抵免'];
const notes=[
  '此檢核表僅提供您做為畢業資格審核參考，是否符合畢業資格仍以實際規定之畢業條件為準。',
  '檢核時除檢查各應修課程是否有對應到實際已修課程，且應注意符合學分是否與應修學分相同。（修習替代課程以及曾辦理免修者請特別留意）',
  '若有任何檢核之問題，請於開學一週內至系上或教務處(分機：2009、2010、2012、2016)或進修專校(分機2512)詢問，以免影響自身之權益。',
  '* 表示全學年課程。',
] as const;

function Indicator({value}:{value:GraduationStatusIndicator}){
  return value===null?null:<img className="legacy-graduation-indicator" src={assets[value]} width="24" height="24" alt={value==='passed'?'通過':'未通過'}/>;
}
function Status({value,iconOnly=false}:{value:GraduationStatusValue;iconOnly?:boolean}){
  return <span className="legacy-graduation-status"><span className={iconOnly&&value.indicator?'legacy-graduation-sr-only':undefined}>{value.text??(iconOnly&&value.indicator?'':'—')}</span><Indicator value={value.indicator}/></span>;
}
function ScrollTable({label,children}:{label:string;children:ReactNode}){
  return <div className="legacy-graduation-scroll" role="region" aria-label={`${label}，可左右捲動`} tabIndex={0}>{children}</div>;
}
function Identity({report}:{report:GraduationReviewReport}){
  const identity=report.identity;
  const fields:readonly [string,string|null][]=[['學號',identity.studentNumber],['姓名',identity.studentName],['系別',identity.departmentName],['年級',identity.yearText],['就學狀態',identity.enrollmentStatusText],['適用課程屆別',identity.curriculumCohortText],['雙主修',identity.doubleMajorText],['輔系',identity.minorText]];
  return <div className="legacy-graduation-identity" aria-label="畢業檢核學籍資料"><p>{fields.map(([label,value],index)=><Fragment key={label}>{index>0&&' | '}<span>{label}: {value??'—'}</span></Fragment>)}</p>
    <p>是否修習教育學程: <Status value={report.educationProgram}/>{' | '}是否修畢專業英文或實用外語課程: <Status value={report.foreignLanguageCompletion}/>{' | '}英文能力畢業門檻: <Status value={report.englishRequirement}/></p>
    <p>是否通過畢業學分檢核: <Status value={report.graduationReview}/>{report.graduationReview.note!==null&&<>（{report.graduationReview.note}）</>}</p>
  </div>;
}
function Requirements({category}:{category:GraduationRequirementCategory}){
  return <table className="legacy-graduation-table legacy-graduation-requirements" aria-label={`${category.label} ${category.requiredElectiveText??''}應修與實際修習課程`}><thead><tr>{requirementColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>{category.requirements.map((requirement,index)=><Fragment key={requirement.id}><tr className={`legacy-graduation-required ${index%2?'even':'odd'}`}><td>{requirement.sequenceText??''}</td><td>{requirement.title}<Indicator value={requirement.indicator}/></td><td>{requirement.moduleText??''}</td><td>{requirement.credits??'—'}</td><td>{requirement.requiredElectiveText??''}</td><td>{requirement.yearText??''}</td><td>{requirement.transferText??''}</td></tr>
      {requirement.matchedCourses.map(course=><tr className="legacy-graduation-matched" key={course.id}><td>{course.sequenceText??''}</td><td><img src={assets.actual} width="16" height="16" alt="實際修習："/>{course.title}</td><td/><td>{course.credits??'—'}</td><td>{course.requiredElectiveText??''}</td><td>{course.yearText??''}</td><td>{course.transferText??''}</td></tr>)}</Fragment>)}
      {category.detailSubtotalCredits!==null&&<tr className="legacy-graduation-subtotal"><td colSpan={3}>學分小計</td><td>{category.detailSubtotalCredits}</td><td colSpan={3}/></tr>}
    </tbody></table>;
}
function ReportBody({report}:{report:GraduationReviewReport}){
  const [expanded,setExpanded]=useState<ReadonlySet<string>>(()=>new Set());
  const prefix=useId(),ids=graduationDetailIds(report),available=new Set(ids);
  const toggle=(id:string)=>setExpanded(previous=>{const next=new Set([...previous].filter(value=>available.has(value)));if(next.has(id))next.delete(id);else next.add(id);return next;});
  return <div className="legacy-graduation-data"><Identity report={report}/><hr className="legacy-graduation-identity-rule"/>
    <ScrollTable label="外語課程檢核"><table className="legacy-graduation-table legacy-graduation-language" aria-label="外語課程檢核"><thead><tr>{graduationLanguageColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{report.languageRequirements.map((row,index)=><tr key={row.id} className={index%2?'even':'odd'}><td>{row.label}</td><td>{row.status.text??'—'}</td><td>{row.requiredCredits??'—'}</td><td>{row.matchedCredits??'—'}</td><td>{row.missingCredits??'—'}</td></tr>)}</tbody></table></ScrollTable><hr/>
    <ScrollTable label="課程類別學分檢核"><table className="legacy-graduation-table legacy-graduation-categories" aria-label="課程類別學分檢核"><thead><tr>{categoryColumns.map(column=><th scope="col" key={column}>{column}</th>)}<th scope="col" aria-label="資料明細"><button type="button" className="legacy-graduation-expand-all" aria-label="展開全部資料明細" disabled={!ids.length} onClick={()=>setExpanded(new Set(ids))}/><button type="button" className="legacy-graduation-collapse-all" aria-label="收合全部資料明細" disabled={!ids.length} onClick={()=>setExpanded(new Set())}/></th></tr></thead><tbody>{report.categories.map((category,index)=>{
      const canExpand=available.has(category.id),open=canExpand&&expanded.has(category.id),id=`${prefix}-detail-${index}`;
      return <Fragment key={category.id}><tr className={`legacy-graduation-category${open?' selected':''}`}><td>{category.label}</td><td>{category.requiredElectiveText??''}</td><td>{category.requiredCredits??'—'}</td><td>{category.completedCredits??'—'}</td><td>{category.matchedCredits??'—'}</td><td>{category.excludedCredits??'—'}</td><td><Status value={category.status} iconOnly/></td><td>{canExpand&&<button type="button" className={`legacy-graduation-toggle${open?' open':''}`} aria-label={`${open?'收合':'展開'}${category.label}${category.requiredElectiveText?` ${category.requiredElectiveText}`:''}資料明細`} aria-controls={id} aria-expanded={open} onClick={()=>toggle(category.id)}/>}</td></tr>
        {canExpand&&<tr className="legacy-graduation-detail-row" id={id} hidden={!open}><td colSpan={8}>{open&&<Requirements category={category}/>}</td></tr>}
      </Fragment>;
    })}</tbody></table></ScrollTable><hr/>
    <h2 className="legacy-graduation-other-heading">其他修習課程（含多修、待對應及不採計）</h2><ScrollTable label="其他修習課程"><table className="legacy-graduation-table legacy-graduation-other" aria-label="其他修習課程"><thead><tr>{otherColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{report.otherCourses.map((course,index)=><tr key={course.id} className={index%2?'even':'odd'}><td>{course.sequenceText??''}</td><td>{course.title}</td><td>{course.credits??'—'}</td><td>{course.requiredElectiveText??''}</td><td>{course.yearText??''}</td><td>{course.transferText??''}</td></tr>)}</tbody></table></ScrollTable><hr/>
    <section className="legacy-graduation-notes" aria-label="注意事項及說明"><h2>注意事項及說明</h2><ol>{notes.map(note=><li key={note}>{note}</li>)}<li>請點選<span className="legacy-graduation-note-arrow" aria-hidden="true"/><span className="legacy-graduation-sr-only">展開按鈕</span>開啟資料明細內容</li></ol></section>
  </div>;
}
export function LegacyGraduationReview({snapshot,busy,error,onReload}:LegacyGraduationReviewProps){
  const report=ownGraduationReview(snapshot?.graduationReview,snapshot?.profile.userId??'','legacy');
  return <div className="legacy-graduation" id="legacy-graduation-top" lang="zh-Hant"><div className="legacy-graduation-shell"><header className="legacy-graduation-header"><div className="legacy-graduation-banner"><span>Campus Information Services</span><span>Shu-Te University</span></div><div className="legacy-graduation-heading"><img src={assets.logo} width="42" height="42" alt="Logo"/><h1>畢業檢核表</h1></div></header>
    <div className="legacy-graduation-content-frame"><main className="legacy-graduation-content" aria-busy={busy}>{busy&&<p className="legacy-graduation-state" role="status">載入畢業檢核資料中…</p>}{error&&<p className="legacy-graduation-error" role="alert">{error} <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}{!busy&&!error&&snapshot&&!report&&<p className="legacy-graduation-state" role="status">目前沒有站內舊版畢業檢核紀錄。</p>}{report&&<ReportBody key={`${report.userId}:${report.id}`} report={report}/>}
      <div className="legacy-graduation-back-top"><a href="#legacy-graduation-top" aria-label="回到頁首">top</a></div>
    </main></div></div><footer className="legacy-graduation-footer"><p><Link to="/">學校首頁</Link>{' '}<Link to="/school-affairs">mySTU</Link></p><p>© 2012 Shu-Te University | 07-6158000#2401</p><p>For processing problems, please call 6158000-2401 or e-mail info@stu.edu.tw.</p></footer></div>;
}
