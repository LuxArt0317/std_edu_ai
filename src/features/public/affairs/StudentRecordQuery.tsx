import { useState } from 'react';
import type { AffairsSnapshot } from '@/services/schoolAffairsWorkspace';
import type { AccountQuery } from './studentServices.js';

type Course = AffairsSnapshot['courses'][number];
type Row = {key:string;cells:(string|number)[]};
type Query = {
  columns:string[];
  byTerm?:boolean;
  rows:(snapshot:AffairsSnapshot,courses:Course[])=>Row[];
};

const enrollmentStatus: Record<string,string> = {enrolled:'修課中',completed:'已修畢',withdrawn:'已退選'};
const attendanceStatus: Record<string,string> = {present:'出席',absent:'缺席',late:'遲到',excused:'請假'};
const dash = '—';
const amount = (value:number,currency:string) =>
  new Intl.NumberFormat('zh-TW',{style:'currency',currency,maximumFractionDigits:2}).format(value);

function timetableRows(courses:Course[]):Row[] {
  const times = new Map<string, string[][]>();
  for (const course of courses) {
    if (!course.weekday || !course.startsAt || course.status!=='enrolled') continue;
    const time = course.startsAt.slice(0,5)+' ~ '+(course.endsAt.slice(0,5)||dash);
    const days = times.get(time) ?? Array.from({length:7},()=>[] as string[]);
    days[course.weekday-1]?.push([course.code+' · '+course.title,course.room].filter(Boolean).join('\n'));
    times.set(time,days);
  }
  return [...times].sort(([a],[b])=>a.localeCompare(b)).map(([time,days])=>({
    key:time,cells:[dash,time,...days.map(day=>day.join('\n\n')||dash)],
  }));
}

const queries: Record<AccountQuery,Query> = {
  enrollments:{
    byTerm:true,
    columns:['序號','當期課程代碼','課程名稱','必選修','學分','教師一','備註'],
    rows:(_,courses)=>courses.map((course,index)=>({
      key:course.enrollmentId,
      cells:[index+1,course.code,course.title,dash,course.credits,course.instructor||dash,enrollmentStatus[course.status] ?? course.status],
    })),
  },
  timetable:{
    byTerm:true,
    columns:['節次','時間','周一','周二','周三','周四','周五','周六','周日'],
    rows:(_,courses)=>timetableRows(courses),
  },
  grades:{
    byTerm:true,
    columns:['科目','評量項目','得分','滿分'],
    rows:(_,courses)=>courses.flatMap(course=>course.grades.map((grade,index)=>({
      key:course.enrollmentId+':'+index,
      cells:[course.code+' · '+course.title,grade.label,grade.score,grade.maximum],
    }))),
  },
  attendance:{
    byTerm:true,
    columns:['上課日期','科目','出缺席紀錄'],
    rows:(_,courses)=>courses.flatMap(course=>course.attendance.map((entry,index)=>({
      key:course.enrollmentId+':'+index,
      cells:[entry.date,course.code+' · '+course.title,attendanceStatus[entry.status] ?? entry.status],
    }))).sort((a,b)=>String(b.cells[0]).localeCompare(String(a.cells[0]))),
  },
  credits:{
    byTerm:true,
    columns:['學期','已修畢科目','已修畢學分'],
    rows:(_,courses)=>courses.filter(course=>course.status==='completed').map(course=>({
      key:course.enrollmentId,cells:[course.term,course.code+' · '+course.title,course.credits],
    })),
  },
  student:{
    columns:['學號','姓名','系所','年級','狀態'],
    rows:({student})=>student ? [{
      key:student.id,cells:[student.studentNumber,student.fullName,student.program||dash,student.yearLevel,student.status],
    }] : [],
  },
  fees:{
    columns:['發生日期 Date','發生原因 Details','類別 Category','待繳金額 Amount',
      '連絡單位 Contact Unit','連絡分機 Contact Extension','繳費單位 Unit in Charge','繳費狀態 Payment Status'],
    rows:({charges})=>charges.map(item=>({
      key:item.id,cells:[dash,item.label,dash,amount(Math.max(0,item.amountDue-item.amountPaid),item.currency),
        dash,dash,dash,item.amountPaid>=item.amountDue?'已繳':'待繳'],
    })),
  },
};

export function StudentRecordQuery({kind,snapshot,title}:{kind:AccountQuery;snapshot:AffairsSnapshot;title:string}) {
  const [term,setTerm]=useState('');
  const query=queries[kind];
  const terms=[...new Set(snapshot.courses.map(course=>course.term))];
  const rows=query.rows(snapshot,term?snapshot.courses.filter(course=>course.term===term):snapshot.courses);
  return <section className={'student-record-query'+(kind==='timetable'?' student-record-timetable':'')} aria-label={title}>
    {query.byTerm && terms.length>0 && <label>
      學期
      <select value={term} onChange={event=>setTerm(event.target.value)}>
        <option value="">全部學期</option>
        {terms.map(value=><option key={value}>{value}</option>)}
      </select>
    </label>}
    <div className="student-service-table-scroll" role="region" aria-label={title+'紀錄表'} tabIndex={0}>
      <table className="student-service-table">
        <thead><tr>{query.columns.map(column=><th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>
          {rows.map(({key,cells})=><tr key={key}>{cells.map((cell,index)=>
            index===0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}
          {rows.length===0 && <tr><td colSpan={query.columns.length}>目前沒有符合的紀錄。</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="student-record-source">stu.best · 範例紀錄</p>
  </section>;
}
