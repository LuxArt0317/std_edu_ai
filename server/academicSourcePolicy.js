/** Temporary academic seed rows are not student evidence. Keep real/imported rows. */
const collections=new Set(['courses','subjects','enrollments','grades','assessments','assignments','materials','meetings','attendance','dtmCourses']);
const temporary=row=>row&&typeof row==='object'&&(row.sourceMode==='sample'||row.source_mode==='sample'||/^SAMP\d/i.test(row.code||''));
export function academicSourceRecords(value,key='',depth=0){
 if(depth>16||!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.filter(row=>!collections.has(key)||!temporary(row)).map(row=>academicSourceRecords(row,key,depth+1));
 return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,academicSourceRecords(item,name,depth+1)]));
}
/** Also protect restored conversations which contain pre-policy record tables. */
export function academicSourceViews(views=[]){
 return views.flatMap(view=>{
  if(!['courses','dtm','assignments','academicGrades'].includes(view.id))return [view];
  const index=view.columns.findIndex(c=>/^data$/i.test(c));
  const rows=view.rows.filter(row=>!(index>=0&&String(row[index]).toLowerCase()==='sample')&&!/^SAMP\d/i.test(String(row[0])));
  if(!rows.length&&view.rows.length)return [];
  return [{...view,rows,total:Math.max(rows.length,view.total-(view.rows.length-rows.length))}];
 });
}
