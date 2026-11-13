import type {SyllabusSearchFilters,SyllabusSearchOption,SyllabusSearchResult,SyllabusSearchRow,SyllabusSearchSort} from '../features/public/affairs/SyllabusSearch';
import {catalogBooleanFields,catalogNumberFields,catalogPeriods,catalogTextFields,type CourseOffering} from '../features/public/affairs/courseCatalogModel.js';
import {normalizeCourseSyllabus} from '../features/public/affairs/courseSyllabusModel.js';

export type SyllabusSearchOptions={terms:SyllabusSearchOption[];departments:SyllabusSearchOption[]};
export type CompleteSyllabusSearchResult=SyllabusSearchResult & {revision:string;sort:SyllabusSearchSort;rows:(SyllabusSearchRow & {sequence:number})[]};
export type SyllabusSearchSessionReader=()=>Promise<{userId:string;token:string}|null>;
export type SyllabusSearchClient={
  loadOptions:(userId:string,signal?:AbortSignal)=>Promise<SyllabusSearchOptions>;
  search:(userId:string,filters:SyllabusSearchFilters,signal?:AbortSignal,sort?:SyllabusSearchSort)=>Promise<CompleteSyllabusSearchResult>;
};
export type SyllabusSearchMetadata={syllabus_is_current:boolean|null;academic_year_text:string|null;semester_text:string|null};
export type SyllabusMetadataPayload=SyllabusSearchMetadata & {id:string;request_id:string;expected_version:number};
export type SyllabusMetadataReceipt={id:string;kind:'save_syllabus_search_metadata';version:number;summary:string};
export type SyllabusSearchApiClient=SyllabusSearchClient & {
  loadDetail:(userId:string,id:string,signal?:AbortSignal)=>Promise<{row:CourseOffering|null}>;
  saveMetadata:(userId:string,payload:SyllabusMetadataPayload,signal?:AbortSignal)=>Promise<SyllabusMetadataReceipt>;
};
export class SyllabusSearchClientError extends Error{
  status:number;
  constructor(message:string,status=503){super(message);this.name='SyllabusSearchClientError';this.status=status;}
}
const sortKeys=['sequence','course_code','course_name','academicYearText','semesterText','admission_name','instructor'];
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const n=char.codePointAt(0)!;return n!==0&&!(n>=0xd800&&n<=0xdfff);});
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const malformed=()=>new SyllabusSearchClientError('課綱資料未通過完整性檢查，請重新查詢。');
const accountChanged=()=>new SyllabusSearchClientError('登入帳戶已變更，請重新登入校務系統。',401);
function valid(condition:unknown):asserts condition{if(!condition)throw malformed();}

/** Copy criteria before awaiting so caller edits cannot change later page requests. */
export function copySyllabusSearchFilters(value:SyllabusSearchFilters):SyllabusSearchFilters{
  if(!exact(value,['keyword','scope','term','department','themes'])||!text(value.keyword,160)||typeof value.scope!=='string'||!['current','historical'].includes(value.scope)||!text(value.term,12)||!text(value.department,16)||!Array.isArray(value.themes)||value.themes.length>26||value.themes.some(item=>typeof item!=='string'||!/^(?:[1-9]|1[0-9]|2[0-6])$/.test(item))||new Set(value.themes).size!==value.themes.length)
    throw new SyllabusSearchClientError('查詢條件格式不正確，請重新設定條件。',400);
  return {keyword:value.keyword,scope:value.scope as SyllabusSearchFilters['scope'],term:value.term,department:value.department,themes:[...value.themes].sort((a,b)=>Number(a)-Number(b))};
}
export const syllabusSearchPath='/school-affairs/services/12-3';
const routeKeys=['search_scope','keyword','term','department','themes','searched','syllabus'];
export function syllabusSearchRouteParams(filters:SyllabusSearchFilters,searched=true,id?:string){
  const value=copySyllabusSearchFilters(filters),params=new URLSearchParams();
  params.set('search_scope',value.scope);for(const key of ['keyword','term','department'] as const)if(value[key])params.set(key,value[key]);
  if(value.themes.length)params.set('themes',value.themes.join(','));if(searched)params.set('searched','1');
  if(id){if(!uuid(id))throw new SyllabusSearchClientError('課綱識別碼不正確。',400);params.set('syllabus',id);}return params;
}
export function readSyllabusSearchRoute(params:URLSearchParams){
  try{
    if(params.toString().length>3000||[...params.keys()].some(key=>!routeKeys.includes(key)||params.getAll(key).length!==1)||(params.has('searched')&&params.get('searched')!=='1')||(params.has('syllabus')&&!uuid(params.get('syllabus'))))throw new SyllabusSearchClientError('課綱查詢網址條件不正確，請重新設定條件。',400);
    const filters=copySyllabusSearchFilters({keyword:params.get('keyword')??'',scope:(params.get('search_scope')??'current') as SyllabusSearchFilters['scope'],term:params.get('term')??'',department:params.get('department')??'',themes:params.get('themes')?params.get('themes')!.split(','):[]});
    return {filters,searched:params.get('searched')==='1',id:params.get('syllabus'),error:null};
  }catch(error){return {filters:copySyllabusSearchFilters({keyword:'',scope:'current',term:'',department:'',themes:[]}),searched:false,id:null,error:error instanceof SyllabusSearchClientError?error.message:'課綱查詢網址條件不正確，請重新設定條件。'};}
}
function parseOptions(value:unknown):SyllabusSearchOptions{
  valid(exact(value,['terms','departments']));
  const result:SyllabusSearchOptions={terms:[],departments:[]};
  for(const [key,codeLimit,labelLimit] of [['terms',12,80],['departments',16,100]] as const){
    const list=value[key];valid(Array.isArray(list)&&list.length<=1000);const seen=new Set<string>();
    for(const item of list){valid(exact(item,['value','label'])&&text(item.value,codeLimit)&&item.value.length>0&&text(item.label,labelLimit)&&item.label.length>0&&!seen.has(item.value));seen.add(item.value);result[key].push({value:item.value,label:item.label});}
  }
  return result;
}
function parseDetail(value:unknown,id:string):{row:CourseOffering|null}{
  valid(exact(value,['row']));if(value.row===null)return {row:null};
  const row=value.row;
  valid(exact(row,[...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'id','version','source_mode','program_codes','meetings','syllabus'])&&row.id===id&&integer(row.version,1,999999999)&&row.source_mode==='sample'&&row.published===true);
  for(const [key,[,limit]] of Object.entries(catalogTextFields))valid(text(row[key],limit));
  for(const key of Object.keys(catalogNumberFields))valid(typeof row[key]==='number'&&Number.isFinite(row[key])&&row[key]>=0&&row[key]<=100000);
  for(const key of Object.keys(catalogBooleanFields))valid(typeof row[key]==='boolean');
  valid(Array.isArray(row.program_codes)&&row.program_codes.length<=30&&row.program_codes.every(item=>typeof item==='string'&&/^[A-Za-z0-9_-]{1,24}$/.test(item))&&Array.isArray(row.meetings)&&row.meetings.length<=2);
  for(const item of row.meetings)valid(exact(item,['weekday','periods'])&&integer(item.weekday,1,7)&&Array.isArray(item.periods)&&item.periods.length>=1&&item.periods.length<=15&&item.periods.every(period=>typeof period==='string'&&catalogPeriods.includes(period)));
  try{normalizeCourseSyllabus(row.syllabus);}catch{throw malformed();}
  return {row:row as unknown as CourseOffering};
}
export function validateSyllabusMetadataPayload(value:unknown):value is SyllabusMetadataPayload{
  return exact(value,['id','request_id','expected_version','syllabus_is_current','academic_year_text','semester_text'])&&uuid(value.id)&&uuid(value.request_id)&&integer(value.expected_version,1,999999998)&&
    (value.syllabus_is_current===null||typeof value.syllabus_is_current==='boolean')&&(value.academic_year_text===null||text(value.academic_year_text,30))&&(value.semester_text===null||text(value.semester_text,30));
}
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response:Response,limit:number,signal:AbortSignal):Promise<unknown>{
  if(Number(response.headers.get('Content-Length'))>limit){void response.body?.cancel().catch(()=>{});throw malformed();}
  if(!response.body)throw malformed();
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,body='';
  try{
    for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>limit)throw malformed();body+=decoder.decode(chunk.value,{stream:true});}
    body+=decoder.decode();return JSON.parse(body) as unknown;
  }catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw signal.reason;throw error instanceof SyllabusSearchClientError?error:malformed();}
  finally{reader.releaseLock();}
}
// PostgreSQL COLLATE "C" compares UTF-8 bytes, unlike localeCompare or UTF-16 ordering.
const encoder=new TextEncoder();
function compareText(a:string,b:string):number{const aa=encoder.encode(a),bb=encoder.encode(b);for(let i=0;i<Math.min(aa.length,bb.length);i++)if(aa[i]!==bb[i])return aa[i]-bb[i];return aa.length-bb.length;}
type CompleteRow=CompleteSyllabusSearchResult['rows'][number];
function canonical(a:CompleteRow,b:CompleteRow){return compareText(a.course_code,b.course_code)||compareText(a.id,b.id);}
function compareRows(a:CompleteRow,b:CompleteRow,sort:SyllabusSearchSort){
  const x=a[sort.key],y=b[sort.key];
  if(x===null||y===null)return x===y?canonical(a,b):x===null?1:-1;
  const order=typeof x==='number'&&typeof y==='number'?x-y:compareText(String(x),String(y));
  return order*(sort.direction==='asc'?1:-1)||canonical(a,b);
}
function parsePage(value:unknown,filters:SyllabusSearchFilters,page:number,sort:SyllabusSearchSort){
  valid(exact(value,['scope','total','rows','page','pageSize','hasMore','sort','revision'])&&value.scope===filters.scope&&integer(value.total,0,Number.MAX_SAFE_INTEGER)&&value.page===page&&value.pageSize===100&&exact(value.sort,['key','direction'])&&value.sort.key===sort.key&&value.sort.direction===sort.direction&&typeof value.revision==='string'&&/^[0-9a-f]{32}$/.test(value.revision));
  if(value.total>1000)throw new SyllabusSearchClientError('符合條件的課綱超過 1000 筆，請縮小查詢條件後重新查詢。',422);
  valid(Array.isArray(value.rows)&&value.rows.length===Math.min(100,Math.max(0,value.total-page*100))&&value.hasMore===(page*100+value.rows.length<value.total));
  const rows:CompleteRow[]=[];
  for(const row of value.rows){
    valid(exact(row,['id','sequence','course_code','course_name','admission_name','instructor','academicYearText','semesterText'])&&uuid(row.id)&&integer(row.sequence,1,value.total)&&text(row.course_code,40)&&text(row.course_name,160)&&text(row.admission_name,100)&&text(row.instructor,100)&&(row.academicYearText===null||text(row.academicYearText,30))&&(row.semesterText===null||text(row.semesterText,30)));
    rows.push({id:row.id,sequence:row.sequence,course_code:row.course_code,course_name:row.course_name,admission_name:row.admission_name,instructor:row.instructor,academicYearText:row.academicYearText as string|null,semesterText:row.semesterText as string|null});
  }
  return {scope:filters.scope,total:value.total,rows,revision:value.revision,hasMore:value.hasMore as boolean};
}

/** One deadline covers session reads, network/body reads, and the entire complete-result drain. */
export function createSyllabusSearchClient(readSession:SyllabusSearchSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),operationTimeoutMs=30000):SyllabusSearchApiClient{
  if(!integer(operationTimeoutMs,1,30000))throw new Error('Syllabus operation timeout must be between 1 and 30000 ms.');
  async function operation<T>(userId:string,signal:AbortSignal|undefined,run:(request:(query:URLSearchParams,maxBytes:number,body?:unknown)=>Promise<unknown>)=>Promise<T>):Promise<T>{
    if(!uuid(userId))throw accountChanged();
    const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(new DOMException('Syllabus request timed out.','TimeoutError')),operationTimeoutMs);
    const bounded=signal?AbortSignal.any([signal,deadline.signal]):deadline.signal;
    const session=async()=>{
      let value:Awaited<ReturnType<SyllabusSearchSessionReader>>;
      try{value=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new SyllabusSearchClientError('登入狀態暫時無法確認，請稍後再試。');}
      if(!value||value.userId!==userId||typeof value.token!=='string'||!value.token)throw accountChanged();return value;
    };
    try{
      bounded.throwIfAborted();
      return await run(async(query,maxBytes,body)=>{
        const before=await session();let response:Response;
        try{response=await within(()=>fetcher(body?'/api/affairs-manage':'/api/affairs-data?'+query.toString(),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
        catch(error){if(bounded.aborted)throw error;throw new SyllabusSearchClientError('課綱資料暫時無法載入，請稍後重試。');}
        if(!response.ok){void response.body?.cancel().catch(()=>{});await session();throw new SyllabusSearchClientError(response.status===401?'登入已逾時，請重新登入校務系統。':response.status===403?'目前帳戶無法執行此課綱操作。':response.status===400?'課綱欄位不正確，請重新檢查。':response.status===409?'此課程已更新，請重新載入後再儲存。':'課綱資料暫時無法載入，請稍後重試。',[400,401,403,409].includes(response.status)?response.status:503);}
        const result=await jsonWithin(response,maxBytes,bounded);await session();bounded.throwIfAborted();return result;
      });
    }catch(error){if(signal?.aborted)throw signal.reason;if(deadline.signal.aborted)throw new SyllabusSearchClientError('課綱查詢逾時，請縮小條件後重試。',504);throw error;}
    finally{clearTimeout(timer);}
  }
  return {
    loadOptions:(userId,signal)=>operation(userId,signal,async request=>parseOptions(await request(new URLSearchParams({scope:'syllabus-options'}),2*1024*1024))),
    loadDetail:async(userId,id,signal)=>{
      if(!uuid(id))throw new SyllabusSearchClientError('課綱識別碼不正確。',400);
      return operation(userId,signal,async request=>parseDetail(await request(new URLSearchParams({scope:'syllabus-detail',id}),128*1024),id));
    },
    saveMetadata:async(userId,input,signal)=>{
      if(!validateSyllabusMetadataPayload(input))throw new SyllabusSearchClientError('課綱查詢設定格式不正確，請檢查欄位。',400);
      const payload={...input};
      return operation(userId,signal,async request=>{
        const receipt=await request(new URLSearchParams(),4096,{kind:'syllabus-metadata',payload});
        valid(exact(receipt,['id','kind','version','summary'])&&receipt.id===payload.id&&receipt.kind==='save_syllabus_search_metadata'&&receipt.version===payload.expected_version+1&&text(receipt.summary,200));
        return receipt as SyllabusMetadataReceipt;
      });
    },
    search:async(userId,input,signal,requestedSort={key:'sequence',direction:'asc'})=>{
      const filters=copySyllabusSearchFilters(input),sort={...requestedSort};
      if(!exact(requestedSort,['key','direction'])||!sortKeys.includes(sort.key)||!['asc','desc'].includes(sort.direction))return Promise.reject(new SyllabusSearchClientError('課綱排序條件不正確。',400));
      return operation(userId,signal,async request=>{
        const rows:CompleteRow[]=[],ids=new Set<string>(),sequences=new Set<number>();let total:number|undefined,revision:string|undefined;
        for(let page=0;page<10;page++){
          const query=new URLSearchParams({scope:'syllabus-search',search_scope:filters.scope,keyword:filters.keyword,term:filters.term,department:filters.department,themes:filters.themes.join(','),page:String(page),page_size:'100',sort:sort.key,direction:sort.direction});
          const result=parsePage(await request(query,512*1024),filters,page,sort);
          if(total!==undefined)valid(result.total===total&&result.revision===revision);else{total=result.total;revision=result.revision;}
          for(const row of result.rows){valid(!ids.has(row.id)&&!sequences.has(row.sequence));if(rows.length)valid(compareRows(rows[rows.length-1],row,sort)<0);ids.add(row.id);sequences.add(row.sequence);rows.push(row);}
          if(!result.hasMore){
            valid(rows.length===total);
            const canonicalRows=[...rows].sort(canonical);valid(canonicalRows.every((row,index)=>row.sequence===index+1));
            return {scope:filters.scope,total,rows,sort,revision:revision!};
          }
        }
        throw malformed();
      });
    },
  };
}
/** Only the independent School Affairs session is used; no Nexus or official-school requests. */
export const syllabusSearchClient=createSyllabusSearchClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
