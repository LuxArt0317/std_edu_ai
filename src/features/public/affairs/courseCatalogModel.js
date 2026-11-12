/** Shared catalog presentation. Offerings are independent of student enrollments. */
export const courseCatalogPath = '/school-affairs/services/12-4';
export const courseCatalogColumns = [
  ['sequence','序號'],['course_code','課程代碼'],['course_name','課程名稱'],['module','模組'],
  ['instructor','教師1'],['schedule1','時段1'],['room1','教室1'],['shared_teaching','多人合授'],
  ['schedule2','時段2'],['room2','教室2'],['grade','開課年級'],['open_grades','開放年級'],
  ['open_other_departments','開放外系'],['cross_admission','非本學制可修'],['required','必選修'],
  ['credits','學分數'],['capacity','限修人數'],['enrolled_count','修課人數'],['selected_count','現選人數'],
  ['audit_capacity','隨班附讀名額'],['audit_count','附讀人數'],
];
export const catalogTextFields = {
  term_code:['學期代碼',12],term_label:['學期名稱',80],department_code:['開課單位代碼',16],department_name:['開課單位名稱',100],
  classification_code:['課程分類代碼',16],classification_name:['課程分類名稱',100],admission_code:['開課學制代碼',16],admission_name:['開課學制名稱',100],
  course_code:['課程代碼',40],course_name:['課程名稱',160],english_name:['英文課名',200],module:['模組',100],instructor:['教師1',100],instructor2:['教師2',100],
  room1:['教室1',60],room2:['教室2',60],grade:['開課年級',8],open_grades:['開放年級',40],prerequisite:['先修課程/分數',500],
  course_nature:['課程性質',60],reserved_departments:['保留院系',500],description:['課程說明',2000],
};
export const catalogNumberFields = {credits:'學分數',capacity:'限修人數',enrolled_count:'修課人數',selected_count:'現選人數',audit_capacity:'隨班附讀名額',audit_count:'附讀人數',lecture_hours:'上課時數',practice_hours:'實習時數',summer_weeks:'暑修週數'};
export const catalogBooleanFields = {published:'公開此範例課程',shared_teaching:'多人合授',open_other_departments:'開放外系',cross_admission:'非本學制可修',required:'必修',e_course:'遠距教學',english_taught:'全英語授課',foreign_language:'外語類課程',immersion:'雙語授課',graduating_course:'畢業班課程'};
export const catalogPeriods = ['晨','1','2','3','4','午','5','6','7','8','傍','A','B','C','D'];
export const catalogWeekdays = ['一','二','三','四','五','六','日'];
export const defaultCatalogFilters = {yr:'1151',dep:'0',ref1:'',admissionType:'0',credit:'0',grd:'0',prog:'0',required:'',e_course:'',english_taught:'',foreign_language:'',immersion:'',keyword:'',instructor:'',weekdays:[],periods:[]};
export function newCourseOffering() {
  return {...Object.fromEntries(Object.keys(catalogTextFields).map(key=>[key,''])),
    ...Object.fromEntries(Object.keys(catalogNumberFields).map(key=>[key,0])),
    ...Object.fromEntries(Object.keys(catalogBooleanFields).map(key=>[key,false])),
    id:'',term_code:'1151',term_label:'115學年度上學期',source_mode:'sample',meetings:[],program_codes:[],version:0};
}
export function catalogSchedule(meeting) {
  return meeting ? `${catalogWeekdays[meeting.weekday-1] || ''}-${meeting.periods.join(',')}` : '';
}
export function catalogCell(record,key,index=0) {
  if(key==='sequence') return index+1;
  if(key==='schedule1' || key==='schedule2') return catalogSchedule(record.meetings[key==='schedule1'?0:1]);
  if(key==='required') return record.required?'必':'選';
  if(typeof record[key]==='boolean') return record[key]?'是':'否';
  return record[key] ?? '';
}
