import {academicGradeReadSources,mapAcademicGrades} from './academicGrades.js';
import {graduationReviewReadSource,isGraduationReviewKind,mapGraduationReview,validateGraduationReviewContent} from './graduationReview.js';
import {academicAttendanceFields,academicAttendanceReadSources,mapAcademicAttendance,validateAcademicAttendancePayload,academicAttendanceQuery} from './academicAttendance.js';

const sources=[...academicGradeReadSources,graduationReviewReadSource,...academicAttendanceReadSources];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
const numeric=(value,max)=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max&&Number(value.toFixed(2))===value;
const hasFields=(row,fields)=>fields.every(key=>Object.hasOwn(row,key));
const commonFields=['id','user_id','source_mode','version','created_at','updated_at'];
const gradeFields={
  affairs_academic_grade_records:['record_kind','academic_year','semester','course_title','course_code','category_text','module_name','required_elective_text','credits','grade_text','remark_text','row_order'],
  affairs_academic_term_summaries:['summary_kind','academic_year','semester','earned_credits','average_grade_text','attempted_credits','passed_credits','failed_credits'],
  affairs_academic_rankings:['academic_year','semester','department_ranking_text','class_ranking_text'],
  affairs_academic_metadata:['class_label','english_requirement_text'],
};
const gradeTextLimits={course_title:160,course_code:80,category_text:160,module_name:160,required_elective_text:30,grade_text:80,remark_text:300,
  average_grade_text:80,department_ranking_text:160,class_ranking_text:160,class_label:80,english_requirement_text:300};
const attendanceKinds={affairs_academic_attendance_statistics:'save_academic_attendance_statistic',
  affairs_academic_attendance_details:'save_academic_attendance_detail',affairs_academic_attendance_metadata:'save_academic_attendance_metadata'};

function timestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}
function gradeText(value,max,required){
  if(value===null)return !required;
  if(typeof value!=='string')return false;
  // The persisted grade constraints use btrim(text), not display normalization.
  const trimmed=value.replace(/^ +| +$/g,'');
  return [...trimmed].length>0&&[...trimmed].length<=max&&[...value].every(character=>{
    const point=character.codePointAt(0);return point!==0&&!(point>=0xd800&&point<=0xdfff);
  });
}
function gradeValid(table,row){
  const fields=gradeFields[table];
  if(!hasFields(row,fields))return false;
  if(table!=='affairs_academic_metadata'&&(!integer(row.academic_year,1,9999)||!integer(row.semester,1,3)))return false;
  for(const key of fields){
    if(Object.hasOwn(gradeTextLimits,key)&&!gradeText(row[key],gradeTextLimits[key],key==='course_title'||key==='course_code'&&row.record_kind==='warning'))return false;
    if(['credits','earned_credits','attempted_credits','passed_credits','failed_credits'].includes(key)&&!numeric(row[key],key==='credits'?999.99:9999.99))return false;
  }
  if(table==='affairs_academic_grade_records')return integer(row.row_order,0,999999)&&(
    row.record_kind==='transcript'&&row.course_code===null&&row.remark_text===null||
    row.record_kind==='warning'&&row.course_code!==null&&row.category_text===null&&row.module_name===null&&row.required_elective_text===null);
  if(table==='affairs_academic_term_summaries')return row.summary_kind==='transcript'&&row.attempted_credits===null&&row.passed_credits===null&&row.failed_credits===null||
    row.summary_kind==='warning'&&row.earned_credits===null&&row.average_grade_text===null;
  return true;
}
function sourceValid(table,row){
  if(!object(row)||!hasFields(row,commonFields)||!uuid(row.id)||!uuid(row.user_id)||row.source_mode!=='local_demo'||
    !integer(row.version,1,2147483647)||!timestamp(row.created_at)||!timestamp(row.updated_at))return false;
  if(Object.hasOwn(gradeFields,table))return gradeValid(table,row);
  if(table===graduationReviewReadSource.table)return hasFields(row,['report_kind','report'])&&isGraduationReviewKind(row.report_kind)&&validateGraduationReviewContent(row.report)===null;
  const kind=attendanceKinds[table],fields=academicAttendanceFields[kind];
  if(!fields||!hasFields(row,fields))return false;
  // Reuse the write validator without coercing or modifying persisted values.
  const payload={id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0,...Object.fromEntries(fields.map(key=>[key,row[key]]))};
  return validateAcademicAttendancePayload(kind,payload)===null;
}
function uniqueKey(table,row){
  if(table===graduationReviewReadSource.table)return [row.user_id,row.report_kind];
  if(table==='affairs_academic_term_summaries')return [row.user_id,row.academic_year,row.semester,row.summary_kind];
  if(table==='affairs_academic_rankings')return [row.user_id,row.academic_year,row.semester];
  if(table==='affairs_academic_metadata'||table==='affairs_academic_attendance_metadata')return [row.user_id];
  if(table==='affairs_academic_attendance_statistics')return [row.user_id,row.academic_year,row.semester,row.course_code];
  return null;
}
function map(rows){
  const mapped={academicGrades:mapAcademicGrades(...rows.slice(0,4)),graduationReview:mapGraduationReview(rows[4]),academicAttendance:mapAcademicAttendance(...rows.slice(5))};
  const collections=[...academicGradeReadSources.map(({key})=>mapped.academicGrades[key]),mapped.graduationReview.reports,
    ...academicAttendanceReadSources.map(({key})=>mapped.academicAttendance[key])];
  if(collections.some((collection,index)=>!Array.isArray(collection)||collection.length!==rows[index].length||
    collection.some((row,rowIndex)=>row.id!==rows[index][rowIndex].id||row.userId!==rows[index][rowIndex].user_id)))
    throw new Error('Academic record mapping did not preserve the validated source rows.');
  return mapped;
}

/**
 * The caller verifies the Google identity and administrator role first. readRows
 * must use that caller's JWT and fetch every page, never a service-role key.
 * Own and administrative results remain separate even for an administrator.
 * Every persisted row is validated before mapping; malformed sources reject the
 * entire load instead of becoming an empty or apparently complete collection.
 */
async function loadRows(userId,admin,readRows,selected=sources){
    return Promise.all(selected.map(async ({table,order})=>{
      const rows=await readRows(table,{select:'*',...(!admin?{user_id:`eq.${userId}`} : {}),order});
      if(!Array.isArray(rows)||Array.from(rows).some(row=>!object(row)||!Object.hasOwn(row,'user_id')||!uuid(row.user_id)||(!admin&&row.user_id!==userId)))
        throw new Error('Academic records returned an invalid account scope.');
      const ids=new Set(),uniqueKeys=new Set();
      for(const row of rows){
        if(!sourceValid(table,row))throw new Error('Academic records returned an invalid persisted row.');
        const key=uniqueKey(table,row),serialized=key===null?null:JSON.stringify(key);
        if(ids.has(row.id)||serialized!==null&&uniqueKeys.has(serialized))throw new Error('Academic records returned duplicate persisted rows.');
        ids.add(row.id);if(serialized!==null)uniqueKeys.add(serialized);
      }
      return rows;
    }));
}
export async function loadNativeAcademicRecords(userId,includeAdmin,readRows) {
  if(!uuid(userId)||typeof readRows!=='function')throw new Error('Academic record access is unavailable.');
  const [own,admin]=await Promise.all([loadRows(userId,false,readRows),includeAdmin===true?loadRows(userId,true,readRows):Promise.resolve(null)]);
  return {
    own:map(own),
    ...(admin?{admin:map(admin)}:{}),
    adminUserIds:admin?[...new Set(admin.flat().map(row=>row.user_id))]:[],
    completeness:Object.fromEntries(sources.map(({table},index)=>[table,{returned:own[index].length,complete:true}])),
  };
}

export async function loadNativeGradeView(userId,view,readRows){
  if(!uuid(userId)||typeof readRows!=='function')throw new Error('Academic record access is unavailable.');
  const keys=view==='transcript'||view==='warning'?['records','termSummaries']
    :view==='ranking'?['rankings']:view==='english'?['metadata']:[];
  const selected=academicGradeReadSources.filter(source=>keys.includes(source.key));
  const values=await loadRows(userId,false,readRows,selected);
  const byKey=new Map(selected.map((source,index)=>[source.key,values[index]]));
  return mapAcademicGrades(...academicGradeReadSources.map(source=>byKey.get(source.key)??[]));
}

/** The caller's designation and the selected term/view are read separately.
 * Unsupported scopes never fetch attendance rows as substitutes. */
export async function loadNativeAttendanceView(userId,question,route,readRows){
  if(!uuid(userId)||typeof readRows!=='function')throw new Error('Academic attendance access is unavailable.');
  let selection=academicAttendanceQuery(question,[],route),metadata=[];
  if(selection.reason==='current_term_missing'){
    [metadata]=await loadRows(userId,false,readRows,academicAttendanceReadSources.filter(source=>source.key==='metadata'));
    selection=academicAttendanceQuery(question,mapAcademicAttendance([],[],metadata).metadata,route);
  }
  const selected=academicAttendanceReadSources.find(source=>source.key===selection.view);
  let rows=[];
  if(!selection.reason){
    const filters={academic_year:'eq.'+selection.academicYear,semester:'eq.'+selection.semester,
      ...(selection.courseDate?{course_date:'eq.'+selection.courseDate}:{})};
    const reader=(table,query)=>readRows(table,{...query,...filters});
    [rows]=await loadRows(userId,false,reader,[selected]);
    if(rows.some(row=>row.academic_year!==selection.academicYear||row.semester!==selection.semester||selection.courseDate&&row.course_date!==selection.courseDate))
      throw new Error('Academic attendance returned rows outside the selected term or date.');
  }
  return {selection,records:mapAcademicAttendance(selection.view==='statistics'?rows:[],selection.view==='details'?rows:[],metadata)};
}
