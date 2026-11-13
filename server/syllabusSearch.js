/** Local published syllabus search. No official-system access or student records. */
import {catalogTextFields,catalogNumberFields,catalogBooleanFields,catalogPeriods} from '../src/features/public/affairs/courseCatalogModel.js';
import {normalizeCourseSyllabus} from '../src/features/public/affairs/courseSyllabusModel.js';
export const syllabusSearchPath='/school-affairs/services/12-3';
export const syllabusMetadataKind='save_syllabus_search_metadata';
export const syllabusSortKeys=['sequence','course_code','course_name','academicYearText','semesterText','admission_name','instructor'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,fields)=>object(value)&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const text=(value,max)=>typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const n=char.codePointAt(0);return n!==0&&!(n>=0xd800&&n<=0xdfff);});
const nullableText=(value,max)=>value===null||text(value,max);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
export class SyllabusSearchError extends Error{constructor(message,status=503){super(message);this.name='SyllabusSearchError';this.status=status;}}
const invalid=()=>{throw new SyllabusSearchError('Invalid syllabus search fields.',400);};
const malformed=()=>{throw new SyllabusSearchError('Published syllabus records could not be verified.');};
export function normalizeSyllabusSearchQuery(query={}){
  const allowed=['scope','search_scope','keyword','term','department','themes','page','page_size','sort','direction'];
  if(!object(query)||Object.keys(query).some(key=>!allowed.includes(key)||typeof query[key]!=='string'))invalid();
  if(query.scope!==undefined&&query.scope!=='syllabus-search')invalid();
  const scope=query.search_scope??'current',sort=query.sort??'course_code',direction=query.direction??'asc';
  if(!['current','historical'].includes(scope)||!syllabusSortKeys.includes(sort)||!['asc','desc'].includes(direction))invalid();
  for(const [key,max] of [['keyword',160],['term',12],['department',16]])if(!text(query[key]??'',max))invalid();
  if(!text(query.themes??'',100))invalid();
  const raw=query.themes?query.themes.split(','):[];
  if(raw.length>26||raw.some(value=>! /^(?:[1-9]|1[0-9]|2[0-6])$/.test(value)))invalid();
  const themes=[...new Set(raw.map(Number))].sort((a,b)=>a-b);
  const page=(key,fallback,min,max)=>{if(query[key]===undefined)return fallback;if(!/^\d+$/.test(query[key]))invalid();const n=Number(query[key]);if(!integer(n,min,max))invalid();return n;};
  return {p_filters:{scope,keyword:(query.keyword??'').trim(),term:query.term??'',department:query.department??'',themes},
    p_page:page('page',0,0,10000),p_page_size:page('page_size',100,1,100),p_sort:sort,p_direction:direction};
}
export function validateSyllabusMetadataPayload(value){
  if(!exact(value,['id','request_id','expected_version','syllabus_is_current','academic_year_text','semester_text']))return 'Use exactly the approved syllabus metadata fields.';
  if(!uuid(value.id)||!uuid(value.request_id)||!integer(value.expected_version,1,999999998))return 'An existing offering ID, request ID and expected version are required.';
  if(value.syllabus_is_current!==null&&typeof value.syllabus_is_current!=='boolean'||!nullableText(value.academic_year_text,30)||!nullableText(value.semester_text,30))return 'Use an explicit current flag and literal year/semester labels, or null.';
  return null;
}
async function rpc(account,name,payload){
  if(!object(account)||!uuid(account.user?.id)||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url??''))throw new SyllabusSearchError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new SyllabusSearchError('Invalid syllabus request deadline.');
  const budget=Math.min(12000,(account.requestDeadline??Infinity)-Date.now());if(budget<=0)throw new SyllabusSearchError('Syllabus request timed out. Please retry.');
  let response;
  try{response=await fetch(account.url.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.floor(budget))});}
  catch{throw new SyllabusSearchError('Syllabus records are temporarily unavailable. Please retry.');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:503;
    throw new SyllabusSearchError(status===409?'This offering changed. Refresh before saving.':status===401||status===403?'This syllabus operation is not available to your account.':status===400?'Check the syllabus fields and try again.':'Syllabus records are temporarily unavailable. Please retry.',status);}
  try{return await response.json();}catch{return malformed();}
}
export async function loadSyllabusSearch(account,query={}){
  const args=normalizeSyllabusSearchQuery(query),result=await rpc(account,'affairs_syllabus_search',args);
  if(!exact(result,['scope','total','rows','page','pageSize','hasMore','sort','revision'])||typeof result.revision!=='string'||! /^[0-9a-f]{32}$/.test(result.revision)||result.scope!==args.p_filters.scope||!integer(result.total,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(result.rows)||result.rows.length>args.p_page_size||result.rows.length>result.total||result.page!==args.p_page||result.pageSize!==args.p_page_size||result.hasMore!==(args.p_page*args.p_page_size+result.rows.length<result.total)||!exact(result.sort,['key','direction'])||result.sort.key!==args.p_sort||result.sort.direction!==args.p_direction)malformed();
  const ids=new Set(),sequences=new Set();
  for(const row of result.rows){
    if(!exact(row,['id','sequence','course_code','course_name','admission_name','instructor','academicYearText','semesterText'])||!uuid(row.id)||ids.has(row.id)||!integer(row.sequence,1,result.total)||sequences.has(row.sequence)||!text(row.course_code,40)||!text(row.course_name,160)||!text(row.admission_name,100)||!text(row.instructor,100)||!nullableText(row.academicYearText,30)||!nullableText(row.semesterText,30))malformed();
    ids.add(row.id);sequences.add(row.sequence);
  }
  if(result.rows.length!==Math.min(args.p_page_size,Math.max(0,result.total-args.p_page*args.p_page_size)))malformed();
  return result;
}
export async function loadSyllabusOptions(account){
  const result=await rpc(account,'affairs_syllabus_options',{});if(!exact(result,['terms','departments']))malformed();
  for(const [name,codeLimit,labelLimit] of [['terms',12,80],['departments',16,100]]){
    if(!Array.isArray(result[name])||result[name].length>1000)malformed();const seen=new Set();
    for(const row of result[name]){if(!exact(row,['value','label'])||!text(row.value,codeLimit)||!row.value||!text(row.label,labelLimit)||!row.label||seen.has(row.value))malformed();seen.add(row.value);}
  }
  return result;
}
export async function loadSyllabusDetail(account,id){
  if(!uuid(id))invalid();const result=await rpc(account,'affairs_syllabus_detail',{p_id:id});
  if(!exact(result,['row']))malformed();if(result.row===null)return result;
  const row=result.row,keys=[...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'id','version','source_mode','program_codes','meetings','syllabus'];
  if(!exact(row,keys)||row.id!==id||!integer(row.version,1,999999999)||row.source_mode!=='sample'||row.published!==true)malformed();
  for(const [key,[,limit]] of Object.entries(catalogTextFields))if(!text(row[key],limit))malformed();
  for(const key of Object.keys(catalogNumberFields))if(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0||row[key]>100000)malformed();
  for(const key of Object.keys(catalogBooleanFields))if(typeof row[key]!=='boolean')malformed();
  if(!Array.isArray(row.program_codes)||row.program_codes.length>30||row.program_codes.some(value=>typeof value!=='string'||! /^[A-Za-z0-9_-]{1,24}$/.test(value))||!Array.isArray(row.meetings)||row.meetings.length>2)malformed();
  for(const meeting of row.meetings)if(!exact(meeting,['weekday','periods'])||!integer(meeting.weekday,1,7)||!Array.isArray(meeting.periods)||meeting.periods.length<1||meeting.periods.length>15||meeting.periods.some(value=>!catalogPeriods.includes(value)))malformed();
  try{normalizeCourseSyllabus(row.syllabus);}catch{malformed();}return result;
}
export async function manageSyllabusMetadata(account,payload){
  const error=validateSyllabusMetadataPayload(payload);if(error)throw new SyllabusSearchError(error,400);
  const result=await rpc(account,'affairs_syllabus_metadata_manage',{p_payload:payload});
  if(!exact(result,['id','kind','version','summary'])||result.id!==payload.id||result.kind!==syllabusMetadataKind||result.version!==payload.expected_version+1||!text(result.summary,200))malformed();
  return result;
}
