export const academicGradeKindOptions=[{value:'transcript',label:'歷年成績'},{value:'warning',label:'預警成績'}] as const;
export const academicGradeSemesterOptions=[{value:1,label:'一'},{value:2,label:'二'},{value:3,label:'暑'}] as const;
export type AcademicGradeKind=typeof academicGradeKindOptions[number]['value'];
export type AcademicGradeSemester=typeof academicGradeSemesterOptions[number]['value'];
type AcademicGradeBase={id:string;userId:string;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string};
export type AcademicGradeRecord=AcademicGradeBase&{
  recordKind:AcademicGradeKind;academicYear:number;semester:AcademicGradeSemester;courseTitle:string;
  courseCode:string|null;categoryText:string|null;moduleName:string|null;requiredElectiveText:string|null;
  credits:number|null;gradeText:string|null;remarkText:string|null;rowOrder:number;
};
export type AcademicGradeTermSummary=AcademicGradeBase&{
  summaryKind:AcademicGradeKind;academicYear:number;semester:AcademicGradeSemester;
  earnedCredits:number|null;averageGradeText:string|null;attemptedCredits:number|null;passedCredits:number|null;failedCredits:number|null;
};
export type AcademicGradeRanking=AcademicGradeBase&{
  academicYear:number;semester:AcademicGradeSemester;departmentRankingText:string|null;classRankingText:string|null;
};
export type AcademicGradeMetadata=AcademicGradeBase&{classLabel:string|null;englishRequirementText:string|null};
export type AcademicGradesRecords={records:AcademicGradeRecord[];termSummaries:AcademicGradeTermSummary[];rankings:AcademicGradeRanking[];metadata:AcademicGradeMetadata[]};
export type AcademicGradeTerm={academicYear:number;semester:AcademicGradeSemester;records:AcademicGradeRecord[];summary:AcademicGradeTermSummary|null};
export type AcademicGradesView='index'|'transcript'|'warning'|'ranking'|'transfer'|'cycle'|'current';
export const academicGradePaths={
  index:'/school-affairs/services/13-1',current:'/school-affairs/services/13-1/current',
  transcript:'/school-affairs/services/13-1/transcript',warning:'/school-affairs/services/13-1/warning',
  ranking:'/school-affairs/services/13-1/ranking',transfer:'/school-affairs/services/13-1/transfer',
  cycle:'/school-affairs/services/13-1/cycle',graduation:'/school-affairs/services/13-1/graduation',
} as const;
export const academicGradeLinks=[
  {view:'current',label:'當學期成績查詢',description:'查詢老師上傳但未確認成績。'},
  {view:'transcript',label:'歷年成績查詢',description:'查詢各學期成績。'},
  {view:'warning',label:'預警成績查詢',description:'查詢期中預警成績。'},
  {view:'ranking',label:'學期排名查詢',description:'查詢各學期班排名及系排名。'},
  {view:'transfer',label:'抵免課程學分查詢',description:'查詢核定抵免科目學分。'},
  {view:'cycle',label:'循環式課程梯次成績查詢',description:'查詢各梯次分級考成績。'},
  {view:'graduation',label:'畢業學分檢核表',description:''},
] as const;
export const academicTranscriptColumns=['選課時間','科目名稱','類別','模組名稱','必選修','學分數','成績'] as const;
export const academicWarningColumns=['課程代碼','課程名稱','學分數','成績','備註'] as const;
export const academicRankingColumns=['學年','學期','系排名','班排名'] as const;
export const academicWarningSummaryLabels=['總修習學分數','及格學分數','不及格學分數'] as const;
export const academicGradeNotes={
  transcript:['歷年成績查詢僅提供於本校修習之課程成績，不含抵免科目。','此項查詢僅供參考，不做任何證明之用。'],
  warning:['同學成績若為 P，表示及格但並不代表期末成績亦是及格的，請同學繼續保持勿掉以輕心。若為 F，表示不及格，同樣並不代表期末成績就是不及格，請同學不要放棄多加努力。','此項查詢僅供參考，不做任何證明之用。','若您有資料上的問題，歡迎洽教務處註冊課務組詢問，電話(07)6158000分機2009、2010、2012、2016。'],
  ranking:['此項查詢僅供參考，不做任何證明之用。','實際排名以教務處所公布結果為準。'],
} as const;

export function ownAcademicGrades(data:AcademicGradesRecords|null|undefined,userId:string):AcademicGradesRecords {
  if(!userId)return {records:[],termSummaries:[],rankings:[],metadata:[]};
  return {records:(data?.records??[]).filter(row=>row.userId===userId),termSummaries:(data?.termSummaries??[]).filter(row=>row.userId===userId),
    rankings:(data?.rankings??[]).filter(row=>row.userId===userId),metadata:(data?.metadata??[]).filter(row=>row.userId===userId)};
}
export function academicGradeTerms(data:AcademicGradesRecords|null|undefined,userId:string,kind:AcademicGradeKind):AcademicGradeTerm[] {
  const own=ownAcademicGrades(data,userId),terms=new Map<string,AcademicGradeTerm>();
  const termFor=(row:{academicYear:number;semester:AcademicGradeSemester})=>{
    const key=`${row.academicYear}:${row.semester}`;
    let term=terms.get(key);
    if(!term){term={academicYear:row.academicYear,semester:row.semester,records:[],summary:null};terms.set(key,term);}
    return term;
  };
  for(const row of own.records)if(row.recordKind===kind)termFor(row).records.push(row);
  for(const summary of own.termSummaries)if(summary.summaryKind===kind){
    const term=termFor(summary);
    if(!term.summary||summary.version>term.summary.version)term.summary=summary;
  }
  return [...terms.values()].sort((a,b)=>a.academicYear-b.academicYear||a.semester-b.semester).map(term=>({...term,records:[...term.records].sort((a,b)=>a.rowOrder-b.rowOrder||a.id.localeCompare(b.id))}));
}
export function academicWarningTerm(data:AcademicGradesRecords|null|undefined,userId:string):AcademicGradeTerm|null {
  return academicGradeTerms(data,userId,'warning').at(-1)??null;
}
export function academicGradeRankings(data:AcademicGradesRecords|null|undefined,userId:string):AcademicGradeRanking[] {
  return ownAcademicGrades(data,userId).rankings.sort((a,b)=>b.academicYear-a.academicYear||b.semester-a.semester||a.id.localeCompare(b.id));
}
export function academicGradeMetadata(data:AcademicGradesRecords|null|undefined,userId:string):AcademicGradeMetadata|null {
  return ownAcademicGrades(data,userId).metadata.sort((a,b)=>b.version-a.version||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id))[0]??null;
}
export function academicSemesterLabel(semester:number):string {
  return academicGradeSemesterOptions.find(option=>option.value===semester)?.label??'—';
}
export function academicGradeTermLabel(academicYear:number,semester:AcademicGradeSemester):string {
  return `${academicYear}學年度${semester===3?'暑期':`第${academicSemesterLabel(semester)}學期`}`;
}
export function academicGradeTimestamp(value:string|undefined):string {
  if(!value)return '—';const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date).replaceAll('-','/');
}
export function academicGradeYearLabel(value:number|undefined):string {
  return value&&Number.isInteger(value)&&value>=1&&value<=9?['一','二','三','四','五','六','七','八','九'][value-1]:value===0?'0':value===undefined?'—':String(value);
}
