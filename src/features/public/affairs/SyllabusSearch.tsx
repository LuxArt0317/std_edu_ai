import {useId,useState,type FormEvent} from 'react';
import type {CourseOffering} from './courseCatalogModel.js';
import {syllabusMeanings} from './courseSyllabusOptions.js';
import './syllabusSearch.css';

export type SyllabusSearchScope='current'|'historical';
export type SyllabusSearchFilters={keyword:string;scope:SyllabusSearchScope;term:string;department:string;themes:string[]};
export type SyllabusSearchOption={value:string;label:string};
export type SyllabusSearchRow=Pick<CourseOffering,'id'|'course_code'|'course_name'|'admission_name'|'instructor'> & {academicYearText:string|null;semesterText:string|null;sequence?:number};
export type SyllabusSearchSortKey='sequence'|'course_code'|'course_name'|'academicYearText'|'semesterText'|'admission_name'|'instructor';
export type SyllabusSearchSort={key:SyllabusSearchSortKey;direction:'asc'|'desc'};
export type SyllabusSearchResult={scope:SyllabusSearchScope;total:number;rows:SyllabusSearchRow[];sort?:SyllabusSearchSort};
export type SyllabusSearchProps={
  terms:readonly SyllabusSearchOption[];departments:readonly SyllabusSearchOption[];
  result:SyllabusSearchResult|null;busy:boolean;error?:string|null;initialFilters?:Partial<SyllabusSearchFilters>;
  onSearch:(filters:SyllabusSearchFilters)=>void;onRetry:()=>void;onOpenDetail:(row:SyllabusSearchRow)=>void;onSort?:(sort:SyllabusSearchSort)=>void;
};
const syllabusSearchColumns=['序號','課號','課程名稱','學年','學期','學制','授課老師','內容'] as const;
const sortKeys=['sequence','course_code','course_name','academicYearText','semesterText','admission_name','instructor','content'] as const;
const emptyFilters=():SyllabusSearchFilters=>({keyword:'',scope:'current',term:'',department:'',themes:[]});
const themes=syllabusMeanings.map((label,index)=>({value:String(index+1),label}));
function validResult(value:SyllabusSearchResult|null):value is SyllabusSearchResult {
  if(!value||!['current','historical'].includes(value.scope)||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.rows)||value.total<value.rows.length)return false;
  if(value.sort&&(!sortKeys.slice(0,7).includes(value.sort.key)||!['asc','desc'].includes(value.sort.direction)))return false;
  const ids=new Set<string>();
  return value.rows.every(row=>{
    if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||(row.sequence!==undefined&&(!Number.isSafeInteger(row.sequence)||row.sequence<1)))return false;
    ids.add(row.id);
    return ['course_code','course_name','admission_name','instructor'].every(key=>typeof row[key as keyof SyllabusSearchRow]==='string')
      &&[row.academicYearText,row.semesterText].every(item=>item===null||typeof item==='string');
  });
}

/** Read-only view. The host supplies explicit query results and the local detail destination. */
export function SyllabusSearch({terms,departments,result,busy,error,initialFilters,onSearch,onRetry,onOpenDetail,onSort}:SyllabusSearchProps) {
  const identity=useId(),criteriaId=identity+'-criteria';
  const [filters,setFilters]=useState<SyllabusSearchFilters>(()=>({...emptyFilters(),...initialFilters,themes:[...(initialFilters?.themes??[])]}));
  const [expanded,setExpanded]=useState(true);
  const [sort,setSort]=useState<(SyllabusSearchSort & {result:SyllabusSearchResult})|null>(null);
  const usable=validResult(result),failed=Boolean(error)||Boolean(result&&!usable);
  const ready=usable&&!busy&&!failed;
  const complete=ready&&result.total===result.rows.length;
  const activeSort=complete?(onSort?result.sort??null:sort?.result===result?sort:null):null;
  const rows=complete?result.rows.map((row,index)=>({row,sequence:row.sequence??index+1})):[];
  if(activeSort&&!onSort){
    const key=activeSort.key,collator=new Intl.Collator('zh-Hant',{numeric:true,sensitivity:'variant'});
    rows.sort((a,b)=>(activeSort.direction==='asc'?1:-1)*(key==='sequence'?a.sequence-b.sequence:collator.compare(a.row[key]??'',b.row[key]??''))||a.sequence-b.sequence);
  }
  const field=<K extends keyof SyllabusSearchFilters>(key:K,value:SyllabusSearchFilters[K])=>setFilters(prior=>({...prior,[key]:value}));
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    if(!busy)onSearch({...filters,themes:[...filters.themes]});
  };
  const theme=(value:string,checked:boolean)=>field('themes',themes.filter(item=>item.value===value?checked:filters.themes.includes(item.value)).map(item=>item.value));
  const detail=(row:SyllabusSearchRow,text:string|null)=> <button type="button" className="syllabus-search-detail" onClick={()=>onOpenDetail(row)} aria-label={`${row.course_name}：${text??'—'}，開啟課程大綱`}>{text??'—'}</button>;
  return <div className="syllabus-search" lang="zh-Hant"><div className="syllabus-search-doc">
    <header className="syllabus-search-header">
      <div className="syllabus-search-banner"><span>Campus Information Services</span><span>Shu-Te University</span></div>
      <div className="syllabus-search-brand"><img src="/stu-reference/housing-logo.png" width="45" height="45" alt=""/><h1>樹德校務資訊系統 ─ 課程大綱查詢</h1></div>
    </header>
    <main className="syllabus-search-content">
      <div className="syllabus-search-title"><h2>設定查詢條件:</h2><button type="button" className="syllabus-search-collapse" aria-controls={criteriaId} aria-expanded={expanded} aria-label={expanded?'收合查詢條件':'展開查詢條件'} onClick={()=>setExpanded(value=>!value)}><span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button></div>
      <div id={criteriaId} className="syllabus-search-criteria" hidden={!expanded}>
        <form className="syllabus-search-form" onSubmit={submit}>
          <fieldset disabled={busy} className="syllabus-search-fields">
            <div className="syllabus-search-field"><label htmlFor={identity+'-keyword'}>搜尋關鍵字:</label><input id={identity+'-keyword'} aria-label="關鍵字" type="text" maxLength={160} value={filters.keyword} onChange={event=>field('keyword',event.target.value)}/></div>
            <fieldset className="syllabus-search-field syllabus-search-scope"><legend>查詢範圍:</legend><div>{([['current','當期課程'],['historical','歷年課程']] as const).map(([value,label])=><label key={value}><input type="radio" name={identity+'-scope'} value={value} checked={filters.scope===value} onChange={()=>field('scope',value)}/>{label}</label>)}</div></fieldset>
            <div className="syllabus-search-field"><label htmlFor={identity+'-term'}>查詢學期:</label><select id={identity+'-term'} aria-label="學年學期" value={filters.term} onChange={event=>field('term',event.target.value)}><option value="">不限</option>{terms.filter(option=>option.value).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="syllabus-search-field"><label htmlFor={identity+'-department'}>開課單位:</label><select id={identity+'-department'} aria-label="系所" value={filters.department} onChange={event=>field('department',event.target.value)}><option value="">不限</option>{departments.filter(option=>option.value).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="syllabus-search-field"><span className="syllabus-search-theme-label">課程意涵:</span></div>
            <table className="syllabus-search-themes" aria-label="課程意涵"><thead><tr><th scope="col">編號</th><th scope="col">課程意涵</th><th scope="col">編號</th><th scope="col">課程意涵</th></tr></thead><tbody>{Array.from({length:13},(_,index)=><tr key={index}>{[themes[index*2],themes[index*2+1]].map(item=><FragmentTheme key={item.value} item={item} checked={filters.themes.includes(item.value)} onChange={checked=>theme(item.value,checked)}/>)}</tr>)}</tbody></table>
            <p className="syllabus-search-note">因網路資源有限，若欲查詢最接近預期之課程請利用關鍵字條件比對搜尋，以節省網路資源。</p>
            <div className="syllabus-search-actions"><button type="submit">查詢</button><button type="button" onClick={()=>setFilters(emptyFilters())}>清除</button></div>
          </fieldset>
        </form>
      </div>
      <div className="syllabus-search-results" role="region" aria-label="課綱查詢結果" tabIndex={0} aria-busy={busy}>
        <table><caption><span>{complete?`${result.scope==='current'?'當期':'歷史'}課綱查詢結果計${result.total}筆`:'課綱查詢結果'}</span></caption><thead><tr>{syllabusSearchColumns.map((label,column)=>{const key=sortKeys[column];return <th key={label} scope="col" aria-sort={activeSort?.key===key?(activeSort.direction==='asc'?'ascending':'descending'):'none'}><button type="button" className="syllabus-search-sort" disabled={!complete||key==='content'} onClick={()=>{if(complete&&key!=='content'){const next:SyllabusSearchSort={key,direction:activeSort?.key===key&&activeSort.direction==='asc'?'desc':'asc'};if(onSort)onSort(next);else setSort({...next,result});}}}>{label}<span aria-hidden="true" className="syllabus-search-sort-arrows"/></button></th>;})}</tr></thead>
          <tbody>{busy?<tr><td colSpan={8} role="status">查詢中…</td></tr>:failed?<tr><td colSpan={8}><p role="alert">{error||'課綱查詢結果無法讀取。'}</p><button className="syllabus-search-retry" type="button" onClick={onRetry}>重試</button></td></tr>:!ready?<tr><td colSpan={8} role="status">請設定條件後查詢。</td></tr>:!complete?<tr><td colSpan={8} role="status">符合條件共 {result.total} 筆，但僅載入 {result.rows.length} 筆；結果尚未完整，請縮小查詢條件後重新查詢。</td></tr>:rows.map(({row,sequence})=><tr key={row.id}><td>{sequence}</td><td>{detail(row,row.course_code)}</td><td>{detail(row,row.course_name)}</td><td>{detail(row,row.academicYearText)}</td><td>{detail(row,row.semesterText)}</td><td>{detail(row,row.admission_name)}</td><td>{detail(row,row.instructor)}</td><td>{detail(row,'…')}</td></tr>)}</tbody>
        </table>
      </div>
    </main>
  </div></div>;
}

function FragmentTheme({item,checked,onChange}:{item:SyllabusSearchOption;checked:boolean;onChange:(value:boolean)=>void}) {
  return <><td>{item.value}</td><td><label><input type="checkbox" value={item.value} checked={checked} onChange={event=>onChange(event.target.checked)}/>{item.label}</label></td></>;
}
