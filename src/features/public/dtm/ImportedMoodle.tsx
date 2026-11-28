import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router';
import {affairsClient} from '../affairs/authClient';
import type {ImportedLibrary,ImportedPage} from '../../../../server/local-dtm/store.js';

async function request(userId:string,path:string,signal?:AbortSignal,body?:string):Promise<ImportedLibrary>{
 const {data,error}=await affairsClient!.auth.getSession();if(error||data.session?.user.id!==userId)throw Error('Sign in again.');
 const boundedSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
 const response=await fetch(path,{signal:boundedSignal,method:body?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},body});
 const value=await response.json();if(!response.ok)throw Error(value.error||'Could not load Moodle content.');return value;
}
export function useImportedMoodle(userId:string,coverage=false){
 const [state,setState]=useState<{userId:string;data:ImportedLibrary}>();
 useEffect(()=>{const controller=new AbortController();void request(userId,'/api/affairs-data?scope=dtm-library'+(coverage?'&view=coverage':''),controller.signal).then(data=>{if(!controller.signal.aborted)setState({userId,data});}).catch(()=>{});return()=>controller.abort();},[userId,coverage]);
 return state?.userId===userId?state.data:undefined;
}
export function DtmImport({userId}:{userId:string}){
 const library=useImportedMoodle(userId,true);
 const [value,setValue]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 return <main className="dtm"><h1>Moodle content import</h1><p>Imports into the private local database for this signed-in account.</p>
 <label>Captured Moodle JSON<textarea aria-label="Captured Moodle JSON" value={value} onChange={e=>setValue(e.target.value)} rows={12}/></label>
 <button disabled={busy||!value} onClick={async()=>{setBusy(true);setStatus('Importing…');try{JSON.parse(value);const result=await request(userId,'/__dtm_library/import',undefined,value) as unknown as {courses:number;pages:number};setStatus(`Saved ${result.courses} courses and ${result.pages} pages.`);setValue('');}catch(e){setStatus(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false);}}}>Import captured content</button><p role="status">{status}</p><Link to="/dtm">Open Moodle</Link>
 <details><summary>Captured course metadata</summary><ul>{library?.courses.map(c=><li key={c.id} data-course={JSON.stringify(c)}>{c.title} · {c.term}</li>)}</ul></details>
 <details><summary>Remaining activity pages · {library?.pending?.length??0}</summary><ul>{library?.pending?.map(p=><li key={p.sourceKey}><a data-course-id={p.courseId} href={'https://dtm.stu.edu.tw'+p.sourceKey}>{p.title}</a></li>)}</ul></details></main>;
}
const key=(url:string)=>{const u=new URL(url,'https://dtm.stu.edu.tw');u.searchParams.sort();return u.pathname+u.search;};
function ImportedLink({url,title,courseId}:{page:ImportedPage;url:string;title:string;courseId:string}){
 const u=new URL(url);if(u.hostname==='dtm.stu.edu.tw'&&!/sesskey|token|logout/.test(url))return <Link to={'/dtm/course/import-'+courseId+'?source='+encodeURIComponent(key(url))}>{title}</Link>;
 return <a href={url} target="_blank" rel="noopener noreferrer">{title}</a>;
}
export function DtmImportedCourse({userId,courseId,view}:{userId:string;courseId:string;view?:string}){
 const {search}=useLocation(),source=new URLSearchParams(search).get('source');
 const [state,setState]=useState<{userId:string;courseId:string;data:ImportedLibrary}>(),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();void request(userId,'/api/affairs-data?scope=dtm-library&course_id='+encodeURIComponent(courseId),controller.signal).then(data=>{if(!controller.signal.aborted){setState({userId,courseId,data});setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[userId,courseId]);
 const data=state?.userId===userId&&state.courseId===courseId?state.data:undefined;
 if(error)return <p role="alert">{error}</p>;if(!data)return <p role="status">載入課程內容中…</p>;
 const wanted=source|| (view==='grades'?'/grade/report/user/index.php?id='+courseId:'/course/view.php?id='+courseId);
 const page=data.pages.find(p=>key(p.url)===wanted);
 if(!page){
  const outline=data.pages.find(p=>key(p.url)==='/course/view.php?id='+courseId);
  const activity=source?outline?.activities.find(a=>a.url&&key(a.url)===source):undefined;
  return <div className="space-y-3">
   {activity&&<h2>{activity.title}</h2>}
   <p role="status">這個頁面尚未匯入。 This activity’s content has not been imported.</p>
   {activity?.url&&<p><a href={activity.url} target="_blank" rel="noreferrer">Open in university Moodle</a></p>}
   <p><Link to={'/dtm/course/import-'+courseId}>返回課程 · Back to course</Link></p>
  </div>;
 }
 const coursePage=key(page.url).startsWith('/course/view.php');
 const introduction=page.tables.length?page.text.slice(0,page.text.indexOf(page.tables[0]?.[0]?.[0]||'\0')).trim().split('\n').slice(1).join('\n').trim():'';
 return <div className="dtm-imported-content">
 {coursePage?<><h2>本週大綱</h2>{[...new Set([...page.activities.map(a=>a.section),'作業區','測驗區','教材區'])].filter(Boolean).map(section=><section className="dtm-course-section" key={section}><h3>{section}</h3><ul className="dtm-course-activities">{page.activities.filter(a=>a.section===section).map(a=><li className={'dtm-course-activity'+(!a.url?' dtm-source-unavailable':'')} key={a.id}><div className="dtm-activity-link"><img src={'/dtm-theme/'+(a.kind==='assign'?'assign':'url')+'.svg'} width="24" height="24" alt=""/>{a.url?<ImportedLink page={page} url={a.url} title={a.title} courseId={courseId}/>:<span>{a.title}</span>}</div>{a.description&&<p className="dtm-activity-description">{a.description}</p>}{a.availability&&<p>{a.availability}</p>}</li>)}</ul></section>)}</>:
 <><h2>{page.text.split('\n')[0]||page.title}</h2>{page.tables.length?<>{introduction&&<div className="dtm-imported-text">{introduction}</div>}{page.tables.map((table,i)=><div className="dtm-literal-grade-scroll" key={i}><table className="dtm-literal-grade-table"><tbody>{table.map((row,ri)=><tr key={ri}>{row.map((cell,ci)=>ri===0&&table[0].length>2?<th key={ci}>{cell}</th>:<td key={ci} colSpan={row.length===2&&table[0].length===8&&ci===1?7:undefined}>{cell}</td>)}</tr>)}</tbody></table></div>)}</>:<div className="dtm-imported-text">{page.text}</div>}
 <ul>{page.links.map((l,i)=><li key={i}><ImportedLink page={page} url={l.url} title={l.title||l.url} courseId={courseId}/></li>)}</ul></>}
 </div>;
}

export function DtmImportedGrades({library}:{library:ImportedLibrary}){
 return <><h2>綜覽報告</h2><table className="dtm-literal-grade-table"><thead><tr><th>課程名稱</th><th>成績</th></tr></thead><tbody>{library.courses.map(c=><tr key={c.id}><td><Link to={'/dtm/course/import-'+c.id+'/grades'}>{c.title}</Link></td><td>{c.gradeText??'–'}</td></tr>)}</tbody></table></>;
}
