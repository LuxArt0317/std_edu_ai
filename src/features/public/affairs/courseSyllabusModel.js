import {syllabusMethods} from './courseSyllabusOptions.js';

export const syllabusTextFields={level:['課程層級',60],language:['授課語言',60],teaching_mode:['教學型態',80],office_hours:['課後諮商時間',300],objectives:['教學目標 (綱要)',1600],materials:['主要教材',1200],references:['參考書籍',1200],advice:['對修習學生建議',1200],certifications:['課程輔導考證照',500]};
export function newCourseSyllabus() {
  return {...Object.fromEntries(Object.keys(syllabusTextFields).map(key=>[key,''])),grading:Array.from({length:4},()=>({weight:null,methods:[]})),capabilities:Array(12).fill(null),meanings:[],sdgs:[],weeks:Array.from({length:18},()=>({date:'',content:'',notes:''}))};
}
export function normalizeCourseSyllabus(value) {
  const fail=()=>{throw new Error('Check the syllabus fields, dates and percentage totals.');};
  if(!value||typeof value!=='object'||Array.isArray(value)) return fail();
  const defaults=newCourseSyllabus(),known=new Set(Object.keys(defaults));
  if(Object.keys(value).some(key=>!known.has(key))) return fail();
  const source={...defaults,...value},result={};
  for(const [key,[,limit]] of Object.entries(syllabusTextFields)) {
    if(typeof source[key]!=='string'||source[key].length>limit) return fail();result[key]=source[key].trim();
  }
  const weights=rows=>{
    if(rows.some(weight=>weight!==null&&(typeof weight!=='number'||!Number.isFinite(weight)||weight<0||weight>100))) fail();
    const sum=rows.reduce((total,weight)=>total+(weight??0),0);
    if(sum>100.0001||rows.every(weight=>weight!==null)&&Math.abs(sum-100)>.0001) fail();
  };
  if(!Array.isArray(source.grading)||source.grading.length!==4) return fail();
  result.grading=source.grading.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['weight','methods'].includes(key))||!('weight' in row)||!Array.isArray(row.methods)||row.methods.length>7||row.methods.some(id=>typeof id!=='string'||!Object.hasOwn(syllabusMethods,id))) return fail();
    return {weight:row.weight,methods:[...new Set(row.methods)]};
  });
  weights(result.grading.map(row=>row.weight));
  if(!Array.isArray(source.capabilities)||source.capabilities.length!==12) return fail();
  weights(source.capabilities);result.capabilities=[...source.capabilities];
  for(const [key,max] of [['meanings',26],['sdgs',17]]) {
    if(!Array.isArray(source[key])||source[key].length>max||source[key].some(id=>!Number.isInteger(id)||id<1||id>max)) return fail();
    result[key]=[...new Set(source[key])].sort((a,b)=>a-b);
  }
  if(!Array.isArray(source.weeks)||source.weeks.length!==18) return fail();
  result.weeks=source.weeks.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['date','content','notes'].includes(key))||typeof row.date!=='string'||typeof row.content!=='string'||typeof row.notes!=='string'||row.content.length>500||row.notes.length>160) return fail();
    if(row.date&&(!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date)) return fail();
    return {date:row.date,content:row.content.trim(),notes:row.notes.trim()};
  });
  if(JSON.stringify(result).length>10000) throw new Error('The complete syllabus must stay within 10,000 characters.');
  return result;
}
