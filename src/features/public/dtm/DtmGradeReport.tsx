import {dtmGradeLiteral,dtmGradeUuid,parseDtmGradeReport,type DtmGradeCells,type DtmGradeReportData} from '@/services/dtmGradeReport';
import type {DtmTranslate} from './locale';
import './dtmGradeReport.css';

export type DtmGradeReportProps={
  userId:string;course:{id:string;userId:string;title:string}|null;data:DtmGradeReportData|null;
  busy?:boolean;error?:string|null;onReload?:()=>void;t?:DtmTranslate;
};
const chinese:DtmTranslate=zh=>zh;
function Cells({value}:{value:DtmGradeCells}){
  return <><td>{dtmGradeLiteral(value.weightText)}{value.weightNote!==null&&<span className="dtm-literal-grade-weight-note">{value.weightNote}</span>}</td>
    <td>{dtmGradeLiteral(value.gradeText)}</td><td>{dtmGradeLiteral(value.rangeText)}</td><td>{dtmGradeLiteral(value.percentageText)}</td>
    <td>{dtmGradeLiteral(value.rankText)}</td><td>{dtmGradeLiteral(value.feedbackText)}</td><td>{dtmGradeLiteral(value.contributionText)}</td></>;
}
/** A literal, caller/course-bound report. Personal tracker grades are never inputs. */
export function DtmGradeReport({userId,course,data,busy=false,error,onReload,t=chinese}:DtmGradeReportProps){
  let report:DtmGradeReportData['report']=null,valid=false;
  const own=Boolean(dtmGradeUuid(userId)&&course&&course.userId===userId&&dtmGradeUuid(course.id)&&typeof course.title==='string');
  if(own&&data)try{report=parseDtmGradeReport(data,userId,course!.id).report;valid=true;}catch{/* Invalid data stays unavailable, never an empty report. */}
  if(error||!own||!valid||!report)return <div className="dtm-literal-grade-state" aria-busy={busy}>
    <p role={error?'alert':'status'}>{busy?t('載入成績報告中…','Loading grade report…'):error||t('目前無法取得成績報告。','Grade report unavailable.')}</p>
    {!busy&&onReload&&<button type="button" onClick={onReload}>{t('重新載入成績報告','Reload grade report')}</button>}
  </div>;
  return <div className="dtm-literal-grade-scroll" role="region" aria-label={t('成績報告','Grade report')} aria-busy={busy} tabIndex={0}>
    <table className="dtm-literal-grade-table" id={'dtm-grade-report-'+report.id}>
      <thead><tr><th scope="col" colSpan={2}>{t('評分項目','Grade item')}</th><th scope="col">{t('計算後權量','Calculated weight')}</th><th scope="col">{t('成績','Grade')}</th><th scope="col">{t('全距','Range')}</th>
        <th scope="col">{t('百分比','Percentage')}</th><th scope="col">{t('排名','Rank')}</th><th scope="col">{t('回饋','Feedback')}</th><th scope="col">{t('貢獻到課程總分','Contribution to course total')}</th></tr></thead>
      <tbody><tr className="dtm-literal-grade-group"><td className="dtm-literal-grade-stripe" aria-hidden="true" rowSpan={1+report.items.length+(report.total===null?0:1)}/><th scope="rowgroup" colSpan={8}><img src="/dtm-theme/folder.svg" width="16" height="16" alt=""/>{course!.title}</th></tr>
        {report.items.map(item=><tr key={item.id} id={'report-item-'+item.id}><th scope="row" className="dtm-literal-grade-item">{item.activityKind==='assignment'&&<img src="/dtm-theme/assign.svg" width="16" height="16" alt=""/>}{item.label}</th><Cells value={item}/></tr>)}
        {report.total!==null&&<tr className="dtm-literal-grade-total"><th scope="row"><span className="dtm-literal-grade-total-symbol" aria-hidden="true">Σ</span>{t('課程總分','Course total')}</th><Cells value={report.total}/></tr>}
      </tbody>
    </table>
  </div>;
}
