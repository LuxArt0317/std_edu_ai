import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, ChevronRight, ExternalLink, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  savePersonalSchoolRecord, type AffairsSnapshot, type DtmAssignment, type DtmCourse, type DtmGrade,
  type DtmMaterial, type DtmMeeting, type DtmRecordKind,
} from '@/services/schoolAffairsWorkspace';
import { CalendarDeadlineImport } from './CalendarDeadlineImport';
import { coursesByTerm, dtmViews, type DtmView } from './catalog';
import { deadlineLabel, taipeiDateTimeInput, termLabel, type DtmTranslate } from './locale';

type EditRecord =
  | {kind:'course';record?:DtmCourse}
  | {kind:'meeting';course:DtmCourse;record?:DtmMeeting}
  | {kind:'grade';course:DtmCourse;record?:DtmGrade}
  | {kind:'assignment';course:DtmCourse;record?:DtmAssignment}
  | {kind:'material';course:DtmCourse;record?:DtmMaterial};
type DeleteRecord = {kind:DtmRecordKind;id:string;name:string;courseId?:string};

const names = {
  course:['課程','course'], meeting:['上課紀錄','class meeting'], grade:['成績','grade'],
  assignment:['作業','assignment'], material:['教材','material'],
} as const;
const viewNames = {materials:['教材','Materials'],meetings:['上課紀錄','Class meetings'],assignments:['作業','Assignments'],grades:['成績','Grades']} as const;
const assignmentStatuses = {open:['未完成','Open'],submitted:['已標記繳交','Marked submitted'],graded:['已記錄評分','Marked graded']} as const;
const attendanceStatuses = {unknown:['未記錄','Unrecorded'],present:['出席','Present'],late:['遲到','Late'],absent:['缺席','Absent'],excused:['請假','Excused']} as const;
const pathFor = (course:DtmCourse) => '/dtm/course/'+encodeURIComponent(course.id);
const translated = (t:DtmTranslate,labels:readonly [string,string]) => t(labels[0],labels[1]);
type ActivityDetail = {kind:'material';record:DtmMaterial}|{kind:'grade';record:DtmGrade};

function CourseActivity({kind,title,details,deadline,open,id,t}:{
  kind:'assignment'|'material';title:string;details?:string;deadline?:string|null;open:()=>void;id:string;t:DtmTranslate;
}) {
  const localDeadline=deadline?taipeiDateTimeInput(deadline):'';
  const dateLabel=localDeadline?t(localDeadline.slice(0,4)+'年'+localDeadline.slice(5,7)+'月'+localDeadline.slice(8,10)+'日,'+localDeadline.slice(11),deadlineLabel(deadline||null,t)):'';
  return <li id={kind+'-'+id} className="dtm-course-activity">
    <div className="dtm-activity-link"><img src={'/dtm-theme/'+(kind==='assignment'?'assign':'url')+'.svg'} width="24" height="24" alt=""/>
      <button type="button" onClick={open}>{title}</button>
    </div>
    {details&&<p className="dtm-activity-description">{details}</p>}
    {deadline&&<p className="dtm-activity-deadline">{t('至','Due ')}<time dateTime={deadline} title={t('臺灣時間','Taipei time')}>{dateLabel}</time></p>}
  </li>;
}

function RecordEditor({edit,t,saved,close}:{edit:EditRecord;t:DtmTranslate;saved:(id:string)=>void;close:()=>void}) {
  const [id] = useState(()=>edit.record?.id || crypto.randomUUID());
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const {kind} = edit;
  const isEdit = Boolean(edit.record);
  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if (kind==='grade' && Number(values.score)>Number(values.maximum)) {
      setError(t('分數不可大於滿分。','The score cannot exceed the maximum.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await savePersonalSchoolRecord({kind:'save_dtm_'+kind as `save_dtm_${DtmRecordKind}`,payload:{
        ...values,id,...(kind==='course'?{}:{course_id:edit.course.id}),
        ...(kind==='assignment'?{due_at:values.due_at?new Date(values.due_at+'+08:00').toISOString():''}:{}),
      }});
      saved(result.id);
    } catch (reason) {
      setError(reason instanceof Error?reason.message:t('無法儲存紀錄。','Could not save this record.'));
    } finally {setBusy(false);}
  };
  return <form className="dtm-record-form" onSubmit={submit}>
    <h3>{t((isEdit?'編輯':'新增')+names[kind][0],(isEdit?'Edit ':'Add ')+names[kind][1])}</h3>
    {edit.kind==='course' && <>
      <div className="dtm-form-grid">
        <label>{t('課程代碼','Course code')}<Input name="code" maxLength={32} required defaultValue={edit.record?.code}/></label>
        <label>{t('學年度與學期','Academic year and semester')}<Input name="term" maxLength={80} required placeholder="115學年度第1學期" defaultValue={edit.record?.term}/></label>
      </div>
      <label>{t('課程名稱','Course name')}<Input name="title" maxLength={160} required defaultValue={edit.record?.title}/></label>
    </>}
    {edit.kind==='meeting' && <>
      <label>{t('課堂主題','Meeting topic')}<Input name="title" maxLength={160} required defaultValue={edit.record?.title}/></label>
      <div className="dtm-form-grid">
        <label>{t('上課日期','Meeting date')}<Input type="date" name="meeting_on" required min="2000-01-01" max="2100-12-31" defaultValue={edit.record?.date}/></label>
        <label>{t('開始時間（臺灣）','Start time (Taipei)')}<Input type="time" name="starts_at" defaultValue={edit.record?.startsAt?.slice(0,5)}/></label>
      </div>
      <label>{t('出席狀態','Attendance')}<select name="attendance" defaultValue={edit.record?.attendance ?? 'unknown'}>
        {Object.entries(attendanceStatuses).map(([value,labels])=><option key={value} value={value}>{translated(t,labels)}</option>)}
      </select></label>
      <label>{t('課堂筆記','Meeting notes')}<Textarea name="notes" maxLength={2000} rows={3} defaultValue={edit.record?.notes}/></label>
    </>}
    {edit.kind==='assignment' && <>
      <label>{t('作業名稱','Assignment name')}<Input name="title" minLength={3} maxLength={160} required defaultValue={edit.record?.title}/></label>
      <div className="dtm-form-grid">
        <label>{t('截止日期（臺灣）','Deadline (Taipei)')}<Input type="datetime-local" name="due_at" min="2000-01-01T00:00" max="2100-12-31T23:59" defaultValue={taipeiDateTimeInput(edit.record?.dueAt ?? null)}/></label>
        <label>{t('作業狀態','Assignment status')}<select name="status" defaultValue={edit.record?.status ?? 'open'}>
          {Object.entries(assignmentStatuses).map(([value,labels])=><option key={value} value={value}>{translated(t,labels)}</option>)}
        </select></label>
      </div>
      <label>{t('指派作業的課堂','Meeting where assigned')}<select name="meeting_id" defaultValue={edit.record?.meetingId ?? ''}>
        <option value="">{t('未連結','No meeting linked')}</option>
        {(edit.course.meetings||[]).map(meeting=><option key={meeting.id} value={meeting.id}>{meeting.date} · {meeting.title}</option>)}
      </select></label>
      <label>{t('作業說明','Assignment notes')}<Textarea name="details" maxLength={2000} rows={3} defaultValue={edit.record?.details}/></label>
    </>}
    {edit.kind==='grade' && <>
      <label>{t('成績項目','Grade item')}<Input name="label" required maxLength={160} defaultValue={edit.record?.label}/></label>
      <div className="dtm-form-grid">
        <label>{t('分數','Score')}<Input name="score" type="number" min={0} max={1000000} step=".01" required defaultValue={edit.record?.score}/></label>
        <label>{t('滿分','Maximum points')}<Input name="maximum" type="number" min={.01} max={1000000} step=".01" required defaultValue={edit.record?.maximum ?? 100}/></label>
      </div>
      <label>{t('評分日期','Graded date')}<Input type="date" name="graded_on" min="2000-01-01" max="2100-12-31" defaultValue={edit.record?.date ?? ''}/></label>
      <label>{t('回饋','Feedback')}<Textarea name="feedback" maxLength={2000} rows={3} defaultValue={edit.record?.feedback}/></label>
    </>}
    {edit.kind==='material' && <>
      <label>{t('教材名稱','Material name')}<Input name="title" required maxLength={160} defaultValue={edit.record?.title}/></label>
      <label>{t('類型','Type')}<select name="kind" defaultValue={edit.record?.kind ?? 'page'}><option value="page">{t('頁面','Page')}</option><option value="file">{t('檔案','File')}</option></select></label>
      <label>{t('Moodle 教材連結（選填）','Moodle material link (optional)')}<Input type="url" name="source_url"
        pattern={String.raw`https://dtm\.stu\.edu\.tw/(course|mod/[a-z_]+)/view\.php\?id=[0-9]{1,12}`} maxLength={150} defaultValue={edit.record?.sourceUrl ?? ''}/></label>
      <label>{t('教材摘要','Material summary')}<Textarea name="summary" maxLength={2000} rows={3} defaultValue={edit.record?.summary}/></label>
    </>}
    {error && <p className="dtm-error" role="alert">{error}</p>}
    <div className="dtm-form-actions">
      <Button type="submit" disabled={busy}>{busy?t('儲存中…','Saving…'):t('儲存紀錄','Save record')}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={close}>{t('取消','Cancel')}</Button>
    </div>
  </form>;
}

function RowActions({t,edit,remove}:{t:DtmTranslate;edit:()=>void;remove:()=>void}) {
  return <div className="dtm-row-actions">
    <Button size="sm" variant="outline" type="button" onClick={edit}>{t('編輯','Edit')}</Button>
    <Button size="sm" variant="ghost" type="button" onClick={remove}>{t('刪除','Delete')}</Button>
  </div>;
}

export function DtmStudentRecords({snapshot,course,view,mode,t,refresh}:{
  snapshot:AffairsSnapshot;course?:DtmCourse;view?:DtmView;mode:'dashboard'|'course'|'assignments'|'grades';
  t:DtmTranslate;refresh:()=>void;
}) {
  const [editor,setEditor] = useState<EditRecord|null>(null);
  const [detail,setDetail] = useState<ActivityDetail|null>(null);
  const [importOpen,setImportOpen] = useState(false);
  const [deleting,setDeleting] = useState<DeleteRecord|null>(null);
  const [error,setError] = useState('');
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);
  const [assignmentFilter,setAssignmentFilter] = useState('all');
  const navigate=useNavigate();
  const courses=snapshot.dtm.courses;
  const personal=courses.filter(row=>row.sourceMode==='personal');
  const visible=personal.length?personal:courses;
  const selected=course?[course]:visible;
  const selectedById=new Map(selected.map(row=>[row.id,row]));
  const assignments=snapshot.assignments.filter(row=>row.dtmCourseId && selectedById.has(row.dtmCourseId));
  const own=course?.sourceMode==='personal';
  const activeView=view||'materials';
  const assignmentList=assignments.filter(row=>assignmentFilter==='all'||(assignmentFilter==='open'?row.status==='open':row.status!=='open'));
  const grades=selected.flatMap(row=>(row.grades||[]).map(grade=>({course:row,grade})));
  function edit(record:EditRecord) {setStatus('');setDetail(null);setImportOpen(false);setEditor(record);}
  function saved(id:string) {
    const newCourse=editor?.kind==='course' && !editor.record;
    setEditor(null);
    setStatus(t('已儲存紀錄。','Record saved.'));
    refresh();
    if(newCourse) navigate('/dtm/course/'+id);
  }
  async function deleteRecord() {
    if(!deleting||busy)return;
    setBusy(true);
    setError('');
    try {
      await savePersonalSchoolRecord({kind:'delete_dtm_'+deleting.kind as `delete_dtm_${DtmRecordKind}`,
        payload:{id:deleting.id,...(deleting.courseId?{course_id:deleting.courseId}:{})}});
      setDeleting(null);
      setDetail(null);
      setEditor(null);
      setStatus(t('已刪除紀錄。','Record deleted.'));
      refresh();
      if(deleting.kind==='course')navigate('/dtm/dashboard');
    }catch(reason){setError(reason instanceof Error?reason.message:t('無法刪除紀錄。','Could not delete the record.'));}
    finally{setBusy(false);}
  }
  function askDelete(record:DeleteRecord){setError('');setDeleting(record);}
  const courseContents=course&&activeView==='materials';
  const report=mode==='grades'||(course&&activeView==='grades');

  return <>
    {mode==='dashboard'&&
      <div className="dtm-section-heading"><h2>{t('我的課程','My courses')}</h2>
        <Button onClick={()=>edit({kind:'course'})}><Plus size={16}/>{t('新增課程','Add course')}</Button>
      </div>}
    {course&&<div className="dtm-course-tools"><DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="dtm-course-menu" aria-label={t('課程選單','Course menu')}><Settings size={17}/></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {dtmViews.map(tab=><DropdownMenuItem asChild key={tab}><Link to={pathFor(course)+(tab==='materials'?'':'/'+tab)}>{translated(t,viewNames[tab])}</Link></DropdownMenuItem>)}
        {own&&<>
          <DropdownMenuSeparator/>
          {(['assignment','material','meeting','grade'] as const).map(kind=><DropdownMenuItem key={kind} onSelect={()=>edit({kind,course})}>{t('新增'+names[kind][0],'Add '+names[kind][1])}</DropdownMenuItem>)}
          <DropdownMenuItem onSelect={()=>{setEditor(null);setImportOpen(true);}}>{t('匯入 Moodle 行事曆','Import Moodle calendar')}</DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onSelect={()=>edit({kind:'course',record:course})}>{t('編輯課程','Edit course')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>askDelete({kind:'course',id:course.id,name:course.title})}>{t('刪除課程','Delete course')}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu></div>}
    {mode==='assignments'&&!course&&<h2>{t('我的作業','My assignments')}</h2>}
    {report&&<>
      <h2 className="dtm-report-title">{t('用戶報告','User report')} - {snapshot.profile.displayName||snapshot.profile.email}</h2>
      <nav className="dtm-report-tabs" aria-label={t('成績報告檢視','Grade report views')}>
        <Link to="/dtm/grades" aria-current={!course?'page':undefined}>{t('綜覽報告','Overview report')}</Link>
        {course&&<Link to={pathFor(course)+'/grades'} aria-current="page">{t('用戶報告','User report')}</Link>}
      </nav>
    </>}
    {status&&<p role="status" className="dtm-saved">{status}</p>}
    {editor&&<RecordEditor key={editor.kind+':'+(editor.record?.id||'new')} edit={editor} t={t} saved={saved} close={()=>setEditor(null)}/>}
    {importOpen&&course&&<CalendarDeadlineImport courseId={course.id} t={t} onImported={count=>{
      setImportOpen(false);
      setStatus(count?t('已匯入 '+count+' 筆截止日期。','Imported '+count+' deadline(s).'):t('所選日期已存在。','The selected deadlines are already saved.'));
      refresh();
    }}/>}
    {mode==='dashboard'&&<div className="dtm-term-list">
      {!courses.length&&<p>{t('尚無課程。請新增一門課程開始。','Add a course to start tracking your records.')}</p>}
      {coursesByTerm(courses).map(([term,rows])=><section className="dtm-card" key={term}>
        <h2>{termLabel(term,t)}</h2>
        <ul className="dtm-record-list">{rows.map(row=><li key={row.id}><Link to={pathFor(row)}>{row.code} · {row.title}<ChevronRight size={15}/></Link>
          {row.sourceMode==='sample'&&<small>{t('範例','Sample')}</small>}</li>)}</ul>
      </section>)}
    </div>}
    {courseContents&&<div className="dtm-course-content">
      <section className="dtm-course-section"><h3>{t('作業區','Assignments')}</h3>
        {assignments.length?<ul className="dtm-course-activities">{assignments.map(row=><CourseActivity key={row.id} id={row.id} kind="assignment" title={row.title} details={row.details} deadline={row.dueAt} open={()=>navigate(pathFor(course)+'/assignment/'+row.id)} t={t}/>)}</ul>
          :<p className="dtm-activity-empty">{t('尚無作業。','No assignments saved.')}</p>}
      </section>
      <section className="dtm-course-section"><h3>{t('測驗區','Quizzes')}</h3><p className="dtm-activity-empty">{t('尚無測驗紀錄。','No quiz records saved.')}</p></section>
      <section className="dtm-course-section"><h3>{t('教材區','Course materials')}</h3>
        {course.materials.length?<ul className="dtm-course-activities">{course.materials.map(row=><CourseActivity key={row.id} id={row.id} kind="material" title={row.title} open={()=>setDetail({kind:'material',record:row})} t={t}/>)}</ul>
          :<p className="dtm-activity-empty">{t('尚無教材。','No course materials saved.')}</p>}
      </section>
    </div>}
    {(mode==='assignments'||(course&&activeView==='assignments'))&&<div className="dtm-assignment-view">
      {course&&<h3>{t('作業區','Assignments')}</h3>}
      <label className="dtm-filter">{t('篩選作業','Filter assignments')}
        <select value={assignmentFilter} onChange={event=>setAssignmentFilter(event.target.value)}>
          <option value="all">{t('全部','All')}</option><option value="open">{t('未完成','Unfinished')}</option><option value="done">{t('已繳交或評分','Submitted or graded')}</option>
        </select>
      </label>
      {assignmentList.length?<ul className="dtm-record-list">{assignmentList.map(row=>{
        const rowCourse=selectedById.get(row.dtmCourseId || '');
        const meeting=rowCourse?.meetings?.find(item=>item.id===row.meetingId);
        return <li key={row.id} id={'assignment-'+row.id}><div>
          {rowCourse?<Link to={pathFor(rowCourse)+'/assignment/'+row.id}>{!course?rowCourse.code+' · ':''}{row.title}</Link>:<span>{row.title}</span>}
          <small>{translated(t,assignmentStatuses[row.status])} · {deadlineLabel(row.dueAt,t)}{row.origin==='moodle_calendar'?' · '+t('Moodle 行事曆','Moodle calendar'):row.sourceMode==='sample'?' · '+t('範例','Sample'):''}</small>
          {meeting&&rowCourse&&<Link className="dtm-record-context" to={pathFor(rowCourse)+'/meetings#meeting-'+meeting.id}>{meeting.date} · {meeting.title}</Link>}
          {row.details&&<p>{row.details}</p>}
          {row.sourceMode==='personal'&&rowCourse&&<RowActions t={t}
            edit={()=>edit({kind:'assignment',course:rowCourse,record:row})}
            remove={()=>askDelete({kind:'assignment',id:row.id,courseId:rowCourse.id,name:row.title})}/>}
        </div></li>;
      })}</ul>:<p className="dtm-empty">{t('沒有符合的作業。','No matching assignments.')}</p>}
    </div>}
    {course&&activeView==='meetings'&&((course.meetings||[]).length?<ul className="dtm-record-list">
      {(course.meetings||[]).map(row=><li key={row.id} id={'meeting-'+row.id}><CalendarDays size={18} aria-hidden="true"/>
        <div><strong>{row.title}</strong><small>{row.date} {row.startsAt?.slice(0,5)!=='00:00'?row.startsAt?.slice(0,5):''} · {translated(t,attendanceStatuses[row.attendance])}</small>
          {row.notes&&<p>{row.notes}</p>}
          {assignments.filter(item=>item.meetingId===row.id).map(item=>
            <Link className="dtm-record-context" key={item.id} to={pathFor(course)+'/assignments#assignment-'+item.id}>{item.title}</Link>)}
        </div>
        {own&&<RowActions t={t} edit={()=>edit({kind:'meeting',course,record:row})} remove={()=>askDelete({kind:'meeting',id:row.id,courseId:course.id,name:row.title})}/>}
      </li>)}
    </ul>:<p className="dtm-empty">{t('尚無上課或出席紀錄。','No class meetings or attendance recorded.')}</p>)}
    {report&&((grades.length||course)?<div className="dtm-grade-scroll" role="region" aria-label={t('成績報告','Grade report')} tabIndex={0}>
      <table className="dtm-grade-table"><thead><tr>
        <th scope="col">{t('評分項目','Grade item')}</th><th scope="col">{t('計算後權量','Calculated weight')}</th><th scope="col">{t('成績','Grade')}</th><th scope="col">{t('全距','Range')}</th><th scope="col">{t('百分比','Percentage')}</th>
        <th scope="col">{t('排名','Rank')}</th><th scope="col">{t('回饋','Feedback')}</th><th scope="col">{t('貢獻到課程總分','Contribution to course total')}</th>
      </tr></thead>{selected.filter(row=>course||row.grades?.length).map(rowCourse=><tbody key={rowCourse.id}>
        <tr className="dtm-grade-group"><th scope="rowgroup" colSpan={8}><img src="/dtm-theme/folder.svg" width="16" height="16" alt=""/>{rowCourse.title}</th></tr>
        {rowCourse.grades?.map(grade=><tr key={grade.id} id={'grade-'+grade.id}>
          <th scope="row" className="dtm-grade-item">{course?<button className="dtm-record-title" type="button" onClick={()=>setDetail({kind:'grade',record:grade})}>{grade.label}</button>:<Link to={pathFor(rowCourse)+'/grades#grade-'+grade.id}>{grade.label}</Link>}</th>
          <td>–</td><td>{grade.score.toFixed(2)}</td><td>0–{grade.maximum.toFixed(2)}</td><td>{((grade.score/grade.maximum)*100).toFixed(2)}%</td><td>–</td><td>{grade.feedback||'–'}</td><td>–</td>
        </tr>)}
        <tr className="dtm-grade-total"><th scope="row"><span className="dtm-grade-total-symbol" aria-hidden="true">Σ</span>{t('課程總分','Course total')}</th><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>
      </tbody>)}</table>
    </div>:<p className="dtm-empty">{t('尚無成績。','No saved grades.')}</p>)}
    <Dialog open={Boolean(detail)} onOpenChange={open=>{if(!open)setDetail(null);}}>
      <DialogContent className="dtm-activity-dialog">
        <DialogHeader><DialogTitle>{detail?.kind==='grade'?detail.record.label:detail?.record.title}</DialogTitle><DialogDescription>{course?.title} · {course?.sourceMode==='sample'?t('範例課程','Sample course'):t('個人紀錄','Personal records')}</DialogDescription></DialogHeader>
        {detail?.kind==='material'&&<>
          {detail.record.summary&&<p className="dtm-detail-text">{detail.record.summary}</p>}
          {detail.record.sourceUrl&&<a href={detail.record.sourceUrl} target="_blank" rel="noreferrer">{t('在校方 Moodle 開啟','Open in university Moodle')} <ExternalLink size={13}/></a>}
        </>}
        {detail?.kind==='grade'&&<><p>{detail.record.score} / {detail.record.maximum} · {((detail.record.score/detail.record.maximum)*100).toFixed(1)}%</p>{detail.record.date&&<p>{detail.record.date}</p>}{detail.record.feedback&&<p className="dtm-detail-text">{detail.record.feedback}</p>}</>}
        {own&&course&&detail&&<DialogFooter><RowActions t={t} edit={()=>{
          if(detail.kind==='material')edit({kind:'material',course,record:detail.record});
          else edit({kind:'grade',course,record:detail.record});
        }} remove={()=>askDelete({kind:detail.kind,id:detail.record.id,courseId:course.id,name:detail.kind==='grade'?detail.record.label:detail.record.title})}/></DialogFooter>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('刪除紀錄','Delete record')}</DialogTitle>
          <DialogDescription>{deleting?.kind==='course'
            ?t('將刪除此課程及相關教材、上課紀錄、作業和成績。','This deletes the course and its materials, meetings, assignments, and grades.')
            :deleting?.name}</DialogDescription>
        </DialogHeader>
        {error&&<p className="dtm-error" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setDeleting(null)}>{t('取消','Cancel')}</Button>
          <Button variant="destructive" disabled={busy} onClick={()=>void deleteRecord()}>{t('刪除','Delete')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
