import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CrmUser } from "../crm/authService";
import {
  createAcademicTerm,
  createAcademicCurriculum,
  createManualAcademicCurriculum,
  deleteDraftAcademicCurriculum,
  createCatalogCourse,
  createCourseSection,
  createDepartment,
  createProgram,
  createScheduleEvent,
  createStudentAccount,
  deleteScheduleEvent,
  manageSectionEnrollment,
  updateCourseSection,
  updateAcademicTerm,
  updateAcademicCurriculum,
  updateCatalogCourse,
  updateDepartment,
  updateProgram,
  updateScheduleEvent,
  updateStudentRecord,
  closeAcademicTerm,
  withdrawStudentRecord,
  mergeStudentRecords,
  archiveAcademicProgram,
  transitionEnrollment,
} from "./platformRepository";
import type {
  AcademicCurriculumInput,
  PlatformData,
  PlatformRole,
  ScheduleEvent,
  SchoolCourse,
} from "./types";

type AcademicTab =
  "overview" | "curricula" | "students" | "subjects" | "sections" | "enrollment";
type ModalName =
  | "student"
  | "department"
  | "program"
  | "curriculum"
  | "term"
  | "subject"
  | "section"
  | "event"
  | "mergeStudent"
  | "duplicateCurriculum"
  | null;

const departmentManagers = new Set<PlatformRole>([
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
]);
const academicManagers = new Set<PlatformRole>([
  "owner",
  "admin",
  "dean",
  "registrar",
  "department_head",
]);
const registrarRoles = new Set<PlatformRole>(["owner", "admin", "registrar"]);
const scheduleManagers = new Set<PlatformRole>([
  "owner",
  "admin",
  "dean",
  "registrar",
  "department_head",
  "faculty",
]);

function generatedPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

function localDateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="academic-modal-layer">
      <button
        type="button"
        className="academic-modal-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <section
        className="academic-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span>ACADEMIC OPERATIONS</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ActionForm({
  children,
  submitLabel,
  busy,
  onSubmit,
}: {
  children: ReactNode;
  submitLabel: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="academic-form" onSubmit={onSubmit}>
      <div className="academic-form-grid">{children}</div>
      <footer>
        <span>Required fields are validated before saving.</span>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </footer>
    </form>
  );
}

const curriculumCategories = ["general_education","core","professional","elective","capstone","internship","physical_education","nstp"] as const;

function CurriculumEditor({draft,status,originalStatus,busy,catalogSubjects,onDraft,onStatus,onSave,onCreateSubject}:{draft:AcademicCurriculumInput;status:"draft"|"approved"|"retired";originalStatus:"draft"|"approved"|"retired";busy:boolean;catalogSubjects:PlatformData["catalogCourses"];onDraft:(value:AcademicCurriculumInput)=>void;onStatus:(value:"draft"|"approved"|"retired")=>void;onSave:(reason:string)=>void;onCreateSubject:()=>void}) {
  const editable=originalStatus === "draft";
  const [catalogSubjectId,setCatalogSubjectId]=useState("");
  const updateSubject=(index:number,patch:Partial<AcademicCurriculumInput["subjects"][number]>)=>onDraft({...draft,subjects:draft.subjects.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item)});
  const updateBlock=(index:number,patch:Partial<AcademicCurriculumInput["blocks"][number]>)=>onDraft({...draft,blocks:draft.blocks.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item)});
  const availableCatalogSubjects=catalogSubjects.filter((course)=>!draft.subjects.some((subject)=>subject.courseId===course.id));
  const addCatalogSubject=()=>{
    const course=catalogSubjects.find((item)=>item.id===catalogSubjectId);
    if(!course)return;
    onDraft({...draft,subjects:[...draft.subjects,{courseId:course.id,code:course.code,title:course.title,description:course.description,units:course.credits,yearLevel:1,semester:1,category:"professional",sortOrder:draft.subjects.length+1,prerequisiteCodes:[],prerequisiteCourseIds:[]}]});
    setCatalogSubjectId("");
  };
  return <form className="curriculum-editor" onSubmit={(event)=>{event.preventDefault();const reason=String(new FormData(event.currentTarget).get("reason")??"");onSave(reason);}}>
    <section className="curriculum-editor-meta">
      <Field label="Effective year"><select value={draft.effectiveYear} disabled={!editable} onChange={(event)=>onDraft({...draft,effectiveYear:Number(event.target.value)})}>{Array.from({length:10},(_,index)=>new Date().getFullYear()+index-1).map((year)=><option key={year} value={year}>{year}{year===new Date().getFullYear()?" · Current year":""}</option>)}</select></Field>
      <Field label="Lifecycle status"><select value={status} onChange={(event)=>onStatus(event.target.value as typeof status)} disabled={status==="retired"}><option value="draft">Draft</option>{status!=="approved"?<option value="approved">Approved</option>:null}{status==="approved"?<option value="retired">Retired</option>:null}</select></Field>
      <Field label="Duration"><select value={draft.durationYears} disabled={!editable} onChange={(event)=>onDraft({...draft,durationYears:Number(event.target.value)})}>{Array.from({length:8},(_,index)=>index+1).map((year)=><option key={year} value={year}>{year} academic year{year===1?"":"s"}</option>)}</select></Field>
      <Field label="Program"><input value={`${draft.programCode} · ${draft.programName}`} disabled/></Field>
      <Field label="Description" wide><textarea rows={3} value={draft.description} disabled={!editable} onChange={(event)=>onDraft({...draft,description:event.target.value})}/></Field>
    </section>
    <section className="curriculum-editor-section"><header><div><span>SUBJECT SEQUENCE</span><h3>{draft.subjects.length} curriculum subjects</h3><p>Choose authoritative catalog subjects, then place them in the pathway. Subject identity and credits remain managed in the Subject catalog.</p></div>{editable?<div className="curriculum-add-actions"><label><span>Add existing catalog subject</span><select aria-label="Catalog subject to add" value={catalogSubjectId} onChange={(event)=>setCatalogSubjectId(event.target.value)}><option value="">Choose an available subject…</option>{availableCatalogSubjects.map((course)=><option key={course.id} value={course.id}>{course.code} · {course.title} · {course.credits} units</option>)}</select></label><button type="button" disabled={!catalogSubjectId} onClick={addCatalogSubject}>Add selected</button><button type="button" onClick={onCreateSubject}>+ Create catalog subject</button></div>:null}</header>
      <div className="curriculum-subject-editor"><div className="curriculum-subject-head"><span>Order</span><span>Code and title</span><span>Placement</span><span>Units/category</span><span>Prerequisites</span><span>Actions</span></div>{draft.subjects.map((subject,index)=><article key={`${subject.code}-${index}`}>
        <input aria-label={`Sort order for ${subject.code}`} type="number" min="1" value={subject.sortOrder} disabled={!editable} onChange={(event)=>updateSubject(index,{sortOrder:Number(event.target.value)})}/>
        <span className="curriculum-catalog-identity"><strong>{subject.code} · {subject.title}</strong><small>{subject.description||"No catalog description"}</small>{!subject.courseId?<label><span>Link this legacy row</span><select aria-label={`Catalog subject for ${subject.code}`} disabled={!editable} defaultValue="" onChange={(event)=>{const course=catalogSubjects.find((item)=>item.id===event.target.value);if(course)updateSubject(index,{courseId:course.id,code:course.code,title:course.title,description:course.description,units:course.credits,prerequisiteCodes:[],prerequisiteCourseIds:[]});}}><option value="">Choose the authoritative subject…</option>{availableCatalogSubjects.map((course)=><option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>:null}</span>
        <span><label>Year<select value={subject.yearLevel} disabled={!editable} onChange={(event)=>updateSubject(index,{yearLevel:Number(event.target.value)})}>{Array.from({length:draft.durationYears},(_,year)=>year+1).map((year)=><option key={year} value={year}>Year {year}</option>)}</select></label><label>Semester<select value={subject.semester} disabled={!editable} onChange={(event)=>updateSubject(index,{semester:Number(event.target.value)})}><option value="1">1st semester</option><option value="2">2nd semester</option><option value="3">Summer</option></select></label></span>
        <span><output aria-label={`Units for ${subject.code}`}>{subject.units} units</output><select aria-label={`Category for ${subject.code}`} value={subject.category} disabled={!editable} onChange={(event)=>updateSubject(index,{category:event.target.value as typeof subject.category})}>{curriculumCategories.map((category)=><option key={category} value={category}>{category.replaceAll("_"," ")}</option>)}</select></span>
        <select multiple aria-label={`Prerequisites for ${subject.code}`} value={subject.prerequisiteCourseIds??[]} disabled={!editable||!subject.courseId} onChange={(event)=>{const prerequisiteCourseIds=Array.from(event.currentTarget.selectedOptions,(option)=>option.value);updateSubject(index,{prerequisiteCourseIds,prerequisiteCodes:prerequisiteCourseIds.map((id)=>draft.subjects.find((item)=>item.courseId===id)?.code).filter((code):code is string=>Boolean(code))});}}>{draft.subjects.filter((candidate,candidateIndex)=>candidateIndex<index&&candidate.courseId).map((candidate)=><option key={candidate.courseId} value={candidate.courseId}>{candidate.code} · {candidate.title}</option>)}</select>
        <span>{editable?<><button type="button" disabled={index===0} onClick={()=>{const subjects=[...draft.subjects];[subjects[index-1],subjects[index]]=[subjects[index],subjects[index-1]];onDraft({...draft,subjects:subjects.map((item,position)=>({...item,sortOrder:position+1}))});}}>↑</button><button type="button" disabled={index===draft.subjects.length-1} onClick={()=>{const subjects=[...draft.subjects];[subjects[index],subjects[index+1]]=[subjects[index+1],subjects[index]];onDraft({...draft,subjects:subjects.map((item,position)=>({...item,sortOrder:position+1}))});}}>↓</button><button type="button" className="danger" onClick={()=>onDraft({...draft,subjects:draft.subjects.filter((_,itemIndex)=>itemIndex!==index)})}>Remove</button></>:<small>Locked</small>}</span>
      </article>)}</div>
    </section>
    <section className="curriculum-editor-section"><header><div><span>BLOCK TEMPLATES</span><h3>Yearly sections and capacity</h3></div>{editable?<button type="button" onClick={()=>onDraft({...draft,blocks:[...draft.blocks,{yearLevel:1,blockCode:`BLOCK-${draft.blocks.length+1}`,capacity:40}]})}>+ Add block</button>:null}</header><div className="curriculum-block-editor">{draft.blocks.map((block,index)=><article key={`${block.blockCode}-${index}`}><label>Year<input type="number" min="1" max={draft.durationYears} value={block.yearLevel} disabled={!editable} onChange={(event)=>updateBlock(index,{yearLevel:Number(event.target.value)})}/></label><label>Block code<input value={block.blockCode} disabled={!editable} onChange={(event)=>updateBlock(index,{blockCode:event.target.value.toUpperCase()})}/></label><label>Capacity<input type="number" min="1" max="500" value={block.capacity} disabled={!editable} onChange={(event)=>updateBlock(index,{capacity:Number(event.target.value)})}/></label>{editable?<button type="button" className="danger" onClick={()=>onDraft({...draft,blocks:draft.blocks.filter((_,itemIndex)=>itemIndex!==index)})}>Remove</button>:null}</article>)}</div></section>
    <footer><label><span>Required change reason</span><textarea name="reason" required minLength={12} maxLength={1000} placeholder="Explain why this curriculum change is academically required."/></label><button type="submit" disabled={busy||!draft.subjects.length||originalStatus==="retired"||(originalStatus==="approved"&&status!=="retired")}>{busy?"Saving curriculum…":originalStatus==="approved"?"Retire curriculum":"Save curriculum"}</button></footer>
  </form>;
}

export function AcademicOperations({
  data,
  currentUser,
  onChanged,
  onToast,
  onAskNexus,
  onOpenSectionWorkspace,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: (message: string) => void;
  onAskNexus: () => void;
  onOpenSectionWorkspace: (destination: "learning" | "teaching" | "assessments" | "grades" | "schedule", sectionId: string) => void;
}) {
  const role = currentUser.role;
  const [tab, setTab] = useState<AcademicTab>("overview");
  const [modal, setModal] = useState<ModalName>(null);
  const [busy, setBusy] = useState(false);
  const [editingSection, setEditingSection] = useState<SchoolCourse | null>(
    null,
  );
  const [editingId, setEditingId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState(
    data.courses[0]?.sectionId ?? "",
  );
  const [selectedProgramId, setSelectedProgramId] = useState(
    data.programs[0]?.id ?? "",
  );
  const [contextProgramId, setContextProgramId] = useState("");
  const [contextSubjectId, setContextSubjectId] = useState("");
  const [editingCurriculumId, setEditingCurriculumId] = useState("");
  const [curriculumDraft, setCurriculumDraft] = useState<AcademicCurriculumInput | null>(null);
  const [curriculumStatus, setCurriculumStatus] = useState<"draft" | "approved" | "retired">("draft");
  const [subjectDepartmentId,setSubjectDepartmentId]=useState("");
  const [subjectProgramId,setSubjectProgramId]=useState("");
  const [returnToCurriculumAfterSubject,setReturnToCurriculumAfterSubject]=useState(false);
  const [studentProgramId,setStudentProgramId]=useState("");
  const [mergeSourceStudentId,setMergeSourceStudentId]=useState("");
  const [sectionProgramId,setSectionProgramId]=useState("");
  const [duplicateCurriculumId,setDuplicateCurriculumId]=useState("");

  const faculty = data.profiles.filter((profile) =>
    ["faculty", "department_head", "dean"].includes(profile.role),
  );
  const advisors = data.profiles.filter(
    (profile) => ["advisor","faculty","department_head"].includes(profile.role),
  );
  const studentProgram=data.programs.find((item)=>item.id===studentProgramId)??null;
  const eligibleStudentAdvisors=advisors.filter((profile)=>!studentProgram||profile.programId===studentProgram.id||(!profile.programId&&profile.departmentId===studentProgram.departmentId));
  const selectedSection = data.courses.find(
    (course) => course.sectionId === selectedSectionId,
  );
  const sectionEnrollments = data.enrollments.filter(
    (item) => item.sectionId === selectedSectionId,
  );
  const roster = sectionEnrollments
    .map((enrollment) => ({
      enrollment,
      student: data.students.find(
        (student) =>
          student.id === enrollment.studentId ||
          student.profileId === enrollment.profileId,
      ),
    }))
    .filter((item) => item.student);
  const availableStudents = data.students.filter(
    (student) =>
      !sectionEnrollments.some(
        (item) => item.studentId === student.id && item.status !== "dropped",
      ),
  );
  const editingDepartment =
    data.departments.find((item) => item.id === editingId) ?? null;
  const editingProgram =
    data.programs.find((item) => item.id === editingId) ?? null;
  const editingTerm = data.terms.find((item) => item.id === editingId) ?? null;
  const editingSubject =
    data.catalogCourses.find((item) => item.id === editingId) ?? null;
  const editingStudent =
    data.students.find((item) => item.id === editingId) ?? null;
  const selectedProgram =
    data.programs.find((item) => item.id === selectedProgramId) ??
    data.programs[0] ??
    null;
  const selectedProgramDepartment = selectedProgram
    ? data.departments.find((item) => item.id === selectedProgram.departmentId) ?? null
    : null;
  const selectedProgramCurricula = selectedProgram
    ? data.curricula.filter((item) => item.programId === selectedProgram.id)
    : [];
  const selectedDraftCurriculum=selectedProgramCurricula.find((item)=>item.status==="draft")??null;
  const selectedProgramSubjects = selectedProgram
    ? data.catalogCourses.filter((item) => item.status==="active"&&item.departmentId===selectedProgram.departmentId&&(item.programId === selectedProgram.id||item.programId===null))
    : [];
  const selectedProgramSubjectIds = new Set(selectedProgramSubjects.map((item) => item.id));
  const selectedProgramSections = data.courses.filter((item) =>
    selectedProgramSubjectIds.has(item.courseId),
  );
  const selectedProgramStudents = selectedProgram
    ? data.students.filter((item) => item.programId === selectedProgram.id)
    : [];
  const selectedProgramStaff = selectedProgram
    ? data.profiles.filter((item) => item.programId === selectedProgram.id)
    : [];
  const contextProgram = data.programs.find((item) => item.id === contextProgramId) ?? null;
  const sectionProgram=data.programs.find((item)=>item.id===sectionProgramId)??null;
  const sectionSubjects=data.catalogCourses.filter((course)=>course.status==="active"&&course.programId===sectionProgramId);
  const sectionFaculty=faculty.filter((profile)=>!sectionProgram||profile.programId===sectionProgram.id||(!profile.programId&&profile.departmentId===sectionProgram.departmentId));
  const relationshipGaps = {
    programsWithoutCurricula: data.programs.filter(
      (program) => !data.curricula.some((plan) => plan.programId === program.id),
    ),
    subjectsWithoutPrograms: data.catalogCourses.filter((course) => !course.programId),
    studentsWithoutPrograms: data.students.filter((student) => !student.programId),
    classesWithoutFaculty: data.courses.filter((course) => !course.facultyId),
  };

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      onToast(success);
      setModal(null);
      setEditingSection(null);
      setEditingId("");
      setContextProgramId("");
      setContextSubjectId("");
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "The academic operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openSection(course?: SchoolCourse) {
    const catalog=data.catalogCourses.find((item)=>item.id===course?.courseId);
    setEditingSection(course ?? null);
    setContextSubjectId(course?.courseId ?? "");
    setSectionProgramId(catalog?.programId??"");
    setModal("section");
  }

  function openStudent(studentId=""){
    const student=data.students.find((item)=>item.id===studentId);
    setEditingId(studentId);
    setStudentProgramId(student?.programId??"");
    setModal("student");
  }

  function openProgram(programId: string) {
    setSelectedProgramId(programId);
    setTab("curricula");
  }

  function addSubjectForProgram(programId: string) {
    const program=data.programs.find((item)=>item.id===programId);
    setContextProgramId(programId);
    setSubjectDepartmentId(program?.departmentId??"");
    setSubjectProgramId(programId);
    setReturnToCurriculumAfterSubject(false);
    setEditingId("");
    setModal("subject");
  }

  function openClassForSubject(courseId: string) {
    const subject=data.catalogCourses.find((item)=>item.id===courseId);
    setContextSubjectId(courseId);
    setSectionProgramId(subject?.programId??"");
    setEditingSection(null);
    setModal("section");
  }

  function openCurriculum(plan: PlatformData["curricula"][number]) {
    setEditingCurriculumId(plan.id);
    setCurriculumDraft(structuredClone(plan.source));
    setCurriculumStatus(plan.status as "draft" | "approved" | "retired");
    setModal("curriculum");
  }

  function createCurriculumForProgram(programId: string) {
    const program=data.programs.find((item)=>item.id===programId);
    if(!program)return onToast("Select a program before creating its curriculum.");
    const programSubjects=data.catalogCourses.filter((item)=>item.programId===program.id);
    const durationYears=Math.min(8,Math.max(1,program.durationYears || 4));
    setEditingCurriculumId("");
    setCurriculumStatus("draft");
    setCurriculumDraft({
      programCode:program.code,
      programName:program.name,
      description:`${program.name} curriculum`,
      durationYears,
      effectiveYear:Math.max(new Date().getFullYear(),...data.curricula.filter((item)=>item.programId===program.id).map((item)=>item.effectiveYear+1)),
      subjects:programSubjects.map((course,index)=>({
        courseId:course.id,
        code:course.code,
        title:course.title,
        description:course.description,
        units:course.credits,
        yearLevel:Math.min(durationYears,Math.floor(index/10)+1),
        semester:index%10<5?1:2,
        category:"professional",
        sortOrder:index+1,
        prerequisiteCodes:[],
        prerequisiteCourseIds:[],
      })),
      blocks:Array.from({length:durationYears},(_,index)=>({yearLevel:index+1,blockCode:`${program.code}-${index+1}A`,capacity:40})),
    });
    setModal("curriculum");
  }

  function openEdit(
    name: Exclude<ModalName, "student" | "section" | "event" | null>,
    id: string,
  ) {
    setEditingId(id);
    if(name==="subject"){
      const subject=data.catalogCourses.find((item)=>item.id===id);
      setSubjectDepartmentId(subject?.departmentId??"");
      setSubjectProgramId(subject?.programId??"");
      setReturnToCurriculumAfterSubject(false);
    }
    setModal(name);
  }

  function closeModal() {
    setModal(null);
    setEditingId("");
    setEditingSection(null);
    setContextProgramId("");
    setContextSubjectId("");
    setEditingCurriculumId("");
    setCurriculumDraft(null);
    setSubjectDepartmentId("");
    setSubjectProgramId("");
    setReturnToCurriculumAfterSubject(false);
    setStudentProgramId("");
    setMergeSourceStudentId("");
    setSectionProgramId("");
    setDuplicateCurriculumId("");
  }

  function exportCsv(filename: string, rows: Array<Array<string | number>>) {
    const csv=rows.map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const link=document.createElement("a"); link.href=url; link.download=filename; link.click(); URL.revokeObjectURL(url); onToast(`${filename} exported from your authorized records.`);
  }

  return (
    <>
      <section className="academic-command-bar">
        <div>
          {registrarRoles.has(role) ? <button type="button" onClick={()=>exportCsv("stu-enrollment-report.csv",[["Student number","Name","Program","Year","Record status"],...data.students.map((student)=>[student.studentNumber,student.fullName,student.program,student.yearLevel,student.recordStatus])])}>Export enrollment report</button> : null}
          {registrarRoles.has(role) && selectedSection ? <button type="button" onClick={()=>exportCsv(`${selectedSection.code}-${selectedSection.sectionCode}-class-list.csv`,[["Student number","Name","Enrollment status"],...roster.map(({student,enrollment})=>[student!.studentNumber,student!.fullName,enrollment.status])])}>Export class list</button> : null}
          {registrarRoles.has(role) ? <button type="button" onClick={()=>exportCsv("stu-official-academic-record-index.csv",[["Student number","Name","Program","Year","Standing/record status"],...data.students.map((student)=>[student.studentNumber,student.fullName,student.program,student.yearLevel,student.recordStatus])])}>Export official record index</button> : null}
          <span>ACADEMIC CONTROL</span>
          <h2>Run the school from one workspace</h2>
          <p>
            Create students and subjects, open sections, assign teachers, manage
            rosters, and build conflict-safe schedules.
          </p>
        </div>
        <div>
          {registrarRoles.has(role) ? (
            <button type="button" onClick={() => openStudent()}>
              + Add student
            </button>
          ) : null}
          {academicManagers.has(role) ? (
            <button type="button" onClick={() => addSubjectForProgram("")}>
              + Add subject
            </button>
          ) : null}
          {academicManagers.has(role) ? (
            <button
              type="button"
              className="primary"
              onClick={() => openSection()}
            >
              + Open class
            </button>
          ) : null}
        </div>
      </section>
      <nav className="academic-tabs" aria-label="Academic operations">
        {(
          [
            ["overview", "Overview"],
            ["curricula", "Curricula"],
            ["students", "Students"],
            ["subjects", "Subjects"],
            ["sections", "Classes"],
            ["enrollment", "Enrollment"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
          <section className="academic-overview">
            <article>
              <span>DEPARTMENTS</span>
              <strong>{data.departments.length}</strong>
              <p>Active academic homes</p>
            </article>
            <article>
              <span>PROGRAMS</span>
              <strong>{data.programs.length}</strong>
              <p>Credential pathways</p>
            </article>
            <article>
              <span>SUBJECTS</span>
              <strong>{data.catalogCourses.length}</strong>
              <p>Catalog offerings</p>
            </article>
            <article>
              <span>LIVE SECTIONS</span>
              <strong>
                {
                  data.courses.filter((course) => course.status === "active")
                    .length
                }
              </strong>
              <p>Current teaching spaces</p>
            </article>
          </section>
          <section className="academic-relationship-health school-card">
            <header><div><span>RELATIONSHIP HEALTH</span><h3>Academic records that still need a connection</h3><p>These are recoverable workflow gaps, not hidden records. Open the affected area to complete each relationship.</p></div></header>
            <div>
              <button type="button" className={relationshipGaps.programsWithoutCurricula.length ? "warning" : "healthy"} onClick={() => {const first=relationshipGaps.programsWithoutCurricula[0];if(first)openProgram(first.id);else setTab("curricula");}}><b>{relationshipGaps.programsWithoutCurricula.length}</b><span>Programs without curriculum</span><small>{relationshipGaps.programsWithoutCurricula.length ? "Open program pathway" : "All programs connected"}</small></button>
              <button type="button" className={relationshipGaps.subjectsWithoutPrograms.length ? "warning" : "healthy"} onClick={() => setTab("subjects")}><b>{relationshipGaps.subjectsWithoutPrograms.length}</b><span>Shared/unassigned subjects</span><small>Review catalog ownership</small></button>
              <button type="button" className={relationshipGaps.studentsWithoutPrograms.length ? "warning" : "healthy"} onClick={() => setTab("students")}><b>{relationshipGaps.studentsWithoutPrograms.length}</b><span>Students without program ID</span><small>Open student directory</small></button>
              <button type="button" className={relationshipGaps.classesWithoutFaculty.length ? "warning" : "healthy"} onClick={() => setTab("sections")}><b>{relationshipGaps.classesWithoutFaculty.length}</b><span>Classes without teacher</span><small>Open class delivery</small></button>
            </div>
          </section>
          <section className="academic-setup-grid">
            <article>
              <span>01</span>
              <div>
                <h3>Academic structure</h3>
                <p>
                  Departments, programs, and terms establish the catalog and
                  delivery calendar.
                </p>
              </div>
              <div>
                {departmentManagers.has(role) ? (
                  <button type="button" onClick={() => setModal("department")}>
                    Add department
                  </button>
                ) : null}
                {academicManagers.has(role) ? (
                  <button type="button" onClick={() => setModal("program")}>
                    Add program
                  </button>
                ) : null}
                {registrarRoles.has(role) ? (
                  <button type="button" onClick={() => setModal("term")}>
                    Add term
                  </button>
                ) : null}
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Course delivery</h3>
                <p>
                  Create the subject first, then open a class for a term with a
                  teacher, room, capacity, and modality.
                </p>
              </div>
              <div>
                {academicManagers.has(role) ? (
                  <button type="button" onClick={() => addSubjectForProgram("")}>
                    Add subject
                  </button>
                ) : null}
                {academicManagers.has(role) ? (
                  <button type="button" onClick={() => openSection()}>
                    Open class
                  </button>
                ) : null}
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Student access</h3>
                <p>
                  Create the student's portal identity, connect the SIS record,
                  and enroll the learner into active sections.
                </p>
              </div>
              <div>
                {registrarRoles.has(role) ? (
                  <button type="button" onClick={() => openStudent()}>
                    Create student
                  </button>
                ) : null}
                <button type="button" onClick={() => setTab("enrollment")}>
                  Manage roster
                </button>
              </div>
            </article>
          </section>
          <section className="department-grid">
            {data.departments.map((department) => (
              <article key={department.id}>
                <span>{department.code}</span>
                <h3>{department.name}</h3>
                <p>{department.description || "No description provided."}</p>
                <div>
                  {data.programs
                    .filter((program) => program.departmentId === department.id)
                    .map((program) => (
                      <small key={program.id}>
                        {program.code} · {program.name}
                      </small>
                    ))}
                </div>
                {departmentManagers.has(role) ? (
                  <button
                    type="button"
                    onClick={() => openEdit("department", department.id)}
                  >
                    Edit department
                  </button>
                ) : null}
              </article>
            ))}
          </section>
          <section className="academic-lifecycle-grid">
            <article className="school-card">
              <header>
                <div>
                  <span>PROGRAMS</span>
                  <h3>Credential pathways</h3>
                </div>
              </header>
              {data.programs.map((program) => (
                <div key={program.id}>
                  <span>
                    <b>{program.code}</b>
                    <small>
                      {data.departments.find((item) => item.id === program.departmentId)?.code ?? "Unlinked department"} → {program.name} · {data.curricula.filter((item) => item.programId === program.id).length || "No"} curriculum · {data.catalogCourses.filter((item) => item.programId === program.id).length} subjects
                    </small>
                  </span>
                  <span className="academic-row-actions"><button type="button" onClick={() => openProgram(program.id)}>Open pathway</button>{academicManagers.has(role) ? <><button type="button" onClick={() => openEdit("program", program.id)}>Edit</button>{program.status !== "inactive" ? <button type="button" onClick={() => {const reason=window.prompt("Program archival reason (at least 12 characters)");if(reason) void perform(() => archiveAcademicProgram(program.id,reason),"Program archived with immutable evidence.");}}>Archive</button> : null}</> : null}</span>
                </div>
              ))}
            </article>
            <article className="school-card">
              <header>
                <div>
                  <span>ACADEMIC TERMS</span>
                  <h3>Delivery calendar</h3>
                </div>
              </header>
              {data.terms.map((term) => (
                <div key={term.id}>
                  <span>
                    <b>{term.code}</b>
                    <small>
                      {term.name} · {term.status}
                    </small>
                  </span>
                  {registrarRoles.has(role) ? (
                    <span className="academic-row-actions"><button type="button" onClick={() => openEdit("term", term.id)}>Edit</button>{term.status !== "completed" ? <button type="button" onClick={() => { const reason=window.prompt("Term closure reason (at least 12 characters)"); if (!reason) return; void perform(() => closeAcademicTerm(term.id,reason),"Academic term closed and locked with audit evidence."); }}>Close term</button> : null}</span>
                  ) : null}
                </div>
              ))}
            </article>
          </section>
        </>
      ) : null}

      {tab === "curricula" ? (
        <section className="curriculum-library">
          <header>
            <div><span>PROGRAM-CENTERED ACADEMIC MAP</span><h3>Programs, curricula, subjects, and delivery</h3><p>Select a program to see its department, curriculum versions, subject sequence, classes, staff, and students as one connected academic pathway.</p></div>
            {academicManagers.has(role) && selectedProgram ? <div className="curriculum-header-actions">{selectedDraftCurriculum?<button type="button" className="primary" onClick={()=>openCurriculum(selectedDraftCurriculum)}>Edit curriculum subjects</button>:<button type="button" className="primary" onClick={() => createCurriculumForProgram(selectedProgram.id)}>+ Create curriculum</button>}<button type="button" onClick={() => addSubjectForProgram(selectedProgram.id)}>+ Add catalog subject</button></div> : null}
          </header>
          <div className="program-relationship-layout">
            <aside className="program-relationship-list" aria-label="Academic programs">
              <span>PROGRAMS</span>
              {data.programs.map((program) => {
                const department = data.departments.find((item) => item.id === program.departmentId);
                const curriculumCount = data.curricula.filter((item) => item.programId === program.id).length;
                const subjectCount = data.catalogCourses.filter((item) => item.programId === program.id).length;
                return <button type="button" key={program.id} className={selectedProgram?.id === program.id ? "active" : ""} onClick={() => setSelectedProgramId(program.id)}>
                  <b>{program.code} · {program.name}</b>
                  <small>{department?.code ?? "No department"} → {curriculumCount ? `${curriculumCount} curriculum ${curriculumCount === 1 ? "version" : "versions"}` : "Curriculum missing"} → {subjectCount} subjects</small>
                </button>;
              })}
            </aside>
            <div className="program-relationship-detail">
              {selectedProgram ? <>
                <section className="program-context-card">
                  <div><span>{selectedProgramDepartment?.code ?? "UNLINKED DEPARTMENT"} → {selectedProgram.code}</span><h3>{selectedProgram.name}</h3><p>{selectedProgram.description || "No program description has been recorded."}</p></div>
                  <div className="program-context-metrics">
                    <span><b>{selectedProgramCurricula.length}</b><small>Curriculum versions</small></span>
                    <span><b>{selectedProgramSubjects.length}</b><small>Subjects</small></span>
                    <span><b>{selectedProgramSections.length}</b><small>Classes</small></span>
                    <span><b>{selectedProgramStudents.length}</b><small>Students</small></span>
                    <span><b>{selectedProgramStaff.length}</b><small>Assigned staff</small></span>
                  </div>
                  <div className="program-context-actions">
                    {academicManagers.has(role) ? <button type="button" onClick={() => openEdit("program", selectedProgram.id)}>Edit program</button> : null}
                    {academicManagers.has(role) ? selectedDraftCurriculum?<button type="button" className="primary" onClick={()=>openCurriculum(selectedDraftCurriculum)}>Edit curriculum subjects</button>:<button type="button" className="primary" onClick={() => createCurriculumForProgram(selectedProgram.id)}>Create curriculum</button> : null}
                    {academicManagers.has(role) ? <button type="button" onClick={() => addSubjectForProgram(selectedProgram.id)}>Add catalog subject</button> : null}
                    <button type="button" onClick={() => setTab("subjects")}>View subjects</button>
                    <button type="button" onClick={() => setTab("sections")}>View classes</button>
                  </div>
                </section>
                {selectedProgramCurricula.length ? selectedProgramCurricula.map((plan) => <article key={plan.id} className="curriculum-plan-card">
              <div className="curriculum-plan-title"><div><span>{plan.status.toUpperCase()} · EFFECTIVE {plan.effectiveYear}</span><h4>{selectedProgramDepartment?.name ?? "Department not linked"} → {selectedProgram.code} → Curriculum {plan.effectiveYear}</h4><small>Source: {plan.source.programCode} curriculum transaction · Record {plan.id.slice(0, 8)}</small></div><div className="curriculum-card-actions"><b>{plan.source.subjects.reduce((total, subject) => total + subject.units, 0)} total units</b>{academicManagers.has(role) ? <><button type="button" onClick={() => openCurriculum(plan)}>{plan.status === "draft" ? "Edit curriculum" : "Manage lifecycle"}</button><button type="button" onClick={() => {setDuplicateCurriculumId(plan.id);setModal("duplicateCurriculum");}}>Duplicate as new version</button>{plan.status==="draft"?<button type="button" className="danger" onClick={()=>{const reason=window.prompt("Why should this draft curriculum be deleted? (at least 12 characters)");if(reason)void perform(()=>deleteDraftAcademicCurriculum(plan.id,reason),`Draft curriculum ${plan.effectiveYear} deleted; catalog subjects were preserved.`);}}>Delete draft</button>:null}</> : null}</div></div>
              <div className="curriculum-years">{Array.from({length: plan.source.durationYears}, (_, index) => index + 1).map((year) => <section key={year}>
                <header><strong>Year {year}</strong><small>{plan.source.blocks.filter((block) => block.yearLevel === year).map((block) => `${block.blockCode} (${block.capacity})`).join(" · ")}</small></header>
                {[1, 2, 3].map((semester) => {
                  const subjects=plan.source.subjects.filter((subject) => subject.yearLevel===year && subject.semester===semester);
                  return subjects.length ? <div key={semester}><b>Semester {semester}</b><ul>{subjects.map((subject) => <li key={subject.code}><span><strong>{subject.code}</strong>{subject.title}</span><small>{subject.units} units{subject.prerequisiteCodes.length ? ` · Prereq: ${subject.prerequisiteCodes.join(", ")}` : ""}</small></li>)}</ul></div> : null;
                })}
              </section>)}</div>
            </article>) : <div className="academic-empty relationship-missing"><strong>No curriculum is connected to {selectedProgram.code}</strong><p>The program exists under {selectedProgramDepartment?.name ?? "an unresolved department"}, but it has no curriculum version. Create a curriculum before opening a complete degree pathway.</p><div>{academicManagers.has(role)?<button type="button" className="primary" onClick={()=>createCurriculumForProgram(selectedProgram.id)}>Create {selectedProgram.code} curriculum</button>:null}<button type="button" onClick={onAskNexus}>Ask Nexus to create a draft</button></div></div>}
              </> : <div className="academic-empty relationship-missing"><strong>No academic programs exist</strong><p>Create a department and program before adding curricula, subjects, or classes.</p></div>}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "students" ? (
        <section className="academic-directory school-card">
          <header>
            <div>
              <span>STUDENT DIRECTORY</span>
              <h3>{data.students.length} student records</h3>
            </div>
            {registrarRoles.has(role) ? (
              <button type="button" onClick={() => openStudent()}>
                + Add student
              </button>
            ) : null}
          </header>
          <div className="academic-table-head student">
            <span>Student</span>
            <span>Number</span>
            <span>Program</span>
            <span>Year</span>
            <span>Portal</span>
          </div>
          {data.students.map((student) => (
            <div className="academic-table-row student" key={student.id}>
              <span>
                <b>{student.name}</b>
                <small>{student.email || "No email recorded"}</small>
              </span>
              <strong>{student.studentNumber}</strong>
              <span>{student.programId ? <button type="button" className="academic-link-button" onClick={() => openProgram(student.programId!)}>{data.programs.find((item) => item.id === student.programId)?.code ?? student.program} → Open pathway</button> : <span className="status-warn">{student.program || "Program not linked"}</span>}</span>
              <span>{student.yearLevel}</span>
              <span className={student.profileId ? "status-ok" : "status-warn"}>
                {student.recordStatus} · {student.profileId ? "Connected" : "SIS only"}
              </span>
              {registrarRoles.has(role) ? (
                <span className="academic-row-actions"><button type="button" onClick={() => openStudent(student.id)}>Edit</button>{student.recordStatus === "active" ? <button type="button" onClick={() => {const reason=window.prompt("Withdrawal reason (at least 12 characters)");if(reason) void perform(() => withdrawStudentRecord(student.id,reason),"Student withdrawn and active enrollments dropped.");}}>Withdraw</button> : null}{student.recordStatus === "active" ? <button type="button" onClick={() => {setMergeSourceStudentId(student.id);setModal("mergeStudent");}}>Merge</button> : null}</span>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {tab === "subjects" ? (
        <section className="subject-grid">
          {data.catalogCourses.map((course) => {
            const department = data.departments.find(
              (item) => item.id === course.departmentId,
            );
            const program = data.programs.find((item) => item.id === course.programId);
            const curriculumPlacements = data.curricula.flatMap((plan) =>
              plan.source.subjects
                .filter((subject) => subject.code.toUpperCase() === course.code.toUpperCase())
                .map((subject) => ({ plan, subject })),
            );
            const classCount = data.courses.filter((item) => item.courseId === course.id).length;
            return (
              <article key={course.id}>
                <header>
                  <span>{course.code}</span>
                  <b>{course.credits} credits</b>
                </header>
                <h3>{course.title}</h3>
                <p>{course.description || "No description provided."}</p>
                <footer>
                  <span>{department?.code || "No department"} → {program?.code || "Shared subject"}</span>
                  <small>{curriculumPlacements.length ? curriculumPlacements.map(({plan,subject}) => `${plan.effectiveYear}: Y${subject.yearLevel} S${subject.semester}`).join(" · ") : "Not placed in a curriculum"} · {classCount} classes</small>
                </footer>
                <div className="subject-connection-actions">
                  {program ? <button type="button" onClick={() => openProgram(program.id)}>Open {program.code} pathway</button> : null}
                  <button type="button" onClick={() => openClassForSubject(course.id)}>Open class</button>
                  {academicManagers.has(role) ? <button type="button" onClick={() => openEdit("subject", course.id)}>Edit subject</button> : null}
                </div>
              </article>
            );
          })}
          <button
            type="button"
            className="add-card"
            onClick={() => {setContextProgramId("");setModal("subject");}}
          >
            <span>+</span>
            <b>Add a subject</b>
            <small>Code, credits, program, and description</small>
          </button>
        </section>
      ) : null}

      {tab === "sections" ? (
        <section className="section-operations">
          {data.courses.map((course) => {
            const subject = data.catalogCourses.find((item) => item.id === course.courseId);
            const program = data.programs.find((item) => item.id === subject?.programId);
            const department = data.departments.find((item) => item.id === subject?.departmentId);
            const moduleCount = data.modules.filter((item) => item.sectionId === course.sectionId).length;
            const assessmentCount = data.assessments.filter((item) => item.sectionId === course.sectionId).length;
            const scheduleCount = data.schedule.filter((item) => item.sectionId === course.sectionId).length;
            return <article key={course.sectionId}>
              <header>
                <span>
                  {course.code} · {course.sectionCode}
                </span>
                <b className={course.status}>{course.status}</b>
              </header>
              <h3>{course.title}</h3>
              <p>{department?.code ?? "No department"} → {program?.code ?? "Shared subject"} → {course.code} → {course.term}</p>
              <div>
                <span>
                  <small>TEACHER</small>
                  <b>{course.facultyName}</b>
                </span>
                <span>
                  <small>ROOM / MODE</small>
                  <b>
                    {course.room} · {course.modality}
                  </b>
                </span>
                <span>
                  <small>ROSTER</small>
                  <b>
                    {course.enrolledStudentIds.length +
                      course.enrolledProfileIds.length}{" "}
                    learners
                  </b>
                </span>
                <span><small>LEARNING</small><b>{moduleCount} modules · {assessmentCount} assessments</b></span>
                <span><small>SCHEDULE</small><b>{scheduleCount} events</b></span>
              </div>
              <div className="section-connection-actions">
                {program ? <button type="button" onClick={() => openProgram(program.id)}>Open {program.code}</button> : null}
                <button type="button" onClick={() => {setSelectedSectionId(course.sectionId);setTab("enrollment");}}>Open roster</button>
                <button type="button" onClick={() => onOpenSectionWorkspace(scheduleManagers.has(role) ? "teaching" : "learning", course.sectionId)}>Open course</button>
                <button type="button" onClick={() => onOpenSectionWorkspace("assessments", course.sectionId)}>Open assessments</button>
                <button type="button" onClick={() => onOpenSectionWorkspace("grades", course.sectionId)}>Open grades</button>
                <button type="button" onClick={() => onOpenSectionWorkspace("schedule", course.sectionId)}>Open schedule</button>
                {academicManagers.has(role) ? <button type="button" onClick={() => openSection(course)}>Edit class</button> : null}
              </div>
            </article>;
          })}
        </section>
      ) : null}

      {tab === "enrollment" ? (
        <section className="enrollment-operations">
          <aside>
            <span>SELECT CLASS</span>
            {data.courses.map((course) => (
              <button
                type="button"
                key={course.sectionId}
                className={
                  selectedSectionId === course.sectionId ? "active" : ""
                }
                onClick={() => setSelectedSectionId(course.sectionId)}
              >
                <b>
                  {course.code} · {course.sectionCode}
                </b>
                <small>
                  {course.term} · {course.facultyName}
                </small>
              </button>
            ))}
          </aside>
          <div className="school-card">
            <header>
              <div>
                <span>CLASS ROSTER</span>
                <h3>
                  {selectedSection
                    ? `${selectedSection.code} · ${selectedSection.sectionCode}`
                    : "Select a class"}
                </h3>
                <p>
                  {
                    roster.filter(
                      (item) => item.enrollment.status === "enrolled",
                    ).length
                  }{" "}
                  enrolled of {selectedSection?.capacity ?? 0} seats
                </p>
              </div>
              {registrarRoles.has(role) && selectedSection ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const studentId = String(form.get("studentId") || "");
                    if (studentId)
                      void perform(
                        () =>
                          manageSectionEnrollment(
                            selectedSectionId,
                            studentId,
                            "enrolled",
                          ),
                        "Student enrolled successfully.",
                      );
                    event.currentTarget.reset();
                  }}
                >
                  <select
                    name="studentId"
                    aria-label="Student to enroll"
                    required
                  >
                    <option value="">Choose a student…</option>
                    {availableStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.studentNumber} · {student.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={busy || !availableStudents.length}
                  >
                    Enroll
                  </button>
                </form>
              ) : null}
            </header>
            {roster.length ? (
              roster.map(({ enrollment, student }) => (
                <div className="roster-row" key={enrollment.id}>
                  <span>
                    <b>{student?.name}</b>
                    <small>
                      {student?.studentNumber} · {student?.program}
                    </small>
                  </span>
                  <strong className={enrollment.status}>
                    {enrollment.status}
                  </strong>
                  {registrarRoles.has(role) ? (
                    <select
                      value={enrollment.status}
                      disabled={busy}
                      onChange={(event) =>
                        (() => { const status=event.target.value as "waitlisted"|"enrolled"|"dropped"|"completed"; const reason=window.prompt(`Reason for changing enrollment to ${status} (at least 12 characters)`); if(!reason){event.target.value=enrollment.status;return;} void perform(() => transitionEnrollment(enrollment.id,status,reason),`Enrollment changed to ${status} with audit evidence.`); })()
                      }
                    >
                      <option value="enrolled">Enrolled</option>
                      <option value="waitlisted">Waitlisted</option>
                      <option value="dropped">Dropped</option>
                      <option value="completed">Completed</option>
                    </select>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="school-empty">
                No students are on this roster yet.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {modal === "curriculum" && curriculumDraft ? (
        <Modal
          title={`${editingCurriculumId?"Manage":"Create"} ${curriculumDraft.programCode} curriculum`}
          description="Build the complete curriculum by effective year, semester, subject placement, prerequisites, and block structure. Approved curricula are immutable and can only be retired or duplicated as a new version."
          onClose={closeModal}
        >
          <CurriculumEditor
            draft={curriculumDraft}
            status={curriculumStatus}
            originalStatus={(data.curricula.find((item)=>item.id===editingCurriculumId)?.status ?? "draft") as "draft"|"approved"|"retired"}
            busy={busy}
            catalogSubjects={selectedProgramSubjects}
            onDraft={setCurriculumDraft}
            onStatus={setCurriculumStatus}
            onCreateSubject={()=>{
              setContextProgramId(selectedProgram?.id??"");
              setSubjectDepartmentId(selectedProgram?.departmentId??"");
              setSubjectProgramId(selectedProgram?.id??"");
              setEditingId("");
              setReturnToCurriculumAfterSubject(true);
              setModal("subject");
            }}
            onSave={(reason)=>void perform(()=>editingCurriculumId
              ? updateAcademicCurriculum({planId:editingCurriculumId,status:curriculumStatus,curriculum:curriculumDraft,reason})
              : createManualAcademicCurriculum({programId:selectedProgram?.id??"",idempotencyKey:`manual-curriculum-${selectedProgram?.id}-${curriculumDraft.effectiveYear}`,curriculum:curriculumDraft,reason}),`Curriculum ${curriculumDraft.effectiveYear} saved with normalized mappings and audit evidence.`)}
          />
        </Modal>
      ) : null}

      {modal==="duplicateCurriculum"&&duplicateCurriculumId?(()=>{const source=data.curricula.find((item)=>item.id===duplicateCurriculumId);const program=data.programs.find((item)=>item.id===source?.programId);if(!source||!program)return null;const department=data.departments.find((item)=>item.id===program.departmentId);const suggested=Math.max(new Date().getFullYear(),source.effectiveYear+1);return <Modal title={`New ${program.code} curriculum version`} description="Create a separate draft linked to the same program. The approved source version remains unchanged." onClose={closeModal}><ActionForm submitLabel="Create draft version" busy={busy} onSubmit={(event)=>{event.preventDefault();const year=Number(new FormData(event.currentTarget).get("effectiveYear"));void perform(()=>createAcademicCurriculum(department?.id??"",`curriculum-version-${source.id}-${year}`,{...structuredClone(source.source),effectiveYear:year}),`Curriculum ${year} created as a separate draft version.`);}}><Field label="Program"><input disabled value={`${program.code} · ${program.name}`}/></Field><Field label="Source curriculum"><input disabled value={`Effective ${source.effectiveYear} · ${source.status}`}/></Field><Field label="New effective year"><select name="effectiveYear" required defaultValue={suggested}>{Array.from({length:10},(_,index)=>suggested+index).filter((year)=>!data.curricula.some((item)=>item.programId===program.id&&item.effectiveYear===year)).map((year)=><option key={year} value={year}>{year}</option>)}</select></Field></ActionForm></Modal>;})():null}

      {modal === "student" ? (
        <Modal
          title={
            editingStudent ? "Edit student record" : "Create student account"
          }
          description={
            editingStudent
              ? "Updates the academic student record. Authentication credentials remain protected."
              : "Creates a confirmed portal identity and its linked academic record. The temporary password is never stored."
          }
          onClose={closeModal}
        >
          <ActionForm
            submitLabel={
              editingStudent ? "Save student changes" : "Create student"
            }
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const values = {
                email: String(form.get("email")),
                fullName: String(form.get("fullName")),
                preferredName: String(form.get("preferredName")),
                studentNumber: String(form.get("studentNumber")),
                programId: String(form.get("programId")),
                program: data.programs.find((item) => item.id === String(form.get("programId")))?.code ?? "",
                yearLevel: String(form.get("yearLevel")),
                phone: String(form.get("phone")),
                advisorId: String(form.get("advisorId")),
              };
              void perform(
                () =>
                  editingStudent
                    ? updateStudentRecord(editingStudent.id, values)
                    : createStudentAccount({
                        ...values,
                        password: String(form.get("password")),
                      }),
                editingStudent
                  ? "Student record updated."
                  : "Student account and academic record created.",
              );
            }}
          >
            <Field label="Full name">
              <input
                name="fullName"
                required
                maxLength={120}
                defaultValue={editingStudent?.fullName}
              />
            </Field>
            <Field label="Preferred name">
              <input
                name="preferredName"
                maxLength={120}
                defaultValue={editingStudent?.preferredName}
              />
            </Field>
            <Field label="Student number">
              <input
                name="studentNumber"
                required
                maxLength={32}
                placeholder="STU-2026-0001"
                defaultValue={editingStudent?.studentNumber}
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                required
                type="email"
                maxLength={254}
                defaultValue={editingStudent?.email ?? ""}
              />
            </Field>
            {!editingStudent ? (
              <Field label="Temporary password">
                <div className="password-create">
                  <input
                    name="password"
                    required
                    minLength={24}
                    maxLength={128}
                    defaultValue={generatedPassword()}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      const input = e.currentTarget
                        .previousElementSibling as HTMLInputElement;
                      input.value = generatedPassword();
                    }}
                  >
                    Regenerate
                  </button>
                </div>
              </Field>
            ) : null}
            <Field label="Program">
              <select
                name="programId"
                required
                value={studentProgramId}
                onChange={(event)=>setStudentProgramId(event.target.value)}
              >
                <option value="">Select program…</option>
                {data.programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {data.departments.find((item) => item.id === program.departmentId)?.code ?? "No department"} → {program.code} · {program.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year level">
              <select
                name="yearLevel"
                required
                defaultValue={editingStudent?.yearLevel ?? "1st Year"}
              >
                <option>1st Year</option>
                <option>2nd Year</option>
                <option>3rd Year</option>
                <option>4th Year</option>
                <option>Graduate</option>
              </select>
            </Field>
            <Field label="Advisor">
              <select
                name="advisorId"
                defaultValue={editingStudent?.advisorId ?? ""}
              >
                <option value="">Unassigned</option>
                {eligibleStudentAdvisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name} · {data.programs.find((item)=>item.id===advisor.programId)?.code??data.departments.find((item)=>item.id===advisor.departmentId)?.code??"Institution"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone">
              <input
                name="phone"
                type="tel"
                maxLength={40}
                defaultValue={editingStudent?.phone}
              />
            </Field>
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "mergeStudent" && mergeSourceStudentId ? (
        <Modal title="Merge duplicate student record" description="Choose the authoritative student record that will remain. Enrollment and academic history are preserved with immutable audit evidence." onClose={closeModal}>
          <ActionForm submitLabel="Merge into selected student" busy={busy} onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);void perform(()=>mergeStudentRecords(mergeSourceStudentId,String(form.get("targetStudentId")),String(form.get("reason"))),"Student records merged with history preserved.");}}>
            <Field label="Duplicate record"><input disabled value={(()=>{const student=data.students.find((item)=>item.id===mergeSourceStudentId);return student?`${student.studentNumber} · ${student.fullName} · ${student.program}`:"Unavailable student";})()}/></Field>
            <Field label="Authoritative student record">
              <select name="targetStudentId" required defaultValue=""><option value="">Search and choose a student…</option>{data.students.filter((student)=>student.id!==mergeSourceStudentId&&student.recordStatus!=="merged"&&student.recordStatus!=="archived").map((student)=><option key={student.id} value={student.id}>{student.studentNumber} · {student.fullName} · {data.programs.find((program)=>program.id===student.programId)?.code??student.program} · {student.recordStatus}</option>)}</select>
            </Field>
            <Field label="Merge reason" wide><textarea name="reason" required minLength={12} maxLength={500} rows={4} placeholder="Explain why these records represent the same learner."/></Field>
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "department" ? (
        <Modal
          title={editingDepartment ? "Edit department" : "Add department"}
          description="Creates an academic home for programs, subjects, and departmental leadership."
          onClose={closeModal}
        >
          <ActionForm
            submitLabel={
              editingDepartment ? "Save department" : "Create department"
            }
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () => {
                  const values = {
                    code: String(f.get("code")),
                    name: String(f.get("name")),
                    description: String(f.get("description")),
                    headId: String(f.get("headId")),
                  };
                  return editingDepartment
                    ? updateDepartment(editingDepartment.id, {
                        ...values,
                        status: String(f.get("status")),
                      })
                    : createDepartment(values);
                },
                editingDepartment
                  ? "Department updated."
                  : "Department created.",
              );
            }}
          >
            <Field label="Code">
              <input
                name="code"
                required
                maxLength={20}
                defaultValue={editingDepartment?.code}
              />
            </Field>
            <Field label="Name">
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={editingDepartment?.name}
              />
            </Field>
            <Field label="Department head">
              <select
                name="headId"
                defaultValue={editingDepartment?.headId ?? ""}
              >
                <option value="">Unassigned</option>
                {data.profiles
                  .filter((p) => p.role === "department_head")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Description" wide>
              <textarea
                name="description"
                rows={4}
                maxLength={1000}
                defaultValue={editingDepartment?.description}
              />
            </Field>
            {editingDepartment ? (
              <Field label="Status">
                <select name="status" defaultValue={editingDepartment.status}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            ) : null}
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "program" ? (
        <Modal
          title={
            editingProgram ? "Edit academic program" : "Add academic program"
          }
          description="Defines a credential pathway inside an existing department."
          onClose={closeModal}
        >
          <ActionForm
            submitLabel={editingProgram ? "Save program" : "Create program"}
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () => {
                  const values = {
                    departmentId: String(f.get("departmentId")),
                    code: String(f.get("code")),
                    name: String(f.get("name")),
                    level: String(f.get("level")),
                    durationYears: Number(f.get("durationYears")),
                    description: String(f.get("description")),
                  };
                  return editingProgram
                    ? updateProgram(editingProgram.id, {
                        ...values,
                        status: editingProgram.status,
                      })
                    : createProgram(values);
                },
                editingProgram
                  ? "Academic program updated."
                  : "Academic program created.",
              );
            }}
          >
            <Field label="Department">
              <select
                name="departmentId"
                required
                defaultValue={editingProgram?.departmentId ?? ""}
              >
                <option value="">Select department…</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Program code">
              <input
                name="code"
                required
                maxLength={30}
                defaultValue={editingProgram?.code}
              />
            </Field>
            <Field label="Program name">
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={editingProgram?.name}
              />
            </Field>
            <Field label="Level">
              <select
                name="level"
                required
                defaultValue={editingProgram?.level ?? "bachelor"}
              >
                <option value="certificate">Certificate</option>
                <option value="bachelor">Bachelor</option>
                <option value="master">Master</option>
                <option value="doctorate">Doctorate</option>
              </select>
            </Field>
            <Field label="Duration (years)">
              <input
                name="durationYears"
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                defaultValue={editingProgram?.durationYears ?? 4}
                required
              />
            </Field>
            <Field label="Description" wide>
              <textarea
                name="description"
                rows={4}
                maxLength={1500}
                defaultValue={editingProgram?.description}
              />
            </Field>
            {editingProgram ? <p className="academic-controlled-note">Status: <strong>{editingProgram.status}</strong>. Use the audited Archive control in the program list to make a program inactive.</p> : null}
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "term" ? (
        <Modal
          title={editingTerm ? "Edit academic term" : "Add academic term"}
          description="Defines teaching and enrollment dates for course delivery."
          onClose={closeModal}
        >
          <ActionForm
            submitLabel={editingTerm ? "Save term" : "Create term"}
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () => {
                  const values = {
                    code: String(f.get("code")),
                    name: String(f.get("name")),
                    startsOn: String(f.get("startsOn")),
                    endsOn: String(f.get("endsOn")),
                    enrollmentStartsOn: String(f.get("enrollmentStartsOn")),
                    enrollmentEndsOn: String(f.get("enrollmentEndsOn")),
                    status: String(f.get("status")),
                  };
                  return editingTerm
                    ? updateAcademicTerm(editingTerm.id, values)
                    : createAcademicTerm(values);
                },
                editingTerm
                  ? "Academic term updated."
                  : "Academic term created.",
              );
            }}
          >
            <Field label="Code">
              <input
                name="code"
                required
                maxLength={30}
                placeholder="2027-SPRING"
                defaultValue={editingTerm?.code}
              />
            </Field>
            <Field label="Name">
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={editingTerm?.name}
              />
            </Field>
            <Field label="Teaching starts">
              <input
                name="startsOn"
                type="date"
                required
                defaultValue={editingTerm?.startsOn}
              />
            </Field>
            <Field label="Teaching ends">
              <input
                name="endsOn"
                type="date"
                required
                defaultValue={editingTerm?.endsOn}
              />
            </Field>
            <Field label="Enrollment starts">
              <input
                name="enrollmentStartsOn"
                type="date"
                defaultValue={editingTerm?.enrollmentStartsOn ?? ""}
              />
            </Field>
            <Field label="Enrollment ends">
              <input
                name="enrollmentEndsOn"
                type="date"
                defaultValue={editingTerm?.enrollmentEndsOn ?? ""}
              />
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue={editingTerm?.status ?? "planning"}
              >
                <option value="planning">Planning</option>
                <option value="enrollment">Enrollment</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "subject" ? (
        <Modal
          title={editingSubject ? "Edit subject" : "Add subject"}
          description="Creates a reusable catalog subject before class sections are opened."
          onClose={closeModal}
        >
          <ActionForm
            submitLabel={editingSubject ? "Save subject" : "Create subject"}
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              const values = {
                    departmentId: String(f.get("departmentId")),
                    programId: String(f.get("programId")),
                    code: String(f.get("code")),
                    title: String(f.get("title")),
                    description: String(f.get("description")),
                    credits: Number(f.get("credits")),
                  };
              if(returnToCurriculumAfterSubject&&!editingSubject){
                setBusy(true);
                void createCatalogCourse(values).then((courseId)=>{
                  setCurriculumDraft((current)=>current?{...current,subjects:[...current.subjects,{courseId,code:values.code.trim().toUpperCase(),title:values.title.trim(),description:values.description.trim(),units:values.credits,yearLevel:1,semester:1,category:"professional",sortOrder:current.subjects.length+1,prerequisiteCodes:[],prerequisiteCourseIds:[]}]}:current);
                  setReturnToCurriculumAfterSubject(false);
                  setModal("curriculum");
                  onChanged();
                  onToast("Catalog subject created and returned to this curriculum for placement.");
                }).catch((error:unknown)=>onToast(error instanceof Error?error.message:"The subject could not be created.")).finally(()=>setBusy(false));
                return;
              }
              void perform(
                () => editingSubject
                    ? updateCatalogCourse(editingSubject.id, {
                        ...values,
                        status: String(f.get("status")),
                      })
                    : createCatalogCourse(values),
                editingSubject
                  ? "Subject updated."
                  : "Subject added to the catalog.",
              );
            }}
          >
            <Field label="Department">
              <select
                name="departmentId"
                required
                value={subjectDepartmentId||editingSubject?.departmentId||contextProgram?.departmentId||""}
                onChange={(event)=>{setSubjectDepartmentId(event.target.value);setSubjectProgramId("");}}
              >
                <option value="">Select department…</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Program">
              <select
                name="programId"
                value={subjectProgramId}
                onChange={(event)=>setSubjectProgramId(event.target.value)}
              >
                <option value="">Shared / no program</option>
                {data.programs.filter((p)=>p.departmentId===subjectDepartmentId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject code">
              <input
                name="code"
                required
                maxLength={30}
                placeholder="IM204"
                defaultValue={editingSubject?.code}
              />
            </Field>
            <Field label="Title">
              <input
                name="title"
                required
                maxLength={180}
                defaultValue={editingSubject?.title}
              />
            </Field>
            <Field label="Credits">
              <input
                name="credits"
                type="number"
                min="0.5"
                max="30"
                step="0.5"
                defaultValue={editingSubject?.credits ?? 3}
                required
              />
            </Field>
            <Field label="Description" wide>
              <textarea
                name="description"
                rows={5}
                maxLength={2000}
                defaultValue={editingSubject?.description}
              />
            </Field>
            {editingSubject ? (
              <Field label="Status">
                <select name="status" defaultValue={editingSubject.status}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            ) : null}
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "section" ? (
        <Modal
          title={editingSection ? "Edit class section" : "Open class section"}
          description="Assign the term, teacher, room, capacity, delivery mode, and operating status."
          onClose={() => {
            setModal(null);
            setEditingSection(null);
          }}
        >
          <ActionForm
            submitLabel={editingSection ? "Save class" : "Open class"}
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              const values = {
                facultyId: String(f.get("facultyId")),
                modality: String(f.get("modality")),
                room: String(f.get("room")),
                capacity: Number(f.get("capacity")),
                status: String(f.get("status")),
              };
              void perform(
                () =>
                  editingSection
                    ? updateCourseSection(editingSection.sectionId, values)
                    : createCourseSection({
                        ...values,
                        courseId: String(f.get("courseId")),
                        termId: String(f.get("termId")),
                        sectionCode: String(f.get("sectionCode")),
                      }),
                editingSection
                  ? "Class section updated."
                  : "Class section opened.",
              );
            }}
          >
            {!editingSection ? (
              <>
                <Field label="Program"><select required value={sectionProgramId} onChange={(event)=>{setSectionProgramId(event.target.value);setContextSubjectId("");}}><option value="">Select program…</option>{data.programs.filter((program)=>program.status==="active").map((program)=><option key={program.id} value={program.id}>{data.departments.find((department)=>department.id===program.departmentId)?.code} → {program.code} · {program.name}</option>)}</select></Field>
                <Field label="Subject">
                  <select name="courseId" required value={contextSubjectId} disabled={!sectionProgramId} onChange={(event)=>setContextSubjectId(event.target.value)}>
                    <option value="">Select subject in this program…</option>
                    {sectionSubjects
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Academic term">
                  <select name="termId" required>
                    <option value="">Select term…</option>
                    {data.terms
                      .filter((t) => t.status !== "completed")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} · {t.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Section code">
                  <input
                    name="sectionCode"
                    required
                    maxLength={30}
                    placeholder="A"
                  />
                </Field>
              </>
            ) : null}
            <Field label="Teacher">
              <select
                name="facultyId"
                defaultValue={editingSection?.facultyId ?? ""}
              >
                <option value="">Assignment pending</option>
                {sectionFaculty.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modality">
              <select
                name="modality"
                defaultValue={editingSection?.modality ?? "onsite"}
              >
                <option value="onsite">On-site</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </Field>
            <Field label="Room">
              <input
                name="room"
                maxLength={120}
                defaultValue={
                  editingSection?.room === "To be announced"
                    ? ""
                    : editingSection?.room
                }
              />
            </Field>
            <Field label="Capacity">
              <input
                name="capacity"
                type="number"
                min="1"
                max="1000"
                defaultValue={editingSection?.capacity ?? 40}
                required
              />
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue={editingSection?.status ?? "planning"}
              >
                <option value="planning">Planning</option>
                <option value="open">Open for enrollment</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
          </ActionForm>
        </Modal>
      ) : null}
    </>
  );
}

export function ScheduleOperations({
  data,
  currentUser,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [modal, setModal] = useState<ModalName>(null);
  const [busy, setBusy] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [eventScope,setEventScope]=useState<"class"|"personal"|"role">("class");
  const canManage = scheduleManagers.has(currentUser.role);
  const manageableSectionIds = useMemo(
    () =>
      currentUser.role === "faculty"
        ? new Set(
            data.courses
              .filter((course) => course.facultyId === currentUser.id)
              .map((course) => course.sectionId),
          )
        : new Set(data.courses.map((course) => course.sectionId)),
    [currentUser, data.courses],
  );

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      onToast(success);
      setModal(null);
      setEditingEvent(null);
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "The schedule operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(event: ScheduleEvent) {
    if (!confirm(`Remove “${event.title}” from the schedule?`)) return;
    await perform(
      () => deleteScheduleEvent(event.id),
      "Schedule event removed.",
    );
  }

  return (
    <>
      {canManage ? (
        <section className="schedule-command">
          <div>
            <span>CONFLICT-SAFE SCHEDULING</span>
            <h3>Manage the live timetable</h3>
            <p>
              Room, assigned-teacher, and enrolled-student overlaps are rejected
              before saving.
            </p>
          </div>
          <button type="button" onClick={() => {setEventScope("class");setModal("event");}}>
            + Add schedule event
          </button>
        </section>
      ) : null}
      {canManage ? (
        <section className="schedule-manager school-card">
          <header>
            <div>
              <span>MANAGE EVENTS</span>
              <h3>Editable schedule</h3>
            </div>
          </header>
          {data.schedule
            .filter(
              (event) =>
                !event.sectionId || manageableSectionIds.has(event.sectionId),
            )
            .map((event) => (
              <div key={event.id}>
                <time>
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(event.startsAt))}
                </time>
                <span>
                  <b>{event.title}</b>
                  <small>
                    {event.location} · {event.type}
                  </small>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(event);
                    setEventScope(event.sectionId?"class":event.audienceRoles.length?"role":"personal");
                    setModal("event");
                  }}
                  disabled={busy}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(event)}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            ))}
        </section>
      ) : null}
      {modal === "event" ? (
        <Modal
          title={editingEvent ? "Edit schedule event" : "Add schedule event"}
          description="Class, exam, and meeting events are checked for room, teacher, learner, and academic-term conflicts."
          onClose={() => {
            setModal(null);
            setEditingEvent(null);
          }}
        >
          <ActionForm
            submitLabel="Save event"
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              const eventType = String(f.get("eventType"));
              const sectionId = eventScope==="class"?String(f.get("sectionId")):"";
              const audience = eventScope==="role"?String(f.get("audienceRole")):"";
              void perform(
                () => {
                  const values = {
                    sectionId,
                    ownerProfileId: eventScope==="personal" ? currentUser.id : undefined,
                    title: String(f.get("title")),
                    description: String(f.get("description")),
                    eventType,
                    startsAt: new Date(String(f.get("startsAt"))).toISOString(),
                    endsAt: new Date(String(f.get("endsAt"))).toISOString(),
                    location: String(f.get("location")),
                    audienceRoles: audience ? [audience as PlatformRole] : [],
                  };
                  return editingEvent
                    ? updateScheduleEvent(editingEvent.id, values)
                    : createScheduleEvent(values);
                },
                editingEvent
                  ? "Schedule event updated without conflicts."
                  : "Schedule event created without conflicts.",
              );
            }}
          >
            <Field label="Event scope"><select value={eventScope} onChange={(event)=>setEventScope(event.target.value as typeof eventScope)}><option value="class">Class roster</option><option value="personal">Only me</option><option value="role">Role-wide</option></select></Field>
            <Field label="Event type">
              <select
                name="eventType"
                required
                defaultValue={editingEvent?.type ?? "class"}
              >
                <option value="class">Class</option>
                <option value="exam">Exam</option>
                <option value="deadline">Deadline</option>
                <option value="meeting">Meeting</option>
                <option value="campus">Campus event</option>
                <option value="personal">Personal</option>
              </select>
            </Field>
            {eventScope==="class"?<Field label="Class section">
              <select
                name="sectionId"
                defaultValue={editingEvent?.sectionId ?? ""}
                required
              >
                <option value="">Personal / role event</option>
                {data.courses
                  .filter((course) =>
                    manageableSectionIds.has(course.sectionId),
                  )
                  .map((course) => (
                    <option key={course.sectionId} value={course.sectionId}>
                      {course.code} · {course.sectionCode} · {course.term}
                    </option>
                  ))}
              </select>
            </Field>:null}
            <Field label="Title">
              <input
                name="title"
                required
                maxLength={180}
                defaultValue={editingEvent?.title}
              />
            </Field>
            <Field label="Location">
              <input
                name="location"
                maxLength={160}
                defaultValue={editingEvent?.location}
              />
            </Field>
            <Field label="Starts">
              <input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={
                  editingEvent ? localDateTimeInput(editingEvent.startsAt) : ""
                }
              />
            </Field>
            <Field label="Ends">
              <input
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={
                  editingEvent ? localDateTimeInput(editingEvent.endsAt) : ""
                }
              />
            </Field>
            {eventScope==="role"?<Field label="Role audience">
              <select
                name="audienceRole"
                defaultValue={editingEvent?.audienceRoles[0] ?? ""}
                required
              >
                <option value="">Section / personal only</option>
                {data.roles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>:null}
            <Field label="Description" wide>
              <textarea
                name="description"
                rows={4}
                maxLength={2000}
                defaultValue={editingEvent?.description}
              />
            </Field>
          </ActionForm>
        </Modal>
      ) : null}
    </>
  );
}
