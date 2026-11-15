import {courseSelectionPeriods,mapCourseSelection} from './courseSelection.js';

export const courseSelectionTable='affairs_course_selection_records';
export const courseSelectionOrder='academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc';
const phases=['initial','add_drop','withdrawal','summer1'];
const periods=new Set(courseSelectionPeriods.map(slot=>slot.period));
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const validUnicode=value=>[...value].every(character=>{
  const point=character.codePointAt(0);
  return point!==0&&!(point>=0xd800&&point<=0xdfff);
});
const text=(value,limit,nullable=false)=>value===null?nullable:typeof value==='string'
  &&value.trim().length>0&&[...value].length<=limit&&validUnicode(value);
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  &&Number.isFinite(Date.parse(value));
const matches=(value,expected)=>expected===undefined||value===expected;

export function courseSelectionQuery(scope){
  const {academicYear,semester,selectionPhase,timetable}=scope;
  if(academicYear!==undefined&&!integer(academicYear,1,9999)||semester!==undefined&&!integer(semester,1,3)
    ||selectionPhase!==undefined&&!phases.includes(selectionPhase)||typeof timetable!=='boolean')throw new TypeError('Invalid course selection scope.');
  return {select:'*',order:courseSelectionOrder,
    ...(academicYear===undefined?{}:{academic_year:'eq.'+academicYear}),
    ...(semester===undefined?{}:{semester:'eq.'+semester}),
    ...(selectionPhase===undefined?{}:{selection_phase:'eq.'+selectionPhase}),
    ...(timetable?{timetable_included:'eq.true'}:{})};
}

function validSlots(meetings){
  if(!Array.isArray(meetings)||meetings.length>98)return false;
  const keys=new Set();
  for(const slot of meetings){
    if(!slot||Object.keys(slot).length!==3||!integer(slot.weekday,1,7)||!periods.has(slot.period)
      ||typeof slot.room!=='string'||[...slot.room].length>80||!validUnicode(slot.room))return false;
    const key=slot.weekday+':'+slot.period;
    if(keys.has(key))return false;
    keys.add(key);
  }
  return true;
}

export function mapOwnedCourseSelection(rows,owner,scope){
  if(!Array.isArray(rows)||rows.length>100)throw new TypeError('Invalid course selection rows.');
  const ids=new Set();
  for(const row of rows){
    if(!row||typeof row.id!=='string'||!uuid.test(row.id)||ids.has(row.id.toLowerCase())||row.user_id!==owner||row.source_mode!=='local_demo'
      ||!integer(row.version,1,2147483647)||!timestamp(row.created_at)||!timestamp(row.updated_at)
      ||!integer(row.academic_year,1,9999)||!integer(row.semester,1,3)||!phases.includes(row.selection_phase)
      ||!matches(row.academic_year,scope.academicYear)||!matches(row.semester,scope.semester)||!matches(row.selection_phase,scope.selectionPhase)
      ||!text(row.term_course_code,80)||!text(row.course_title,160)||!text(row.required_elective_text,30,true)
      ||!text(row.instructor_one,160,true)||!text(row.remark_text,300,true)||!integer(row.row_order,0,999999)
      ||typeof row.credits!=='number'||row.credits<0||row.credits>999.99||Number(row.credits.toFixed(2))!==row.credits
      ||typeof row.timetable_included!=='boolean'||scope.timetable&&!row.timetable_included||!validSlots(row.meetings))
      throw new TypeError('Course selection rows did not match the approved owner or scope.');
    ids.add(row.id.toLowerCase());
  }
  return mapCourseSelection(rows).records;
}
