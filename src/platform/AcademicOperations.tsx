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
} from "./platformRepository";
import type {
  PlatformData,
  PlatformRole,
  ScheduleEvent,
  SchoolCourse,
} from "./types";

type AcademicTab =
  | "overview"
  | "students"
  | "subjects"
  | "sections"
  | "enrollment";
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

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      onToast(success);
      setModal(null);
      setEditingSection(null);
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

  return (
    <>
      <section className="academic-command-bar">
        <div>
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
              </article>
            ))}
          </section>
        </>
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
                {student.profileId ? "Connected" : "SIS only"}
              </span>
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
                        void perform(
                          () =>
                            manageSectionEnrollment(
                              selectedSectionId,
                              student!.id,
                              event.target.value,
                            ),
                          `Enrollment changed to ${event.target.value}.`,
                        )
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
          title="Create student account"
          description="Creates a confirmed portal identity and its linked academic record. The temporary password is never stored."
          onClose={() => setModal(null)}
        >
          <ActionForm
            submitLabel="Create student"
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void perform(
                () =>
                  createStudentAccount({
                    email: String(form.get("email")),
                    password: String(form.get("password")),
                    fullName: String(form.get("fullName")),
                    preferredName: String(form.get("preferredName")),
                    studentNumber: String(form.get("studentNumber")),
                    program: String(form.get("program")),
                    yearLevel: String(form.get("yearLevel")),
                    phone: String(form.get("phone")),
                    advisorId: String(form.get("advisorId")),
                  }),
                "Student account and academic record created.",
              );
            }}
          >
            <Field label="Full name">
              <input name="fullName" required maxLength={120} />
            </Field>
            <Field label="Preferred name">
              <input name="preferredName" maxLength={120} />
            </Field>
            <Field label="Student number">
              <input
                name="studentNumber"
                required
                maxLength={32}
                placeholder="STU-2026-0001"
              />
            </Field>
            <Field label="Email">
              <input name="email" required type="email" maxLength={254} />
            </Field>
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
            <Field label="Program">
              <select name="program" required>
                <option value="">Select program…</option>
                {data.programs.map((program) => (
                  <option key={program.id} value={program.name}>
                    {program.code} · {program.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year level">
              <select name="yearLevel" required>
                <option>1st Year</option>
                <option>2nd Year</option>
                <option>3rd Year</option>
                <option>4th Year</option>
                <option>Graduate</option>
              </select>
            </Field>
            <Field label="Advisor">
              <select name="advisorId">
                <option value="">Unassigned</option>
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" maxLength={40} />
            </Field>
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "department" ? (
        <Modal
          title="Add department"
          description="Creates an academic home for programs, subjects, and departmental leadership."
          onClose={() => setModal(null)}
        >
          <ActionForm
            submitLabel="Create department"
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () =>
                  createDepartment({
                    code: String(f.get("code")),
                    name: String(f.get("name")),
                    description: String(f.get("description")),
                    headId: String(f.get("headId")),
                  }),
                "Department created.",
              );
            }}
          >
            <Field label="Code">
              <input name="code" required maxLength={20} />
            </Field>
            <Field label="Name">
              <input name="name" required maxLength={120} />
            </Field>
            <Field label="Department head">
              <select name="headId">
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
              <textarea name="description" rows={4} maxLength={1000} />
            </Field>
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "program" ? (
        <Modal
          title="Add academic program"
          description="Defines a credential pathway inside an existing department."
          onClose={() => setModal(null)}
        >
          <ActionForm
            submitLabel="Create program"
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () =>
                  createProgram({
                    departmentId: String(f.get("departmentId")),
                    code: String(f.get("code")),
                    name: String(f.get("name")),
                    level: String(f.get("level")),
                    durationYears: Number(f.get("durationYears")),
                    description: String(f.get("description")),
                  }),
                "Academic program created.",
              );
            }}
          >
            <Field label="Department">
              <select name="departmentId" required>
                <option value="">Select department…</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Program code">
              <input name="code" required maxLength={30} />
            </Field>
            <Field label="Program name">
              <input name="name" required maxLength={160} />
            </Field>
            <Field label="Level">
              <select name="level" required>
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
                defaultValue="4"
                required
              />
            </Field>
            <Field label="Description" wide>
              <textarea name="description" rows={4} maxLength={1500} />
            </Field>
          </ActionForm>
        </Modal>
      ) : null}

      {modal === "term" ? (
        <Modal
          title="Add academic term"
          description="Defines teaching and enrollment dates for course delivery."
          onClose={() => setModal(null)}
        >
          <ActionForm
            submitLabel="Create term"
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () =>
                  createAcademicTerm({
                    code: String(f.get("code")),
                    name: String(f.get("name")),
                    startsOn: String(f.get("startsOn")),
                    endsOn: String(f.get("endsOn")),
                    enrollmentStartsOn: String(f.get("enrollmentStartsOn")),
                    enrollmentEndsOn: String(f.get("enrollmentEndsOn")),
                    status: String(f.get("status")),
                  }),
                "Academic term created.",
              );
            }}
          >
            <Field label="Code">
              <input
                name="code"
                required
                maxLength={30}
                placeholder="2027-SPRING"
              />
            </Field>
            <Field label="Name">
              <input name="name" required maxLength={120} />
            </Field>
            <Field label="Teaching starts">
              <input name="startsOn" type="date" required />
            </Field>
            <Field label="Teaching ends">
              <input name="endsOn" type="date" required />
            </Field>
            <Field label="Enrollment starts">
              <input name="enrollmentStartsOn" type="date" />
            </Field>
            <Field label="Enrollment ends">
              <input name="enrollmentEndsOn" type="date" />
            </Field>
            <Field label="Status">
              <select name="status">
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
          title="Add subject"
          description="Creates a reusable catalog subject before class sections are opened."
          onClose={() => setModal(null)}
        >
          <ActionForm
            submitLabel="Create subject"
            busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void perform(
                () =>
                  createCatalogCourse({
                    departmentId: String(f.get("departmentId")),
                    programId: String(f.get("programId")),
                    code: String(f.get("code")),
                    title: String(f.get("title")),
                    description: String(f.get("description")),
                    credits: Number(f.get("credits")),
                  }),
                "Subject added to the catalog.",
              );
            }}
          >
            <Field label="Department">
              <select name="departmentId" required>
                <option value="">Select department…</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Program">
              <select name="programId">
                <option value="">Shared / no program</option>
                {data.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject code">
              <input name="code" required maxLength={30} placeholder="IM204" />
            </Field>
            <Field label="Title">
              <input name="title" required maxLength={180} />
            </Field>
            <Field label="Credits">
              <input
                name="credits"
                type="number"
                min="0.5"
                max="30"
                step="0.5"
                defaultValue="3"
                required
              />
            </Field>
            <Field label="Description" wide>
              <textarea name="description" rows={5} maxLength={2000} />
            </Field>
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
          title="Add schedule event"
          description="Class, exam, and meeting events are checked for room, teacher, learner, and academic-term conflicts."
          onClose={() => setModal(null)}
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
                () =>
                  createScheduleEvent({
                    sectionId,
                    ownerProfileId: !sectionId ? currentUser.id : undefined,
                    title: String(f.get("title")),
                    description: String(f.get("description")),
                    eventType,
                    startsAt: new Date(String(f.get("startsAt"))).toISOString(),
                    endsAt: new Date(String(f.get("endsAt"))).toISOString(),
                    location: String(f.get("location")),
                    audienceRoles: audience ? [audience as PlatformRole] : [],
                  }),
                "Schedule event created without conflicts.",
              );
            }}
          >
            <Field label="Event type">
              <select name="eventType" required>
                <option value="class">Class</option>
                <option value="exam">Exam</option>
                <option value="deadline">Deadline</option>
                <option value="meeting">Meeting</option>
                <option value="campus">Campus event</option>
                <option value="personal">Personal</option>
              </select>
            </Field>
            <Field label="Class section">
              <select name="sectionId">
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
              <input name="title" required maxLength={180} />
            </Field>
            <Field label="Location">
              <input name="location" maxLength={160} />
            </Field>
            <Field label="Starts">
              <input name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="Ends">
              <input name="endsAt" type="datetime-local" required />
            </Field>
            <Field label="Role audience">
              <select name="audienceRole">
                <option value="">Section / personal only</option>
                {data.roles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" wide>
              <textarea name="description" rows={4} maxLength={2000} />
            </Field>
          </ActionForm>
        </Modal>
      ) : null}
    </>
  );
}
