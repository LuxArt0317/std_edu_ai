import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router';
import {ChevronsDown,ChevronsRight,ChevronsUp,House,Landmark,List,Search} from 'lucide-react';
import {Dialog,DialogClose,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {permanentCoursesPath} from './permanentCourseRouting.js';
import './permanentCourseCatalog.css';

type Option={value:string;label:string};
type Course={code:string;title:string;english_title:string;requirement:string;credits:number;kind:string;department:string;
  duration:string;category_code:string;display_sequence:number};
type Catalog={rows:Course[];kinds:Option[];divisions:Option[];total:number;page:number;pageSize:number};
type Description={code:string;title:string;english_title:string;requirement:string;credits:string;college:string;
  department:string;description:string;english_description:string};
type Result<T>={key:string;data?:T;error?:string};
const headers=['序號','課程代碼','課程名稱','課程英文名稱','必/選修','學分數','課程種類','開課系所','學年','課程類別代碼'];
const detailHeaders=['永久課號','課程名稱','必選修','學分','開課學院','開課系所'];

function useCatalogResult<T>(query:string|null) {
  const [result,setResult]=useState<Result<T>|null>(null);
  const [retry,setRetry]=useState(0);
  const key=query===null?null:query+':'+retry;
  useEffect(()=>{
    if (query===null || key===null) return;
    const controller=new AbortController();
    fetch('/api/affairs-data?'+query,{signal:controller.signal}).then(async response=>{
      const body=await response.json();
      if (!response.ok) throw new Error(typeof body?.error==='string'?body.error:'課程資料暫時無法載入。');
      if (!controller.signal.aborted) setResult({key,data:body as T});
    }).catch((error:unknown)=>{
      if (!controller.signal.aborted) setResult({key,error:error instanceof Error?error.message:'課程資料暫時無法載入。'});
    });
    return ()=>controller.abort();
  },[key,query]);
  return {result:key!==null&&result?.key===key?result:null,previousData:result?.data,retry:()=>setRetry(value=>value+1)};
}

function CourseDescription({code,onClose,returnFocus}:{code:string|null;onClose:()=>void;returnFocus:()=>void}) {
  const query=code?new URLSearchParams({scope:'permanent-courses',code}).toString():null;
  const {result,retry}=useCatalogResult<{description:Description}>(query);
  const row=result?.data?.description;
  return <Dialog open={Boolean(code)} onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className="permanent-course-dialog" aria-describedby={undefined}
      onCloseAutoFocus={event=>{event.preventDefault();returnFocus();}}>
      <header><DialogTitle>{row?row.code+row.title+'課程簡介:':code+' 課程簡介'}</DialogTitle></header>
      <div className="permanent-course-dialog-body">
        {!result&&<p role="status">載入課程簡介…</p>}
        {result?.error&&<p role="alert">{result.error} <button type="button" onClick={retry}>重試</button></p>}
        {row&&<div className="permanent-course-table-scroll" tabIndex={0} role="region" aria-label="課程簡介">
          <table><thead><tr>{detailHeaders.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody><tr>{[row.code,row.title,row.requirement,row.credits,row.college,row.department].map((value,index)=><td key={index}>{value}</td>)}</tr>
              {[['課程英文名稱',row.english_title],['課程簡介',row.description],['英文簡介',row.english_description]].map(([label,value])=>
                <FragmentRows key={label} label={label} value={value}/>)}
            </tbody></table>
        </div>}
      </div>
      <footer><DialogClose className="permanent-course-close">Close</DialogClose>
        <button className="permanent-course-print" type="button" disabled={!row} onClick={()=>window.print()}>列印</button></footer>
    </DialogContent>
  </Dialog>;
}

function FragmentRows({label,value}:{label:string;value:string}) {
  return <><tr><th colSpan={6}>{label}</th></tr><tr><td colSpan={6}>{value}</td></tr></>;
}

export function PermanentCourseCatalog() {
  const [params,setParams]=useSearchParams();
  const kind=params.get('kind')??'',division=params.get('division')??'',keyword=params.get('keyword')??'',page=params.get('page')??'0';
  const course=params.get('course');
  const query=new URLSearchParams({scope:'permanent-courses'});
  if (kind || division || keyword || page!=='0') {
    query.set('kind',kind);query.set('division',division);query.set('keyword',keyword);query.set('page',page);
  }
  const {result,previousData,retry}=useCatalogResult<Catalog>(query.toString());
  const [expanded,setExpanded]=useState(true);
  const searchButton=useRef<HTMLButtonElement>(null);
  const launch=useRef<HTMLButtonElement|null>(null);
  const data=result?.data;
  useEffect(()=>{document.title='永久課程簡介查詢 · stu.best';},[]);
  const options=data??previousData;
  function search(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const next=new URLSearchParams({kind:String(fields.get('kind')),division:String(fields.get('division')),keyword:String(fields.get('keyword')).trim()});
    if(next.toString()===params.toString())retry();
    else setParams(next);
  }
  function update(name:string,value:string|null) {
    const next=new URLSearchParams(params);
    if(value===null)next.delete(name);else next.set(name,value);
    setParams(next,{replace:name==='course'&&value===null});
  }
  return <div className="permanent-course-page" lang="zh-Hant">
    <main className="permanent-course-catalog">
      <header className="permanent-course-masthead"><strong><img src="/stu-reference/ee1f2bb8f7f5a9dd.svg" alt=""/>管理系統</strong><strong>Shu-Te University</strong></header>
      <nav className="permanent-course-nav" aria-label="課程查詢選單">
        <details><summary>選課</summary><Link to="/school-affairs/services/11-1">選課記錄查詢</Link></details>
        <details><summary>查詢</summary><Link to={permanentCoursesPath}>永久課程簡介</Link><Link to="/school-affairs/services/12-3">課程大綱查詢</Link><Link to="/school-affairs/services/12-4">當期課程查詢</Link></details>
        <details><summary>Index</summary><Link to="/school-affairs">校務資訊系統</Link><Link to="/school-affairs/signed-out">Logout</Link></details>
      </nav>
      <div className="permanent-course-crumb"><House size={15}/><Link to="/school-affairs">Index</Link><ChevronsRight size={12}/>
        <Link to={permanentCoursesPath}>永久課程簡介</Link></div>
      <section className="permanent-course-content">
        <h1><Landmark size={19}/> 永久課程簡介查詢 <ChevronsRight size={13}/></h1>
        <button ref={searchButton} className="permanent-course-toggle" type="button" aria-expanded={expanded} aria-controls="permanent-course-form" onClick={()=>setExpanded(value=>!value)}>
          <Search size={13}/> 查詢條件輸入 {expanded?<ChevronsUp size={14}/>:<ChevronsDown size={14}/>}
        </button>
        <form id="permanent-course-form" hidden={!expanded} key={kind+':'+division+':'+keyword+':'+Boolean(options)} onSubmit={search}>
          <label>課程種類:<select name="kind" required defaultValue={kind}><option value="">請選擇課程種類</option>
            {options?.kinds.map((item,index)=><option key={item.value+':'+index} value={item.value}>{item.label}</option>)}</select></label>
          <label>部別:<select name="division" required defaultValue={division}><option value="">請選擇部別</option>
            {options?.divisions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>課名關鍵字:<input name="keyword" maxLength={120} defaultValue={keyword} placeholder="課名關鍵字查詢"/></label>
          <button type="submit" disabled={!options}>查詢 <Search size={14}/></button>
        </form>
        <h2><List size={17}/> 永久課程</h2>
        {!result&&<p role="status">載入課程…</p>}
        {result?.error&&<p role="alert">{result.error} <button type="button" onClick={retry}>重試</button></p>}
        {data&&<><div className="permanent-course-table-scroll" role="region" aria-label="永久課程" tabIndex={0}>
          <table><colgroup>{[5,7.6,18.6,31.3,6.2,5.3,6.4,6.5,4,9.1].map((width,index)=><col key={index} style={{width:width+'%'}}/>)}</colgroup>
            <thead><tr>{headers.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{data.rows.map(row=><tr key={row.code}><td>{row.display_sequence}</td>
              <td><button type="button" onClick={event=>{launch.current=event.currentTarget;update('course',row.code);}}>{row.code}</button></td>
              <td>{row.title}</td><td>{row.english_title}</td><td>{row.requirement}</td><td>{row.credits}</td><td>{row.kind}</td>
              <td>{row.department}</td><td>{row.duration}</td><td>{row.category_code}</td></tr>)}
              <tr><td colSpan={10} className="permanent-course-count">計 {data.total.toLocaleString('zh-TW')} 筆課程資料</td></tr>
            </tbody></table>
        </div>
          {data.total>data.pageSize&&<nav className="permanent-course-pages" aria-label="課程分頁">
            <button type="button" disabled={data.page===0} onClick={()=>update('page',String(data.page-1))}>上一頁</button>
            <span>{data.page+1} / {Math.ceil(data.total/data.pageSize)}</span>
            <button type="button" disabled={(data.page+1)*data.pageSize>=data.total} onClick={()=>update('page',String(data.page+1))}>下一頁</button>
          </nav>}
        </>}
      </section>
    </main>
    <CourseDescription code={course} onClose={()=>update('course',null)}
      returnFocus={()=>requestAnimationFrame(()=>{(launch.current?.isConnected?launch.current:searchButton.current)?.focus();})}/>
  </div>;
}
