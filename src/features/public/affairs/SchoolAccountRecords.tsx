import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { manageSchoolAffairsRecord, performSchoolAffairsAction } from '@/services/schoolAffairsWorkspace';
import type { AffairsAction, AffairsManagerAction } from '@/services/schoolAffairsWorkspace';
import { SchoolRecordManager } from './SchoolRecordManager';
import { useAffairsRecords } from './useAffairsRecords';

const weekdays=['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function SchoolAccountRecords({ userId }: { userId: string }) {
  const [adminOpen,setAdminOpen]=useState(false),[busy,setBusy]=useState(false);
  const {snapshot:data,loading,error,refresh}=useAffairsRecords(userId,adminOpen);
  const [task,setTask]=useState(''),[requestTitle,setRequestTitle]=useState(''),[requestDetails,setRequestDetails]=useState('');
  const [requestType,setRequestType]=useState<'general'|'records'|'registration'>('general');
  const [noticeTitle,setNoticeTitle]=useState(''),[noticeBody,setNoticeBody]=useState('');
  const [actionError,setActionError]=useState(''),[actionStatus,setActionStatus]=useState('');
  useEffect(()=>{
    window.addEventListener('school-affairs:updated',refresh);
    return ()=>window.removeEventListener('school-affairs:updated',refresh);
  },[refresh]);
  async function act(action:AffairsAction,after?:()=>void) {
    if(busy)return;
    setBusy(true);setActionError('');setActionStatus('');
    try {
      const result=await performSchoolAffairsAction(action);
      setActionStatus(result.summary);after?.();refresh();
    } catch(error) {setActionError(error instanceof Error?error.message:'Action could not be completed.');}
    finally {setBusy(false);}
  }
  async function manage(action:AffairsManagerAction) {
    if(busy)return false;
    setBusy(true);setActionError('');setActionStatus('');
    try {const result=await manageSchoolAffairsRecord(action);setActionStatus(result.summary);refresh();return true;}
    catch(error){setActionError(error instanceof Error?error.message:'Record could not be saved.');return false;}
    finally{setBusy(false);}
  }
  function submitTask(event:FormEvent) {event.preventDefault();void act({kind:'create_task',payload:{title:task.trim()}},()=>setTask(''));}
  function submitRequest(event:FormEvent) {event.preventDefault();void act({kind:'create_service_request',payload:{title:requestTitle.trim(),details:requestDetails.trim(),request_type:requestType}},()=>{setRequestTitle('');setRequestDetails('');});}
  function submitNotice(event:FormEvent) {event.preventDefault();void act({kind:'publish_announcement',payload:{title:noticeTitle.trim(),body:noticeBody.trim()}},()=>{setNoticeTitle('');setNoticeBody('');});}
  return <section className="portal-account-records" aria-label="My School Affairs records">
    <div className="affairs-records-header"><div><h2>My School Affairs</h2><p>Subjects, timetable, assignments, tuition, tasks and requests for this Google account.</p></div><Link to="/dtm/dashboard">Open my DTM records</Link></div>
    <p className="affairs-sample-note">Enrollment and fees shown here are samples. Your DTM and service records are saved in your stu.best account.</p>
    {loading && <p role="status">Loading your School Affairs records…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={refresh}>Try again</Button></div>}
    {data && <>
      <dl className="affairs-record-identity"><div><dt>Account</dt><dd>{data.profile.email}</dd></div><div><dt>Student number</dt><dd>{data.student?.studentNumber||'Not linked'}</dd></div><div><dt>Program</dt><dd>{data.student?.program||'Not linked'}</dd></div><div><dt>Access</dt><dd>{data.profile.role==='admin'?'Site admin':'Student'}</dd></div></dl>
      <div className="affairs-record-grid">
        <section><h3>My subjects &amp; timetable</h3>{data.courses.length?<ul>{data.courses.map(course=><li key={course.enrollmentId}><strong>{course.code} · {course.title}</strong><span>{course.term} · {course.status} · {weekdays[course.weekday||0]} {course.startsAt.slice(0,5)}–{course.endsAt.slice(0,5)} · {course.room}</span><span>{course.instructor} · {course.credits} credits</span>{course.grades.map(grade=><span key={grade.label}>Practice grade: {grade.label} {grade.score}/{grade.maximum}</span>)}</li>)}</ul>:<p>No subjects linked.</p>}</section>
        <section><h3>My assignments</h3>{data.assignments.length?<ul>{data.assignments.map(item=><li key={item.id}><strong>{item.dtmCourseId?<Link to={`/dtm/course/${item.dtmCourseId}/assignments#assignment-${item.id}`}>{item.course} · {item.title}</Link>:item.course+' · '+item.title}</strong><span>{item.status} · {item.sourceMode==='personal'?'Personal DTM record':'Sample'}{item.dueAt?` · due ${new Date(item.dueAt).toLocaleString('en-US',{timeZone:'Asia/Taipei'})} Taipei`:''}</span><span>{item.details}</span></li>)}</ul>:<p>No assignments linked.</p>}</section>
        <section><h3>Tasks</h3><ul>{data.tasks.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.completedAt?'Done':'Open'} · {item.sourceMode==='sample'?'Sample':'stu.best task'}</span>{!item.completedAt&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void act({kind:'complete_task',payload:{task_id:item.id}})}>Mark done</Button>}</li>)}</ul><form onSubmit={submitTask} className="affairs-record-form"><label htmlFor="affairs-task">Add a task</label><div><Input id="affairs-task" value={task} onChange={event=>setTask(event.target.value)} minLength={3} maxLength={160} required placeholder="e.g. Review my course list"/><Button disabled={busy} type="submit">Add</Button></div></form></section>
        <section><h3>Notices</h3><ul>{data.announcements.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.body}</span><small>{item.sourceMode==='sample'?'Sample notice':'stu.best notice'}</small></li>)}</ul></section>
        <section><h3>Tuition, fees &amp; requests</h3><p>{data.charges.length?data.charges.map(item=>`${item.label}: NT$${item.amountDue.toLocaleString()} · paid NT$${item.amountPaid.toLocaleString()} · remaining NT$${(item.amountDue-item.amountPaid).toLocaleString()} (sample)`).join('; '):'No fee items in this workspace.'}</p><ul>{data.requests.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.status} · stu.best request</span></li>)}</ul><form onSubmit={submitRequest} className="affairs-record-form"><label htmlFor="affairs-request-title">Ask the site admin</label><Input id="affairs-request-title" value={requestTitle} onChange={event=>setRequestTitle(event.target.value)} minLength={3} maxLength={160} required placeholder="Request title"/><select aria-label="Request type" value={requestType} onChange={event=>setRequestType(event.target.value as typeof requestType)}><option value="general">General</option><option value="records">Records</option><option value="registration">Registration</option></select><Textarea aria-label="Request details" value={requestDetails} onChange={event=>setRequestDetails(event.target.value)} minLength={5} maxLength={2000} required placeholder="Describe what you need"/><Button disabled={busy} type="submit">Submit to stu.best</Button></form></section>
      </div>
      {data.profile.role==='admin'&&<div className="affairs-admin">
        <Button variant="outline" aria-expanded={adminOpen} onClick={()=>setAdminOpen(value=>!value)}>{adminOpen?'Hide admin':'Open site admin'}</Button>
        {adminOpen&&data.admin&&<>
          <SchoolRecordManager admin={data.admin} busy={busy} onManage={manage}/>
          <div className="affairs-record-grid">
            <section><h3>Accounts ({data.admin.profiles.length})</h3><ul>{data.admin.profiles.map(item=>
              <li key={item.user_id}><strong>{item.display_name}</strong><span>{item.email} · {item.role}</span></li>
            )}</ul></section>
            <section><h3>Site requests</h3><ul>{data.admin.requests.map(item=>
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.status} · {item.request_type}</span>
                <p className="whitespace-pre-wrap break-words">{item.details}</p>
                {item.status!=='resolved'&&<Button size="sm" variant="outline" disabled={busy}
                  onClick={()=>void act({kind:'resolve_service_request',payload:{request_id:item.id}})}>Resolve</Button>}
              </li>
            )}</ul></section>
            <section><h3>Publish a stu.best notice</h3><form onSubmit={submitNotice} className="affairs-record-form">
              <Input aria-label="Announcement title" value={noticeTitle} onChange={event=>setNoticeTitle(event.target.value)} minLength={3} maxLength={160} required placeholder="Title"/>
              <Textarea aria-label="Announcement body" value={noticeBody} onChange={event=>setNoticeBody(event.target.value)} minLength={5} maxLength={2000} required placeholder="Message"/>
              <Button disabled={busy} type="submit">Publish notice</Button>
            </form></section>
          </div>
        </>}
      </div>}
      {actionError&&<p role="alert" className="affairs-record-error">{actionError}</p>}{actionStatus&&<p role="status" className="affairs-record-success">{actionStatus}</p>}
      <p className="affairs-record-updated">Checked {new Date(data.checkedAt).toLocaleString()} · Ask the campus assistant about these records.</p>
    </>}
  </section>;
}
export function SchoolAffairsPrivacy() {
  return <main className="affairs-login"><article className="affairs-login-wrap affairs-login-card">
    <h1>stu.best sign-in privacy</h1>
    <p>stu.best is an independent campus website. It is not the university's identity provider.</p>
    <h2>Google account information</h2><p>Google authenticates you and shares your basic profile: name, email address and profile picture. We do not request Gmail mailbox, contacts, Drive or calendar access. Your Google password is entered only on Google.</p>
    <h2>Account and records</h2><p>Supabase stores your site account, sample records, and private records you enter or import. Requesting site review shares the service record title, dates and class periods with the stu.best administrator. Use official university services for enrollment, grades, applications and submissions.</p>
    <h2>Browser storage and AI</h2><p>The browser stores your separate School Affairs session and display preferences. The assistant answers questions about personal DTM and service records from the database on stu.best. Other School Affairs questions may use the AI service. The assistant runs proposed actions after you confirm them.</p>
    <h2>Account assistance</h2><p>For account or data requests, contact the site administrator at <a href="mailto:luxart0317@gmail.com">luxart0317@gmail.com</a>.</p>
    <a href="/school-affairs/login">Return to sign in</a>
  </article></main>;
}
