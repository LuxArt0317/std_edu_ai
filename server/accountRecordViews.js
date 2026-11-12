const clean=value=>String(value??'—').slice(0,200);
const date=value=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(value)):'Not set';
const money=(value,currency='TWD')=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value));
export function accountRecordViews(snapshot,tools){
  const definitions={
    courses:['Subjects','/school-affairs/records',['Subject','Term','Status','Room','Data'],snapshot.courses||[],row=>[`${row.code} ${row.title}`,row.term,row.status,row.room,row.sourceMode]],
    charges:['Tuition and fees','/school-affairs/services/39-1',['Item','Due','Paid','Remaining','Data'],snapshot.charges||[],row=>[row.label,money(row.amountDue,row.currency),money(row.amountPaid,row.currency),money(Number(row.amountDue)-Number(row.amountPaid),row.currency),row.sourceMode]],
    assignments:['Assignment tracker','/dtm/assignments',['Assignment','Course','Due (Taipei)','Status','Data'],snapshot.assignments||[],row=>[row.title,row.course,date(row.dueAt),row.status,row.sourceMode]],
    tasks:['Your tasks','/school-affairs/records',['Task','Due (Taipei)','Status'],snapshot.tasks||[],row=>[row.title,date(row.dueAt),row.completedAt?'Complete':'Open']],
    requests:['Your service requests','/school-affairs/records',['Request','Type','Status'],snapshot.requests||[],row=>[row.title,row.type,row.status]],
    dtm:['DTM courses','/dtm',['Course','Term','Materials','Data'],snapshot.dtm?.courses||[],row=>[`${row.code} ${row.title}`,row.term,String(row.materials?.length||0),row.sourceMode]],
    serviceRecords:['Your service records','/school-affairs/services/leave',['Record','Type','Status','Starts'],snapshot.serviceRecords||[],row=>[row.title,row.recordType,row.reviewStatus||row.status,row.startsOn]],
  };
  return tools.filter(key=>key in definitions).slice(0,3).map(key=>{
    const [title,url,columns,records,values]=definitions[key];
    return {id:key,title,url,columns,rows:records.slice(0,12).map(row=>values(row).map(clean)),total:records.length,checkedAt:snapshot.checkedAt,
      note:'Retrieved stu.best records. “sample” means demonstration data. This is not a live university sync. Collections may be limited as described in the answer.'};
  });
}
