import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router';
import {affairsClient} from './authClient';
import {catalogBooleanFields,catalogCell,catalogNumberFields,catalogPeriods,catalogTextFields,catalogWeekdays,courseCatalogColumns,courseCatalogPath,defaultCatalogFilters,newCourseOffering,type CatalogFilters,type CatalogResult,type CourseOffering} from './courseCatalogModel.js';
import {courseCatalogOptions} from './courseCatalogOptions.js';
import {CourseSyllabus,CourseSyllabusEditor} from './courseSyllabusViews';
import {SyllabusSearchMetadataEditor} from './SyllabusSearchMetadataEditor';
import './courseCatalog.css';

async function catalogRequest<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T> {
  if(!affairsClient) throw new Error('School Affairs sign-in is unavailable.');
  const {data,error}=await affairsClient.auth.getSession();
  if(error || !data.session) throw new Error('Sign in to School Affairs again.');
  const response=await fetch(path,{signal,method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json().catch(()=>null);
  if(!response.ok || !payload) throw new Error(payload?.error||'Course catalog is temporarily unavailable.');
  return payload as T;
}

function readFilters(params:URLSearchParams):CatalogFilters {
  const filters={...defaultCatalogFilters};
  for(const key of Object.keys(filters) as (keyof CatalogFilters)[]) {
    const value=params.get(key);
    if(key==='weekdays'||key==='periods') filters[key]=value?value.split(','):[];
    else if(value!==null) filters[key]=value;
  }
  return filters;
}
function filterParams(filters:CatalogFilters) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(filters)) if(Array.isArray(value)?value.length:value) params.set(key,Array.isArray(value)?value.join(','):value);
  return params;
}
const message=(error:unknown)=>error instanceof Error?error.message:'Course catalog could not be loaded.';
const programCodes=(value:string)=>value.split(',').map(code=>code.trim()).filter(Boolean);
function courseDraftFingerprint(record:CourseOffering,programText:string) {
  // Search metadata and its shared revision are not edits to the legacy course form.
  const fields=[...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'meetings','syllabus'];
  return JSON.stringify({...Object.fromEntries(fields.map(key=>[key,record[key as keyof CourseOffering]])),program_codes:programCodes(programText)});
}

function OfferingDetail({record,back}:{record:CourseOffering;back:string}) {
  return <main className="catalog-detail">
    <table><caption>課程資訊</caption><tbody>
      <tr><td>課程代碼</td><td>{record.course_code}</td><td>英文課名</td><td>{record.english_name}</td></tr>
      <tr><td>上課時數</td><td>{record.lecture_hours}</td><td>先修課程/分數</td><td>{record.prerequisite}</td></tr>
      <tr><td>實習時數</td><td>{record.practice_hours}</td><td>開放外系</td><td>{record.open_other_departments?'是':'否'}</td></tr>
      <tr><td>課程性質</td><td>{record.course_nature}</td><td>保留院系</td><td>{record.reserved_departments}</td></tr>
      <tr><td>畢業班課程</td><td>{record.graduating_course?'Y':'N'}</td><td>暑修週數</td><td>{record.summer_weeks}</td></tr>
      <tr><td colSpan={4}>課程說明:{record.description}</td></tr>
    </tbody></table>
    <Link to={back}>回上頁</Link>
    <p className="catalog-detail-provenance">stu.best · 本地範例課程</p>
  </main>;
}

function CatalogManager({userId,rows,onSaved,onReload}:{userId:string;rows:CourseOffering[];onSaved:()=>void;onReload:()=>void}) {
  const [record,setRecord]=useState<CourseOffering>(()=>({...newCourseOffering(),id:crypto.randomUUID()}));
  const [baseline,setBaseline]=useState(record);
  const [programText,setProgramText]=useState('');
  const [metadataDirty,setMetadataDirty]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const retry=useRef<{fingerprint:string;requestId:string}|null>(null);
  const courseDirty=courseDraftFingerprint(record,programText)!==courseDraftFingerprint(baseline,baseline.program_codes.join(','));
  function field(key:string,value:unknown) {setRecord(old=>({...old,[key]:value}));setStatus('');}
  function pick(id:string) {
    if(busy||metadataDirty)return;
    const selected=rows.find(row=>row.id===id) ?? {...newCourseOffering(),id:crypto.randomUUID()};
    setRecord(selected);setBaseline(selected);setProgramText(selected.program_codes.join(','));setMetadataDirty(false);setError('');setStatus('');retry.current=null;
  }
  async function save(kind:'save_course_offering'|'delete_course_offering') {
    if(busy||metadataDirty) return;
    setBusy(true);setError('');setStatus('');
    const edited={...record,program_codes:programCodes(programText)};
    const payload={id:record.id,expected_version:record.version,...(kind==='save_course_offering'?{record:edited}:{})};
    const fingerprint=JSON.stringify({kind,payload});
    if(retry.current?.fingerprint!==fingerprint) retry.current={fingerprint,requestId:crypto.randomUUID()};
    try {
      const result=await catalogRequest<{version:number}>('/api/affairs-manage',AbortSignal.timeout(20000),{kind,payload:{...payload,request_id:retry.current.requestId}});
      const saved=kind==='delete_course_offering'?{...newCourseOffering(),id:crypto.randomUUID()}:{...edited,version:result.version};
      setRecord(saved);setBaseline(saved);
      if(kind==='delete_course_offering') setProgramText('');
      retry.current=null;setStatus(kind==='delete_course_offering'?'已刪除範例課程。':'已儲存範例課程。');onSaved();
    } catch(cause) {setError(message(cause));} finally {setBusy(false);}
  }
  return <details className="catalog-manager"><summary>管理本地範例課程</summary>
    <p>管理員可維護所有查詢欄位。課程資料獨立於學生選課，不會更改任何學生紀錄。</p>
    {metadataDirty&&<p role="status">請先儲存或取消課綱查詢設定的變更，再編輯課程。</p>}
    <label>選擇本頁課程 <select value={rows.some(row=>row.id===record.id)?record.id:''} onChange={event=>pick(event.target.value)} disabled={busy||metadataDirty}>
      <option value="">新增課程</option>{rows.map(row=><option key={row.id} value={row.id}>{row.course_code} · {row.course_name}{row.published?'':'（未公開）'}</option>)}
    </select></label>
    <form onSubmit={event=>{event.preventDefault();void save('save_course_offering');}}>
      <fieldset disabled={busy||metadataDirty}><legend>課程與開課資料</legend><div className="catalog-editor-fields">
        {Object.entries(catalogTextFields).map(([key,[label,max]])=><label key={key}>{label}
          {key==='description'?<textarea maxLength={max} value={String(record[key as keyof CourseOffering])} onChange={event=>field(key,event.target.value)}/>
            :<input maxLength={max} required={['term_code','term_label','department_code','department_name','classification_code','admission_code','course_code','course_name','instructor'].includes(key)} value={String(record[key as keyof CourseOffering])} onChange={event=>field(key,event.target.value)}/>}</label>)}
        {Object.entries(catalogNumberFields).map(([key,label])=><label key={key}>{label}<input type="number" min="0" max={key==='credits'?30:['lecture_hours','practice_hours'].includes(key)?168:key==='summer_weeks'?52:100000} step={['credits','lecture_hours','practice_hours'].includes(key)?'0.01':'1'} required value={Number.isFinite(Number(record[key as keyof CourseOffering]))?Number(record[key as keyof CourseOffering]):''} onChange={event=>field(key,event.target.value===''?NaN:Number(event.target.value))}/></label>)}
        <label>學分學程代碼（逗號分隔）<input value={programText} onChange={event=>setProgramText(event.target.value)}/></label>
      </div>
      <div className="catalog-editor-options">{Object.entries(catalogBooleanFields).map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(record[key as keyof CourseOffering])} onChange={event=>field(key,event.target.checked)}/>{label}</label>)}</div>
      {[0,1].map(index=><fieldset key={index} className="catalog-meeting"><legend>時段{index+1}</legend>
        <label>星期 <select disabled={index===1&&!record.meetings[0]} value={record.meetings[index]?.weekday||''} onChange={event=>{
          const meetings=[...record.meetings];if(!event.target.value) meetings.splice(index,1);else meetings[index]={weekday:Number(event.target.value),periods:meetings[index]?.periods||['1']};field('meetings',meetings.filter(Boolean));
        }}><option value="">不設定</option>{catalogWeekdays.map((label,i)=><option key={label} value={i+1}>星期{label}</option>)}</select></label>
        {catalogPeriods.map(period=><label key={period}><input type="checkbox" disabled={!record.meetings[index]} checked={record.meetings[index]?.periods.includes(period)||false} onChange={event=>{
          const meetings=record.meetings.map((meeting,i)=>i===index?{...meeting,periods:event.target.checked?[...meeting.periods,period]:meeting.periods.filter(p=>p!==period)}:meeting);field('meetings',meetings);
        }}/>{period}</label>)}
      </fieldset>)}
      <CourseSyllabusEditor value={record.syllabus} onChange={value=>field('syllabus',value)}/>
      <button type="submit">{busy?'儲存中…':'儲存課程'}</button>
      <button type="button" disabled={!courseDirty} onClick={()=>{setRecord(baseline);setProgramText(baseline.program_codes.join(','));setError('');setStatus('');}}>取消課程變更</button>
      {record.version>0 && <details className="catalog-delete"><summary>刪除此範例課程</summary><p>刪除後將不再出現在課程查詢。</p><button type="button" onClick={()=>void save('delete_course_offering')}>確認刪除 {record.course_code}</button></details>}
      </fieldset>
    </form>
    {courseDirty&&<p role="status">請先儲存或取消課程變更，再編輯課綱查詢設定。</p>}
    <SyllabusSearchMetadataEditor key={userId+':'+record.id} userId={userId} record={record} latest={rows.find(row=>row.id===record.id)} disabled={busy||courseDirty} onDirtyChange={setMetadataDirty} onBusyChange={setBusy} onReload={onReload} onSaved={(receipt,metadata)=>{setRecord(current=>({...current,...metadata,version:receipt.version}));setBaseline(current=>({...current,...metadata,version:receipt.version}));retry.current=null;onSaved();}}/>
    {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
  </details>;
}

export default function CourseCatalog({userId}:{userId:string}) {
  const [params,setParams]=useSearchParams();
  const serialized=params.toString(),syllabusId=params.get('syllabus'),detailId=syllabusId||params.get('course');
  const [draft,setDraft]=useState(()=>({key:serialized,value:readFilters(params)}));
  const filters=draft.key===serialized?draft.value:readFilters(params);
  const [reload,setReload]=useState(0),[notice,setNotice]=useState('');
  const requestKey=userId+'|'+serialized+'|'+reload;
  const [loaded,setLoaded]=useState<{key:string;result:CatalogResult|null;error:string}>({key:'',result:null,error:''});
  const loading=loaded.key!==requestKey,result=loaded.key===requestKey?loaded.result:null,error=loaded.key===requestKey?loaded.error:'';
  useEffect(()=>{
    const abort=new AbortController();
    const query=detailId?new URLSearchParams({scope:'catalog',id:detailId}):filterParams(readFilters(new URLSearchParams(serialized)));
    query.set('scope','catalog');
    if(!detailId) for(const key of ['sort','direction','page']) {const value=new URLSearchParams(serialized).get(key);if(value) query.set(key,value);}
    void catalogRequest<CatalogResult>('/api/affairs-data?'+query,abort.signal).then(data=>{if(!abort.signal.aborted)setLoaded({key:requestKey,result:data,error:''});}).catch(cause=>{if(!abort.signal.aborted)setLoaded({key:requestKey,result:null,error:message(cause)});});
    return ()=>abort.abort();
  },[serialized,detailId,requestKey]);
  useEffect(()=>{document.title=syllabusId?'課程大綱 · stu.best':'課程查詢系統 Course Catalog · stu.best';},[syllabusId]);
  const back=new URLSearchParams(params);back.delete('course');back.delete('syllabus');
  if(detailId) return result?.rows[0]?(syllabusId?<CourseSyllabus record={result.rows[0]} back={courseCatalogPath+(back.size?'?'+back:'')}/>:<OfferingDetail record={result.rows[0]} back={courseCatalogPath+(back.size?'?'+back:'')}/>)
    :<main className="catalog-detail"><p role={error?'alert':'status'}>{loading?'載入課程資訊…':error||'找不到此課程。'}</p><Link to={courseCatalogPath+(back.size?'?'+back:'')}>回上頁</Link></main>;
  function update(key:keyof CatalogFilters,value:string|string[]) {setDraft({key:serialized,value:{...filters,[key]:value}});}
  function select(key:'yr'|'dep'|'ref1'|'admissionType'|'credit'|'grd'|'prog',label:string) {
    const extra=key==='yr'?result?.terms||[]:[];
    const options=[...extra,...(courseCatalogOptions[key]||[])].filter((o,i,all)=>all.findIndex(other=>other.value===o.value)===i);
    return <label className="catalog-filter-row">{label}： <select aria-label={label} value={filters[key]} onChange={event=>update(key,event.target.value)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  function radios(key:'required'|'e_course'|'english_taught'|'foreign_language'|'immersion',label:string) {
    return <fieldset className="catalog-radio-row"><legend>{label}：</legend>{[['','不限/ALL'],['true',key==='required'?'必修/Required':'是'],['false',key==='required'?'選修/Elective':'否']].map(([value,text])=><label key={value}><input type="radio" name={key} value={value} checked={filters[key]===value} onChange={()=>update(key,value)}/>{text}</label>)}</fieldset>;
  }
  function checks(key:'weekdays'|'periods',values:string[],labels:string[]) {
    return values.map((value,index)=><label key={value}><input type="checkbox" checked={filters[key].includes(value)} onChange={event=>update(key,event.target.checked?[...filters[key],value]:filters[key].filter(item=>item!==value))}/>{labels[index]}</label>);
  }
  function search(event:FormEvent) {event.preventDefault();setParams(filterParams(filters));setReload(value=>value+1);}
  function sort(key:string) {const next=new URLSearchParams(params);next.set('sort',key);next.set('direction',params.get('sort')===key&&params.get('direction')!=='desc'?'desc':'asc');next.delete('page');setParams(next);}
  return <main className="course-catalog" id="catalog-top">
    <header className="catalog-heading"><img src="/stu-reference/course-catalog-heading.jpg" alt="校務行政資訊整合系統 Information Integration System"/><h1>課程查詢系統 Course Catalog</h1>
      <p className="catalog-instructions">本系統僅供查詢使用，不具選課功能。<br/>stu.best 本地範例課程，非校方即時開課資料。請適當地設定查詢條件。</p>
      <Link className="catalog-home" to="/school-affairs">home</Link>
    </header>
    <form className="catalog-filters" onSubmit={search}>
      <div className="catalog-query-label">查詢選項Query Item</div>
      <div className="catalog-filter-columns"><div>
        {select('yr','學年/學期Academic year/Semester')}
        <div className="catalog-classification"><label>選擇課程類別Course Classification： <input aria-label="課程類別代碼" value={filters.ref1} maxLength={16} onChange={event=>update('ref1',event.target.value)}/></label>{select('ref1','課程類別')}</div>
        {select('credit','學分數Credit')}{select('grd','開課年級Grade')}
        <div className="catalog-filter-row">星期Weekday：{checks('weekdays',catalogWeekdays.map((_,i)=>String(i+1)),catalogWeekdays.map(day=>'星期'+day))}</div>
        <div className="catalog-filter-row">節次Section:{checks('periods',catalogPeriods,catalogPeriods)}</div>
        <label className="catalog-keyword">課程關鍵字Course Keyword（關鍵字查詢Keyword Query）： <input aria-label="課程關鍵字" value={filters.keyword} maxLength={160} onChange={event=>update('keyword',event.target.value)}/></label>
      </div><div>
        {select('dep','選擇開課單位Department')}{select('admissionType','開課學制Class Title')}
        {radios('required','必選修Required/Elective')}{select('prog','學分學程Program')}
        {radios('e_course','遠距教學e-course')}{radios('english_taught','全英語授課Language Lecturing in the Course')}
        {radios('foreign_language','外語類課程Foreign language courses')}{radios('immersion','雙語授課Two-way Immersion')}
        <label className="catalog-filter-row">授課教師Instructor(系所或姓名關鍵字輸入查詢)： <input aria-label="授課教師" value={filters.instructor} maxLength={160} onChange={event=>update('instructor',event.target.value)}/></label>
      </div></div>
      <div className="catalog-actions"><button type="submit" className="catalog-search" disabled={loading}>查詢 Search</button><button type="button" className="catalog-reset" onClick={()=>{setDraft({key:serialized,value:{...defaultCatalogFilters}});setParams(filterParams(defaultCatalogFilters));setReload(value=>value+1);}}>重設</button></div>
    </form>
    <hr/>
    <ul className="catalog-notes"><li>其他查詢功能－點選課程代碼可查詢課程大綱；點選課程名稱可查詢課程資訊；點選欄位標題進行排序。</li><li>人數欄位說明－修課人數：開學加退選結束後確定之人數。現選人數：現階段網路選課人數。本頁均為本地範例資料。</li></ul>
    {error&&<p role="alert" className="catalog-error">{error} <button onClick={()=>setReload(value=>value+1)}>重試</button></p>}
    <p className="catalog-count" role="status">{loading?'載入課程資料…':`計${result?.total??0} 筆課程資料`}</p>
    <div className="catalog-table-scroll" role="region" aria-label="課程查詢結果" tabIndex={0}><table className="catalog-table"><thead><tr>{courseCatalogColumns.map(([key,label])=><th key={key} scope="col" aria-sort={params.get('sort')===key?(params.get('direction')==='desc'?'descending':'ascending'):'none'}><button onClick={()=>sort(key)}>{label}</button></th>)}</tr></thead><tbody>
      {result?.rows.map((row,index)=><tr key={row.id}>{courseCatalogColumns.map(([key])=><td key={key}>{key==='course_name'||key==='course_code'?<Link to={courseCatalogPath+'?'+new URLSearchParams([...params.entries(),[key==='course_code'?'syllabus':'course',row.id]])}>{key==='course_code'?row.course_code:row.course_name}</Link>:catalogCell(row,key,index+result.page*result.page_size)}</td>)}</tr>)}
      {!loading&&!error&&!result?.rows.length&&<tr><td colSpan={21}>目前沒有符合查詢條件的課程。</td></tr>}
    </tbody></table></div>
    {result&&result.total>result.page_size&&<nav className="catalog-pagination" aria-label="課程分頁"><button disabled={result.page===0} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(result.page-1));setParams(next);}}>上一頁</button><span>第 {result.page+1} / {Math.ceil(result.total/result.page_size)} 頁</span><button disabled={(result.page+1)*result.page_size>=result.total} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(result.page+1));setParams(next);}}>下一頁</button></nav>}
    {notice&&<p role="status">{notice}</p>}
    {result?.can_manage&&<CatalogManager key={userId} userId={userId} rows={result.rows} onReload={()=>setReload(value=>value+1)} onSaved={()=>{setNotice('本地範例課程已更新。');setReload(value=>value+1);}}/>}
    <footer><Link to="/school-affairs">校務系統</Link> · stu.best 本地範例課程 <a href="#catalog-top">回頁首</a></footer>
  </main>;
}
