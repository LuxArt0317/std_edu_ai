export const selectionPhaseOptions=[{value:'initial',label:'初選'},{value:'add_drop',label:'加退選'},{value:'withdrawal',label:'棄選'},{value:'summer1',label:'暑一'}] as const;
export const semesterOptions=[{value:1,label:'一'},{value:2,label:'二'},{value:3,label:'暑'}] as const;
export const courseSelectionPeriods=[
  {key:'1',start:'08:10',end:'09:00'},{key:'2',start:'09:10',end:'10:00'},{key:'3',start:'10:10',end:'11:00'},
  {key:'4',start:'11:10',end:'12:00'},{key:'午',start:'12:10',end:'13:00'},{key:'5',start:'13:10',end:'14:00'},
  {key:'6',start:'14:10',end:'15:00'},{key:'7',start:'15:10',end:'16:00'},{key:'8',start:'16:10',end:'17:00'},
  {key:'傍',start:'17:10',end:'18:00'},{key:'A',start:'18:20',end:'19:10'},{key:'B',start:'19:15',end:'20:05'},
  {key:'C',start:'20:10',end:'21:00'},{key:'D',start:'21:05',end:'21:55'},
] as const;
export type CourseSelectionPhase=typeof selectionPhaseOptions[number]['value'];
export type CourseSelectionSemester=typeof semesterOptions[number]['value'];
export type CourseSelectionMeeting={weekday:number;period:string;room:string};
export type CourseSelectionRecord={
  id:string;userId:string;academicYear:number;semester:CourseSelectionSemester;selectionPhase:CourseSelectionPhase;
  termCourseCode:string;courseTitle:string;requiredElectiveText:string|null;credits:number;instructorOne:string|null;
  remarkText:string|null;rowOrder:number;timetableIncluded:boolean;meetings:CourseSelectionMeeting[];
  sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string;
};
export type CourseSelectionRecords={records:CourseSelectionRecord[]};
export type CourseSelectionFilter={academicYear:number;semester:CourseSelectionSemester;selectionPhase:CourseSelectionPhase};
export type CourseSelectionSlot={record:CourseSelectionRecord;rooms:string[]};
export const courseSelectionSourceDefault:CourseSelectionFilter={academicYear:115,semester:1,selectionPhase:'add_drop'};

export function courseSelectionYears(records:readonly CourseSelectionRecord[],userId:string):number[] {
  return [...new Set([114,115,116,...records.filter(row=>row.userId===userId).map(row=>row.academicYear)])].sort((a,b)=>a-b);
}
export function defaultCourseSelectionFilter(records:readonly CourseSelectionRecord[],userId:string):CourseSelectionFilter {
  const own=records.filter(row=>row.userId===userId);
  if(!own.length||own.some(row=>row.academicYear===115&&row.semester===1&&row.selectionPhase==='add_drop'))return {...courseSelectionSourceDefault};
  const phaseOrder=['add_drop','initial','withdrawal','summer1'];
  const row=[...own].sort((a,b)=>b.academicYear-a.academicYear||b.semester-a.semester||phaseOrder.indexOf(a.selectionPhase)-phaseOrder.indexOf(b.selectionPhase)||a.id.localeCompare(b.id))[0];
  return {academicYear:row.academicYear,semester:row.semester,selectionPhase:row.selectionPhase};
}
export function filterCourseSelection(records:readonly CourseSelectionRecord[],userId:string,filter:CourseSelectionFilter):CourseSelectionRecord[] {
  return records.filter(row=>row.userId===userId&&row.academicYear===filter.academicYear&&row.semester===filter.semester&&row.selectionPhase===filter.selectionPhase)
    .sort((a,b)=>a.rowOrder-b.rowOrder||a.id.localeCompare(b.id));
}
export function courseSelectionSlotKey(weekday:number,period:string):string{return `${weekday}:${period}`;}
export function courseSelectionSchedule(records:readonly CourseSelectionRecord[],userId:string,filter:CourseSelectionFilter) {
  const entries=new Map<string,CourseSelectionSlot[]>(),unscheduled:CourseSelectionRecord[]=[];
  const periodKeys=new Set<string>(courseSelectionPeriods.map(period=>period.key));
  for(const record of filterCourseSelection(records,userId,filter)){
    if(!record.timetableIncluded)continue;
    const meetings=record.meetings.filter(meeting=>Number.isInteger(meeting.weekday)&&meeting.weekday>=1&&meeting.weekday<=7&&periodKeys.has(meeting.period));
    if(!meetings.length){unscheduled.push(record);continue;}
    for(const meeting of meetings){
      const key=courseSelectionSlotKey(meeting.weekday,meeting.period),list=entries.get(key)||[];
      let entry=list.find(item=>item.record.id===record.id);
      if(!entry){entry={record,rooms:[]};list.push(entry);entries.set(key,list);}
      if(meeting.room&&!entry.rooms.includes(meeting.room))entry.rooms.push(meeting.room);
    }
  }
  return {entries,unscheduled};
}

export const courseSelectionHistoryNotes=[
  '於初選階段，備註欄位若為Y，則代表該課程未選上。',
  '於棄選階段，備註欄位若為Y(W)，則代表該課程已棄選該課程。',
  '備註欄位若為A，則代表該課程為灌堂。',
  '「學則」第二十四條　缺曠課相關規定 第二十四條 學生因故請假（包括病、喪、事假），經核准為缺課；未經准假、假期巳滿而任意缺席者為曠課。 缺課、曠課依照下列規定辦理： 遲到或早退次數每一次作缺課一小時論。 因公假、懷孕、分娩或撫育三歲以下子女之照顧，而核准之事(病)假、產假請假者，不受缺課日數達該學期上課總日數三分之一勒令休學之限制。 學生因懷孕、分娩或撫育三歲以下子女之照顧，而核准之事(病)假、產假，其缺席不扣分；致缺課時數逾全學期授課時數三分之一者，該科目成績得視需要與科目性質以補考或以其他補救措施彈性處理，補考成績並按實際成績計算。',
] as const;
