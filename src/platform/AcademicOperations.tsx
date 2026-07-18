import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CrmUser } from "../crm/authService";
import {
  createAcademicTerm,
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
  | "term"
  | "subject"
  | "section"
  | "event"
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

export function AcademicOperations({
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

  const faculty = data.profiles.filter((profile) =>
    ["faculty", "department_head", "dean"].includes(profile.role),
  );
  const advisors = data.profiles.filter(
    (profile) => profile.role === "advisor",
  );
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

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      onToast(success);
      setModal(null);
      setEditingSection(null);
      setEditingId("");
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
    setEditingSection(course ?? null);
    setModal("section");
  }

  function openEdit(
    name: Exclude<ModalName, "student" | "section" | "event" | null>,
    id: string,
  ) {
    setEditingId(id);
    setModal(name);
  }

  function closeModal() {
    setModal(null);
    setEditingId("");
    setEditingSection(null);
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
            <button type="button" onClick={() => setModal("student")}>
              + Add student
            </button>
          ) : null}
          {academicManagers.has(role) ? (
            <button type="button" onClick={() => setModal("subject")}>
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
                  <button type="button" onClick={() => setModal("subject")}>
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
                  <button type="button" onClick={() => setModal("student")}>
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
                      {program.name} · {program.status}
                    </small>
                  </span>
                  {academicManagers.has(role) ? (
                    <span className="academic-row-actions"><button type="button" onClick={() => openEdit("program", program.id)}>Edit</button>{program.status !== "inactive" ? <button type="button" onClick={() => {const reason=window.prompt("Program archival reason (at least 12 characters)");if(reason) void perform(() => archiveAcademicProgram(program.id,reason),"Program archived with immutable evidence.");}}>Archive</button> : null}</span>
                  ) : null}
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
            <div><span>DEGREE MAPS</span><h3>Curriculum plans and block templates</h3><p>Drafts created by Nexus remain reviewable academic records. Programs and catalog subjects stay editable through their ordinary controls.</p></div>
            <button type="button" onClick={() => setTab("subjects")}>Edit catalog subjects</button>
          </header>
          {data.curricula.length ? data.curricula.map((plan) => {
            const program = data.programs.find((item) => item.id === plan.programId);
            return <article key={plan.id} className="curriculum-plan-card">
              <div className="curriculum-plan-title"><div><span>{plan.status.toUpperCase()} · EFFECTIVE {plan.effectiveYear}</span><h4>{program?.code ?? plan.source.programCode} · {program?.name ?? plan.source.programName}</h4></div><b>{plan.source.subjects.reduce((total, subject) => total + subject.units, 0)} total units</b></div>
              <div className="curriculum-years">{Array.from({length: plan.source.durationYears}, (_, index) => index + 1).map((year) => <section key={year}>
                <header><strong>Year {year}</strong><small>{plan.source.blocks.filter((block) => block.yearLevel === year).map((block) => `${block.blockCode} (${block.capacity})`).join(" · ")}</small></header>
                {[1, 2, 3].map((semester) => {
                  const subjects=plan.source.subjects.filter((subject) => subject.yearLevel===year && subject.semester===semester);
                  return subjects.length ? <div key={semester}><b>Semester {semester}</b><ul>{subjects.map((subject) => <li key={subject.code}><span><strong>{subject.code}</strong>{subject.title}</span><small>{subject.units} units{subject.prerequisiteCodes.length ? ` · Prereq: ${subject.prerequisiteCodes.join(", ")}` : ""}</small></li>)}</ul></div> : null;
                })}
              </section>)}</div>
            </article>;
          }) : <div className="academic-empty"><strong>No curriculum plans yet</strong><p>Ask Nexus to prepare a complete curriculum, review its subject and block preview, then confirm the transaction.</p></div>}
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
              <button type="button" onClick={() => setModal("student")}>
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
              <span>{student.program}</span>
              <span>{student.yearLevel}</span>
              <span className={student.profileId ? "status-ok" : "status-warn"}>
                {student.recordStatus} · {student.profileId ? "Connected" : "SIS only"}
              </span>
              {registrarRoles.has(role) ? (
                <span className="academic-row-actions"><button type="button" onClick={() => {setEditingId(student.id);setModal("student");}}>Edit</button>{student.recordStatus === "active" ? <button type="button" onClick={() => {const reason=window.prompt("Withdrawal reason (at least 12 characters)");if(reason) void perform(() => withdrawStudentRecord(student.id,reason),"Student withdrawn and active enrollments dropped.");}}>Withdraw</button> : null}{student.recordStatus === "active" ? <button type="button" onClick={() => {const targetNumber=window.prompt(`Target student number for merging ${student.studentNumber}`);if(!targetNumber)return;const target=data.students.find((item) => item.studentNumber.toLowerCase()===targetNumber.trim().toLowerCase());if(!target){onToast("No student matches that student number.");return;}const reason=window.prompt("Merge reason (at least 12 characters)");if(reason) void perform(() => mergeStudentRecords(student.id,target.id,reason),"Student records merged with history preserved.");}}>Merge</button> : null}</span>
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
            return (
              <article key={course.id}>
                <header>
                  <span>{course.code}</span>
                  <b>{course.credits} credits</b>
                </header>
                <h3>{course.title}</h3>
                <p>{course.description || "No description provided."}</p>
                <footer>
                  <span>{department?.name || "Department"}</span>
                  <small>{course.status}</small>
                </footer>
                {academicManagers.has(role) ? (
                  <button
                    type="button"
                    onClick={() => openEdit("subject", course.id)}
                  >
                    Edit subject
                  </button>
                ) : null}
              </article>
            );
          })}
          <button
            type="button"
            className="add-card"
            onClick={() => setModal("subject")}
          >
            <span>+</span>
            <b>Add a subject</b>
            <small>Code, credits, program, and description</small>
          </button>
        </section>
      ) : null}

      {tab === "sections" ? (
        <section className="section-operations">
          {data.courses.map((course) => (
            <article key={course.sectionId}>
              <header>
                <span>
                  {course.code} · {course.sectionCode}
                </span>
                <b className={course.status}>{course.status}</b>
              </header>
              <h3>{course.title}</h3>
              <p>{course.term}</p>
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
              </div>
              {academicManagers.has(role) ? (
                <button type="button" onClick={() => openSection(course)}>
                  Edit class →
                </button>
              ) : null}
            </article>
          ))}
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
                program: String(form.get("program")),
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
                name="program"
                required
                defaultValue={editingStudent?.program ?? ""}
              >
                <option value="">Select program…</option>
                {data.programs.map((program) => (
                  <option key={program.id} value={program.name}>
                    {program.code} · {program.name}
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
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name}
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
          onClose={() => setModal(null)}
        >
          <ActionForm
            submitLabel={editingSubject ? "Save subject" : "Create subject"}
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () => {
                  const values = {
                    departmentId: String(f.get("departmentId")),
                    programId: String(f.get("programId")),
                    code: String(f.get("code")),
                    title: String(f.get("title")),
                    description: String(f.get("description")),
                    credits: Number(f.get("credits")),
                  };
                  return editingSubject
                    ? updateCatalogCourse(editingSubject.id, {
                        ...values,
                        status: String(f.get("status")),
                      })
                    : createCatalogCourse(values);
                },
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
                defaultValue={editingSubject?.departmentId ?? ""}
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
                defaultValue={editingSubject?.programId ?? ""}
              >
                <option value="">Shared / no program</option>
                {data.programs.map((p) => (
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
                <Field label="Subject">
                  <select name="courseId" required>
                    <option value="">Select subject…</option>
                    {data.catalogCourses
                      .filter((c) => c.status === "active")
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
                {faculty.map((p) => (
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
          <button type="button" onClick={() => setModal("event")}>
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
              const sectionId = String(f.get("sectionId"));
              const audience = String(f.get("audienceRole"));
              void perform(
                () => {
                  const values = {
                    sectionId,
                    ownerProfileId: !sectionId ? currentUser.id : undefined,
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
            <Field label="Class section">
              <select
                name="sectionId"
                defaultValue={editingEvent?.sectionId ?? ""}
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
            </Field>
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
            <Field label="Role audience">
              <select
                name="audienceRole"
                defaultValue={editingEvent?.audienceRoles[0] ?? ""}
              >
                <option value="">Section / personal only</option>
                {data.roles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
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
