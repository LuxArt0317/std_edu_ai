import {Link} from 'react-router';
import type {CourseOffering} from './courseCatalogModel.js';
import {newCourseSyllabus,syllabusTextFields,type CourseSyllabus as Syllabus} from './courseSyllabusModel.js';
import {syllabusCapabilities,syllabusGradingLabels,syllabusMeanings,syllabusMethods,syllabusSdgs,syllabusSourcePolicy} from './courseSyllabusOptions.js';
import './courseSyllabus.css';

const shown=(value:string|number|null|undefined)=>value==null||value===''?'—':value;
function ReadCheck({checked,label}:{checked:boolean;label:string}) {return <label><input type="checkbox" checked={checked} disabled/>{label}</label>;}

export function CourseSyllabus({record,back}:{record:CourseOffering;back:string}) {
  const data={...newCourseSyllabus(),...record.syllabus};
  const capabilityTotal=data.capabilities.some(weight=>weight!==null)?data.capabilities.reduce<number>((sum,weight)=>sum+(weight??0),0):null;
  return <main className="course-syllabus" lang="zh-Hant">
    <h1>樹德科技大學 課程大綱</h1>
    <div className="syllabus-scroll" role="region" aria-label="課程基本資料" tabIndex={0}><table className="syllabus-identity"><tbody>
      <tr><th>課程代碼</th><td>{record.course_code}</td><th>課程名稱</th><td>{record.course_name}</td><th>學分數</th><td>{record.credits}</td><th>課程性質</th><td>{record.course_nature==='半'?'半學年':shown(record.course_nature)}</td></tr>
      <tr><th>教師姓名</th><td>{record.instructor}</td><th>開課系所</th><td>{record.department_name}</td><th>開課年級</th><td>{shown(record.grade)}</td><th>修課別</th><td>{record.required?'必修':'選修'}</td></tr>
      <tr><th>上課時數</th><td>{record.lecture_hours}</td><th>實習時數</th><td>{record.practice_hours}</td><th>課程層級</th><td>{shown(data.level)}</td><th>授課語言</th><td>{shown(data.language)}</td></tr>
      <tr><th>多人合授</th><td>{record.shared_teaching?'Y':'N'}</td><th>教學型態</th><td>{shown(data.teaching_mode)}</td><th>課後諮商時間</th><td colSpan={3}>{data.office_hours}</td></tr>
    </tbody></table></div>
    <table className="syllabus-objectives"><tbody>
      {(['objectives','materials','references'] as const).map(key=><tr key={key}><th>{syllabusTextFields[key][0]}</th><td>{shown(data[key])}</td></tr>)}
      <tr><th>先修課程</th><td>{shown(record.prerequisite)}</td></tr>
      {(['advice','certifications'] as const).map(key=><tr key={key}><th>{syllabusTextFields[key][0]}</th><td>{shown(data[key])}</td></tr>)}
    </tbody></table>
    <h2>評分標準</h2><table className="syllabus-grading"><thead><tr><th colSpan={2}>評分項目</th><th>配分比例</th><th>相關說明</th></tr></thead><tbody>
      {data.grading.map((row,index)=><tr key={index}><td>{index+1}.</td><td>{syllabusGradingLabels[index]}</td><td>{row.weight===null?'—':row.weight+'%'}</td><td>{row.methods.map(id=><ReadCheck key={id} checked label={syllabusMethods[id]}/>)}</td></tr>)}
    </tbody></table>
    <h2>課程對應系能力指標權重:</h2><div className="syllabus-scroll" role="region" aria-label="課程能力指標權重" tabIndex={0}><table className="syllabus-capabilities"><thead><tr><th>權重總和</th>{syllabusCapabilities.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody><tr><td>{shown(capabilityTotal)}</td>{data.capabilities.map((weight,index)=><td key={index}>{shown(weight)}</td>)}</tr></tbody></table></div>
    <h2>本課程具有以下意涵：</h2><table className="syllabus-meanings"><thead><tr><th>編號</th><th>課程意涵</th><th>編號</th><th>課程意涵</th></tr></thead><tbody>{Array.from({length:13},(_,row)=><tr key={row}>{[row*2,row*2+1].map(index=><SyllabusMeaning key={index} id={index+1} checked={data.meanings.includes(index+1)} label={syllabusMeanings[index]}/>)}</tr>)}</tbody></table>
    <h2>本課程對應以下SDGs指標：</h2><table className="syllabus-sdgs"><thead><tr><th>編號</th><th>SDGs指標</th></tr></thead><tbody>{syllabusSdgs.map((label,index)=><tr key={label}><td>SDG{String(index+1).padStart(2,'0')}</td><td><ReadCheck checked={data.sdgs.includes(index+1)} label={label}/></td></tr>)}</tbody></table>
    <h2>授課進度:</h2><table className="syllabus-weeks"><thead><tr><th>預計進度</th><th>日期</th><th>授課單元及內容</th><th>備註</th></tr></thead><tbody>{data.weeks.map((week,index)=><tr key={index}><td>第{index+1}週</td><td>{week.date?week.date.split('-').map(Number).join('/'):'—'}</td><td>{shown(week.content)}</td><td>{shown(week.notes)}</td></tr>)}</tbody></table>
    <table className="syllabus-policy"><tbody><tr><td>{syllabusSourcePolicy}</td></tr></tbody></table>
    <footer>stu.best 本地範例課程 · 校方條款為 2026-11-12 擷取內容 <Link to={back}>回上頁</Link></footer>
  </main>;
}
function SyllabusMeaning({id,label,checked}:{id:number;label:string;checked:boolean}) {return <><td>{id}</td><td><ReadCheck checked={checked} label={label}/></td></>;}

export function CourseSyllabusEditor({value,onChange}:{value?:Syllabus;onChange:(value:Syllabus)=>void}) {
  const data={...newCourseSyllabus(),...value};
  function field(key:string,next:unknown) {onChange({...data,[key]:next});}
  function toggle(key:'meanings'|'sdgs',id:number,checked:boolean) {field(key,checked?[...data[key],id]:data[key].filter(item=>item!==id));}
  const inputWeight=(value:string)=>value===''?null:Number(value);
  return <details className="syllabus-editor"><summary>課程大綱資料</summary><p>維護站內範例大綱；未記錄的比例保留空白，完整比例總和須為 100。大綱合計上限 10,000 字元。</p>
    <div className="catalog-editor-fields">{Object.entries(syllabusTextFields).map(([key,[label,max]])=><label key={key}>{label}{max>100?<textarea aria-label={label} value={String(data[key as keyof Syllabus])} maxLength={max} onChange={event=>field(key,event.target.value)}/>:<input aria-label={label} value={String(data[key as keyof Syllabus])} maxLength={max} onChange={event=>field(key,event.target.value)}/>}</label>)}</div>
    <fieldset><legend>評分標準</legend>{data.grading.map((row,index)=><fieldset key={index}><legend>{syllabusGradingLabels[index]}</legend><label>配分比例 % <input type="number" min={0} max={100} step="0.01" value={row.weight??''} onChange={event=>field('grading',data.grading.map((entry,i)=>i===index?{...entry,weight:inputWeight(event.target.value)}:entry))}/></label>{Object.entries(syllabusMethods).map(([id,label])=><label key={id}><input type="checkbox" checked={row.methods.includes(id)} onChange={event=>field('grading',data.grading.map((entry,i)=>i===index?{...entry,methods:event.target.checked?[...entry.methods,id]:entry.methods.filter(key=>key!==id)}:entry))}/>{label}</label>)}</fieldset>)}</fieldset>
    <fieldset><legend>課程對應系能力指標權重</legend><div className="catalog-editor-fields">{syllabusCapabilities.map((label,index)=><label key={label}>{label}<input type="number" min={0} max={100} step="0.01" value={data.capabilities[index]??''} onChange={event=>field('capabilities',data.capabilities.map((weight,i)=>i===index?inputWeight(event.target.value):weight))}/></label>)}</div></fieldset>
    <fieldset><legend>課程意涵</legend>{syllabusMeanings.map((label,index)=><label key={label}><input type="checkbox" checked={data.meanings.includes(index+1)} onChange={event=>toggle('meanings',index+1,event.target.checked)}/>{label}</label>)}</fieldset>
    <fieldset><legend>SDGs指標</legend>{syllabusSdgs.map((label,index)=><label key={label}><input type="checkbox" checked={data.sdgs.includes(index+1)} onChange={event=>toggle('sdgs',index+1,event.target.checked)}/>{label}</label>)}</fieldset>
    <fieldset><legend>授課進度</legend>{data.weeks.map((week,index)=><div className="syllabus-week-editor" key={index}><strong>第{index+1}週</strong><label>日期<input type="date" value={week.date} onChange={event=>field('weeks',data.weeks.map((entry,i)=>i===index?{...entry,date:event.target.value}:entry))}/></label><label>授課單元及內容<textarea maxLength={500} value={week.content} onChange={event=>field('weeks',data.weeks.map((entry,i)=>i===index?{...entry,content:event.target.value}:entry))}/></label><label>備註<input maxLength={160} value={week.notes} onChange={event=>field('weeks',data.weeks.map((entry,i)=>i===index?{...entry,notes:event.target.value}:entry))}/></label></div>)}</fieldset>
  </details>;
}
