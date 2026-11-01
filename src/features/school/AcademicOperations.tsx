import { Plus, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CurriculumRequests } from '@/features/curriculum/CurriculumWorkspace'
import { requestText } from '@/lib/decisions'
import { WorkspaceDialog } from '@/components/workspace-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
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
  "overview" | "curricula" | "students" | "subjects" | "sections" | "enrollment" | "requests";
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
}) { return <WorkspaceDialog title={title} description={description} onClose={onClose}>{children}</WorkspaceDialog>; }

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
    <Label className={wide ? "wide" : ""}>
      <span>{label}</span>
      {children}
    </Label>
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
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
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
      <Field label="Effective year"><NativeSelect value={draft.effectiveYear} disabled={!editable} onChange={(event)=>onDraft({...draft,effectiveYear:Number(event.target.value)})}>{Array.from({length:10},(_,index)=>new Date().getFullYear()+index-1).map((year)=><NativeSelectOption key={year} value={year}>{year}{year===new Date().getFullYear()?" · Current year":""}</NativeSelectOption>)}</NativeSelect></Field>
      <Field label="Lifecycle status"><NativeSelect value={status} onChange={(event)=>onStatus(event.target.value as typeof status)} disabled={status==="retired"}><NativeSelectOption value="draft">Draft</NativeSelectOption>{status!=="approved"?<NativeSelectOption value="approved">Approved</NativeSelectOption>:null}{status==="approved"?<NativeSelectOption value="retired">Retired</NativeSelectOption>:null}</NativeSelect></Field>
      <Field label="Duration"><NativeSelect value={draft.durationYears} disabled={!editable} onChange={(event)=>onDraft({...draft,durationYears:Number(event.target.value)})}>{Array.from({length:8},(_,index)=>index+1).map((year)=><NativeSelectOption key={year} value={year}>{year} academic year{year===1?"":"s"}</NativeSelectOption>)}</NativeSelect></Field>
      <Field label="Program"><Input value={`${draft.programCode} · ${draft.programName}`} disabled/></Field>
      <Field label="Description" wide><Textarea rows={3} value={draft.description} disabled={!editable} onChange={(event)=>onDraft({...draft,description:event.target.value})}/></Field>
    </section>
    <section className="curriculum-editor-section"><header><div><h3>{draft.subjects.length} curriculum subjects</h3><p>Choose authoritative catalog subjects, then place them in the pathway. Subject identity and credits remain managed in the Subject catalog.</p></div>{editable?<div className="curriculum-add-actions"><Label><span>Add existing catalog subject</span><NativeSelect aria-label="Catalog subject to add" value={catalogSubjectId} onChange={(event)=>setCatalogSubjectId(event.target.value)}><NativeSelectOption value="">Choose an available subject…</NativeSelectOption>{availableCatalogSubjects.map((course)=><NativeSelectOption key={course.id} value={course.id}>{course.code} · {course.title} · {course.credits} units</NativeSelectOption>)}</NativeSelect></Label><Button type="button" disabled={!catalogSubjectId} onClick={addCatalogSubject}>Add selected</Button><Button type="button" onClick={onCreateSubject}>+ Create catalog subject</Button></div>:null}</header>
      <div className="curriculum-subject-editor"><div className="curriculum-subject-head"><span>Order</span><span>Code and title</span><span>Placement</span><span>Units/category</span><span>Prerequisites</span><span>Actions</span></div>{draft.subjects.map((subject,index)=><Card key={`${subject.code}-${index}`}>
        <Input aria-label={`Sort order for ${subject.code}`} type="number" min="1" value={subject.sortOrder} disabled={!editable} onChange={(event)=>updateSubject(index,{sortOrder:Number(event.target.value)})}/>
        <span className="curriculum-catalog-identity"><strong>{subject.code} · {subject.title}</strong><small>{subject.description||"No catalog description"}</small>{!subject.courseId?<Label><span>Link this legacy row</span><NativeSelect aria-label={`Catalog subject for ${subject.code}`} disabled={!editable} defaultValue="" onChange={(event)=>{const course=catalogSubjects.find((item)=>item.id===event.target.value);if(course)updateSubject(index,{courseId:course.id,code:course.code,title:course.title,description:course.description,units:course.credits,prerequisiteCodes:[],prerequisiteCourseIds:[]});}}><NativeSelectOption value="">Choose the authoritative subject…</NativeSelectOption>{availableCatalogSubjects.map((course)=><NativeSelectOption key={course.id} value={course.id}>{course.code} · {course.title}</NativeSelectOption>)}</NativeSelect></Label>:null}</span>
        <span><Label>Year<NativeSelect value={subject.yearLevel} disabled={!editable} onChange={(event)=>updateSubject(index,{yearLevel:Number(event.target.value)})}>{Array.from({length:draft.durationYears},(_,year)=>year+1).map((year)=><NativeSelectOption key={year} value={year}>Year {year}</NativeSelectOption>)}</NativeSelect></Label><Label>Semester<NativeSelect value={subject.semester} disabled={!editable} onChange={(event)=>updateSubject(index,{semester:Number(event.target.value)})}><NativeSelectOption value="1">1st semester</NativeSelectOption><NativeSelectOption value="2">2nd semester</NativeSelectOption><NativeSelectOption value="3">Summer</NativeSelectOption></NativeSelect></Label></span>
        <span><output aria-label={`Units for ${subject.code}`}>{subject.units} units</output><NativeSelect aria-label={`Category for ${subject.code}`} value={subject.category} disabled={!editable} onChange={(event)=>updateSubject(index,{category:event.target.value as typeof subject.category})}>{curriculumCategories.map((category)=><NativeSelectOption key={category} value={category}>{category.replaceAll("_"," ")}</NativeSelectOption>)}</NativeSelect></span>
        <NativeSelect multiple aria-label={`Prerequisites for ${subject.code}`} value={subject.prerequisiteCourseIds??[]} disabled={!editable||!subject.courseId} onChange={(event)=>{const prerequisiteCourseIds=Array.from(event.currentTarget.selectedOptions,(option)=>option.value);updateSubject(index,{prerequisiteCourseIds,prerequisiteCodes:prerequisiteCourseIds.map((id)=>draft.subjects.find((item)=>item.courseId===id)?.code).filter((code):code is string=>Boolean(code))});}}>{draft.subjects.filter((candidate,candidateIndex)=>candidateIndex<index&&candidate.courseId).map((candidate)=><NativeSelectOption key={candidate.courseId} value={candidate.courseId}>{candidate.code} · {candidate.title}</NativeSelectOption>)}</NativeSelect>
        <span>{editable?<><Button variant="outline" type="button" disabled={index===0} onClick={()=>{const subjects=[...draft.subjects];[subjects[index-1],subjects[index]]=[subjects[index],subjects[index-1]];onDraft({...draft,subjects:subjects.map((item,position)=>({...item,sortOrder:position+1}))});}}>↑</Button><Button variant="outline" type="button" disabled={index===draft.subjects.length-1} onClick={()=>{const subjects=[...draft.subjects];[subjects[index],subjects[index+1]]=[subjects[index+1],subjects[index]];onDraft({...draft,subjects:subjects.map((item,position)=>({...item,sortOrder:position+1}))});}}>↓</Button><Button variant="outline" type="button" className="danger" onClick={()=>onDraft({...draft,subjects:draft.subjects.filter((_,itemIndex)=>itemIndex!==index)})}>Remove</Button></>:<small>Locked</small>}</span>
      </Card>)}</div>
    </section>
    <section className="curriculum-editor-section"><header><div><h3>Yearly sections and capacity</h3></div>{editable?<Button variant="outline" type="button" onClick={()=>onDraft({...draft,blocks:[...draft.blocks,{yearLevel:1,blockCode:`BLOCK-${draft.blocks.length+1}`,capacity:40}]})}>+ Add block</Button>:null}</header><div className="curriculum-block-editor">{draft.blocks.map((block,index)=><Card key={`${block.blockCode}-${index}`}><Label>Year<Input type="number" min="1" max={draft.durationYears} value={block.yearLevel} disabled={!editable} onChange={(event)=>updateBlock(index,{yearLevel:Number(event.target.value)})}/></Label><Label>Block code<Input value={block.blockCode} disabled={!editable} onChange={(event)=>updateBlock(index,{blockCode:event.target.value.toUpperCase()})}/></Label><Label>Capacity<Input type="number" min="1" max="500" value={block.capacity} disabled={!editable} onChange={(event)=>updateBlock(index,{capacity:Number(event.target.value)})}/></Label>{editable?<Button variant="outline" type="button" className="danger" onClick={()=>onDraft({...draft,blocks:draft.blocks.filter((_,itemIndex)=>itemIndex!==index)})}>Remove</Button>:null}</Card>)}</div></section>
    <footer><Label><span>Required change reason</span><Textarea name="reason" required minLength={12} maxLength={1000} placeholder="Explain why this curriculum change is academically required."/></Label><Button type="submit" disabled={busy||!draft.subjects.length||originalStatus==="retired"||(originalStatus==="approved"&&status!=="retired")}>{busy?"Saving curriculum…":originalStatus==="approved"?"Retire curriculum":"Save curriculum"}</Button></footer>
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

  function openFromMenu(action: () => void) {
    requestAnimationFrame(() => {
      document.getElementById("academic-add")?.focus();
      action();
    });
  }
  return (
    <>
      <div className="academic-toolbar">
        <div />
        <div className="flex flex-wrap gap-2">
          {registrarRoles.has(role) ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Download className="size-4" />Export</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => exportCsv("stu-enrollment-report.csv",[["Student number","Name","Program","Year","Record status"],...data.students.map(student => [student.studentNumber,student.fullName,student.program,student.yearLevel,student.recordStatus])])}>Enrollment report</DropdownMenuItem>
            {selectedSection ? <DropdownMenuItem onSelect={() => exportCsv(`${selectedSection.code}-${selectedSection.sectionCode}-class-list.csv`,[["Student number","Name","Enrollment status"],...roster.map(({student,enrollment}) => [student!.studentNumber,student!.fullName,enrollment.status])])}>Class list</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={() => exportCsv("stu-official-academic-record-index.csv",[["Student number","Name","Program","Year","Standing/record status"],...data.students.map(student => [student.studentNumber,student.fullName,student.program,student.yearLevel,student.recordStatus])])}>Academic records</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu> : null}
          {departmentManagers.has(role) || academicManagers.has(role) || registrarRoles.has(role) ? <DropdownMenu><DropdownMenuTrigger asChild><Button id="academic-add"><Plus className="size-4" />Add</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            {departmentManagers.has(role) ? <DropdownMenuItem onSelect={() => openFromMenu(() => setModal("department"))}>Department</DropdownMenuItem> : null}
            {academicManagers.has(role) ? <DropdownMenuItem onSelect={() => openFromMenu(() => setModal("program"))}>Program</DropdownMenuItem> : null}
            {registrarRoles.has(role) ? <DropdownMenuItem onSelect={() => openFromMenu(() => setModal("term"))}>Term</DropdownMenuItem> : null}
            {academicManagers.has(role) ? <DropdownMenuItem onSelect={() => openFromMenu(() => addSubjectForProgram(""))}>Subject</DropdownMenuItem> : null}
            {academicManagers.has(role) ? <DropdownMenuItem onSelect={() => openFromMenu(() => openSection())}>Class</DropdownMenuItem> : null}
            {registrarRoles.has(role) ? <DropdownMenuItem onSelect={() => openFromMenu(() => openStudent())}>Student</DropdownMenuItem> : null}
          </DropdownMenuContent></DropdownMenu> : null}
        </div>
      </div>
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)}><TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1" aria-label="Academic operations">
        {(
          [
            ["overview", "Overview"],
            ["curricula", "Curriculum"],
            ["students", "Students"],
            ["subjects", "Subjects"],
            ["sections", "Classes"],
            ["enrollment", "Enrollment"],
            ...(academicManagers.has(role) ? [["requests", "Change requests"] as const] : []),
          ] as const
        ).map(([value, label]) => (
          <TabsTrigger
            value={value}
            key={value}
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList><TabsContent value={tab} className="min-w-0">

      {tab === "requests" && academicManagers.has(role) ? <CurriculumRequests data={data} currentUser={currentUser} onOpenProgram={programId => { setSelectedProgramId(programId); setTab("curricula"); }} /> : null}
      {tab === "overview" ? (
        <>
          <section className="overview-counts" aria-label="Academic summary">
            <div><strong>{data.departments.length}</strong><span>Departments</span></div>
            <div><strong>{data.programs.length}</strong><span>Programs</span></div>
            <div><strong>{data.catalogCourses.length}</strong><span>Subjects</span></div>
            <div><strong>{data.courses.length}</strong><span>Classes</span></div>
          </section>
          {Object.values(relationshipGaps).some(items => items.length) ? <section className="academic-relationship-health">
            <h3>Needs attention</h3>
            <div>
              {relationshipGaps.programsWithoutCurricula.length ? <Button variant="outline" onClick={() => openProgram(relationshipGaps.programsWithoutCurricula[0].id)}><b>{relationshipGaps.programsWithoutCurricula.length}</b><span>Programs without curriculum</span><span aria-hidden="true">→</span></Button> : null}
              {relationshipGaps.subjectsWithoutPrograms.length ? <Button variant="outline" onClick={() => setTab("subjects")}><b>{relationshipGaps.subjectsWithoutPrograms.length}</b><span>Shared/unassigned subjects</span><span aria-hidden="true">→</span></Button> : null}
              {relationshipGaps.studentsWithoutPrograms.length ? <Button variant="outline" onClick={() => setTab("students")}><b>{relationshipGaps.studentsWithoutPrograms.length}</b><span>Students without program ID</span><span aria-hidden="true">→</span></Button> : null}
              {relationshipGaps.classesWithoutFaculty.length ? <Button variant="outline" onClick={() => setTab("sections")}><b>{relationshipGaps.classesWithoutFaculty.length}</b><span>Classes without teacher</span><span aria-hidden="true">→</span></Button> : null}
            </div>
          </section> : null}
          <section className="department-grid">
            <Table aria-label="Departments"><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Department</TableHead><TableHead>Programs</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
              {data.departments.map(department => <TableRow key={department.id}>
                <TableCell className="font-medium">{department.code}</TableCell><TableCell>{department.name}</TableCell>
                <TableCell>{data.programs.filter(program => program.departmentId === department.id).map(program => program.code).join(", ") || "None"}</TableCell>
                <TableCell>{departmentManagers.has(role) ? <Button variant="outline" size="sm" onClick={() => openEdit("department",department.id)}>Edit department</Button> : null}</TableCell>
              </TableRow>)}
              {!data.departments.length ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No departments yet. Use Add to create one.</TableCell></TableRow> : null}
            </TableBody></Table>
          </section>
          <section className="academic-lifecycle-grid">
            <Card className="school-card">
              <header>
                <div>
                  <h3>Programs</h3>
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
                  <span className="academic-row-actions"><Button variant="outline" type="button" onClick={() => openProgram(program.id)}>Open curriculum</Button>{academicManagers.has(role) ? <><Button variant="outline" type="button" onClick={() => openEdit("program", program.id)}>Edit</Button>{program.status !== "inactive" ? <Button variant="outline" type="button" onClick={async () => {const reason=(await requestText("Program archival reason (at least 12 characters)"));if(reason) void perform(() => archiveAcademicProgram(program.id,reason),"Program archived with immutable evidence.");}}>Archive</Button> : null}</> : null}</span>
                </div>
              ))}
            </Card>
            <Card className="school-card">
              <header>
                <div>
                  <h3>Terms</h3>
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
                    <span className="academic-row-actions"><Button variant="outline" type="button" onClick={() => openEdit("term", term.id)}>Edit</Button>{term.status !== "completed" ? <Button variant="outline" type="button" onClick={async () => { const reason=(await requestText("Term closure reason (at least 12 characters)")); if (!reason) return; void perform(() => closeAcademicTerm(term.id,reason),"Academic term closed and locked with audit evidence."); }}>Close term</Button> : null}</span>
                  ) : null}
                </div>
              ))}
            </Card>
          </section>
        </>
      ) : null}

      {tab === "curricula" ? (
        <section className="curriculum-library">
          <header>
            <div><h3>Programs</h3><p>Select a program to manage its curriculum and classes.</p></div>
            {academicManagers.has(role) && selectedProgram ? <div className="curriculum-header-actions">{selectedDraftCurriculum?<Button variant="outline" type="button" className="primary" onClick={()=>openCurriculum(selectedDraftCurriculum)}>Edit curriculum subjects</Button>:<Button variant="outline" type="button" className="primary" onClick={() => createCurriculumForProgram(selectedProgram.id)}>+ Create curriculum</Button>}<Button variant="outline" type="button" onClick={() => addSubjectForProgram(selectedProgram.id)}>+ Add catalog subject</Button></div> : null}
          </header>
          <div className="program-relationship-layout">
            <aside className="program-relationship-list" aria-label="Academic programs">
              <span>Programs</span>
              {data.programs.map((program) => {
                const department = data.departments.find((item) => item.id === program.departmentId);
                const curriculumCount = data.curricula.filter((item) => item.programId === program.id).length;
                const subjectCount = data.catalogCourses.filter((item) => item.programId === program.id).length;
                return <Button variant="outline" type="button" key={program.id} className={selectedProgram?.id === program.id ? "active" : ""} onClick={() => setSelectedProgramId(program.id)}>
                  <b>{program.code} · {program.name}</b>
                  <small>{department?.code ?? "No department"} → {curriculumCount ? `${curriculumCount} curriculum ${curriculumCount === 1 ? "version" : "versions"}` : "Curriculum missing"} → {subjectCount} subjects</small>
                </Button>;
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
                    <span><b>{selectedProgramStaff.length}</b><small>Assigned to</small></span>
                  </div>
                  <div className="program-context-actions">
                    {academicManagers.has(role) ? <Button variant="outline" type="button" onClick={() => openEdit("program", selectedProgram.id)}>Edit program</Button> : null}
                    {academicManagers.has(role) ? selectedDraftCurriculum?<Button variant="outline" type="button" className="primary" onClick={()=>openCurriculum(selectedDraftCurriculum)}>Edit curriculum subjects</Button>:<Button variant="outline" type="button" className="primary" onClick={() => createCurriculumForProgram(selectedProgram.id)}>Create curriculum</Button> : null}
                    {academicManagers.has(role) ? <Button variant="outline" type="button" onClick={() => addSubjectForProgram(selectedProgram.id)}>Add catalog subject</Button> : null}
                    <Button variant="outline" type="button" onClick={() => setTab("subjects")}>View subjects</Button>
                    <Button variant="outline" type="button" onClick={() => setTab("sections")}>View classes</Button>
                  </div>
                </section>
                {selectedProgramCurricula.length ? selectedProgramCurricula.map((plan) => <Card key={plan.id} className="curriculum-plan-card">
              <div className="curriculum-plan-title"><div><span>{plan.status.toUpperCase()} · EFFECTIVE {plan.effectiveYear}</span><h4>{selectedProgramDepartment?.name ?? "Department not linked"} → {selectedProgram.code} → Curriculum {plan.effectiveYear}</h4><small>Source: {plan.source.programCode} curriculum transaction · Record {plan.id.slice(0, 8)}</small></div><div className="curriculum-card-actions"><b>{plan.source.subjects.reduce((total, subject) => total + subject.units, 0)} total units</b>{academicManagers.has(role) ? <><Button variant="outline" type="button" onClick={() => openCurriculum(plan)}>{plan.status === "draft" ? "Edit curriculum" : "Manage lifecycle"}</Button><Button variant="outline" type="button" onClick={() => {setDuplicateCurriculumId(plan.id);setModal("duplicateCurriculum");}}>Duplicate as new version</Button>{plan.status==="draft"?<Button variant="outline" type="button" className="danger" onClick={async ()=>{const reason=(await requestText("Why should this draft curriculum be deleted? (at least 12 characters)"));if(reason)void perform(()=>deleteDraftAcademicCurriculum(plan.id,reason),`Draft curriculum ${plan.effectiveYear} deleted; catalog subjects were preserved.`);}}>Delete draft</Button>:null}</> : null}</div></div>
              <div className="curriculum-years">{Array.from({length: plan.source.durationYears}, (_, index) => index + 1).map((year) => <section key={year}>
                <header><strong>Year {year}</strong><small>{plan.source.blocks.filter((block) => block.yearLevel === year).map((block) => `${block.blockCode} (${block.capacity})`).join(" · ")}</small></header>
                {[1, 2, 3].map((semester) => {
                  const subjects=plan.source.subjects.filter((subject) => subject.yearLevel===year && subject.semester===semester);
                  return subjects.length ? <div key={semester}><b>Semester {semester}</b><ul>{subjects.map((subject) => <li key={subject.code}><span><strong>{subject.code}</strong>{subject.title}</span><small>{subject.units} units{subject.prerequisiteCodes.length ? ` · Prereq: ${subject.prerequisiteCodes.join(", ")}` : ""}</small></li>)}</ul></div> : null;
                })}
              </section>)}</div>
            </Card>) : <div className="academic-empty relationship-missing"><strong>No curriculum is connected to {selectedProgram.code}</strong><p>The program exists under {selectedProgramDepartment?.name ?? "an unresolved department"}, but it has no curriculum version. Create a curriculum before opening a complete degree pathway.</p><div>{academicManagers.has(role)?<Button variant="outline" type="button" className="primary" onClick={()=>createCurriculumForProgram(selectedProgram.id)}>Create {selectedProgram.code} curriculum</Button>:null}<Button variant="outline" type="button" onClick={onAskNexus}>Draft curriculum a draft</Button></div></div>}
              </> : <div className="academic-empty relationship-missing"><strong>No academic programs exist</strong><p>Create a department and program before adding curricula, subjects, or classes.</p></div>}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "students" ? (
        <section className="academic-directory school-card">
          <header>
            <div>
              <h3>{data.students.length} student records</h3>
            </div>
            {registrarRoles.has(role) ? (
              <Button variant="outline" type="button" onClick={() => openStudent()}>
                + Add student
              </Button>
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
              <span>{student.programId ? <Button variant="outline" type="button" className="academic-link-button" onClick={() => openProgram(student.programId!)}>{data.programs.find((item) => item.id === student.programId)?.code ?? student.program} → Open curriculum</Button> : <span className="status-warn">{student.program || "Program not linked"}</span>}</span>
              <span>{student.yearLevel}</span>
              <span className={student.profileId ? "status-ok" : "status-warn"}>
                {student.recordStatus} · {student.profileId ? "Connected" : "SIS only"}
              </span>
              {registrarRoles.has(role) ? (
                <span className="academic-row-actions"><Button variant="outline" type="button" onClick={() => openStudent(student.id)}>Edit</Button>{student.recordStatus === "active" ? <Button variant="outline" type="button" onClick={async () => {const reason=(await requestText("Withdrawal reason (at least 12 characters)"));if(reason) void perform(() => withdrawStudentRecord(student.id,reason),"Student withdrawn and active enrollments dropped.");}}>Withdraw</Button> : null}{student.recordStatus === "active" ? <Button variant="outline" type="button" onClick={() => {setMergeSourceStudentId(student.id);setModal("mergeStudent");}}>Merge</Button> : null}</span>
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
              <Card key={course.id}>
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
                  {program ? <Button variant="outline" type="button" onClick={() => openProgram(program.id)}>Open {program.code} pathway</Button> : null}
                  <Button variant="outline" type="button" onClick={() => openClassForSubject(course.id)}>Open class</Button>
                  {academicManagers.has(role) ? <Button variant="outline" type="button" onClick={() => openEdit("subject", course.id)}>Edit subject</Button> : null}
                </div>
              </Card>
            );
          })}
          <Button variant="outline"
            type="button"
            className="add-card"
            onClick={() => {setContextProgramId("");setModal("subject");}}
          >
            <span>+</span>
            <b>Add a subject</b>
            <small>Code, credits, program, and description</small>
          </Button>
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
            return <Card key={course.sectionId}>
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
                  <small>Teacher</small>
                  <b>{course.facultyName}</b>
                </span>
                <span>
                  <small>Room / mode</small>
                  <b>
                    {course.room} · {course.modality}
                  </b>
                </span>
                <span>
                  <small>Roster</small>
                  <b>
                    {course.enrolledStudentIds.length +
                      course.enrolledProfileIds.length}{" "}
                    learners
                  </b>
                </span>
                <span><small>Learning</small><b>{moduleCount} modules · {assessmentCount} assessments</b></span>
                <span><small>Schedule</small><b>{scheduleCount} events</b></span>
              </div>
              <div className="section-connection-actions">
                {program ? <Button variant="outline" type="button" onClick={() => openProgram(program.id)}>Open {program.code}</Button> : null}
                <Button variant="outline" type="button" onClick={() => {setSelectedSectionId(course.sectionId);setTab("enrollment");}}>Open roster</Button>
                <Button variant="outline" type="button" onClick={() => onOpenSectionWorkspace(scheduleManagers.has(role) ? "teaching" : "learning", course.sectionId)}>Open course</Button>
                <Button variant="outline" type="button" onClick={() => onOpenSectionWorkspace("assessments", course.sectionId)}>Open assessments</Button>
                <Button variant="outline" type="button" onClick={() => onOpenSectionWorkspace("grades", course.sectionId)}>Open grades</Button>
                <Button variant="outline" type="button" onClick={() => onOpenSectionWorkspace("schedule", course.sectionId)}>Open schedule</Button>
                {academicManagers.has(role) ? <Button variant="outline" type="button" onClick={() => openSection(course)}>Edit class</Button> : null}
              </div>
            </Card>;
          })}
        </section>
      ) : null}

      {tab === "enrollment" ? (
        <section className="enrollment-operations">
          <aside>
            <span>Select class</span>
            {data.courses.map((course) => (
              <Button variant="outline"
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
              </Button>
            ))}
          </aside>
          <div className="school-card">
            <header>
              <div>
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
                  <NativeSelect
                    name="studentId"
                    aria-label="Student to enroll"
                    required
                  >
                    <NativeSelectOption value="">Choose a student…</NativeSelectOption>
                    {availableStudents.map((student) => (
                      <NativeSelectOption key={student.id} value={student.id}>
                        {student.studentNumber} · {student.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    type="submit"
                    disabled={busy || !availableStudents.length}
                  >
                    Enroll
                  </Button>
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
                    <NativeSelect
                      value={enrollment.status}
                      disabled={busy}
                      onChange={(event) =>
                        (async () => { const status=event.target.value as "waitlisted"|"enrolled"|"dropped"|"completed"; const reason=(await requestText(`Reason for changing enrollment to ${status} (at least 12 characters)`)); if(!reason){event.target.value=enrollment.status;return;} void perform(() => transitionEnrollment(enrollment.id,status,reason),`Enrollment changed to ${status} with audit evidence.`); })()
                      }
                    >
                      <NativeSelectOption value="enrolled">Enrolled</NativeSelectOption>
                      <NativeSelectOption value="waitlisted">Waitlisted</NativeSelectOption>
                      <NativeSelectOption value="dropped">Dropped</NativeSelectOption>
                      <NativeSelectOption value="completed">Completed</NativeSelectOption>
                    </NativeSelect>
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

      {modal==="duplicateCurriculum"&&duplicateCurriculumId?(()=>{const source=data.curricula.find((item)=>item.id===duplicateCurriculumId);const program=data.programs.find((item)=>item.id===source?.programId);if(!source||!program)return null;const department=data.departments.find((item)=>item.id===program.departmentId);const suggested=Math.max(new Date().getFullYear(),source.effectiveYear+1);return <Modal title={`New ${program.code} curriculum version`} description="Create a separate draft linked to the same program. The approved source version remains unchanged." onClose={closeModal}><ActionForm submitLabel="Create draft version" busy={busy} onSubmit={(event)=>{event.preventDefault();const year=Number(new FormData(event.currentTarget).get("effectiveYear"));void perform(()=>createAcademicCurriculum(department?.id??"",`curriculum-version-${source.id}-${year}`,{...structuredClone(source.source),effectiveYear:year}),`Curriculum ${year} created as a separate draft version.`);}}><Field label="Program"><Input disabled value={`${program.code} · ${program.name}`}/></Field><Field label="Source curriculum"><Input disabled value={`Effective ${source.effectiveYear} · ${source.status}`}/></Field><Field label="New effective year"><NativeSelect name="effectiveYear" required defaultValue={suggested}>{Array.from({length:10},(_,index)=>suggested+index).filter((year)=>!data.curricula.some((item)=>item.programId===program.id&&item.effectiveYear===year)).map((year)=><NativeSelectOption key={year} value={year}>{year}</NativeSelectOption>)}</NativeSelect></Field></ActionForm></Modal>;})():null}

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
              <Input
                name="fullName"
                required
                maxLength={120}
                defaultValue={editingStudent?.fullName}
              />
            </Field>
            <Field label="Preferred name">
              <Input
                name="preferredName"
                maxLength={120}
                defaultValue={editingStudent?.preferredName}
              />
            </Field>
            <Field label="Student number">
              <Input
                name="studentNumber"
                required
                maxLength={32}
                placeholder="STU-2026-0001"
                defaultValue={editingStudent?.studentNumber}
              />
            </Field>
            <Field label="Email">
              <Input
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
                  <Input
                    name="password"
                    required
                    minLength={24}
                    maxLength={128}
                    defaultValue={generatedPassword()}
                  />
                  <Button variant="outline"
                    type="button"
                    onClick={(e) => {
                      const input = e.currentTarget
                        .previousElementSibling as HTMLInputElement;
                      input.value = generatedPassword();
                    }}
                  >
                    Regenerate
                  </Button>
                </div>
              </Field>
            ) : null}
            <Field label="Program">
              <NativeSelect
                name="programId"
                required
                value={studentProgramId}
                onChange={(event)=>setStudentProgramId(event.target.value)}
              >
                <NativeSelectOption value="">Select program…</NativeSelectOption>
                {data.programs.map((program) => (
                  <NativeSelectOption key={program.id} value={program.id}>
                    {data.departments.find((item) => item.id === program.departmentId)?.code ?? "No department"} → {program.code} · {program.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Year level">
              <NativeSelect
                name="yearLevel"
                required
                defaultValue={editingStudent?.yearLevel ?? "1st Year"}
              >
                <NativeSelectOption>1st Year</NativeSelectOption>
                <NativeSelectOption>2nd Year</NativeSelectOption>
                <NativeSelectOption>3rd Year</NativeSelectOption>
                <NativeSelectOption>4th Year</NativeSelectOption>
                <NativeSelectOption>Graduate</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Advisor">
              <NativeSelect
                name="advisorId"
                defaultValue={editingStudent?.advisorId ?? ""}
              >
                <NativeSelectOption value="">Unassigned</NativeSelectOption>
                {eligibleStudentAdvisors.map((advisor) => (
                  <NativeSelectOption key={advisor.id} value={advisor.id}>
                    {advisor.name} · {data.programs.find((item)=>item.id===advisor.programId)?.code??data.departments.find((item)=>item.id===advisor.departmentId)?.code??"Institution"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Phone">
              <Input
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
            <Field label="Duplicate record"><Input disabled value={(()=>{const student=data.students.find((item)=>item.id===mergeSourceStudentId);return student?`${student.studentNumber} · ${student.fullName} · ${student.program}`:"Unavailable student";})()}/></Field>
            <Field label="Authoritative student record">
              <NativeSelect name="targetStudentId" required defaultValue=""><NativeSelectOption value="">Search and choose a student…</NativeSelectOption>{data.students.filter((student)=>student.id!==mergeSourceStudentId&&student.recordStatus!=="merged"&&student.recordStatus!=="archived").map((student)=><NativeSelectOption key={student.id} value={student.id}>{student.studentNumber} · {student.fullName} · {data.programs.find((program)=>program.id===student.programId)?.code??student.program} · {student.recordStatus}</NativeSelectOption>)}</NativeSelect>
            </Field>
            <Field label="Merge reason" wide><Textarea name="reason" required minLength={12} maxLength={500} rows={4} placeholder="Explain why these records represent the same learner."/></Field>
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
              <Input
                name="code"
                required
                maxLength={20}
                defaultValue={editingDepartment?.code}
              />
            </Field>
            <Field label="Name">
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={editingDepartment?.name}
              />
            </Field>
            <Field label="Department head">
              <NativeSelect
                name="headId"
                defaultValue={editingDepartment?.headId ?? ""}
              >
                <NativeSelectOption value="">Unassigned</NativeSelectOption>
                {data.profiles
                  .filter((p) => p.role === "department_head")
                  .map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Description" wide>
              <Textarea
                name="description"
                rows={4}
                maxLength={1000}
                defaultValue={editingDepartment?.description}
              />
            </Field>
            {editingDepartment ? (
              <Field label="Status">
                <NativeSelect name="status" defaultValue={editingDepartment.status}>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                </NativeSelect>
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
              <NativeSelect
                name="departmentId"
                required
                defaultValue={editingProgram?.departmentId ?? ""}
              >
                <NativeSelectOption value="">Select department…</NativeSelectOption>
                {data.departments.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Program code">
              <Input
                name="code"
                required
                maxLength={30}
                defaultValue={editingProgram?.code}
              />
            </Field>
            <Field label="Program name">
              <Input
                name="name"
                required
                maxLength={160}
                defaultValue={editingProgram?.name}
              />
            </Field>
            <Field label="Level">
              <NativeSelect
                name="level"
                required
                defaultValue={editingProgram?.level ?? "bachelor"}
              >
                <NativeSelectOption value="certificate">Certificate</NativeSelectOption>
                <NativeSelectOption value="bachelor">Bachelor</NativeSelectOption>
                <NativeSelectOption value="master">Master</NativeSelectOption>
                <NativeSelectOption value="doctorate">Doctorate</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Duration (years)">
              <Input
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
              <Textarea
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
              <Input
                name="code"
                required
                maxLength={30}
                placeholder="2027-SPRING"
                defaultValue={editingTerm?.code}
              />
            </Field>
            <Field label="Name">
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={editingTerm?.name}
              />
            </Field>
            <Field label="Teaching starts">
              <Input
                name="startsOn"
                type="date"
                required
                defaultValue={editingTerm?.startsOn}
              />
            </Field>
            <Field label="Teaching ends">
              <Input
                name="endsOn"
                type="date"
                required
                defaultValue={editingTerm?.endsOn}
              />
            </Field>
            <Field label="Enrollment starts">
              <Input
                name="enrollmentStartsOn"
                type="date"
                defaultValue={editingTerm?.enrollmentStartsOn ?? ""}
              />
            </Field>
            <Field label="Enrollment ends">
              <Input
                name="enrollmentEndsOn"
                type="date"
                defaultValue={editingTerm?.enrollmentEndsOn ?? ""}
              />
            </Field>
            <Field label="Status">
              <NativeSelect
                name="status"
                defaultValue={editingTerm?.status ?? "planning"}
              >
                <NativeSelectOption value="planning">Planning</NativeSelectOption>
                <NativeSelectOption value="enrollment">Enrollment</NativeSelectOption>
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="completed">Completed</NativeSelectOption>
              </NativeSelect>
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
              <NativeSelect
                name="departmentId"
                required
                value={subjectDepartmentId||editingSubject?.departmentId||contextProgram?.departmentId||""}
                onChange={(event)=>{setSubjectDepartmentId(event.target.value);setSubjectProgramId("");}}
              >
                <NativeSelectOption value="">Select department…</NativeSelectOption>
                {data.departments.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Program">
              <NativeSelect
                name="programId"
                value={subjectProgramId}
                onChange={(event)=>setSubjectProgramId(event.target.value)}
              >
                <NativeSelectOption value="">Shared / no program</NativeSelectOption>
                {data.programs.filter((p)=>p.departmentId===subjectDepartmentId).map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Subject code">
              <Input
                name="code"
                required
                maxLength={30}
                placeholder="IM204"
                defaultValue={editingSubject?.code}
              />
            </Field>
            <Field label="Title">
              <Input
                name="title"
                required
                maxLength={180}
                defaultValue={editingSubject?.title}
              />
            </Field>
            <Field label="Credits">
              <Input
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
              <Textarea
                name="description"
                rows={5}
                maxLength={2000}
                defaultValue={editingSubject?.description}
              />
            </Field>
            {editingSubject ? (
              <Field label="Status">
                <NativeSelect name="status" defaultValue={editingSubject.status}>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="archived">Archived</NativeSelectOption>
                </NativeSelect>
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
                <Field label="Program"><NativeSelect required value={sectionProgramId} onChange={(event)=>{setSectionProgramId(event.target.value);setContextSubjectId("");}}><NativeSelectOption value="">Select program…</NativeSelectOption>{data.programs.filter((program)=>program.status==="active").map((program)=><NativeSelectOption key={program.id} value={program.id}>{data.departments.find((department)=>department.id===program.departmentId)?.code} → {program.code} · {program.name}</NativeSelectOption>)}</NativeSelect></Field>
                <Field label="Subject">
                  <NativeSelect name="courseId" required value={contextSubjectId} disabled={!sectionProgramId} onChange={(event)=>setContextSubjectId(event.target.value)}>
                    <NativeSelectOption value="">Select subject in this program…</NativeSelectOption>
                    {sectionSubjects
                      .map((c) => (
                        <NativeSelectOption key={c.id} value={c.id}>
                          {c.code} · {c.title}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>
                <Field label="Academic term">
                  <NativeSelect name="termId" required>
                    <NativeSelectOption value="">Select term…</NativeSelectOption>
                    {data.terms
                      .filter((t) => t.status !== "completed")
                      .map((t) => (
                        <NativeSelectOption key={t.id} value={t.id}>
                          {t.code} · {t.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>
                <Field label="Section code">
                  <Input
                    name="sectionCode"
                    required
                    maxLength={30}
                    placeholder="A"
                  />
                </Field>
              </>
            ) : null}
            <Field label="Teacher">
              <NativeSelect
                name="facultyId"
                defaultValue={editingSection?.facultyId ?? ""}
              >
                <NativeSelectOption value="">Assignment pending</NativeSelectOption>
                {sectionFaculty.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name} · {p.role.replaceAll("_", " ")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Modality">
              <NativeSelect
                name="modality"
                defaultValue={editingSection?.modality ?? "onsite"}
              >
                <NativeSelectOption value="onsite">On-site</NativeSelectOption>
                <NativeSelectOption value="online">Online</NativeSelectOption>
                <NativeSelectOption value="hybrid">Hybrid</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Room">
              <Input
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
              <Input
                name="capacity"
                type="number"
                min="1"
                max="1000"
                defaultValue={editingSection?.capacity ?? 40}
                required
              />
            </Field>
            <Field label="Status">
              <NativeSelect
                name="status"
                defaultValue={editingSection?.status ?? "planning"}
              >
                <NativeSelectOption value="planning">Planning</NativeSelectOption>
                <NativeSelectOption value="open">Open for enrollment</NativeSelectOption>
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="completed">Completed</NativeSelectOption>
                <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
              </NativeSelect>
            </Field>
          </ActionForm>
        </Modal>
      ) : null}
      </TabsContent></Tabs>
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
            <h3>Manage the live timetable</h3>
            <p>
              Room, assigned-teacher, and enrolled-student overlaps are rejected
              before saving.
            </p>
          </div>
          <Button variant="outline" type="button" onClick={() => {setEventScope("class");setModal("event");}}>
            + Add schedule event
          </Button>
        </section>
      ) : null}
      {canManage ? (
        <section className="schedule-manager school-card">
          <header>
            <div>
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
                <Button variant="outline"
                  type="button"
                  onClick={() => {
                    setEditingEvent(event);
                    setEventScope(event.sectionId?"class":event.audienceRoles.length?"role":"personal");
                    setModal("event");
                  }}
                  disabled={busy}
                >
                  Edit
                </Button>
                <Button variant="outline"
                  type="button"
                  onClick={() => void remove(event)}
                  disabled={busy}
                >
                  Remove
                </Button>
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
            <Field label="Event scope"><NativeSelect value={eventScope} onChange={(event)=>setEventScope(event.target.value as typeof eventScope)}><NativeSelectOption value="class">Class roster</NativeSelectOption><NativeSelectOption value="personal">Only me</NativeSelectOption><NativeSelectOption value="role">Role-wide</NativeSelectOption></NativeSelect></Field>
            <Field label="Event type">
              <NativeSelect
                name="eventType"
                required
                defaultValue={editingEvent?.type ?? "class"}
              >
                <NativeSelectOption value="class">Class</NativeSelectOption>
                <NativeSelectOption value="exam">Exam</NativeSelectOption>
                <NativeSelectOption value="deadline">Deadline</NativeSelectOption>
                <NativeSelectOption value="meeting">Meeting</NativeSelectOption>
                <NativeSelectOption value="campus">Campus event</NativeSelectOption>
                <NativeSelectOption value="personal">Personal</NativeSelectOption>
              </NativeSelect>
            </Field>
            {eventScope==="class"?<Field label="Class section">
              <NativeSelect
                name="sectionId"
                defaultValue={editingEvent?.sectionId ?? ""}
                required
              >
                <NativeSelectOption value="">Personal / role event</NativeSelectOption>
                {data.courses
                  .filter((course) =>
                    manageableSectionIds.has(course.sectionId),
                  )
                  .map((course) => (
                    <NativeSelectOption key={course.sectionId} value={course.sectionId}>
                      {course.code} · {course.sectionCode} · {course.term}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>:null}
            <Field label="Title">
              <Input
                name="title"
                required
                maxLength={180}
                defaultValue={editingEvent?.title}
              />
            </Field>
            <Field label="Location">
              <Input
                name="location"
                maxLength={160}
                defaultValue={editingEvent?.location}
              />
            </Field>
            <Field label="Starts">
              <Input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={
                  editingEvent ? localDateTimeInput(editingEvent.startsAt) : ""
                }
              />
            </Field>
            <Field label="Ends">
              <Input
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={
                  editingEvent ? localDateTimeInput(editingEvent.endsAt) : ""
                }
              />
            </Field>
            {eventScope==="role"?<Field label="Role audience">
              <NativeSelect
                name="audienceRole"
                defaultValue={editingEvent?.audienceRoles[0] ?? ""}
                required
              >
                <NativeSelectOption value="">Section / personal only</NativeSelectOption>
                {data.roles.map((role) => (
                  <NativeSelectOption key={role.code} value={role.code}>
                    {role.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>:null}
            <Field label="Description" wide>
              <Textarea
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
