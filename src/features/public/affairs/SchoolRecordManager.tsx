import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AffairsManagerAction, AffairsSnapshot } from '@/services/schoolAffairsWorkspace';
import { ScholarshipManager } from './ScholarshipManager';
import { StudentAidManager } from './studentAidManager';
import { HousingManager } from './HousingManager';
import {CreditLoadHistoryManager} from './CreditLoadHistoryManager';
import {CourseSelectionManager} from './CourseSelectionManager';
import {AcademicGradesManager} from './AcademicGradesManager';
import {GraduationReviewManager} from './GraduationReviewManager';
import {AcademicAttendanceManager} from './AcademicAttendanceManager';
import {PendingFeeFields} from './PendingFeeFields';
import {pendingFeeDraft} from '@/services/pendingFees';

type Admin = NonNullable<AffairsSnapshot['admin']>;
const taipeiInput=(iso:string|null)=>iso?new Date(iso).toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).replace(' ','T').slice(0,16):'';
export function SchoolRecordManager({admin,busy,onManage,onRefresh}:{admin:Admin;busy:boolean;onRefresh?:()=>void;onManage:(action:AffairsManagerAction)=>Promise<boolean>}) {
  const [studentId,setStudentId]=useState('');
  const [sectionId,setSectionId]=useState('');
  const [enrollmentStatus,setEnrollmentStatus]=useState('enrolled');
  const [chargeId,setChargeId]=useState('');
  const [chargeLabel,setChargeLabel]=useState('');
  const [amountDue,setAmountDue]=useState('');
  const [amountPaid,setAmountPaid]=useState('0');
  const [chargeDue,setChargeDue]=useState('');
  const [feeMetadata,setFeeMetadata]=useState(pendingFeeDraft);
  const [assignmentId,setAssignmentId]=useState('');
  const [relation,setRelation]=useState('');
  const [assignmentTitle,setAssignmentTitle]=useState('');
  const [assignmentDetails,setAssignmentDetails]=useState('');
  const [assignmentDue,setAssignmentDue]=useState('');
  const selected=admin.students.find(item=>item.id===studentId)||admin.students[0];
  const nativeManagers=<>
    <CourseSelectionManager records={admin.courseSelection?.records ?? []} profiles={admin.profiles} busy={busy} onSave={onManage} onRefresh={onRefresh}/>
    <AcademicGradesManager records={admin.academicGrades ?? {records:[],termSummaries:[],rankings:[],metadata:[]}} profiles={admin.profiles} busy={busy} onSave={onManage} onRefresh={onRefresh}/>
    <GraduationReviewManager records={admin.graduationReview ?? {reports:[]}} profiles={admin.profiles} busy={busy} onSave={onManage} onRefresh={onRefresh}/>
    <AcademicAttendanceManager records={admin.academicAttendance ?? {statistics:[],details:[],metadata:[]}} profiles={admin.profiles} busy={busy} onSave={onManage} onRefresh={onRefresh}/>
    <CreditLoadHistoryManager records={admin.creditLoadHistory?.records ?? []} profiles={admin.profiles} busy={busy} onSave={onManage}/>
    <ScholarshipManager admin={admin} busy={busy} onManage={onManage}/>
    <StudentAidManager records={admin.studentAid?.records ?? []} profiles={admin.profiles} busy={busy} onSave={onManage}/>
    <HousingManager admin={admin} busy={busy} onManage={onManage}/>
  </>;
  if(!selected)return <><p>No student accounts are available for record management.</p>{nativeManagers}</>;
  const studentEnrollments=admin.enrollments.filter(item=>item.studentId===selected.id);
  const studentDtm=admin.dtmCourses.filter(item=>item.user_id===selected.user_id);
  const studentCharges=admin.charges.filter(item=>item.student_id===selected.id);
  const studentAssignments=admin.assignments.filter(item=>item.student_id===selected.id);
  function clearCharge(){setChargeId('');setChargeLabel('');setAmountDue('');setAmountPaid('0');setChargeDue('');setFeeMetadata(pendingFeeDraft());}
  function clearAssignment(){setAssignmentId('');setRelation('');setAssignmentTitle('');setAssignmentDetails('');setAssignmentDue('');}
  function changeStudent(value:string){setStudentId(value);clearCharge();clearAssignment();}
  function saveEnrollment(event:FormEvent){event.preventDefault();void onManage({kind:'save_enrollment',payload:{student_id:selected.id,section_id:sectionId,status:enrollmentStatus}});}
  function saveCharge(event:FormEvent){event.preventDefault();void onManage({kind:'save_charge',payload:{id:chargeId,student_id:selected.id,label:chargeLabel,amount_due:amountDue,amount_paid:amountPaid,due_on:chargeDue,...feeMetadata}}).then(saved=>{if(saved)clearCharge();});}
  function saveAssignment(event:FormEvent){event.preventDefault();const [kind,id]=relation.split(':');void onManage({kind:'save_assignment',payload:{id:assignmentId,student_id:selected.id,enrollment_id:kind==='school'?id:'',dtm_course_id:kind==='dtm'?id:'',title:assignmentTitle,details:assignmentDetails,due_at:assignmentDue?new Date(`${assignmentDue}:00+08:00`).toISOString():''}}).then(saved=>{if(saved)clearAssignment();});}
  return <div className="affairs-manager">
    <h3>Manage sample school records</h3>
    <p>These records power stu.best account answers. Changes are audited and remain separate from official university systems.</p>
    <label className="affairs-manager-student">Student account<select value={selected.id} onChange={event=>changeStudent(event.target.value)}>{admin.students.map(item=><option key={item.id} value={item.id}>{item.full_name} · {item.student_number}</option>)}</select></label>
    <div className="affairs-record-grid">
      <section><h3>Subjects</h3><ul>{studentEnrollments.map(item=><li key={item.id}><strong>{item.code}</strong><span>{item.status}</span></li>)}</ul>
        <form onSubmit={saveEnrollment} className="affairs-record-form"><label htmlFor="manager-section">Add or update enrollment</label><select id="manager-section" required value={sectionId} onChange={event=>setSectionId(event.target.value)}><option value="">Choose a subject</option>{admin.sections.map(item=><option key={item.id} value={item.id}>{item.code} · {item.term}</option>)}</select><select aria-label="Enrollment status" value={enrollmentStatus} onChange={event=>setEnrollmentStatus(event.target.value)}><option value="enrolled">Enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select><Button disabled={busy} type="submit">Save enrollment</Button></form>
      </section>
      <section><h3>Tuition and fees</h3><ul>{studentCharges.map(item=><li key={item.id}><strong>{item.label}</strong><span>NT${item.amount_due} · paid NT${item.amount_paid}</span><div className="affairs-manager-actions"><Button size="sm" variant="outline" onClick={()=>{setChargeId(item.id);setChargeLabel(item.label);setAmountDue(String(item.amount_due));setAmountPaid(String(item.amount_paid));setChargeDue(item.due_on||'');setFeeMetadata(pendingFeeDraft(item));}}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm(`Delete sample charge “${item.label}”?`))void onManage({kind:'delete_charge',payload:{id:item.id}});}}>Delete</Button></div></li>)}</ul>
        <form onSubmit={saveCharge} className="affairs-record-form"><label htmlFor="manager-charge-label">{chargeId?'Edit':'Add'} sample charge</label><Input id="manager-charge-label" required minLength={3} maxLength={160} value={chargeLabel} onChange={event=>setChargeLabel(event.target.value)} placeholder="Fee label"/><label>Amount due (TWD)<Input type="number" min="0" step="0.01" required value={amountDue} onChange={event=>setAmountDue(event.target.value)}/></label><label>Amount paid (TWD)<Input type="number" min="0" step="0.01" required value={amountPaid} onChange={event=>setAmountPaid(event.target.value)}/></label><label>Due date<Input type="date" value={chargeDue} onChange={event=>setChargeDue(event.target.value)}/></label><PendingFeeFields value={feeMetadata} onChange={setFeeMetadata} disabled={busy}/><div><Button disabled={busy} type="submit">Save charge</Button>{chargeId&&<Button type="button" variant="outline" onClick={clearCharge}>Cancel</Button>}</div></form>
      </section>
      <section><h3>Assignments</h3><ul>{studentAssignments.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.status}{item.due_at?` · due ${new Date(item.due_at).toLocaleString('en-US',{timeZone:'Asia/Taipei'})} Taipei`:''}</span><div className="affairs-manager-actions"><Button size="sm" variant="outline" onClick={()=>{setAssignmentId(item.id);setRelation(item.enrollment_id?`school:${item.enrollment_id}`:`dtm:${item.dtm_course_id}`);setAssignmentTitle(item.title);setAssignmentDetails(item.details);setAssignmentDue(taipeiInput(item.due_at));}}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm(`Delete sample assignment “${item.title}”?`))void onManage({kind:'delete_assignment',payload:{id:item.id}});}}>Delete</Button></div></li>)}</ul>
        <form onSubmit={saveAssignment} className="affairs-record-form"><label htmlFor="manager-assignment-course">{assignmentId?'Edit':'Add'} sample assignment</label><select id="manager-assignment-course" required value={relation} onChange={event=>setRelation(event.target.value)}><option value="">Choose a course</option>{studentEnrollments.map(item=><option key={item.id} value={`school:${item.id}`}>{item.code} · School Affairs</option>)}{studentDtm.map(item=><option key={item.id} value={`dtm:${item.id}`}>{item.code} · DTM</option>)}</select><Input aria-label="Assignment title" required minLength={3} maxLength={160} value={assignmentTitle} onChange={event=>setAssignmentTitle(event.target.value)} placeholder="Assignment title"/><Textarea aria-label="Assignment details" maxLength={2000} value={assignmentDetails} onChange={event=>setAssignmentDetails(event.target.value)} placeholder="Instructions"/><label>Due date and time · Taipei<Input type="datetime-local" value={assignmentDue} onChange={event=>setAssignmentDue(event.target.value)}/></label><div><Button disabled={busy} type="submit">Save assignment</Button>{assignmentId&&<Button type="button" variant="outline" onClick={clearAssignment}>Cancel</Button>}</div></form>
      </section>
    </div>
    {nativeManagers}
  </div>;
}
