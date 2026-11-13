import {Fragment,useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router';
import {
  courseSubstitutionPath as root,substitutionYears,substitutionTracks,substitutionTrack,substitutionDepartmentCode,
  type SubstitutionDepartment,type SubstitutionResult,
} from './courseSubstitution.js';
import './courseSubstitution.css';

type Selection = {year:string;track:string;department:string};

export function CourseSubstitutionWorkspace({selection}: {selection?:Selection}) {
  const navigate=useNavigate();
  const {hash}=useLocation();
  const [year,setYear]=useState(selection?.year??'');
  const [track,setTrack]=useState(selection?.track??'');
  const [term,setTerm]=useState('');
  const [department,setDepartment]=useState<SubstitutionDepartment>();
  const [matches,setMatches]=useState<SubstitutionDepartment[]>([]);
  const [suggestionError,setSuggestionError]=useState(false);
  const [suggesting,setSuggesting]=useState(false);
  const [result,setResult]=useState<SubstitutionResult>();
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [filters,setFilters]=useState(true);
  const [expanded,setExpanded]=useState<string[]>(()=>{
    const initialCode=/^#course-([A-Z0-9-]{1,24})$/.exec(hash)?.[1];
    return initialCode?[initialCode]:[];
  });
  const selectedYear=selection?.year,selectedTrack=selection?.track,selectedDepartment=selection?.department;

  useEffect(()=>{
    if (!term.trim() || department) return;
    const request=new AbortController();
    const timer=window.setTimeout(()=>{
      setSuggesting(true);
      void (async()=>{
        try {
          const query=new URLSearchParams({scope:'course-substitution-departments',term:term.trim()});
          const response=await fetch('/api/affairs-data?'+query,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)])});
          if (!response.ok) throw new Error('Department lookup failed.');
          const {departments}=await response.json();
          if (!Array.isArray(departments)) throw new Error('Invalid department results.');
          if (!request.signal.aborted) setMatches(departments);
        } catch {
          if (!request.signal.aborted) setSuggestionError(true);
        } finally {
          if (!request.signal.aborted) setSuggesting(false);
        }
      })();
    },250);
    return ()=>{window.clearTimeout(timer);request.abort();};
  },[term,department]);

  useEffect(()=>{
    if (!selectedYear || !selectedTrack || !selectedDepartment) return;
    const request=new AbortController();
    void (async()=>{
      try {
        const query=new URLSearchParams({scope:'course-substitution',year:selectedYear,track:selectedTrack,department:selectedDepartment});
        const response=await fetch('/api/affairs-data?'+query,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(17000)])});
        if (!response.ok) throw new Error('Substitution lookup failed.');
        const data:SubstitutionResult=await response.json();
        if (data.year!==selectedYear || data.track!==substitutionTrack(selectedTrack) ||
          data.department?.code!==selectedDepartment || !Array.isArray(data.courses)) throw new Error('Wrong substitution result.');
        if (!request.signal.aborted) {
          setResult(data);
          setDepartment(data.department);
          setTerm(data.department.name);
        }
      } catch {
        if (!request.signal.aborted) setError(true);
      }
    })();
    return ()=>request.abort();
  },[selectedYear,selectedTrack,selectedDepartment,attempt]);

  useEffect(()=>{
    if (!result || !/^#course-[A-Z0-9-]{1,24}$/.test(hash)) return;
    const row=document.getElementById(hash.slice(1));
    if (row) {
      row.scrollIntoView({block:'center'});
      row.querySelector('button')?.focus({preventScroll:true});
    }
  },[result,hash]);

  function editTerm(value:string) {
    setTerm(value);
    setDepartment(undefined);
    setMatches([]);
    setSuggesting(false);
    setSuggestionError(false);
  }

  function retry() {
    setError(false);
    setResult(undefined);
    setAttempt(previous=>previous+1);
  }

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code=department?.code ?? term.trim().toUpperCase();
    if (!substitutionYears.includes(year) || !substitutionTrack(track) || !substitutionDepartmentCode(code)) return;
    if (year===selection?.year && track===selection.track && code===selection.department) retry();
    else navigate(`${root}/results/${year}/${track}/${code}`);
  }

  const canSearch=Boolean(year && track && (department || substitutionDepartmentCode(term.trim().toUpperCase())));
  const pending=selection && !result && !error;
  return <div className="course-substitution" lang="zh-Hant">
    <main id="top">
      <header><h1>替代科目查詢</h1><p lang="en">Student Information Services</p></header>
      <div className="substitution-content">
        <div className="substitution-toggle"><button type="button" aria-expanded={filters} aria-controls="substitution-filter" onClick={()=>setFilters(value=>!value)}>
          {filters?'收合查詢':'開啟查詢'}
        </button></div>
        <form id="substitution-filter" hidden={!filters} onSubmit={submit}>
          <div><label htmlFor="substitution-year">屆別</label>
            <select id="substitution-year" value={year} required onChange={event=>setYear(event.target.value)}>
              <option value="" />{substitutionYears.map(value=><option key={value}>{value}</option>)}
            </select></div>
          <div><label htmlFor="substitution-track">學制</label>
            <select id="substitution-track" value={track} required onChange={event=>setTrack(event.target.value)}>
              <option value="" />{substitutionTracks.map((label,index)=><option key={label} value={index+1}>{label}</option>)}
            </select></div>
          <div className="substitution-department">
            <label htmlFor="substitution-department">開課單位</label>
            <div>
              <input id="substitution-department" value={term} maxLength={32} required autoComplete="off" onChange={event=>editTerm(event.target.value)} />
              {suggesting && <p role="status">查詢開課單位…</p>}
              {suggestionError && <p role="status">無法搜尋開課單位名稱，可輸入已知的單位代碼。</p>}
              {matches.length>0 && <ul aria-label="開課單位建議">{matches.map(item=><li key={item.code}>
                <button type="button" onClick={()=>{setDepartment(item);setTerm(item.name);setMatches([]);}}>{item.name} {item.code}</button>
              </li>)}</ul>}
            </div>
          </div>
          <div className="substitution-actions">
            <button type="submit" disabled={!canSearch || !!pending}>查詢</button>
            <button type="button" onClick={()=>{if(selection) navigate(root); else {setYear('');setTrack('');editTerm('');}}}>清除</button>
          </div>
        </form>
        <div className="substitution-results">
          {pending && <p role="status">載入替代科目…</p>}
          {error && <p role="alert">此範圍的替代科目暫時無法載入。 <button type="button" onClick={retry}>重試</button></p>}
          {!pending && !error && <div className="substitution-scroll" role="region" aria-label="替代科目查詢結果" tabIndex={0}>
            <table className="substitution-table">
              <caption>
                <span>屆別：{result?.year}　學制：{result?.track}　開課單位：{result?.department.name}</span>
                <span>替代科目查詢結果</span>
              </caption>
              <thead>
                <tr><th colSpan={4}>舊科目</th></tr>
                <tr><th scope="col">科目代碼</th><th scope="col">科目名稱</th><th scope="col">學分數</th>
                  <th scope="col">{result?.courses.length ? <>
                    <button type="button" aria-label="開啟所有替代科目明細" onClick={()=>setExpanded(result.courses.map(row=>row.code))}>⌄</button>
                    <button type="button" aria-label="關閉所有替代科目明細" onClick={()=>setExpanded([])}>⌃</button>
                  </> : null}</th></tr>
              </thead>
              <tbody>
                {result?.courses.length===0 && <tr><td colSpan={4}>查無資料，請重新選擇屆別、學制及開課單位！</td></tr>}
                {result?.courses.map(row=>{
                  const open=expanded.includes(row.code);
                  const target='course-'+row.code;
                  return <Fragment key={row.code}>
                    <tr id={target} className="substitution-old-course"><th scope="row">{row.code}</th><td>{row.name}</td><td>{row.credits}</td>
                      <td><button type="button" aria-label={`替代科目明細 ${row.code}`} aria-expanded={open} aria-controls={target+'-details'}
                        onClick={()=>setExpanded(previous=>open?previous.filter(key=>key!==row.code):previous.concat(row.code))}>{open?'⌃':'⌄'}</button></td></tr>
                    <tr id={target+'-details'} hidden={!open}><td colSpan={4}>
                      {row.detailStatus!=='listed' ? <p>{row.detailStatus==='none'?'無替代科目資料！':'未列出替代科目明細。'}</p> :
                        <table className="substitution-detail">
                          <caption>替代科目明細表</caption>
                          <thead><tr>{['替代組合','課程代碼','替代科目','學分數','必選修','備註'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
                          <tbody>{row.groups.map((group,index)=><Fragment key={index}>{group.courses.map((course,i)=><tr key={i}>
                            {i===0 && <th scope="row" rowSpan={group.courses.length}>{group.label}</th>}
                            <td>{course.code}</td><td>{course.name}</td><td>{course.credits}</td><td>{course.required}</td><td>{course.notes}</td>
                          </tr>)}</Fragment>)}</tbody>
                        </table>}
                    </td></tr>
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>}
          {result?.source==='snapshot' && <p className="substitution-provenance">查詢存檔 · {result.checkedOn}</p>}
        </div>
        <section className="substitution-notes" aria-labelledby="substitution-explanation">
          <h2 id="substitution-explanation">說明</h2>
          <ol><li>必修課程停開或更名時，請依開課單位公告選擇一組替代課程。</li><li>所選組合中的每門課程均須修習。</li></ol>
        </section>
        <footer><Link to={root+'/notes'}>個人備註</Link><a href="#top">top</a></footer>
      </div>
    </main>
  </div>;
}
