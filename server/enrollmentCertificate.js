/** Independent local assessments only. This module does not issue, sign, or download documents. */
export const enrollmentCertificatePath='/school-affairs/services/17-1';
export const enrollmentCertificateMaxPayloadBytes=8000;
export const enrollmentCertificateKinds=['save_enrollment_certificate_assessment','save_enrollment_certificate_document'];
const commonFields=['id','user_id','request_id','expected_version'];
export const enrollmentCertificateFields={
  save_enrollment_certificate_assessment:['academic_year','semester','has_pending_fees','status','result_text','assessed_at','student_number','student_name','department_name','year_text','class_label'],
  save_enrollment_certificate_document:['assessment_id','assessment_version','issuer','purpose','status','verified_at','expires_at'],
};
const assessmentColumns=['id','user_id',...enrollmentCertificateFields.save_enrollment_certificate_assessment,'source_mode','version','created_at','updated_at'];
const documentColumns=['id','user_id',...enrollmentCertificateFields.save_enrollment_certificate_document,'source_mode','version','created_at','updated_at'];
export const enrollmentCertificateReadSources=[
  {key:'assessments',table:'affairs_enrollment_certificate_assessments',select:assessmentColumns.join(','),order:'id.asc'},
  {key:'documentMetadata',table:'affairs_enrollment_certificate_documents',select:documentColumns.join(','),order:'id.asc'},
];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const nullableText=(value,max)=>value===null||typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const point=char.codePointAt(0);return point!==0&&!(point>=0xd800&&point<=0xdfff);});
const textLimits={student_number:80,student_name:160,department_name:160,year_text:30,class_label:80,result_text:500};
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return null;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(!year||month<1||month>12||day<1||day>days[month-1])return null;
  const time=Date.parse(value);return Number.isFinite(time)?time:null;
}
/** Flat approved payloads only; accounts for PostgreSQL jsonb's comma/colon spaces. */
export function enrollmentCertificatePayloadBytes(value){
  try{
    if(!object(value)||Object.values(value).some(item=>item!==null&&!['string','number','boolean'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item)))return Infinity;
    return new TextEncoder().encode('{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}').byteLength;
  }catch{return Infinity;}
}
export function validateEnrollmentCertificatePayload(kind,value){
  if(!enrollmentCertificateKinds.includes(kind)||!object(value))return 'Invalid enrollment certificate operation.';
  const fields=[...commonFields,...enrollmentCertificateFields[kind]];
  if(Object.keys(value).length!==fields.length||!fields.every(key=>Object.hasOwn(value,key)))return 'Certificate payload must contain exactly the approved fields, including nullable fields.';
  if(!['id','user_id','request_id'].every(key=>typeof value[key]==='string'&&uuid.test(value[key]))||!integer(value.expected_version,0,999999998))return 'Invalid certificate identifier or expected version.';
  if(kind==='save_enrollment_certificate_assessment'){
    if(value.academic_year!==null&&!integer(value.academic_year,1,9999)||value.semester!==null&&!integer(value.semester,1,3))return 'Invalid academic year or semester; use a valid integer or null.';
    if(![null,'Y','N'].includes(value.has_pending_fees)||!['unknown','blocked','local_eligible'].includes(value.status))return 'Invalid explicit local assessment status.';
    for(const [key,max] of Object.entries(textLimits))if(!nullableText(value[key],max))return 'Invalid certificate text field: '+key+'.';
    if(value.assessed_at!==null&&instant(value.assessed_at)===null)return 'Assessment time must be null or an actual zoned ISO timestamp.';
  }else{
    if(typeof value.assessment_id!=='string'||!uuid.test(value.assessment_id)||!integer(value.assessment_version,1,999999999))return 'Invalid linked assessment or revision.';
    if(value.issuer!=='stu.best'||value.purpose!=='local_enrollment_reference'||!['metadata_only','revoked'].includes(value.status)||value.verified_at!==null)
      return 'Only unverified local document metadata is supported; document activation is unavailable.';
    if(value.expires_at!==null&&instant(value.expires_at)===null)return 'Expiration must be null or an actual zoned ISO timestamp.';
  }
  return enrollmentCertificatePayloadBytes(value)>enrollmentCertificateMaxPayloadBytes?'Certificate operation exceeds the 8000-byte JSONB limit.':null;
}
export class EnrollmentCertificateError extends Error{
  constructor(message,status=503){super(message);this.name='EnrollmentCertificateError';this.status=status;}
}
const budgetMs=12000,pageSize=200,maxRows=10000;
function boundedAccount(account){
  if(!object(account)||!uuid.test(account.user?.id||'')||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key||
    typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new EnrollmentCertificateError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new EnrollmentCertificateError('Invalid certificate request deadline.');
  return {...account,requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
async function request(account,table,{query={},body}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());
  if(remaining<=0)throw new EnrollmentCertificateError('Certificate request time limit reached. Retry the same operation.');
  const target=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+table);
  for(const [key,value] of Object.entries(query))target.searchParams.set(key,String(value));
  let response;
  try{response=await fetch(target,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:`Bearer ${account.token}`,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(Math.min(budgetMs,remaining))});}
  catch{throw new EnrollmentCertificateError('Certificate records are temporarily unavailable. Retry the same operation.');}
  if(!response.ok){
    if(response.status===401)throw new EnrollmentCertificateError('Sign in to School Affairs again.',401);
    if(response.status===403)throw new EnrollmentCertificateError('This certificate operation is not available to your account.',403);
    if(response.status===409)throw new EnrollmentCertificateError('This certificate record changed. Refresh and retry.',409);
    if([400,413,422].includes(response.status))throw new EnrollmentCertificateError('Certificate fields were rejected. Check the values and retry.',400);
    throw new EnrollmentCertificateError('Certificate records are temporarily unavailable. Retry the same operation.');
  }
  try{return await response.json();}catch{throw new EnrollmentCertificateError('Certificate records returned an invalid response.');}
}
async function requireAdmin(account){
  const access=await request(account,'affairs_enrollment_certificate_access',{body:{}});
  if(!object(access)||Object.keys(access).length!==2||access.userId!==account.user.id||access.canManage!==true)throw new EnrollmentCertificateError('School Affairs administrator access is required.',403);
}
function validRow(row,key){
  const columns=key==='assessments'?assessmentColumns:documentColumns;
  if(!object(row)||Object.keys(row).length!==columns.length||!columns.every(field=>Object.hasOwn(row,field))||row.source_mode!=='local_demo'||!integer(row.version,1,999999999)||instant(row.created_at)===null||instant(row.updated_at)===null)return false;
  const kind=key==='assessments'?enrollmentCertificateKinds[0]:enrollmentCertificateKinds[1];
  const payload={id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0};
  for(const field of enrollmentCertificateFields[kind])payload[field]=row[field];
  return validateEnrollmentCertificatePayload(kind,payload)===null;
}
const envelope=row=>({id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
function assessment(row){return {...envelope(row),academicYear:row.academic_year,semester:row.semester,hasPendingFees:row.has_pending_fees,status:row.status,resultText:row.result_text,assessedAt:row.assessed_at,
  identity:{studentNumber:row.student_number,studentName:row.student_name,departmentName:row.department_name,yearText:row.year_text,classLabel:row.class_label}};}
function metadata(row){return {...envelope(row),assessmentId:row.assessment_id,assessmentVersion:row.assessment_version,issuer:row.issuer,purpose:row.purpose,status:row.status,verifiedAt:null,expiresAt:row.expires_at};}
async function readRows(account,source,admin,ownerId){
  const rows=[],scopeOwner=admin?ownerId:account.user.id;let cursor;
  for(;;){
    const page=await request(account,source.table,{query:{select:source.select,order:source.order,limit:pageSize,...(scopeOwner?{user_id:'eq.'+scopeOwner}:{}),...(cursor?{id:'gt.'+cursor}:{})}});
    if(!Array.isArray(page)||page.length>pageSize)throw new EnrollmentCertificateError('Certificate records returned an invalid page.');
    for(const row of page){
      if(!validRow(row,source.key)||scopeOwner&&row.user_id!==scopeOwner||cursor&&row.id<=cursor)throw new EnrollmentCertificateError('Certificate records returned an invalid account scope or order.');
      rows.push(row);cursor=row.id;
      if(rows.length>maxRows)throw new EnrollmentCertificateError('Certificate records exceed the supported complete-read limit; narrow the administrator view.');
    }
    if(page.length<pageSize)return rows;
  }
}
/** Always caller-scoped, even for administrators. No document action can be activated by metadata. */
export async function loadEnrollmentCertificate(account){
  account=boundedAccount(account);
  const rows=await readRows(account,enrollmentCertificateReadSources[0],false);
  if(rows.length>1)throw new EnrollmentCertificateError('Multiple current certificate assessments require administrator review.');
  return {assessments:rows.map(assessment),documents:[]};
}
/** Only the explicit manager response includes unverified document metadata, never model evidence. */
export async function loadEnrollmentCertificateAdmin(account,options={}){
  if(!object(options)||Object.keys(options).some(key=>key!=='userId')||options.userId!==undefined&&(typeof options.userId!=='string'||!uuid.test(options.userId)))throw new EnrollmentCertificateError('Invalid certificate account filter.',400);
  account=boundedAccount(account);await requireAdmin(account);
  const [rows,documents]=await Promise.all(enrollmentCertificateReadSources.map(source=>readRows(account,source,true,options.userId)));
  if(new Set(rows.map(row=>row.user_id)).size!==rows.length)throw new EnrollmentCertificateError('Duplicate current certificate assessments require review.');
  return {assessments:rows.map(assessment),documents:[],documentMetadata:documents.map(metadata)};
}
/** Call with an account returned by verifyAffairsToken; SQL repeats Google/admin authorization. */
export async function manageEnrollmentCertificateRecord(account,kind,payload){
  const error=validateEnrollmentCertificatePayload(kind,payload);if(error)throw new EnrollmentCertificateError(error,400);
  account=boundedAccount(account);await requireAdmin(account);
  const result=await request(account,'affairs_manage_enrollment_certificate',{body:{p_kind:kind,p_payload:payload}});
  if(!object(result)||Object.keys(result).length!==4||result.id!==payload.id||result.kind!==kind||result.version!==payload.expected_version+1||typeof result.summary!=='string')throw new EnrollmentCertificateError('Certificate operation returned an invalid receipt.');
  return result;
}
