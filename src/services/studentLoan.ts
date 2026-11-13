/** Account-owned literal metadata only. No loan application, approval, amount or file capability. */
export const studentLoanPaths={index:'/school-affairs/services/21-1',progress:'/school-affairs/services/21-1/progress',history:'/school-affairs/services/21-1/history',document:'/school-affairs/services/21-1/document'} as const;
export type StudentLoanView=keyof typeof studentLoanPaths;
export type StudentLoanRecord={
  id:string;userId:string;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string;
  currentTermLabel:string|null;currentApplicationState:'unknown'|'not_applied'|'recorded';
  currentApplicationText:string|null;progressText:string|null;historyCount:number|null;historyText:string|null;
};
export type StudentLoanData={status:'loading'|'unavailable';record?:null}|{status:'loaded';record:StudentLoanRecord|null};
export const studentLoanTextLimits={currentTermLabel:160,currentApplicationText:2000,progressText:2000,historyText:2000} as const;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const text=(value:unknown,limit:number)=>value===null||typeof value==='string'&&[...value].length<=limit&&![...value].some(char=>{const point=char.codePointAt(0)!;return point===0||point>=0xd800&&point<=0xdfff;});
const instant=(value:unknown)=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
};
/** Malformed, ownerless or foreign data is unavailable, never an empty application history. */
export function ownStudentLoanRecord(value:unknown,userId:string):StudentLoanRecord|null{
  const keys=['id','userId','sourceMode','version','createdAt','updatedAt','currentApplicationState','historyCount',...Object.keys(studentLoanTextLimits)];
  if(!uuid(userId)||!plain(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))
    ||!uuid(value.id)||value.userId!==userId||value.sourceMode!=='local_demo'||!Number.isSafeInteger(value.version)||Number(value.version)<1||Number(value.version)>999999999
    ||!instant(value.createdAt)||!instant(value.updatedAt)||typeof value.currentApplicationState!=='string'||!['unknown','not_applied','recorded'].includes(value.currentApplicationState)
    ||!(value.historyCount===null||Number.isSafeInteger(value.historyCount)&&Number(value.historyCount)>=0&&Number(value.historyCount)<=1000000)
    ||!Object.entries(studentLoanTextLimits).every(([key,limit])=>text(value[key],limit)))return null;
  return {...value} as StudentLoanRecord;
}
export function ownStudentLoanData(value:unknown,userId:string):StudentLoanData{
  if(!uuid(userId)||!plain(value)||Object.keys(value).some(key=>!['status','record'].includes(key)))return {status:'unavailable'};
  if(value.status==='loading'&&(value.record===undefined||value.record===null))return {status:'loading'};
  if(value.status!=='loaded')return {status:'unavailable'};
  const record=ownStudentLoanRecord(value.record,userId);return record?{status:'loaded',record}:{status:'unavailable'};
}
/** Null and literal blank remain distinct; no date, credit, amount or eligibility calculations. */
export function studentLoanNotice(view:Exclude<StudentLoanView,'index'>,record:StudentLoanRecord|null):string{
  if(!record)return '目前無法確認站內就學貸款紀錄。';
  if(view==='history')return record.historyText??(record.historyCount===0?'目前沒有歷史申請記錄':'目前無法提供歷史申請記錄。');
  if(record.currentApplicationState==='not_applied')return record.currentApplicationText??(record.currentTermLabel?.trim()?`本學期${record.currentTermLabel}，尚未申請就學貸款。`:'尚未申請就學貸款。');
  if(view==='document')return '目前無法提供站內就學貸款文件。';
  return record.progressText??record.currentApplicationText??'目前無法提供當期就學貸款進度。';
}
