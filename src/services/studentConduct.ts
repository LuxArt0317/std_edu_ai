/** Explicit local conduct records. Display values never imply eligibility or merit totals. */
export const studentConductPath='/school-affairs/services/38-1';
export const studentConductColumns=[
  {key:'occurredOnText',label:'發生日期',width:8},
  {key:'studentNumber',label:'學號',width:8},
  {key:'studentName',label:'姓名',width:8},
  {key:'academicYearText',label:'學年',width:8},
  {key:'semesterText',label:'學期',width:8},
  {key:'yearLevelText',label:'年級',width:8},
  {key:'reasonText',label:'事由',width:20},
  {key:'conductCode',label:'獎懲代號',width:8},
  {key:'conductName',label:'獎懲名稱',width:8},
  {key:'quantityText',label:'數量',width:6},
  {key:'voidStatusText',label:'作廢狀態',width:8},
] as const;
export type StudentConductRecord={
  id:string;userId:string;sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string;
  occurredOnText:string|null;studentNumber:string|null;studentName:string|null;
  academicYearText:string|null;semesterText:string|null;yearLevelText:string|null;
  reasonText:string|null;conductCode:string|null;conductName:string|null;quantityText:string|null;voidStatusText:string|null;
  rowOrder:number;
};
export type StudentConductRecords={records:StudentConductRecord[]};
export type StudentConductIdentity={userId:string;studentNumber:string|null;studentName:string|null};
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const nullableText=(value:unknown):value is string|null=>value===null||typeof value==='string';
export function ownStudentConductIdentity(value:StudentConductIdentity|null|undefined,userId:string):StudentConductIdentity|null{
  return identifier(userId)&&value&&Object.hasOwn(value,'userId')&&value.userId===userId&&nullableText(value.studentNumber)&&nullableText(value.studentName)?value:null;
}
/** Null means unavailable/invalid, never an empty history. Foreign rows are suppressed. */
export function ownStudentConductRecords(value:StudentConductRecords|null|undefined,userId:string):StudentConductRecord[]|null{
  if(!identifier(userId)||!value||!Array.isArray(value.records)||value.records.length>1000)return null;
  const candidates:StudentConductRecord[]=[],seen=new Set<string>();
  for(const row of value.records){
    if(!row||!Object.hasOwn(row,'userId')||!identifier(row.userId))return null;
    if(row.userId!==userId)continue;
    if(!identifier(row.id)||seen.has(row.id)||row.sourceMode!=='local_demo'||!Number.isSafeInteger(row.version)||row.version<1
      ||!Number.isInteger(row.rowOrder)||row.rowOrder<0||row.rowOrder>10000
      ||!studentConductColumns.every(column=>Object.hasOwn(row,column.key)&&nullableText(row[column.key])))return null;
    seen.add(row.id);candidates.push(row);
  }
  return candidates.sort((a,b)=>a.rowOrder-b.rowOrder||a.id.localeCompare(b.id));
}
