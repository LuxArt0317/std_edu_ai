import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router';
import {SyllabusSearch,type SyllabusSearchFilters,type SyllabusSearchRow} from './SyllabusSearch';
import {CourseSyllabus} from './courseSyllabusViews';
import type {CourseOffering} from './courseCatalogModel.js';
import {copySyllabusSearchFilters,readSyllabusSearchRoute,syllabusSearchPath,syllabusSearchRouteParams,syllabusSearchClient,SyllabusSearchClientError,type CompleteSyllabusSearchResult,type SyllabusSearchApiClient,type SyllabusSearchClient,type SyllabusSearchOptions} from '../../../services/syllabusSearchClient';

export type SyllabusSearchWorkspaceProps={
  userId:string;
  onOpenDetail:(row:SyllabusSearchRow)=>void;
  initialFilters?:SyllabusSearchFilters;
  /** A parent-controlled back/forward navigation identity; never a URL to fetch. */
  navigationKey?:string;
  initialSearch?:boolean;
  initialError?:string|null;
  /** Parent may persist submitted filters in its local route before opening a detail. */
  onFiltersChange?:(filters:SyllabusSearchFilters)=>void;
  /** Routing host owns the query operation when submitting creates a navigation. */
  onNavigateSearch?:(filters:SyllabusSearchFilters)=>void;
  client?:SyllabusSearchClient;
};
const emptyFilters=():SyllabusSearchFilters=>({keyword:'',scope:'current',term:'',department:'',themes:[]});
const message=(error:unknown)=>error instanceof SyllabusSearchClientError?error.message:'課綱資料暫時無法載入，請稍後重試。';

/** Unmounted host. The account/navigation key discards prior records synchronously on render. */
export function SyllabusSearchWorkspace(props:SyllabusSearchWorkspaceProps){
  return <AccountSyllabusSearch key={props.userId+'\u0000'+(props.navigationKey??'')} {...props}/>;
}
function AccountSyllabusSearch({userId,onOpenDetail,initialFilters,initialSearch=false,initialError,onFiltersChange,onNavigateSearch,client=syllabusSearchClient}:SyllabusSearchWorkspaceProps){
  const [initial]=useState(()=>{try{return {filters:copySyllabusSearchFilters(initialFilters??emptyFilters()),error:initialError??null};}catch(error){return {filters:emptyFilters(),error:message(error)};}});
  const [options,setOptions]=useState<SyllabusSearchOptions|null>(null);
  const [result,setResult]=useState<CompleteSyllabusSearchResult|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState<string|null>(initial.error);
  const pending=useRef<SyllabusSearchFilters|null>(initialSearch&&!initial.error?initial.filters:null);
  const operation=useRef<AbortController|null>(null);
  const alive=useRef(false);
  const criteriaError=(filters:SyllabusSearchFilters,available:SyllabusSearchOptions)=>
    filters.term&&!available.terms.some(item=>item.value===filters.term)||filters.department&&!available.departments.some(item=>item.value===filters.department)
      ?new SyllabusSearchClientError('所選學期或系所目前無法確認，請重新設定查詢條件。',400):null;
  async function run(filters:SyllabusSearchFilters|null,available:SyllabusSearchOptions|null){
    operation.current?.abort();const controller=new AbortController();operation.current=controller;
    setBusy(true);setError(null);setResult(null);
    try{
      const loaded=available??await client.loadOptions(userId,controller.signal);
      if(controller.signal.aborted||!alive.current)return;
      setOptions(loaded);
      if(filters){
        const invalid=criteriaError(filters,loaded);if(invalid)throw invalid;
        const completed=await client.search(userId,filters,controller.signal);
        if(controller.signal.aborted||!alive.current)return;
        setResult(completed);
      }else if(initial.error)setError(initial.error);
    }catch(cause){if(!controller.signal.aborted&&alive.current)setError(message(cause));}
    finally{if(!controller.signal.aborted&&alive.current)setBusy(false);}
  }
  useEffect(()=>{
    alive.current=true;void run(pending.current,null);
    return ()=>{alive.current=false;operation.current?.abort();};
    // A client replacement starts a fresh account-bound load; submitted criteria remain local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client,userId]);
  return <SyllabusSearch terms={options?.terms??[]} departments={options?.departments??[]} result={result} busy={busy} error={error} initialFilters={initial.filters}
    onSearch={filters=>{
      if(busy)return;
      try{const submitted=copySyllabusSearchFilters(filters);pending.current=submitted;onFiltersChange?.(copySyllabusSearchFilters(submitted));if(onNavigateSearch)onNavigateSearch(submitted);else void run(submitted,options);}
      catch(cause){setResult(null);setError(message(cause));}
    }}
    onRetry={()=>{if(!busy)void run(pending.current,options);}}
    onOpenDetail={row=>{if(!busy&&!error&&result?.rows.some(item=>item.id===row.id))onOpenDetail(row);}}/>;
}

/** Exact local query route. Back targets are constructed here; caller-supplied URLs are never used. */
export function SyllabusSearchRoute({userId,client=syllabusSearchClient}:{userId:string;client?:SyllabusSearchApiClient}){
  const [params,setParams]=useSearchParams(),location=useLocation(),state=readSyllabusSearchRoute(params);
  const back=syllabusSearchPath+'?'+syllabusSearchRouteParams(state.filters,state.searched).toString();
  useEffect(()=>{document.title=state.id?'課程大綱 · stu.best':'課程大綱查詢 · stu.best';},[state.id]);
  if(state.id)return <SyllabusDetailWorkspace key={userId+':'+state.id} userId={userId} id={state.id} back={back} client={client}/>;
  return <SyllabusSearchWorkspace userId={userId} navigationKey={location.key} initialFilters={state.filters} initialSearch={state.searched} initialError={state.error} client={client}
    onNavigateSearch={filters=>setParams(syllabusSearchRouteParams(filters),{replace:true})}
    onOpenDetail={row=>setParams(syllabusSearchRouteParams(state.filters,state.searched,row.id))}/>;
}
function SyllabusDetailWorkspace({userId,id,back,client}:{userId:string;id:string;back:string;client:Pick<SyllabusSearchApiClient,'loadDetail'>}){
  const [revision,setRevision]=useState(0),[state,setState]=useState<{revision:number;row:CourseOffering|null;error:string|null}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void client.loadDetail(userId,id,controller.signal).then(data=>{if(!controller.signal.aborted)setState({revision,row:data.row,error:null});}).catch(error=>{if(!controller.signal.aborted)setState({revision,row:null,error:message(error)});});
    return()=>controller.abort();
  },[userId,id,revision,client]);
  const current=state?.revision===revision?state:null;
  if(current?.row)return <CourseSyllabus record={current.row} back={back}/>;
  return <main className="catalog-detail"><p role={current?.error?'alert':'status'}>{!current?'載入課程大綱…':current.error||'此課程大綱目前無法提供。'}</p>{current?.error&&<button type="button" onClick={()=>setRevision(value=>value+1)}>重試</button>}<Link to={back}>回上頁</Link></main>;
}
