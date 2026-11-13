/** Selected supplemental reader. Requires 20261112170000_syllabus_search.sql.
 * Only published local offerings; never enrollment, official records or writes.
 */
import {loadSyllabusSearch,loadSyllabusDetail,normalizeSyllabusSearchQuery} from './syllabusSearch.js';
import {normalizeCourseOffering} from './courseCatalog.js';
import {catalogTextFields,catalogNumberFields,catalogBooleanFields} from '../src/features/public/affairs/courseCatalogModel.js';
import {normalizeCourseSyllabus} from '../src/features/public/affairs/courseSyllabusModel.js';

export const catalogEvidenceRequirements=Object.freeze({migration:'20261112170000',mounted:true,readOnly:true});
export const catalogEvidenceMaxBytes=18000;
const base='/school-affairs/services/12-4';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const safeText=(value,max)=>typeof value==='string'&&[...value].length<=max&&!/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value);
const validAccount=account=>plain(account)&&uuid(account.user?.id)&&typeof account.token==='string'&&Boolean(account.token)&&typeof account.key==='string'&&Boolean(account.key)&&/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url??'');
const domain=/\bcourse\s+(?:catalog(?:ue)?|offerings?|search|outline)\b|\bsyllab(?:us|i)\b|\b(?:offered|available)\s+courses?\b|\bcourses?(?:\s+are)?\s+(?:offered|available)\b|課程大綱|課綱|開課(?:查詢|資料|清單)|當期課程查詢/iu;
const personalOnly=/\b(?:my (?:grades?|gpa|tuition|fees?|assignments?|attendance|enrollments?|subjects?|classes)|next class|classes today|enrolled courses?)\b|我的(?:成績|課表|學費|作業|選課)|下(?:一)?堂課/iu;
const pathOf=route=>typeof route==='string'?route.split(/[?#]/u)[0].replace(/\/+$/u,''):'';

export function isCatalogEvidenceQuestion(question,route='',history=[]) {
  if(typeof question!=='string'||!question.trim())return false;
  if(domain.test(question))return true;
  if(personalOnly.test(question))return false;
  const catalogRoute=[base,'/school-affairs/services/12-3'].includes(pathOf(route));
  const followup=/^(?:and\b|what about\b|how about\b|what (?:does|is|are|will)|who |when |where |show |explain |那|這|它|還有|請問)/iu.test(question.trim());
  const previous=Array.isArray(history)?[...history].reverse().find(row=>row?.role==='user'&&typeof row.content==='string')?.content:'';
  return followup&&(catalogRoute||domain.test(previous||''));
}

function selectionError(code='invalid_selection'){const error=new Error(code);error.code=code;throw error;}
const queryKeys=['id','search_scope','keyword','term','department','themes','page','page_size','sort','direction'];
const legacyRouteKeys=new Set(['course','syllabus','yr','dep','ref1','admissionType','credit','grd','prog','required','e_course','english_taught','foreign_language','immersion','keyword','instructor','weekdays','periods','page','sort','direction']);
const syllabusRouteKeys=new Set(['search_scope','keyword','term','department','themes','searched','syllabus']);
const searchFilterKeys=['search_scope','keyword','term','department','themes'];
function normalizedQuery(input){
  if(input.themes&&new Set(input.themes.split(',')).size!==input.themes.split(',').length)selectionError();
  const args=normalizeSyllabusSearchQuery(input);
  if(args.p_page_size>50||args.p_page>1000)selectionError();
  return args;
}
function comparableSelector(key,value){
  if(key==='keyword')return value.trim();
  if(key==='themes')return value?value.split(',').map(Number).sort((a,b)=>a-b).join(','):'';
  if(['page','page_size'].includes(key))return String(Number(value));
  return value;
}
function select(query,route,question) {
  if(!plain(query)||Object.keys(query).some(key=>!queryKeys.includes(key)||typeof query[key]!=='string'))selectionError();
  if(query.id!==undefined&&!uuid(query.id))selectionError();
  if(query.id&&Object.keys(query).some(key=>key!=='id'))selectionError('ambiguous_selection');
  const queryFilters={...query};delete queryFilters.id;
  // Validate explicit selectors independently; neither a route nor an exact ID
  // may conceal malformed planner input.
  normalizedQuery({search_scope:'historical',page_size:'20',...queryFilters});
  let routeId=null,syllabus=false,fromRoute={},routeContext=null,defaultScope='historical';
  if(route!==undefined&&typeof route!=='string')selectionError();
  const path=pathOf(route),syllabusRoute=path==='/school-affairs/services/12-3';
  if(route&&(!route.startsWith('/')||route.startsWith('//')||route.length>(syllabusRoute?3100:2048)||/[\u0000-\u001f\\]/u.test(route)))selectionError();
  if([base,'/school-affairs/services/12-3'].includes(path)) {
    const url=new URL(route,'https://stu.best'),params=url.searchParams;
    if(syllabusRoute&&params.toString().length>3000)selectionError();
    const routeKeys=syllabusRoute?syllabusRouteKeys:legacyRouteKeys;
    const seen=new Set();
    for(const [key,value]of params){if(!routeKeys.has(key)||seen.has(key)||!safeText(value,160))selectionError();seen.add(key);}
    const ids=['course','syllabus'].filter(key=>params.has(key));
    if(ids.length>1)selectionError('ambiguous_selection');
    if(ids.length){routeId=params.get(ids[0]);if(!uuid(routeId))selectionError();routeId=routeId.toLowerCase();syllabus=ids[0]==='syllabus';}
    if(syllabusRoute){
      defaultScope='current';
      if(params.has('searched')&&params.get('searched')!=='1')selectionError();
      for(const key of searchFilterKeys)if(params.has(key))fromRoute[key]=params.get(key);
    }else{
      for(const [key,target]of [['yr','term'],['dep','department'],['keyword','keyword'],['page','page'],['sort','sort'],['direction','direction']]){
        const value=params.get(key);if(value&&!(key==='dep'&&value==='0'))fromRoute[target]=value;
      }
      if([...params].some(([key,value])=>!['course','syllabus','yr','dep','keyword','page','sort','direction'].includes(key)&&value!==''&&value!=='0'))selectionError('unsupported_filters');
    }
    const routeArgs=normalizedQuery({search_scope:defaultScope,page_size:'20',...fromRoute});
    routeContext={path,filters:routeArgs.p_filters,...(syllabusRoute?{searched:params.get('searched')==='1'}:{})};
  }
  const id=query.id?.toLowerCase()||routeId;
  if(query.id&&routeId&&query.id.toLowerCase()!==routeId)selectionError('ambiguous_selection');
  if(id&&Object.keys(queryFilters).length)selectionError('ambiguous_selection');
  // Like the page's detail loader, an exact ID selects the offering. Filters
  // retained in that URL describe the originating search, not facts about it.
  if(id)return {mode:'detail',id,syllabus:syllabus||/syllab|outline|課綱|大綱/iu.test(question),filters:null,routeContext};
  for(const key of Object.keys(fromRoute)){
    if(Object.hasOwn(queryFilters,key)&&comparableSelector(key,fromRoute[key])!==comparableSelector(key,queryFilters[key]))selectionError('ambiguous_selection');
  }
  const input={search_scope:defaultScope,page_size:'20',...fromRoute,...queryFilters};
  const args=normalizedQuery(input);
  return {mode:'search',query:input,filters:args.p_filters,page:args.p_page,pageSize:args.p_page_size,sort:{key:args.p_sort,direction:args.p_direction},routeContext};
}

function validateSearch(result,selection){
  if(!exact(result,['scope','total','rows','page','pageSize','hasMore','sort','revision'])||result.scope!==selection.filters.scope
    ||!Number.isSafeInteger(result.total)||result.total<0||!Array.isArray(result.rows)||result.page!==selection.page||result.pageSize!==selection.pageSize
    ||!exact(result.sort,['key','direction'])||result.sort.key!==selection.sort.key||result.sort.direction!==selection.sort.direction
    ||typeof result.revision!=='string'||!/^[0-9a-f]{32}$/u.test(result.revision)
    ||result.rows.length!==Math.min(selection.pageSize,Math.max(0,result.total-selection.page*selection.pageSize))
    ||result.hasMore!==(selection.page*selection.pageSize+result.rows.length<result.total))throw new Error('malformed_catalog_result');
  const ids=new Set(),sequences=new Set();
  for(const row of result.rows){
    if(!exact(row,['id','sequence','course_code','course_name','admission_name','instructor','academicYearText','semesterText'])||!uuid(row.id)||ids.has(row.id)||!Number.isSafeInteger(row.sequence)||row.sequence<1||row.sequence>result.total||sequences.has(row.sequence))throw new Error('malformed_catalog_result');
    for(const [key,max]of [['course_code',40],['course_name',160],['admission_name',100],['instructor',100]])if(!safeText(row[key],max))throw new Error('malformed_catalog_result');
    for(const key of ['academicYearText','semesterText'])if(row[key]!==null&&!safeText(row[key],30))throw new Error('malformed_catalog_result');
    ids.add(row.id);sequences.add(row.sequence);
  }
  return result;
}
function validateDetail(result,id){
  if(!exact(result,['row']))throw new Error('malformed_catalog_result');
  if(result.row===null)return null;
  const row=result.row,keys=[...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'id','version','source_mode','program_codes','meetings','syllabus'];
  if(!exact(row,keys)||row.id!==id||row.published!==true||row.source_mode!=='sample'||!Number.isSafeInteger(row.version)||row.version<1)throw new Error('malformed_catalog_result');
  const clean=normalizeCourseOffering(row);
  return {id:row.id,version:row.version,source_mode:'sample',...clean,syllabus:normalizeCourseSyllabus(row.syllabus)};
}
function source(payload,url=base,urls=[base]) {
  return {id:'account:courseCatalog',title:'Published local course offerings and syllabi',url,urls,content:JSON.stringify(payload)};
}
function envelope(payload,url,urls){
  const result={readState:payload.readState,reason:payload.reason,evidence:source(payload,url,urls)};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>catalogEvidenceMaxBytes)throw new Error('catalog_evidence_budget');
  return result;
}
function fits(payload,url,urls,reserve=0){try{return Buffer.byteLength(JSON.stringify(envelope(payload,url,urls)),'utf8')<=catalogEvidenceMaxBytes-reserve;}catch{return false;}}
// Each published read has the same 12-second ceiling as its transport and
// shares the caller's absolute deadline. The race also bounds injected readers
// that never settle; it cannot cancel arbitrary injected work after returning.
async function readBeforeDeadline(operation,deadline){
  const remaining=Math.min(12000,deadline-Date.now());
  if(!Number.isFinite(remaining)||remaining<=0)throw new Error('deadline_exceeded');
  let timer;
  try{return await Promise.race([
    Promise.resolve().then(operation),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('deadline_exceeded')),Math.max(1,Math.floor(remaining)));}),
  ]);}
  finally{clearTimeout(timer);}
}
function payloadFor(selection){
  return {collection:'courseCatalog',requiredMigration:catalogEvidenceRequirements.migration,checkedAt:new Date().toISOString(),
    provenance:{source:'published_local_sample_catalog',sourceMode:'sample',officialUniversityData:false,enrollmentEvidence:false},
    rules:'Published local sample offerings only. No enrollment, personal grade, actual assignment, eligibility, payment or official university synchronization is established. A syllabus describes a plan, not completed teaching. Blank fields and null weights are unknown. Current means the explicitly stored current flag; historical search includes all published terms, including current. Search selectors are user input, not source facts. For exact-ID details, routeContext is only the originating search context and does not establish that the offering matches those filters. Omitted rows or fields cannot prove absence.',
    selection,readState:'ok',reason:null,counts:{total:null,returnedRows:0,includedRows:0,hasMore:null,complete:false},revision:null,
    consistency:'Search revision covers the published search page; detail version covers a separate published detail read. This is not an atomic database snapshot.',rows:[],omittedFields:[]};
}

/** Returns one bounded evidence source; never falls back to the admin catalog RPC. */
export async function readCatalogEvidence(account,{query={},route='',question='',deadline}={},dependencies={}) {
  const initial=payloadFor(null);
  const unavailable=reason=>envelope({...initial,readState:'unavailable',reason});
  if(!validAccount(account))return unavailable('authorization_required');
  // Capture only the verified read credentials before any deferred dependency
  // runs. A shared caller object (including its nested user) may later change.
  const caller={user:Object.freeze({id:account.user.id}),url:account.url,key:account.key,token:account.token,requestDeadline:account.requestDeadline};
  if(!Number.isFinite(deadline)||deadline<=Date.now()||caller.requestDeadline!==undefined&&(!Number.isFinite(caller.requestDeadline)||caller.requestDeadline<=Date.now()))return unavailable('deadline_exceeded');
  let selection;
  try{selection=select(query,route,typeof question==='string'?question:'');}
  catch(error){return unavailable(['ambiguous_selection','unsupported_filters'].includes(error.code)?error.code:'invalid_selection');}
  const payload=payloadFor(selection);
  const search=dependencies.search??loadSyllabusSearch,detail=dependencies.detail??loadSyllabusDetail;
  if(typeof search!=='function'||typeof detail!=='function')return unavailable('catalog_read_unavailable');
  const bounded=Object.freeze({...caller,requestDeadline:Math.min(deadline,caller.requestDeadline??Infinity)});
  const remaining=()=>{if(Date.now()>=bounded.requestDeadline)throw new Error('deadline_exceeded');};
  let id=selection.id,url=base,urls=[base];
  try{
    remaining();
    if(selection.mode==='search'){
      const result=validateSearch(await readBeforeDeadline(()=>search(bounded,selection.query),bounded.requestDeadline),selection);remaining();
      payload.revision=result.revision;payload.counts={total:result.total,returnedRows:result.rows.length,includedRows:0,hasMore:result.hasMore,complete:false};
      // Reserve the final partial-result metadata before filling the byte budget.
      payload.readState='partial';payload.reason='evidence_budget';
      for(const row of result.rows){
        const copy={...row};payload.rows.push(copy);payload.counts.includedRows=payload.rows.length;
        if(!fits(payload,url,urls,128)){payload.rows.pop();payload.counts.includedRows=payload.rows.length;break;}
      }
      payload.counts.complete=result.page===0&&!result.hasMore&&payload.rows.length===result.total;
      if(result.total===0){payload.readState='empty';payload.reason='no_matching_published_rows';return envelope(payload,url,urls);}
      if(!result.rows.length){payload.readState='partial';payload.reason='page_out_of_range';return envelope(payload,url,urls);}
      if(result.total!==1){
        payload.readState=payload.counts.complete?'ok':'partial';
        payload.reason=payload.rows.length<result.rows.length?'evidence_budget':!payload.counts.complete?'paged_results':null;
        if(/syllab|outline|prerequisite|objectives?|grading|materials?|教學目標|課綱|大綱|先修|配分/iu.test(question)){payload.readState='partial';payload.reason='ambiguous_selection';}
        return envelope(payload,url,urls);
      }
      id=result.rows[0].id;
    }
    remaining();
    const row=validateDetail(await readBeforeDeadline(()=>detail(bounded,id),bounded.requestDeadline),id);remaining();
    url=base+'?'+new URLSearchParams({[selection.syllabus||/syllab|outline|課綱|大綱/iu.test(question)?'syllabus':'course']:id});urls=[base,url];
    if(row===null){
      payload.rows=[];payload.counts.includedRows=0;
      if(selection.mode==='search'){payload.readState='unavailable';payload.reason='offering_changed_during_read';payload.counts.complete=false;}
      else{payload.readState='empty';payload.reason='published_offering_not_found';payload.counts={total:0,returnedRows:0,includedRows:0,hasMore:false,complete:true};}
      return envelope(payload,url,urls);
    }
    if(selection.mode==='search'){
      const summary=payload.rows[0];
      if(!summary||['course_code','course_name','instructor','admission_name'].some(key=>summary[key]!==row[key]))return unavailable('offering_changed_during_read');
      if(selection.filters.term&&selection.filters.term!==row.term_code||selection.filters.department&&selection.filters.department!==row.department_code)return unavailable('offering_changed_during_read');
    }
    payload.rows=[row];payload.readState='ok';payload.reason=null;payload.counts={total:1,returnedRows:1,includedRows:1,hasMore:false,complete:true};
    if(fits(payload,url,urls))return envelope(payload,url,urls);
    // Preserve exact complete fields, never slice stored strings or invent zero
    // weights. Large fields are explicitly omitted from this bounded excerpt.
    const core={id:row.id,version:row.version,source_mode:row.source_mode,published:true,course_code:row.course_code,course_name:row.course_name,term_code:row.term_code,term_label:row.term_label,syllabus:{}};
    const fields=Object.keys(row).filter(key=>!Object.hasOwn(core,key)).map(key=>({path:key,value:row[key]}));
    const syllabusFields=Object.entries(row.syllabus).map(([key,value])=>({path:'syllabus.'+key,value}));
    const priority=/grad|weight|assessment|配分|評分/iu.test(question)?'grading':/materials?|教材/iu.test(question)?'materials':/objectives?|目標/iu.test(question)?'objectives':/week|週|進度/iu.test(question)?'weeks':null;
    const entries=[...syllabusFields.filter(item=>item.path==='syllabus.'+priority),...fields,...syllabusFields.filter(item=>item.path!=='syllabus.'+priority)];
    payload.rows=[core];payload.readState='partial';payload.reason='evidence_budget';payload.omittedFields=entries.map(item=>item.path);payload.counts.complete=false;
    for(const {path,value}of entries){
      const target=path.startsWith('syllabus.')?core.syllabus:core,key=path.split('.').at(-1);
      target[key]=value;payload.omittedFields=payload.omittedFields.filter(item=>item!==path);
      if(!fits(payload,url,urls)){delete target[key];payload.omittedFields.push(path);}
    }
    return envelope(payload,url,urls);
  }catch(error){return unavailable(error.message==='deadline_exceeded'?'deadline_exceeded':'catalog_read_unavailable');}
}
