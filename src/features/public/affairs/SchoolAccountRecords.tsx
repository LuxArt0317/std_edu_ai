import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { loadSchoolAffairsData, performSchoolAffairsAction } from '@/services/schoolAffairsWorkspace';
import type { AffairsAction, AffairsSnapshot } from '@/services/schoolAffairsWorkspace';

const weekdays=['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function SchoolAccountRecords({ userId }: { userId: string }) {
  const [state,setState]=useState<{loading:boolean;data:AffairsSnapshot|null;error:string}>({loading:true,data:null,error:''});
  const [attempt,setAttempt]=useState(0),[adminOpen,setAdminOpen]=useState(false),[busy,setBusy]=useState(false);
  const [task,setTask]=useState(''),[requestTitle,setRequestTitle]=useState(''),[requestDetails,setRequestDetails]=useState('');
  const [requestType,setRequestType]=useState<'general'|'records'|'registration'>('general');
  const [noticeTitle,setNoticeTitle]=useState(''),[noticeBody,setNoticeBody]=useState('');
  const [actionError,setActionError]=useState(''),[actionStatus,setActionStatus]=useState('');
  useEffect(()=>{
    let active=true;
    setState({loading:true,data:null,error:''});
    void loadSchoolAffairsData(adminOpen).then(data=>{if(active)setState({loading:false,data,error:''});})
      .catch(error=>{if(active)setState({loading:false,data:null,error:error instanceof Error?error.message:'Records could not be loaded.'});});
    return ()=>{active=false;};
  },[userId,attempt,adminOpen]);
  useEffect(()=>{
    const onUpdated=()=>setAttempt(value=>value+1);
    window.addEventListener('school-affairs:updated',onUpdated);
    return ()=>window.removeEventListener('school-affairs:updated',onUpdated);
  },[]);
  async function act(action:AffairsAction,after?:()=>void) {
    if(busy)return;
    setBusy(true);setActionError('');setActionStatus('');
    try {
      const result=await performSchoolAffairsAction(action);
      setActionStatus(result.summary);after?.();setAttempt(value=>value+1);
    } catch(error) {setActionError(error instanceof Error?error.message:'Action could not be completed.');}
    finally {setBusy(false);}
  }
  function submitTask(event:FormEvent) {event.preventDefault();void act({kind:'create_task',payload:{title:task.trim()}},()=>setTask(''));}
  function submitRequest(event:FormEvent) {event.preventDefault();void act({kind:'create_service_request',payload:{title:requestTitle.trim(),details:requestDetails.trim(),request_type:requestType}},()=>{setRequestTitle('');setRequestDetails('');});}
  function submitNotice(event:FormEvent) {event.preventDefault();void act({kind:'publish_announcement',payload:{title:noticeTitle.trim(),body:noticeBody.trim()}},()=>{setNoticeTitle('');setNoticeBody('');});}
  const data=state.data;
  return <section className="portal-account-records" aria-label="My School Affairs records">
    <div className="affairs-records-header"><div><h2>My School Affairs</h2><p>Courses, timetable, practice grades, tasks and requests for this Google account.</p></div><span className="affairs-sample-tag">SAMPLE DATA</span></div>
    <p className="affairs-sample-note">This is a real stu.best database workspace with simulated school records. It is not connected to the university's official student system, grades, fees or submissions.</p>
    {state.loading && <p role="status">Loading your School Affairs records…</p>}
    {state.error && <div role="alert"><p>{state.error}</p><Button variant="outline" onClick={()=>setAttempt(value=>value+1)}>Try again</Button></div>}
    {data && <>
      <dl className="affairs-record-identity"><div><dt>Account</dt><dd>{data.profile.email}</dd></div><div><dt>Student number</dt><dd>{data.student?.studentNumber||'Not linked'}</dd></div><div><dt>Program</dt><dd>{data.student?.program||'Not linked'}</dd></div><div><dt>Access</dt><dd>{data.profile.role==='admin'?'Site admin':'Student'}</dd></div></dl>
      <div className="affairs-record-grid">
        <section><h3>My courses &amp; timetable</h3>{data.courses.length?<ul>{data.courses.map(course=><li key={course.enrollmentId}><strong>{course.code} · {course.title}</strong><span>{course.term} · {weekdays[course.weekday||0]} {course.startsAt.slice(0,5)}–{course.endsAt.slice(0,5)} · {course.room}</span><span>{course.instructor} · {course.credits} credits</span>{course.grades.map(grade=><span key={grade.label}>Practice grade: {grade.label} {grade.score}/{grade.maximum}</span>)}</li>)}</ul>:<p>No courses linked.</p>}</section>
        <section><h3>Tasks</h3><ul>{data.tasks.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.completedAt?'Done':'Open'} · {item.sourceMode==='sample'?'Sample':'stu.best task'}</span>{!item.completedAt&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void act({kind:'complete_task',payload:{task_id:item.id}})}>Mark done</Button>}</li>)}</ul><form onSubmit={submitTask} className="affairs-record-form"><label htmlFor="affairs-task">Add a task</label><div><Input id="affairs-task" value={task} onChange={event=>setTask(event.target.value)} minLength={3} maxLength={160} required placeholder="e.g. Review my course list"/><Button disabled={busy} type="submit">Add</Button></div></form></section>
        <section><h3>Notices</h3><ul>{data.announcements.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.body}</span><small>{item.sourceMode==='sample'?'Sample notice':'stu.best notice'}</small></li>)}</ul></section>
        <section><h3>Fees &amp; requests</h3><p>{data.charges.length?data.charges.map(item=>`${item.label}: ${item.amountDue} ${item.currency} (${item.sourceMode})`).join('; '):'No fee items in this workspace. This does not confirm an official balance.'}</p><ul>{data.requests.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.status} · stu.best request</span></li>)}</ul><form onSubmit={submitRequest} className="affairs-record-form"><label htmlFor="affairs-request-title">Ask the site admin</label><Input id="affairs-request-title" value={requestTitle} onChange={event=>setRequestTitle(event.target.value)} minLength={3} maxLength={160} required placeholder="Request title"/><select aria-label="Request type" value={requestType} onChange={event=>setRequestType(event.target.value as typeof requestType)}><option value="general">General</option><option value="records">Records</option><option value="registration">Registration</option></select><Textarea aria-label="Request details" value={requestDetails} onChange={event=>setRequestDetails(event.target.value)} minLength={5} maxLength={2000} required placeholder="Describe what you need"/><Button disabled={busy} type="submit">Submit to stu.best</Button></form></section>
      </div>
      {data.profile.role==='admin'&&<div className="affairs-admin"><Button variant="outline" aria-expanded={adminOpen} onClick={()=>setAdminOpen(value=>!value)}>{adminOpen?'Hide admin':'Open site admin'}</Button>{adminOpen&&data.admin&&<div className="affairs-record-grid"><section><h3>Accounts ({data.admin.profiles.length})</h3><ul>{data.admin.profiles.map(item=><li key={item.user_id}><strong>{item.display_name}</strong><span>{item.email} · {item.role}</span></li>)}</ul></section><section><h3>Site requests</h3><ul>{data.admin.requests.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.status} · {item.request_type}</span>{item.status!=='resolved'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void act({kind:'resolve_service_request',payload:{request_id:item.id}})}>Resolve</Button>}</li>)}</ul></section><section><h3>Publish a stu.best notice</h3><form onSubmit={submitNotice} className="affairs-record-form"><Input aria-label="Announcement title" value={noticeTitle} onChange={event=>setNoticeTitle(event.target.value)} minLength={3} maxLength={160} required placeholder="Title"/><Textarea aria-label="Announcement body" value={noticeBody} onChange={event=>setNoticeBody(event.target.value)} minLength={5} maxLength={2000} required placeholder="Message"/><Button disabled={busy} type="submit">Publish notice</Button></form></section></div>}</div>}
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
    <h2>Account and records</h2><p>Supabase stores your site account and authentication session. School Affairs creates account-specific sample courses, grades and notices for demonstration. These are not official university records. Site tasks and requests are real stu.best workspace records, but are not submitted to the university. The verified Lux Google account receives a site admin role after its first School Affairs sign-in.</p>
    <h2>Browser storage and AI</h2><p>A separate School Affairs session and account-specific display preferences are stored in your browser. Signing out of School Affairs leaves a separately signed-in Nexus management session unchanged. AI conversations are kept in page memory and cleared when the account changes. Private questions send only this account's stu.best School Affairs records to the AI service. A proposed action runs only when you confirm it. School Affairs chat does not read Nexus records or official university data. Attached images are not accepted for private account questions.</p>
    <h2>Account assistance</h2><p>For account or data requests, contact the site administrator at <a href="mailto:luxart0317@gmail.com">luxart0317@gmail.com</a>.</p>
    <a href="/school-affairs/login">Return to sign in</a>
  </article></main>;
}
