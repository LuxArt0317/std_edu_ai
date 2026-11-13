import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { curriculumMapColleges, curriculumMapEntry, curriculumMapPath, curriculumMapSource } from "./curriculumMaps.js";
import type { CurriculumMapEntry, CurriculumMapResult } from "./curriculumMaps.js";
import "./curriculumMaps.css";

const asset = "/stu-reference/curriculum-map/";
const labels = { department:"系定必修", required:"學程必修", elective:"學程選修", other:"課程" };

function CourseMap({ entry }: { entry: CurriculumMapEntry }) {
  const [year,setYear] = useState(entry.years[0] ?? "");
  const [track,setTrack] = useState(entry.tracks[0]?.value ?? "");
  const [selection,setSelection] = useState<{year:string;track:string}>();
  const [result,setResult] = useState<CurriculumMapResult>();
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    const query = new URLSearchParams({scope:"curriculum-map",program:entry.id,...selection});
    void (async () => {
      try {
        const response = await fetch("/api/affairs-data?" + query, {
          signal:AbortSignal.any([controller.signal,AbortSignal.timeout(18000)]),
        });
        if (!response.ok) throw Error("Lookup failed");
        const map: CurriculumMapResult = await response.json();
        if (!controller.signal.aborted) setResult(map);
      } catch {
        if (!controller.signal.aborted) setError("課程地圖暫時無法載入，請重試。");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  },[entry.id,selection]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(undefined);
    setError("");
    setBusy(true);
    setSelection({year,track});
  }

  return <>
    <form onSubmit={submit}>
      <label>瀏覽學年 <select value={year} onChange={event=>setYear(event.target.value)}>{entry.years.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>學程名稱 <select value={track} onChange={event=>setTrack(event.target.value)} disabled={!entry.tracks.length}>
        {entry.tracks.length ? entry.tracks.map(option=><option key={option.value} value={option.value}>{option.label}</option>) : <option value="">無學程</option>}
      </select></label>
      <button type="submit" disabled={busy || !year}>確定</button>
    </form>
    {busy && <p role="status">載入課程地圖…</p>}
    {error && <p role="alert">{error} <a href={curriculumMapSource(entry,"seccontent")} target="_blank" rel="noopener noreferrer">開啟校方查詢</a></p>}
    {result && <>
      {result.tables.map(([heading,columns,...rows],index)=><div className="curriculum-map-scroll" key={index} role="region" tabIndex={0} aria-label={heading?.join(" ")}>
        <table>
          <caption>{heading?.join(" ")}</caption>
          <thead><tr>{columns?.map((column,key)=><th key={key} scope="col">{column}</th>)}</tr></thead>
          <tbody>{rows.map((row,key)=><tr key={key}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>)}
      <div className="curriculum-map-scroll" role="region" tabIndex={0} aria-label={result.title}>
        <table className="curriculum-map-flow">
          <caption>{result.title}</caption>
          <thead><tr>{result.semesters.map((semester,index)=><th scope="col" key={index}>{semester.label}</th>)}</tr></thead>
          <tbody><tr>{result.semesters.map((semester,index)=><td key={index}>{semester.courses.map((course,key)=>
            <div key={key} className={"curriculum-map-course "+course.category} title={labels[course.category]}>{course.title}</div>,
          )}</td>)}</tr></tbody>
        </table>
      </div>
      {result.semesters.some(semester=>semester.courses.length>0) ? <p className="curriculum-map-legend">
        {Object.entries(labels).filter(([key])=>key!=="other").map(([key,label])=><span key={key} className={key}>{label}</span>)}
      </p> : <p role="status">這個學年和學程沒有課程項目。</p>}
    </>}
  </>;
}

const views = [
  { key:"career", label:"就業導向" },
  { key:"competencies", label:"能力指標" },
  { key:"courses", label:"課程路徑" },
  { key:"home", label:"回課程地圖首頁" },
];

export function CurriculumMapWorkspace({ id, view }: { id?:string; view?:string }) {
  const entry = id ? curriculumMapEntry(id) : undefined;
  const title = view === "courses" ? "系所課程介紹" : views.find(item=>item.key===view)?.label;
  const entryPath = curriculumMapPath + "/program/" + id;
  return <div className="curriculum-map" lang="zh-Hant">
    <header>
      <img className="curriculum-map-logo" src={asset+"logo.gif"} width="78" height="80" alt="" />
      <div>
        <h1><Link to={curriculumMapPath}>課程地圖</Link></h1>
        <p lang="en">Curriculum Mapping</p>
        {entry && <p>課程地圖 &gt;&gt; {entry.heading}{title && "　" + title}</p>}
        <img className="curriculum-map-rule" src={asset+(entry?"detail-rule.jpg":"index-rule.jpg")} alt="" />
      </div>
    </header>
    <div className={"curriculum-map-layout"+(id?" is-detail":"")}>
      {entry ? <nav className="curriculum-map-actions" aria-label="系所課程地圖">
        {views.map(({key,label},index)=><Link key={key}
          to={key==="home"?curriculumMapPath:entryPath+"/"+key} aria-current={key===view?"page":undefined}>
          <img src={asset+"action-"+(index+1)+".jpg"} alt={label} width="240" height="59" />
          <img className="curriculum-map-hover" src={asset+"action-"+(index+1)+"-hover.jpg"} alt="" width="240" height="59" />
        </Link>)}
      </nav> : !id && <nav className="curriculum-map-colleges" aria-label="學院與系所">
        {curriculumMapColleges.map(college=><section key={college.label}>
          <h2>{college.label}</h2>
          <ul>{college.entries.map(program=><li key={program.id}>
            <Link to={curriculumMapPath+"/program/"+program.id}>{program.label}</Link>
          </li>)}</ul>
        </section>)}
      </nav>}
      <main>
        {!id && <>
          <div className="curriculum-map-intro">
            <h2>了解課程地圖</h2>
            <img src={asset+"intro.jpg"} alt="" />
          </div>
          <p className="curriculum-map-description">依系所查閱課程安排、核心能力與職涯方向，規劃自己的學習路徑。</p>
          <Link className="curriculum-map-notes" to={curriculumMapPath+"/notes"}>個人備註</Link>
        </>}
        {id && !entry && <p role="status">查無系所。 <Link to={curriculumMapPath}>返回課程地圖</Link></p>}
        {entry && !view && <img className="curriculum-map-triangle" src={asset+"triangle.jpg"} alt="職涯、核心能力與系所課程的關係" />}
        {entry && view==="courses" && <CourseMap key={entry.id} entry={entry} />}
        {entry && (view==="career" || view==="competencies") && <section>
          <h2>{title}</h2>
          <p>請登入校方系統查看{title}資料。</p>
          <a href={curriculumMapSource(entry,view==="career"?"career":"abtab")} target="_blank" rel="noopener noreferrer">開啟校方{title}</a>
        </section>}
      </main>
    </div>
  </div>;
}
