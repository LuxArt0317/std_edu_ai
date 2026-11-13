import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {catalogTextFields,catalogNumberFields,catalogBooleanFields,catalogPeriods,courseCatalogColumns} from '../src/features/public/affairs/courseCatalogModel.js';
import {normalizeCourseSyllabus} from '../src/features/public/affairs/courseSyllabusModel.js';

const first=value=>Array.isArray(value)?value[0]:value;
const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const invalid=message=>{throw new AffairsWorkspaceError(message,400);};
async function rpc(account,name,payload) {
  let response;
  try {response=await fetch(`${account.url}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:account.key,Authorization:`Bearer ${account.token}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(12000),
  });} catch {throw new AffairsWorkspaceError('Course catalog could not be reached. Please try again.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok) {
    const status=response.status===401||response.status===403?403:response.status===409?409:response.status===400?400:503;
    throw new AffairsWorkspaceError(status===403?'Administrator access is required for catalog changes.':status===409?'This course offering changed. Reload it before saving.':status===400?'Check the course fields and try again.':'Course catalog could not be loaded.',status);
  }
  if(!result || typeof result!=='object') throw new AffairsWorkspaceError('Course catalog returned an invalid response.');
  return result;
}

export function normalizeCatalogQuery(query={}) {
  const filters={};
  for(const key of ['yr','dep','ref1','admissionType','credit','grd','prog','required','e_course','english_taught','foreign_language','immersion','keyword','instructor','id']) {
    const value=first(query[key]);
    if(value!==undefined && (typeof value!=='string'||value.length>160)) invalid('Invalid course search.');
    filters[key]=(value||'').trim();
  }
  for(const key of ['required','e_course','english_taught','foreign_language','immersion'])
    if(!['','true','false'].includes(filters[key])) invalid('Invalid course filter.');
  if(filters.credit && filters.credit!=='0' && !/^[1-9](\.5)?$/.test(filters.credit)) invalid('Invalid credit filter.');
  if(filters.id && !uuid(filters.id)) invalid('Invalid course ID.');
  for(const key of ['weekdays','periods']) {
    const value=first(query[key])||'';
    if(typeof value!=='string'||value.length>100) invalid('Invalid course schedule.');
    filters[key]=[...new Set(value.split(',').filter(Boolean))];
    const allowed=key==='weekdays'?['1','2','3','4','5','6','7']:catalogPeriods;
    if(filters[key].some(item=>!allowed.includes(item))) invalid('Invalid course schedule.');
  }
  const integer=(key,fallback,max)=>{
    const raw=first(query[key]);if(raw===undefined) return fallback;
    if(typeof raw!=='string'||!/^\d+$/.test(raw)||Number(raw)>max) invalid('Invalid catalog page.');
    return Number(raw);
  };
  const page=integer('page',0,100000),pageSize=integer('page_size',100,100);
  if(!pageSize) invalid('Invalid catalog page size.');
  const sort=first(query.sort)||'course_code',direction=first(query.direction)||'asc';
  if(!courseCatalogColumns.some(([key])=>key===sort)||!['asc','desc'].includes(direction)) invalid('Invalid catalog sort.');
  return {p_filters:filters,p_page:page,p_page_size:pageSize,p_sort:sort,p_direction:direction};
}

export async function loadCourseCatalog(account,query={}) {
  const args=normalizeCatalogQuery(query);
  const result=await rpc(account,'affairs_catalog_search',args);
  if(!Array.isArray(result.rows)||!Number.isInteger(result.total)||typeof result.can_manage!=='boolean'||!Array.isArray(result.terms))
    throw new AffairsWorkspaceError('Course catalog returned invalid records.');
  return {...result,page:args.p_page,page_size:args.p_page_size};
}

export function normalizeCourseOffering(record) {
  if(!record||typeof record!=='object'||Array.isArray(record)) invalid('A course offering is required.');
  const known=new Set([...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'meetings','program_codes','syllabus','id','version','source_mode','created_at','updated_at','syllabus_is_current','academic_year_text','semester_text']);
  if(Object.keys(record).some(key=>!known.has(key))) invalid('Unknown course field.');
  if(record.source_mode!==undefined && record.source_mode!=='sample') invalid('Catalog records must retain sample provenance.');
  // New search metadata is read-only here; its separate versioned operation owns writes.
  if(record.syllabus_is_current!==undefined&&record.syllabus_is_current!==null&&typeof record.syllabus_is_current!=='boolean') invalid('Invalid syllabus current-membership metadata.');
  for(const key of ['academic_year_text','semester_text'])
    if(record[key]!==undefined&&record[key]!==null&&(typeof record[key]!=='string'||[...record[key]].length>30||[...record[key]].some(char=>{const point=char.codePointAt(0);return point===0||point>=0xd800&&point<=0xdfff;}))) invalid('Invalid syllabus term metadata.');
  const output={};
  for(const [key,[,max]] of Object.entries(catalogTextFields)) {
    if(typeof record[key]!=='string'||record[key].length>max) invalid(`Invalid course field: ${key}.`);
    output[key]=record[key].trim();
  }
  for(const key of ['term_code','term_label','department_code','department_name','classification_code','admission_code','course_code','course_name','instructor'])
    if(!output[key]) invalid(`Required course field: ${key}.`);
  for(const key of Object.keys(catalogNumberFields)) {
    const value=record[key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000||(!['credits','lecture_hours','practice_hours'].includes(key)&&!Number.isInteger(value))) invalid(`Invalid course number: ${key}.`);
    output[key]=value;
  }
  if(output.credits>30||output.lecture_hours>168||output.practice_hours>168||output.summer_weeks>52) invalid('Invalid course hours or credits.');
  if(output.enrolled_count>output.capacity||output.selected_count>output.capacity||output.audit_count>output.audit_capacity) invalid('Course counts cannot exceed capacity.');
  for(const key of Object.keys(catalogBooleanFields)) {
    if(typeof record[key]!=='boolean') invalid(`Invalid course option: ${key}.`);
    output[key]=record[key];
  }
  if(!Array.isArray(record.program_codes)||record.program_codes.length>30||record.program_codes.some(x=>typeof x!=='string'||! /^[A-Za-z0-9_-]{1,24}$/.test(x))) invalid('Invalid course programs.');
  output.program_codes=[...new Set(record.program_codes)];
  if(!Array.isArray(record.meetings)||record.meetings.length>2) invalid('At most two meeting groups are supported.');
  output.meetings=record.meetings.map(meeting=>{
    if(!meeting||Object.keys(meeting).some(key=>!['weekday','periods'].includes(key))||!Number.isInteger(meeting.weekday)||meeting.weekday<1||meeting.weekday>7||!Array.isArray(meeting.periods)||!meeting.periods.length||meeting.periods.length>15||meeting.periods.some(p=>!catalogPeriods.includes(p))) invalid('Invalid course meeting.');
    return {weekday:meeting.weekday,periods:[...new Set(meeting.periods)]};
  });
  if(record.syllabus!==undefined) {
    try {output.syllabus=normalizeCourseSyllabus(record.syllabus);} catch(error) {invalid(error instanceof Error?error.message:'Invalid syllabus.');}
  }
  if(JSON.stringify(output).length>14000) invalid('The complete course and syllabus must stay within 14,000 characters.');
  return output;
}

export async function manageCourseCatalog(account,kind,payload) {
  if(!['save_course_offering','delete_course_offering'].includes(kind)) invalid('Unsupported catalog action.');
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!uuid(payload.id)||!uuid(payload.request_id)||!Number.isInteger(payload.expected_version)||payload.expected_version<0) invalid('A course ID, request ID and version are required.');
  const input={id:payload.id,request_id:payload.request_id,expected_version:payload.expected_version};
  if(kind==='save_course_offering') input.record=normalizeCourseOffering(payload.record);
  return rpc(account,'affairs_catalog_manage',{p_kind:kind,p_payload:input});
}
