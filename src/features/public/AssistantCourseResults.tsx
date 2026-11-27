import type {AssistantResponse} from '../../services/researchAssistant';
type View=NonNullable<AssistantResponse['views']>[number];
export function AssistantCourseResults({view}:{view:View}){
 const groups=new Map<string,string[][]>();for(const row of view.rows){const term=row[1]||'Term not provided';groups.set(term,[...(groups.get(term)||[]),row]);}
 const missing=(value:string)=>!value?.trim()||/^[-–—]$/.test(value.trim());
 return <section className="assistant-courses" aria-label="Moodle subjects and grades">
  <header className="assistant-courses-heading"><div><span className="assistant-courses-eyebrow">YOUR MOODLE RECORDS</span><h3>Subjects &amp; grades</h3></div><span className="assistant-course-count">{view.rows.length} subjects</span></header>
  {[...groups].sort(([a],[b])=>a.localeCompare(b,'zh-Hant',{numeric:true})).map(([term,rows])=><details className="assistant-course-term" key={term} open={rows.some(row=>!missing(row[2]))}>
   <summary>
   <h4>{term}<span>{rows.length} subjects{rows.every(row=>missing(row[2]))?' · No grades recorded':''}</span></h4></summary>
   <ul>{rows.map((row,i)=><li key={row[5]||i} className="assistant-course-row">
    <div className="assistant-course-name"><a href={/^\/dtm\/course\/import-\d{1,12}\/grades$/.test(row[5])?row[5]:'/dtm/grades'} target="_blank" rel="noopener noreferrer">{row[0].split(' - ')[0]}<span aria-hidden="true"> ↗</span></a>{row[6]&&<span className="assistant-course-code">{row[6]}</span>}</div>
    {missing(row[2])?<span className="assistant-grade-empty">No grade recorded</span>:<dl className="assistant-course-marks"><div><dt>Moodle total</dt><dd>{row[2]}{!missing(row[3])&&<small>Range {row[3]}</small>}</dd></div>{!missing(row[4])&&<div><dt>Percentage</dt><dd>{row[4]}</dd></div>}</dl>}
   </li>)}</ul>
  </details>)}
  <p className="assistant-course-note">{view.note}</p>
 </section>;
}
