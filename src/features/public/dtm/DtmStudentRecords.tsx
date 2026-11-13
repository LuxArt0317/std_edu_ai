import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CalendarDays, Settings } from 'lucide-react';
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
import { dtmViews, type DtmView } from './catalog';
import { deadlineLabel, taipeiDateTimeInput, type DtmTranslate } from './locale';
import {DtmCourseGradeReport} from './DtmCourseGradeReport';
import {DtmGradeOverview} from './DtmGradeOverview';
import {DtmCourseContent} from './DtmCourseContent';
import {dtmMaterialTargetUrlMaxLength,validateDtmMaterialTargetUrl} from '@/services/dtmCourseResource';

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
type ActivityDetail = {kind:'grade';record:DtmGrade};

function RecordEditor({edit,t,saved,close,onBusyChange,expectedUserId}:{edit:EditRecord;t:DtmTranslate;saved:(id:string)=>void;close:()=>void;onBusyChange?:(busy:boolean)=>void;expectedUserId?:string}) {
  const [id] = useState(()=>edit.record?.id || crypto.randomUUID());
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const {kind} = edit;
  const isEdit = Boolean(edit.record);
  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if (kind==='grade' && Number(values.score)>Number(values.maximum)) {
      setError(t('分數不可大於滿分。','The score cannot exceed the maximum.'));
      return;
    }
    if(kind==='material'){
      const invalid=validateDtmMaterialTargetUrl(values.target_url);
      if(invalid){setError(t('請輸入有效的公開 HTTPS 資源網址，或留空。','Enter a valid public HTTPS resource URL, or leave it blank.'));return;}
      // Older snapshots may omit this field. An untouched blank must not erase a stored destination.
      if(edit.kind==='material'&&edit.record&&edit.record.targetUrl===undefined&&values.target_url==='')delete values.target_url;
    }
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    const controller=new AbortController();
    pending.current=controller;
    try {
      const result = await savePersonalSchoolRecord({kind:'save_dtm_'+kind as `save_dtm_${DtmRecordKind}`,payload:{
        ...values,id,...(kind==='course'?{}:{course_id:edit.course.id}),
        ...(kind==='assignment'?{due_at:values.due_at?new Date(values.due_at+'+08:00').toISOString():''}:{}),
      }},expectedUserId===undefined?undefined:{expectedUserId,signal:controller.signal});
      if(!controller.signal.aborted)saved(result.id);
    } catch (reason) {
      if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:t('無法儲存紀錄。','Could not save this record.'));
    } finally {if(pending.current===controller)pending.current=null;if(!controller.signal.aborted){setBusy(false);onBusyChange?.(false);}}
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
      <label>{t('資源網址（選填）','Resource destination URL (optional)')}<Input type="text" inputMode="url" name="target_url"
        maxLength={dtmMaterialTargetUrlMaxLength} defaultValue={edit.record?.targetUrl ?? ''}/></label>
      <label>{t('教材摘要','Material summary')}<Textarea name="summary" maxLength={2000} rows={3} defaultValue={edit.record?.summary}/></label>
    </>}
    {error && <p className="dtm-error" role="alert">{error}</p>}
    <div className="dtm-form-actions">
      <Button type="submit" disabled={busy}>{busy?t('儲存中…','Saving…'):t('儲存紀錄','Save record')}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={close}>{t('取消','Cancel')}</Button>
    </div>
  </form>;
}

/** Local record creation stays available without adding a dashboard block. */
export function DtmCourseCreateDialog({userId,open,onOpenChange,t,onSaved}:{
  userId:string;open:boolean;onOpenChange:(open:boolean)=>void;t:DtmTranslate;onSaved:(id:string)=>void;
}) {
  const busy=useRef(false);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  function close(){if(!busy.current)onOpenChange(false);}
  return <Dialog open={open} onOpenChange={value=>{if(value||!busy.current)onOpenChange(value);}}>
    <DialogContent className="dtm dtm-course-create-dialog" onCloseAutoFocus={event=>{
      event.preventDefault();document.querySelector<HTMLButtonElement>('.dtm-user')?.focus();
    }}>
      <DialogHeader><DialogTitle className="sr-only">{t('新增課程','Add course')}</DialogTitle>
        <DialogDescription>{t('新增此帳號的個人課程紀錄。','Add a personal course record for this account.')}</DialogDescription></DialogHeader>
      <RecordEditor edit={{kind:'course'}} expectedUserId={userId} t={t} close={close} onBusyChange={value=>{busy.current=value;}}
        saved={id=>{if(active.current)onSaved(id);}}/>
    </DialogContent>
  </Dialog>;
}

function RowActions({t,edit,remove}:{t:DtmTranslate;edit:()=>void;remove:()=>void}) {
  return <div className="dtm-row-actions">
    <Button size="sm" variant="outline" type="button" onClick={edit}>{t('編輯','Edit')}</Button>
    <Button size="sm" variant="ghost" type="button" onClick={remove}>{t('刪除','Delete')}</Button>
  </div>;
}

type DtmStudentRecordsProps={
  snapshot:AffairsSnapshot;course?:DtmCourse;view?:DtmView;gradeReportView?:'overview';mode:'course'|'assignments'|'grades';
  t:DtmTranslate;refresh:()=>void;
};
export function DtmStudentRecords(props:DtmStudentRecordsProps){
  return <DtmStudentRecordsSession key={props.snapshot.profile.userId} {...props}/>;
}
function DtmStudentRecordsSession({snapshot,course,view,gradeReportView,mode,t,refresh}:DtmStudentRecordsProps) {
  const [editor,setEditor] = useState<EditRecord|null>(null);
  const [detail,setDetail] = useState<ActivityDetail|null>(null);
  const [importOpen,setImportOpen] = useState(false);
  const [deleting,setDeleting] = useState<DeleteRecord|null>(null);
  const [error,setError] = useState('');
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);
  const [assignmentFilter,setAssignmentFilter] = useState('all');
  const [gradeEntriesOpen,setGradeEntriesOpen]=useState(false);
  const [materialEntriesOpen,setMaterialEntriesOpen]=useState(false);
  const deletion=useRef<AbortController|null>(null);
  useEffect(()=>()=>deletion.current?.abort(),[]);
  const {hash}=useLocation();
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
  function edit(record:EditRecord) {setStatus('');setDetail(null);setMaterialEntriesOpen(false);setImportOpen(false);setEditor(record);}
  function saved(id:string) {
    const newCourse=editor?.kind==='course' && !editor.record;
    setEditor(null);
    setStatus(t('已儲存紀錄。','Record saved.'));
    refresh();
    if(newCourse) navigate('/dtm/course/'+id);
  }
  async function deleteRecord() {
    if(!deleting||deletion.current)return;
    const controller=new AbortController();deletion.current=controller;
    setBusy(true);
    setError('');
    try {
      await savePersonalSchoolRecord({kind:'delete_dtm_'+deleting.kind as `delete_dtm_${DtmRecordKind}`,
        payload:{id:deleting.id,...(deleting.courseId?{course_id:deleting.courseId}:{})}},
        {expectedUserId:snapshot.profile.userId,signal:controller.signal});
      if(controller.signal.aborted)return;
      setDeleting(null);
      setDetail(null);
      setEditor(null);
      setStatus(t('已刪除紀錄。','Record deleted.'));
      refresh();
      if(deleting.kind==='course')navigate('/dtm/dashboard');
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:t('無法刪除紀錄。','Could not delete the record.'));}
    finally{if(deletion.current===controller)deletion.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  function askDelete(record:DeleteRecord){setError('');setMaterialEntriesOpen(false);setDeleting(record);}
  const courseContents=course&&activeView==='materials';
  const report=mode==='grades'||(course&&activeView==='grades');
  const overview=mode==='grades'||gradeReportView==='overview';
  useEffect(()=>{
    if(!report||overview||!course||!/^#grade-[0-9a-f-]{36}$/.test(hash))return;
    const grade=course.grades?.find(row=>row.id===hash.slice(7));
    if(grade)setDetail({kind:'grade',record:grade});
  },[report,overview,course,hash]);

  return <>
    {course&&<div className="dtm-course-tools"><DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="dtm-course-menu" aria-label={t('課程選單','Course menu')}><Settings size={17}/></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {dtmViews.map(tab=><DropdownMenuItem asChild key={tab}><Link to={pathFor(course)+(tab==='materials'?'':'/'+tab)}>{translated(t,viewNames[tab])}</Link></DropdownMenuItem>)}
        {Boolean(course.grades?.length)&&<DropdownMenuItem onSelect={()=>setGradeEntriesOpen(true)}>{t('個人成績紀錄','Personal grade entries')}</DropdownMenuItem>}
        {own&&<>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onSelect={()=>setMaterialEntriesOpen(true)}>{t('管理教材','Manage materials')}</DropdownMenuItem>
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
      <h2 className="dtm-report-title">{overview?t('綜覽報告','Overview report'):t('用戶報告','User report')} - {snapshot.profile.displayName||snapshot.profile.email}</h2>
      <nav className="dtm-report-tabs" aria-label={t('成績報告檢視','Grade report views')}>
        <Link to={course?pathFor(course)+'/grades/overview':'/dtm/grades'} aria-current={overview?'page':undefined}>{t('綜覽報告','Overview report')}</Link>
        {course&&<Link to={pathFor(course)+'/grades'} aria-current={overview?undefined:'page'}>{t('用戶報告','User report')}</Link>}
      </nav>
    </>}
    {status&&<p role="status" className="dtm-saved">{status}</p>}
    {editor&&<RecordEditor key={editor.kind+':'+(editor.record?.id||'new')} edit={editor} expectedUserId={snapshot.profile.userId} t={t} saved={saved} close={()=>setEditor(null)}/>}
    {importOpen&&course&&<CalendarDeadlineImport courseId={course.id} t={t} onImported={count=>{
      setImportOpen(false);
      setStatus(count?t('已匯入 '+count+' 筆截止日期。','Imported '+count+' deadline(s).'):t('所選日期已存在。','The selected deadlines are already saved.'));
      refresh();
    }}/>}
    {courseContents&&<DtmCourseContent key={snapshot.profile.userId+':'+course.id} userId={snapshot.profile.userId}
      courseId={course.id} refreshKey={snapshot.checkedAt} t={t}
      onOpenAssignment={id=>navigate(pathFor(course)+'/assignment/'+id)} onOpenMaterial={record=>navigate(pathFor(course)+'/material/'+encodeURIComponent(record.id))}/>}
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
    {report&&(overview?<DtmGradeOverview key={snapshot.profile.userId} userId={snapshot.profile.userId} t={t}/>
      :course&&<DtmCourseGradeReport key={snapshot.profile.userId+':'+course.id} userId={snapshot.profile.userId} course={course} t={t}/>)}
    <Dialog open={materialEntriesOpen} onOpenChange={setMaterialEntriesOpen}>
      <DialogContent className="dtm-activity-dialog"><DialogHeader><DialogTitle>{t('管理教材','Manage materials')}</DialogTitle>
        <DialogDescription>{course?.title}</DialogDescription></DialogHeader>
        {course?.materials.length?<ul className="dtm-record-list">{course.materials.map(material=><li key={material.id}>
          <Link to={pathFor(course)+'/material/'+encodeURIComponent(material.id)}>{material.title}</Link>
          {own&&material.sourceMode==='personal'&&<RowActions t={t} edit={()=>edit({kind:'material',course,record:material})}
            remove={()=>askDelete({kind:'material',id:material.id,courseId:course.id,name:material.title})}/>}
        </li>)}</ul>:<p>{t('尚無教材紀錄。','No material records.')}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={gradeEntriesOpen} onOpenChange={setGradeEntriesOpen}>
      <DialogContent className="dtm-activity-dialog"><DialogHeader><DialogTitle>{t('個人成績紀錄','Personal grade entries')}</DialogTitle>
        <DialogDescription>{course?.title}</DialogDescription></DialogHeader>
        <ul className="dtm-record-list">{course?.grades?.map(grade=><li key={grade.id} id={'grade-'+grade.id}>
          <button type="button" className="dtm-record-title" onClick={()=>{setGradeEntriesOpen(false);setDetail({kind:'grade',record:grade});}}>{grade.label}</button>
          <span>{grade.score} / {grade.maximum}</span>
        </li>)}</ul>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(detail)} onOpenChange={open=>{if(!open)setDetail(null);}}>
      <DialogContent className="dtm-activity-dialog">
        <DialogHeader><DialogTitle>{detail?.record.label}</DialogTitle><DialogDescription>{course?.title} · {course?.sourceMode==='sample'?t('範例課程','Sample course'):t('個人紀錄','Personal records')}</DialogDescription></DialogHeader>
        {detail?.kind==='grade'&&<><p>{detail.record.score} / {detail.record.maximum} · {((detail.record.score/detail.record.maximum)*100).toFixed(1)}%</p>{detail.record.date&&<p>{detail.record.date}</p>}{detail.record.feedback&&<p className="dtm-detail-text">{detail.record.feedback}</p>}</>}
        {own&&course&&detail&&<DialogFooter><RowActions t={t} edit={()=>{
          edit({kind:'grade',course,record:detail.record});
        }} remove={()=>askDelete({kind:detail.kind,id:detail.record.id,courseId:course.id,name:detail.record.label})}/></DialogFooter>}
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
