import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CurriculumWorkspace } from '@/features/curriculum/CurriculumWorkspace'
import { notifyError, confirmAction, requestText } from '@/lib/decisions'
import { WorkspaceDialog } from '@/components/workspace-dialog'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CheckboxField } from '@/components/form-controls'
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CrmUser } from "../crm/authService";
import {
  createAttendanceSession,
  createCourseAnnouncement,
  createCourseAssessment,
  createLearningMaterial,
  createLearningMaterialPage,
  createLearningModule,
  deleteAttendanceSession,
  deleteCourseAnnouncement,
  deleteCourseAssessment,
  deleteLearningMaterial,
  deleteLearningModule,
  getLmsFileUrl,
  gradeAssignmentSubmission,
  markLearningProgress,
  saveAttendance,
  setLearningModuleStatus,
  submitAssignment,
  uploadLmsFile,
  uploadLearningImage,
  uploadLearningVideo,
  updateLearningModule,
  updateAttendanceSession,
  updateCourseAnnouncement,
  updateCourseAssessment,
  updateLearningMaterial,
  updateLearningMaterialPage,
  deleteLearningMaterialPage,
  requestAttendanceCorrection,
  decideAttendanceCorrection,
  transitionAssignmentSubmission,
} from "./platformRepository";
import type {
  Announcement,
  AttendanceSession,
  LearningMaterial,
  LearningModule,
  PlatformData,
  SchoolAssessment,
  SchoolCourse,
} from "./types";
import { RichTextContent, RichTextEditor } from "./RichTextEditor";

type Toast = (message: string) => void;
type TeacherTab =
  "content" | "curriculum" | "preview" | "assessment" | "submissions" | "attendance" | "announcements";

function dateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "No deadline";
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function attachedFileName(path: string) {
  const stored = path.split("/").at(-1) ?? "attached-file";
  return decodeURIComponent(stored.replace(/^[0-9a-f-]{36}-/i, ""));
}

async function openAttachedFile(path: string) {
  try {
    const url = await getLmsFileUrl(path);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "The attached file could not be opened.");
  }
}

function FormModal({
  title,
  children,
  onClose,
  immersive = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  immersive?: boolean;
}) { return <WorkspaceDialog title={title} immersive={immersive} onClose={onClose}>{children}</WorkspaceDialog>; }

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="lms-empty">
      <span>◇</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function TeacherLmsStudio({
  data,
  currentUser,
  onChanged,
  onToast,
  initialSectionId,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: Toast;
  initialSectionId: string;
}) {
  const [sectionId, setSectionId] = useState(
    data.courses.some((item) => item.sectionId === initialSectionId)
      ? initialSectionId
      : data.courses[0]?.sectionId ?? "",
  );
  const [tab, setTab] = useState<TeacherTab>("content");
  const [modal, setModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const course =
    data.courses.find((item) => item.sectionId === sectionId) ??
    data.courses[0];
  const modules = data.modules
    .filter((item) => item.sectionId === course?.sectionId)
    .sort((a, b) => a.position - b.position);
  const assessments = data.assessments.filter(
    (item) => item.sectionId === course?.sectionId,
  );
  const assignments = assessments.filter((item) =>
    ["assignment", "project"].includes(item.type),
  );
  const submissions = data.submissions.filter((item) =>
    assignments.some((assignment) => assignment.id === item.assessmentId),
  );
  const sessions = data.attendanceSessions.filter(
    (item) => item.sectionId === course?.sectionId,
  );
  const roster = data.students.filter(
    (student) =>
      course?.enrolledProfileIds.includes(student.profileId ?? "") ||
      course?.enrolledStudentIds.includes(student.id),
  );
  const completion = data.progress.filter((item) =>
    modules.some((module) =>
      data.materials.some(
        (material) =>
          material.moduleId === module.id &&
          material.id === item.materialId &&
          item.status === "completed",
      ),
    ),
  ).length;

  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      setModal(null);
      onToast(message);
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "The LMS operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!course)
    return (
      <Empty
        title="No assigned classes"
        text="An academic administrator must assign a section before the course studio can be used."
      />
    );

  return (
    <>
      <section className="lms-hero">
        <div>
          <span>INTEGRATED LEARNING MANAGEMENT</span>
          <h1>Teach, assess, and support—from one class</h1>
          <p>
            Build the learning path, publish materials, collect work, take
            attendance, grade, and communicate without leaving STU Nexus.
          </p>
        </div>
        <NativeSelect
          aria-label="Assigned class"
          value={course.sectionId}
          onChange={(event) => setSectionId(event.target.value)}
        >
          {data.courses.map((item) => (
            <NativeSelectOption key={item.sectionId} value={item.sectionId}>
              {item.code} · {item.sectionCode}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </section>
      <section className="lms-course-head">
        <div>
          <b>{course.code}</b>
          <span>{course.status}</span>
        </div>
        <h2>{course.title}</h2>
        <p>
          {course.sectionCode} · {course.term} · {course.facultyName}
        </p>
        <div>
          <span>
            <strong>{roster.length}</strong> learners
          </span>
          <span>
            <strong>{modules.length}</strong> modules
          </span>
          <span>
            <strong>{assessments.length}</strong> assessments
          </span>
          <span>
            <strong>{completion}</strong> completions
          </span>
        </div>
      </section>
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)}><TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1" aria-label="Course workspaces">
        {(
          [
            ["content", "Content"],
            ["curriculum", "Curriculum"],
            ["preview", "Student view"],
            ["assessment", "Assessments"],
            ["submissions", "Submissions"],
            ["attendance", "Attendance"],
            ["announcements", "Announcements"],
          ] as const
        ).map(([id, label]) => (
          <TabsTrigger
            value={id}
            key={id}
          >
            {label}
            {id === "submissions" && submissions.length ? (
              <i>{submissions.length}</i>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList><TabsContent value={tab} className="min-w-0">

      {tab === "curriculum" ? <CurriculumWorkspace data={data} course={course} currentUser={currentUser} /> : null}

      {tab === "preview" ? (
        <section className="lms-student-preview-workspace">
          <header>
            <div>
              <span>EXACT PUBLISHED VIEW</span>
              <h2>What students can see now</h2>
              <p>Only published modules and published materials appear below. There is no separate copy or synchronization step.</p>
            </div>
            <Button type="button" onClick={() => setTab("content")}>Return to authoring</Button>
          </header>
          <StudentLmsLearning
            data={data}
            currentUser={currentUser}
            onChanged={onChanged}
            onToast={onToast}
            mode="preview"
            initialSectionId={course.sectionId}
          />
        </section>
      ) : null}

      {tab === "content" ? (
        <section className="lms-workspace">
          <header>
            <div>
              <span>CURRICULUM BUILDER</span>
              <h2>Modules and learning materials</h2>
              <p>
                Students see only published modules and materials in this order.
              </p>
            </div>
            <Button type="button" onClick={() => setModal("module")}>
              + New module
            </Button>
          </header>
          {modules.length ? (
            <div className="lms-module-list">
              {modules.map((module) => {
                const materials = data.materials
                  .filter((item) => item.moduleId === module.id)
                  .sort((a, b) => a.position - b.position);
                return (
                  <Card key={module.id}>
                    <header>
                      <i>{String(module.position).padStart(2, "0")}</i>
                      <div>
                        <Button
                          type="button"
                          onClick={() => setModal(`module:${module.id}`)}
                        >
                          Edit
                        </Button>
                        <span className={module.status === "published" ? "lms-visible" : "lms-hidden"}>{module.status === "published" ? "Published module" : "Draft module · hidden from students"}</span>
                        <h3>{module.title}</h3>
                        <p>
                          {module.description || "No module description yet."}
                        </p>
                      </div>
                      <div>
                        <Button
                          type="button"
                          onClick={() =>
                            void perform(
                              () =>
                                setLearningModuleStatus(
                                  module.id,
                                  module.status === "published"
                                    ? "draft"
                                    : "published",
                                ),
                              module.status === "published"
                                ? "Module returned to draft."
                                : "Module published.",
                            )
                          }
                        >
                          {module.status === "published"
                            ? "Unpublish"
                            : "Publish"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setModal(`material:${module.id}`)}
                        >
                          + Material
                        </Button>
                        <Button
                          type="button"
                          onClick={async () => {
                            if (
                              !(await confirmAction(
                                `Delete “${module.title}” and all of its materials?`,
                              ))
                            )
                              return;
                            void perform(
                              () => deleteLearningModule(module.id),
                              "Module deleted.",
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </header>
                    <div className="lms-material-list">
                      {materials.length ? (
                        materials.map((material) => {
                          const unlocked = !module.unlocksAt || new Date(module.unlocksAt) <= new Date();
                          const studentVisible = module.status === "published" && material.status === "published" && unlocked;
                          const visibilityReason = material.status !== "published"
                            ? "Draft material · hidden from students"
                            : module.status !== "published"
                              ? "Published material, but its module is still draft"
                              : !unlocked
                                ? `Scheduled for ${dateTime(module.unlocksAt)}`
                                : "Visible to students now";
                          return <div key={material.id}>
                            <Button type="button" className="lms-material-open" onClick={() => setModal(`preview-material:${material.id}`)} aria-label={`Open lesson ${material.title}`}>
                              <b>{material.type === "file" ? "⇩" : material.type === "video" ? "▶" : material.type === "link" ? "↗" : "☰"}</b>
                              <span><strong>{material.title}</strong><small>{material.minutes} min · {material.required ? "Required" : "Optional"}</small><em className={studentVisible ? "lms-visible" : "lms-hidden"}>{visibilityReason}</em></span>
                            </Button>
                            <div className="lms-material-actions">
                            {material.externalUrl ? (
                              <a
                                href={material.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open ↗
                              </a>
                            ) : null}
                            {material.storagePath ? (
                              <Button
                                type="button"
                                onClick={() =>
                                  void getLmsFileUrl(
                                    material.storagePath!,
                                  ).then((url) => window.open(url, "_blank"))
                                }
                              >
                                Open file
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              onClick={() =>
                                setModal(`edit-material:${material.id}`)
                              }
                            >
                              Edit lesson
                            </Button>
                            <Button type="button" onClick={() => void perform(
                              () => updateLearningMaterial(material.id, {
                                title: material.title,
                                description: material.description,
                                type: material.type,
                                content: material.content,
                                externalUrl: material.externalUrl ?? undefined,
                                storagePath: material.storagePath ?? undefined,
                                minutes: material.minutes,
                                required: material.required,
                                publish: material.status !== "published",
                              }),
                              material.status === "published" ? "Material unpublished and hidden from students." : module.status === "published" ? "Material published and visible to students." : "Material published. Publish its module to make it visible to students.",
                            )}>{material.status === "published" ? "Unpublish" : "Publish for students"}</Button>
                            <Button
                              type="button"
                              onClick={async () => {
                                if (
                                  !(await confirmAction(`Delete “${material.title}”?`))
                                )
                                  return;
                                void perform(
                                  () => deleteLearningMaterial(material.id),
                                  "Material deleted.",
                                );
                              }}
                            >
                              Delete lesson
                            </Button>
                            </div>
                          </div>;
                        })
                      ) : (
                        <Empty
                          title="This module is empty"
                          text="Add a lesson, file, video, link, or learning activity."
                        />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Build the first module"
              text="Organize your course into a clear sequence, then add learning materials inside each module."
            />
          )}
        </section>
      ) : null}

      {tab === "assessment" ? (
        <section className="lms-workspace">
          <header>
            <div>
              <span>ASSESSMENT DESIGN</span>
              <h2>Quizzes, exams, assignments, and projects</h2>
              <p>
                Published work appears automatically in the enrolled student
                experience.
              </p>
            </div>
            <Button type="button" onClick={() => setModal("assessment")}>
              + New assessment
            </Button>
          </header>
          <div className="lms-assessment-grid">
            {assessments.map((item) => (
              <Card key={item.id}>
                <span>{item.type}</span>
                <h3>{item.title}</h3>
                {item.instructions ? (
                  <RichTextContent html={item.instructions} />
                ) : (
                  <p>No instructions.</p>
                )}
                <div>
                  <b>{item.maxScore} pts</b>
                  <small>Due {dateTime(item.dueAt)}</small>
                  <em>{item.status}</em>
                </div>
                <footer className="lms-record-actions">
                  <Button
                    type="button"
                    onClick={() => setModal(`assessment:${item.id}`)}
                  >
                    Edit assessment
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (
                        !(await confirmAction(
                          `Delete “${item.title}”? Existing attempts prevent deletion.`,
                        ))
                      )
                        return;
                      void perform(
                        () => deleteCourseAssessment(item.id),
                        "Assessment deleted.",
                      );
                    }}
                  >
                    Delete
                  </Button>
                  <Button type="button" onClick={()=>setModal(`integrity:${item.id}`)}>
                    Integrity log ({data.assessmentIntegrityEvents.filter((event)=>event.assessmentId===item.id).length})
                  </Button>
                </footer>
              </Card>
            ))}
          </div>
          {!assessments.length ? (
            <Empty
              title="No assessments yet"
              text="Create a quiz, exam, assignment, or project and choose when students can see it."
            />
          ) : null}
        </section>
      ) : null}

      {tab === "submissions" ? (
        <section className="lms-workspace">
          <header>
            <div>
              <span>REVIEW QUEUE</span>
              <h2>Student assignment submissions</h2>
              <p>Open submitted work, return feedback, and record a score.</p>
            </div>
          </header>
          {submissions.length ? (
            <div className="lms-submission-list">
              {submissions.map((submission) => {
                const learner = data.students.find(
                  (item) => item.profileId === submission.profileId,
                );
                const assignment = assignments.find(
                  (item) => item.id === submission.assessmentId,
                );
                return (
                  <Card key={submission.id}>
                    <div>
                      <span>{submission.status}</span>
                      <h3>{learner?.name ?? "Student"}</h3>
                      <p>
                        {assignment?.title} · {learner?.studentNumber}
                      </p>
                    </div>
                    <p>{submission.text || "File submission"}</p>
                    {submission.storagePath ? (
                      <Button
                        type="button"
                        onClick={() =>
                          void getLmsFileUrl(submission.storagePath!).then(
                            (url) => window.open(url, "_blank"),
                          )
                        }
                      >
                        Open attachment
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => setModal(`grade:${submission.id}`)}
                    >
                      {submission.status === "graded"
                        ? `${submission.score} pts · Edit`
                        : "Grade work"}
                    </Button>
                    {submission.status !== "returned" && submission.status !== "voided" ? <Button type="button" onClick={async () => {const reason=(await requestText("Return-for-revision reason (at least 12 characters)"));if(reason) void perform(() => transitionAssignmentSubmission(submission.id,"return",reason),"Submission returned for revision with audit evidence.");}}>Return for revision</Button> : null}
                    {submission.status !== "voided" ? <Button type="button" onClick={async () => {const reason=(await requestText("Void reason (at least 12 characters)"));if(reason) void perform(() => transitionAssignmentSubmission(submission.id,"void",reason),"Submission voided with audit evidence.");}}>Void submission</Button> : null}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Nothing waiting for review"
              text="Student assignment and project submissions will appear here."
            />
          )}
        </section>
      ) : null}

      {tab === "attendance" ? (
        <section className="lms-workspace">
          <header>
            <div>
              <span>CLASS ATTENDANCE</span>
              <h2>Sessions and learner status</h2>
              <p>Create a class meeting, then mark every enrolled learner.</p>
            </div>
            <Button type="button" onClick={() => setModal("attendance")}>
              + Take attendance
            </Button>
          </header>
          {sessions.map((session) => (
            <Card className="lms-attendance-card" key={session.id}>
              <header>
                <div>
                  <span>{session.status}</span>
                  <h3>{session.title}</h3>
                  <p>
                    {dateTime(session.startsAt)}–{dateTime(session.endsAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => setModal(`roll:${session.id}`)}
                >
                  Open roll
                </Button>
                <Button
                  type="button"
                  onClick={() => setModal(`attendance:${session.id}`)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    if (
                      !(await confirmAction(
                        `Delete attendance session “${session.title}” and its marks?`,
                      ))
                    )
                      return;
                    void perform(
                      () => deleteAttendanceSession(session.id),
                      "Attendance session deleted.",
                    );
                  }}
                >
                  Delete
                </Button>
              </header>
              <div>
                {(["present", "late", "absent", "excused"] as const).map(
                  (status) => (
                    <span key={status}>
                      <b>
                        {
                          data.attendanceRecords.filter(
                            (record) =>
                              record.sessionId === session.id &&
                              record.status === status,
                          ).length
                        }
                      </b>
                      {status}
                    </span>
                  ),
                )}
              </div>
            </Card>
          ))}
          {!sessions.length ? (
            <Empty
              title="No attendance sessions"
              text="Create a meeting to start recording present, late, absent, and excused learners."
            />
          ) : null}
          {data.attendanceCorrections.filter((item) => item.status === "pending" && data.attendanceRecords.some((record) => record.id === item.attendanceRecordId && sessions.some((session) => session.id === record.sessionId))).map((request) => {
            const learner=data.profiles.find((item) => item.id === request.studentProfileId);
            return <Card className="lms-attendance-card" key={request.id}><header><div><span>CORRECTION REQUEST</span><h3>{learner?.name ?? "Learner"} requests “{request.requestedStatus}”</h3><p>{request.reason}</p></div><Button type="button" onClick={async () => { const reason=(await requestText("Approval reason (at least 12 characters)")); if (reason) void perform(() => decideAttendanceCorrection({requestId:request.id,approve:true,reason}),"Attendance corrected and audited."); }}>Approve</Button><Button type="button" onClick={async () => { const reason=(await requestText("Rejection reason (at least 12 characters)")); if (reason) void perform(() => decideAttendanceCorrection({requestId:request.id,approve:false,reason}),"Correction request rejected and audited."); }}>Reject</Button></header></Card>;
          })}
        </section>
      ) : null}

      {tab === "announcements" ? (
        <section className="lms-workspace">
          <header>
            <div>
              <span>CLASS COMMUNICATION</span>
              <h2>Announcements</h2>
              <p>Publish time-sensitive instructions to the enrolled class.</p>
            </div>
            <Button type="button" onClick={() => setModal("announcement")}>
              + Announcement
            </Button>
          </header>
          <div className="lms-announcements">
            {data.announcements
              .filter(
                (item) =>
                  !item.sectionId || item.sectionId === course.sectionId,
              )
              .map((item) => (
                <Card key={item.id}>
                  <b>{item.priority}</b>
                  <div>
                    <h3>{item.title}</h3>
                    <RichTextContent html={item.body} />
                    <small>{item.publishedAt}</small>
                  </div>
                  <div className="lms-record-actions">
                    <Button
                      type="button"
                      onClick={() => setModal(`announcement:${item.id}`)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            `Delete announcement “${item.title}”?`,
                          ))
                        )
                          return;
                        void perform(
                          () => deleteCourseAnnouncement(item.id),
                          "Announcement deleted.",
                        );
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        </section>
      ) : null}

      {modal === "module" || modal?.startsWith("module:") ? (
        <ModuleForm
          module={
            modal.includes(":")
              ? (modules.find((item) => item.id === modal.split(":")[1]) ??
                null)
              : null
          }
          sectionId={course.sectionId}
          position={modules.length + 1}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal?.startsWith("material:") ? (
        <MaterialForm
          moduleId={modal.split(":")[1]}
          sectionId={course.sectionId}
          position={
            data.materials.filter(
              (item) => item.moduleId === modal.split(":")[1],
            ).length + 1
          }
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal?.startsWith("edit-material:") ? (
        <MaterialForm
          material={
            data.materials.find((item) => item.id === modal.split(":")[1]) ??
            null
          }
          existingPages={data.materialPages.filter(
            (page) => page.materialId === modal.split(":")[1],
          )}
          moduleId={
            data.materials.find((item) => item.id === modal.split(":")[1])
              ?.moduleId ?? ""
          }
          sectionId={course.sectionId}
          position={
            data.materials.find((item) => item.id === modal.split(":")[1])
              ?.position ?? 1
          }
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal?.startsWith("preview-material:") ? (() => {
        const material=data.materials.find((item)=>item.id===modal.split(":")[1]);
        if(!material) return null;
        const pages=data.materialPages.filter((page)=>page.materialId===material.id).sort((a,b)=>a.position-b.position);
        return <FormModal immersive title={`Student lesson preview · ${material.title}`} onClose={()=>setModal(null)}><div className="lms-teacher-preview lms-immersive-preview"><span>{material.type} · {material.status}</span><h2>{material.title}</h2><p>{material.description}</p>{pages.length ? pages.map((page)=><Card key={page.id}><small>PAGE {page.position}</small><h3>{page.title}</h3><RichTextContent html={page.content} onOpenFile={openAttachedFile} /></Card>) : <RichTextContent html={material.content} onOpenFile={openAttachedFile} />}<footer><Button type="button" onClick={()=>setModal(`edit-material:${material.id}`)}>Edit lesson</Button><Button type="button" onClick={()=>setModal(null)}>Return to course studio</Button></footer></div></FormModal>;
      })() : null}
      {modal === "assessment" || modal?.startsWith("assessment:") ? (
        <AssessmentBuilder
          sectionId={course.sectionId}
          assessment={
            modal.includes(":")
              ? (assessments.find((item) => item.id === modal.split(":")[1]) ??
                null)
              : null
          }
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal?.startsWith("integrity:") ? (()=>{const assessmentId=modal.split(":")[1];const events=data.assessmentIntegrityEvents.filter((event)=>event.assessmentId===assessmentId);return <FormModal title="Assessment integrity evidence" onClose={()=>setModal(null)}><div className="lms-integrity-log"><p>Technical events support human review. They are not automatic misconduct findings.</p>{events.map((event)=>{const student=data.profiles.find((profile)=>profile.id===event.studentProfileId);return <Card key={event.id} className={event.severity}><div><b>{event.eventType.replaceAll("_"," ")}</b><span>{event.severity}</span></div><p>{student?.name??"Student"} · {new Date(event.occurredAt).toLocaleString()}</p><small>{Object.keys(event.details).length?JSON.stringify(event.details):"No additional device detail"}</small></Card>;})}{!events.length?<Empty title="No integrity events" text="Preflight and in-assessment signals will appear here after students begin."/>:null}</div></FormModal>;})() : null}
      {modal?.startsWith("grade:") ? (
        <GradeForm
          id={modal.split(":")[1]}
          maxScore={
            assignments.find(
              (a) =>
                a.id ===
                submissions.find((s) => s.id === modal.split(":")[1])
                  ?.assessmentId,
            )?.maxScore ?? 100
          }
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal === "attendance" || modal?.startsWith("attendance:") ? (
        <AttendanceForm
          sectionId={course.sectionId}
          defaultTitle={`${course.code} class meeting`}
          session={
            modal.includes(":")
              ? (sessions.find((item) => item.id === modal.split(":")[1]) ??
                null)
              : null
          }
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal?.startsWith("roll:") ? (
        <AttendanceRoll
          sessionId={modal.split(":")[1]}
          roster={roster}
          existing={data.attendanceRecords}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      {modal === "announcement" || modal?.startsWith("announcement:") ? (
        <AnnouncementForm
          sectionId={course.sectionId}
          announcement={
            modal.includes(":")
              ? (data.announcements.find(
                  (item) => item.id === modal.split(":")[1],
                ) ?? null)
              : null
          }
          busy={busy}
          onClose={() => setModal(null)}
          onSave={perform}
        />
      ) : null}
      </TabsContent></Tabs>
    </>
  );
}

function ModuleForm({
  module,
  sectionId,
  position,
  busy,
  onClose,
  onSave,
}: {
  module: LearningModule | null;
  sectionId: string;
  position: number;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <FormModal
      title={module ? "Edit learning module" : "Create a learning module"}
      onClose={onClose}
    >
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const values = {
            title: String(f.get("title")),
            description: String(f.get("description")),
          };
          const publish = f.get("publish") === "on";
          void onSave(
            () =>
              module
                ? updateLearningModule(module.id, values)
                : createLearningModule({
                    sectionId,
                    ...values,
                    position,
                    publish,
                  }),
            module ? "Learning module updated." : publish ? "Module published to students." : "Module saved as a draft and hidden from students.",
          );
        }}
      >
        <Label>
          Module title
          <Input
            name="title"
            required
            maxLength={180}
            defaultValue={module?.title}
          />
        </Label>
        <Label>
          Description
          <Textarea
            name="description"
            rows={4}
            maxLength={4000}
            defaultValue={module?.description}
          />
        </Label>
        {!module ? (
          <Label className="check">
            <CheckboxField name="publish" type="checkbox" defaultChecked /> Publish module to students immediately
          </Label>
        ) : null}
        <Button disabled={busy}>
          {module ? "Save module changes" : "Create module"}
        </Button>
      </form>
    </FormModal>
  );
}

function localDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function AttendanceForm({
  sectionId,
  defaultTitle,
  session,
  busy,
  onClose,
  onSave,
}: {
  sectionId: string;
  defaultTitle: string;
  session: AttendanceSession | null;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <FormModal
      title={session ? "Edit attendance session" : "Create attendance session"}
      onClose={onClose}
    >
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const values = {
            title: String(f.get("title")),
            startsAt: String(f.get("startsAt")),
            endsAt: String(f.get("endsAt")),
          };
          void onSave(
            () =>
              session
                ? updateAttendanceSession(session.id, {
                    ...values,
                    status: String(f.get("status")),
                  })
                : createAttendanceSession({ sectionId, ...values }),
            session
              ? "Attendance session updated."
              : "Attendance session opened.",
          );
        }}
      >
        <Label>
          Session title
          <Input
            name="title"
            required
            defaultValue={session?.title ?? defaultTitle}
          />
        </Label>
        <div className="split">
          <Label>
            Starts
            <Input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={localDateTime(session?.startsAt)}
            />
          </Label>
          <Label>
            Ends
            <Input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={localDateTime(session?.endsAt)}
            />
          </Label>
        </div>
        {session ? (
          <Label>
            Status
            <NativeSelect name="status" defaultValue={session.status}>
              <NativeSelectOption value="open">Open</NativeSelectOption>
              <NativeSelectOption value="closed">Closed</NativeSelectOption>
              <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
            </NativeSelect>
          </Label>
        ) : null}
        <Button disabled={busy}>
          {session ? "Save session changes" : "Open attendance"}
        </Button>
      </form>
    </FormModal>
  );
}

function AnnouncementForm({
  sectionId,
  announcement,
  busy,
  onClose,
  onSave,
}: {
  sectionId: string;
  announcement: Announcement | null;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [body, setBody] = useState(announcement?.body ?? "");
  return (
    <FormModal
      title={
        announcement ? "Edit class announcement" : "Publish class announcement"
      }
      onClose={onClose}
    >
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const values = {
            title: String(f.get("title")),
            body,
            priority: String(f.get("priority")),
          };
          void onSave(
            () =>
              announcement
                ? updateCourseAnnouncement(announcement.id, values)
                : createCourseAnnouncement({ sectionId, ...values }),
            announcement ? "Announcement updated." : "Announcement published.",
          );
        }}
      >
        <Label>
          Title
          <Input name="title" required defaultValue={announcement?.title} />
        </Label>
        <Label>
          Message
          <RichTextEditor
            value={body}
            onChange={setBody}
            onImageUpload={(file) => uploadLearningImage(sectionId, file)}
          />
        </Label>
        <Label>
          Priority
          <NativeSelect
            name="priority"
            defaultValue={announcement?.priority ?? "normal"}
          >
            <NativeSelectOption>normal</NativeSelectOption>
            <NativeSelectOption>important</NativeSelectOption>
            <NativeSelectOption>urgent</NativeSelectOption>
          </NativeSelect>
        </Label>
        <Button disabled={busy}>
          {announcement ? "Save announcement changes" : "Publish announcement"}
        </Button>
      </form>
    </FormModal>
  );
}

function MaterialForm({
  material = null,
  existingPages = [],
  moduleId,
  sectionId,
  position,
  busy,
  onClose,
  onSave,
}: {
  material?: LearningMaterial | null;
  existingPages?: PlatformData["materialPages"];
  moduleId: string;
  sectionId: string;
  position: number;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [pages, setPages] = useState(() =>
    existingPages.length
      ? [...existingPages]
          .sort((a, b) => a.position - b.position)
          .map((page) => ({
            id: page.id,
            title: page.title,
            content: page.content,
          }))
      : [{ id: "", title: "Page 1", content: material?.content ?? "" }],
  );
  return (
    <FormModal
      title={material ? `Edit lesson · ${material.title}` : "Create a learning experience"}
      onClose={onClose}
      immersive
    >
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const publish = f.get("publish") === "on";
          void onSave(
            async () => {
              const values = {
                title: String(f.get("title")),
                description: String(f.get("description")),
                type: String(f.get("type")),
                content: pages[0]?.content ?? "",
                externalUrl: material?.externalUrl ?? undefined,
                storagePath: material?.storagePath ?? undefined,
                minutes: Number(f.get("minutes")),
                required: f.get("required") === "on",
                publish,
              };
              const materialId = material
                ? (await updateLearningMaterial(material.id, values),
                  material.id)
                : await createLearningMaterial({
                    ...values,
                    moduleId,
                    position,
                  });
              const keptIds = pages.map((page) => page.id).filter(Boolean);
              await Promise.all(
                existingPages
                  .filter((page) => !keptIds.includes(page.id))
                  .map((page) => deleteLearningMaterialPage(page.id)),
              );
              await Promise.all(
                pages.map((page, index) =>
                  page.id
                    ? updateLearningMaterialPage(page.id, {
                        title: page.title || `Page ${index + 1}`,
                        content: page.content,
                        position: index + 1,
                      })
                    : createLearningMaterialPage({
                        materialId,
                        title: page.title || `Page ${index + 1}`,
                        content: page.content,
                        position: index + 1,
                      }),
                ),
              );
            },
            material
              ? publish ? "Learning material saved and published to students." : "Learning material saved as a draft and hidden from students."
              : publish ? "Learning material published to students." : "Learning material saved as a draft and hidden from students.",
          );
        }}
      >
        <div className="split">
          <Label>
            Material type
            <NativeSelect name="type" defaultValue={material?.type ?? "lesson"}>
              <NativeSelectOption value="lesson">Lesson</NativeSelectOption>
              <NativeSelectOption value="video">Video</NativeSelectOption>
              <NativeSelectOption value="activity">Activity</NativeSelectOption>
              {material && !["lesson", "video", "activity"].includes(material.type) ? <NativeSelectOption value={material.type}>Legacy {material.type}</NativeSelectOption> : null}
            </NativeSelect>
          </Label>
          <Label>
            Estimated minutes
            <Input
              name="minutes"
              type="number"
              min="1"
              max="1440"
              defaultValue={material?.minutes ?? 20}
            />
          </Label>
        </div>
        <Label>
          Title
          <Input name="title" required defaultValue={material?.title} />
        </Label>
        <Label>
          Description
          <Textarea
            name="description"
            rows={2}
            defaultValue={material?.description}
          />
        </Label>
        <section className="lms-page-builder">
          <header>
            <div>
              <b>Lesson pages</b>
              <small>Build a guided, image-rich reading experience.</small>
            </div>
            <Button
              type="button"
              onClick={() =>
                setPages((current) => [
                  ...current,
                  { id: "", title: `Page ${current.length + 1}`, content: "" },
                ])
              }
            >
              Add page
            </Button>
          </header>
          {pages.map((page, index) => (
            <Card key={index}>
              <div>
                <span>PAGE {index + 1}</span>
                <Input
                  value={page.title}
                  onChange={(event) =>
                    setPages((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    )
                  }
                  required
                />
                {pages.length > 1 ? (
                  <Button
                    type="button"
                    onClick={() =>
                      setPages((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <RichTextEditor
                value={page.content}
                onChange={(content) =>
                  setPages((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, content } : item,
                    ),
                  )
                }
                onImageUpload={(file) => uploadLearningImage(sectionId, file)}
                onVideoUpload={(file) => uploadLearningVideo(sectionId, file)}
                onFileUpload={async (file) => ({
                  path: await uploadLmsFile(sectionId, "materials", file),
                  name: file.name,
                  size: fileSize(file.size),
                })}
              />
            </Card>
          ))}
        </section>
        <div className="split">
          <Label className="check">
            <CheckboxField
              name="required"
              type="checkbox"
              defaultChecked={material?.required ?? true}
            />{" "}
            Required
          </Label>
          <Label className="check">
            <CheckboxField
              name="publish"
              type="checkbox"
              defaultChecked={material ? material.status === "published" : true}
            />{" "}
            {material ? "Published to students" : "Publish to students immediately"}
          </Label>
        </div>
        <Button disabled={busy}>
          {material ? "Save material changes" : "Add material"}
        </Button>
      </form>
    </FormModal>
  );
}

type BuilderQuestion = {
  prompt: string;
  points: number;
  choices: string;
  correctOption: number;
  explanation: string;
};

function AssessmentBuilder({
  sectionId,
  assessment = null,
  busy,
  onClose,
  onSave,
}: {
  sectionId: string;
  assessment?: SchoolAssessment | null;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [type, setType] = useState<"quiz" | "exam" | "assignment" | "project">(
    (assessment?.type as "quiz" | "exam" | "assignment" | "project") ??
      "assignment",
  );
  const [instructions, setInstructions] = useState(
    assessment?.instructions ?? "",
  );
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    assessment?.questions.length
      ? assessment.questions.map((question) => ({
          prompt: question.prompt,
          points: question.points,
          choices: question.options.map((option) => option.label).join("\n"),
          correctOption: question.correctOption ?? 1,
          explanation: question.explanation,
        }))
      : [
          {
            prompt: "",
            points: 1,
            choices: "",
            correctOption: 1,
            explanation: "",
          },
        ],
  );
  const objective = type === "quiz" || type === "exam";
  function updateQuestion(index: number, patch: Partial<BuilderQuestion>) {
    setQuestions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }
  return (
    <FormModal
      title={assessment ? "Edit assessment" : "Create an assessment"}
      onClose={onClose}
    >
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const values = {
            sectionId,
            title: String(f.get("title")),
            instructions,
            type,
            dueAt: String(f.get("dueAt")),
            opensAt: String(f.get("opensAt")),
            durationMinutes: Number(f.get("durationMinutes")) || null,
            attemptLimit: Number(f.get("attemptLimit")) || 1,
            maxScore: Number(f.get("maxScore")),
            publish: f.get("publish") === "on",
            releaseExplanations: f.get("releaseExplanations") === "on",
            releaseScoresImmediately: f.get("releaseScoresImmediately") === "on",
            reviewMode: (objective ? String(f.get("reviewMode")) : "score_only") as SchoolAssessment["reviewMode"],
            requireFullscreen: objective && f.get("requireFullscreen") === "on",
            monitorFocus: objective && f.get("monitorFocus") === "on",
            detectExtendedDisplay: objective && f.get("detectExtendedDisplay") === "on",
            requireCamera: objective && f.get("requireCamera") === "on",
            detectMultipleCameras: objective && f.get("detectMultipleCameras") === "on",
            preventCopyPaste: objective && f.get("preventCopyPaste") === "on",
            integrityInstructions: objective ? String(f.get("integrityInstructions")) : "",
            questions: objective
              ? questions.map((question) => ({
                  prompt: question.prompt,
                  points: question.points,
                  options: question.choices
                    .split("\n")
                    .map((choice) => choice.trim())
                    .filter(Boolean),
                  correctOption: question.correctOption,
                  explanation: question.explanation,
                }))
              : [],
          };
          void onSave(
            () =>
              assessment
                ? updateCourseAssessment(assessment.id, values)
                : createCourseAssessment(values),
            assessment
              ? "Assessment updated."
              : "Assessment and protected answer key created.",
          );
        }}
      >
        <div className="split">
          <Label>
            Type
            <NativeSelect
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <NativeSelectOption value="assignment">Assignment</NativeSelectOption>
              <NativeSelectOption value="project">Project</NativeSelectOption>
              <NativeSelectOption value="quiz">Quiz</NativeSelectOption>
              <NativeSelectOption value="exam">Exam</NativeSelectOption>
            </NativeSelect>
          </Label>
          {!objective ? (
            <Label>
              Maximum score
              <Input
                name="maxScore"
                type="number"
                min="1"
                max="10000"
                defaultValue={assessment?.maxScore ?? 100}
                required
              />
            </Label>
          ) : (
            <Label>
              Calculated score
              <Input
                value={questions.reduce(
                  (total, question) => total + question.points,
                  0,
                )}
                readOnly
              />
            </Label>
          )}
        </div>
        <Label>
          Title
          <Input name="title" required defaultValue={assessment?.title} />
        </Label>
        <Label>
          Instructions
          <RichTextEditor value={instructions} onChange={setInstructions} onImageUpload={(file) => uploadLearningImage(sectionId, file)} />
        </Label>
        <Label>
          Opens at
          <Input name="opensAt" type="datetime-local" defaultValue={assessment?.opensAt?.slice(0,16) ?? ""} />
        </Label>
        <div className="split"><Label>Duration in minutes<Input name="durationMinutes" type="number" min="1" max="1440" defaultValue={assessment?.durationMinutes ?? ""} placeholder="Untimed" /></Label><Label>Attempt limit<Input name="attemptLimit" type="number" min="1" max="20" defaultValue={assessment?.attemptLimit ?? 1} required /></Label></div>
        <Label>
          Due date
          <Input
            name="dueAt"
            type="datetime-local"
            defaultValue={assessment?.dueAt?.slice(0, 16) ?? ""}
          />
        </Label>
        {objective ? (
          <section className="lms-question-builder">
            <header>
              <div>
                <b>Objective questions</b>
                <small>Correct answers remain protected from students.</small>
              </div>
              <Button
                type="button"
                onClick={() =>
                  setQuestions((current) => [
                    ...current,
                    {
                      prompt: "",
                      points: 1,
                      choices: "",
                      correctOption: 1,
                      explanation: "",
                    },
                  ])
                }
              >
                + Question
              </Button>
            </header>
            {questions.map((question, index) => {
              const choices = question.choices
                .split("\n")
                .filter((choice) => choice.trim());
              return (
                <Card key={index}>
                  <header>
                    <b>Question {index + 1}</b>
                    {questions.length > 1 ? (
                      <Button
                        type="button"
                        onClick={() =>
                          setQuestions((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </header>
                  <Label>
                    Prompt
                    <Textarea
                      value={question.prompt}
                      onChange={(event) =>
                        updateQuestion(index, { prompt: event.target.value })
                      }
                      rows={2}
                      required
                    />
                  </Label>
                  <div className="split">
                    <Label>
                      Choices, one per line
                      <Textarea
                        value={question.choices}
                        onChange={(event) =>
                          updateQuestion(index, { choices: event.target.value })
                        }
                        rows={4}
                        placeholder={
                          "First choice\nSecond choice\nThird choice"
                        }
                        required
                      />
                    </Label>
                    <div>
                      <Label>
                        Points
                        <Input
                          type="number"
                          min="0.01"
                          max="1000"
                          step="0.01"
                          value={question.points}
                          onChange={(event) =>
                            updateQuestion(index, {
                              points: Number(event.target.value),
                            })
                          }
                        />
                      </Label>
                      <Label>
                        Correct choice
                        <NativeSelect
                          value={question.correctOption}
                          onChange={(event) =>
                            updateQuestion(index, {
                              correctOption: Number(event.target.value),
                            })
                          }
                        >
                          {choices.map((_, choiceIndex) => (
                            <NativeSelectOption key={choiceIndex} value={choiceIndex + 1}>
                              Choice {choiceIndex + 1}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Label>
                    </div>
                  </div>
                  <Label>
                    Explanation (released only when enabled below)
                    <Textarea
                      value={question.explanation}
                      onChange={(event) =>
                        updateQuestion(index, {
                          explanation: event.target.value,
                        })
                      }
                      rows={2}
                    />
                  </Label>
                </Card>
              );
            })}
          </section>
        ) : null}
        <Label className="check">
          <CheckboxField
            name="publish"
            type="checkbox"
            defaultChecked={assessment?.status === "published"}
          />{" "}
          Published
        </Label>
        {objective ? <>
          <section className="lms-assessment-policy">
            <header><div><b>After-submission experience</b><small>Choose exactly what students can revisit after finishing.</small></div></header>
            <Label>Student review access<NativeSelect name="reviewMode" defaultValue={assessment?.reviewMode ?? "score_only"}><NativeSelectOption value="closed">Close the assessment after submission</NativeSelectOption><NativeSelectOption value="score_only">Show released score only</NativeSelectOption><NativeSelectOption value="responses">Show questions and the student’s responses</NativeSelectOption><NativeSelectOption value="full_review">Show responses, correct answers, and released explanations</NativeSelectOption></NativeSelect></Label>
            <div className="split"><Label className="check"><CheckboxField name="releaseScoresImmediately" type="checkbox" defaultChecked={assessment?.releaseScoresImmediately ?? true} /> Release score immediately after submission</Label><Label className="check"><CheckboxField name="releaseExplanations" type="checkbox" defaultChecked={assessment?.releaseExplanations ?? false} /> Release teacher-written explanations in full review</Label></div>
          </section>
          <section className="lms-assessment-policy integrity">
            <header><div><b>Assessment integrity</b><small>Students see every enabled check before they begin. Browser signals are recorded as review evidence—not silently treated as proof of misconduct.</small></div></header>
            <div className="lms-policy-grid">
              <Label className="check"><CheckboxField name="requireFullscreen" type="checkbox" defaultChecked={assessment?.requireFullscreen ?? false} /> Require browser fullscreen</Label>
              <Label className="check"><CheckboxField name="monitorFocus" type="checkbox" defaultChecked={assessment?.monitorFocus ?? false} /> Record tab/window focus changes</Label>
              <Label className="check"><CheckboxField name="detectExtendedDisplay" type="checkbox" defaultChecked={assessment?.detectExtendedDisplay ?? false} /> Check for an extended/multiple display</Label>
              <Label className="check"><CheckboxField name="requireCamera" type="checkbox" defaultChecked={assessment?.requireCamera ?? false} /> Verify camera permission and availability</Label>
              <Label className="check"><CheckboxField name="detectMultipleCameras" type="checkbox" defaultChecked={assessment?.detectMultipleCameras ?? false} /> Report multiple camera devices</Label>
              <Label className="check"><CheckboxField name="preventCopyPaste" type="checkbox" defaultChecked={assessment?.preventCopyPaste ?? false} /> Block copy, cut, paste, and context menu in the assessment</Label>
            </div>
            <Label>Message shown before starting<Textarea name="integrityInstructions" rows={3} maxLength={2000} defaultValue={assessment?.integrityInstructions ?? "Use only the resources permitted by your teacher. Technical signals are reviewed in context and are not automatic misconduct findings."} /></Label>
            <p className="lms-policy-truth">Important: a web browser cannot completely prevent operating-system app switching or guarantee monitor/camera detection on every device. Nexus records supported signals, clearly reports unsupported checks, and leaves decisions to authorized teachers.</p>
          </section>
        </> : null}
        <Button disabled={busy}>
          {assessment ? "Save assessment changes" : `Create ${type}`}
        </Button>
      </form>
    </FormModal>
  );
}

function GradeForm({
  id,
  maxScore,
  busy,
  onClose,
  onSave,
}: {
  id: string;
  maxScore: number;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <FormModal title="Grade submission" onClose={onClose}>
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          void onSave(
            () =>
              gradeAssignmentSubmission(
                id,
                Number(f.get("score")),
                String(f.get("feedback")),
              ),
            "Submission graded and feedback saved.",
          );
        }}
      >
        <Label>
          Score out of {maxScore}
          <Input
            name="score"
            type="number"
            min="0"
            max={maxScore}
            step="0.01"
            required
          />
        </Label>
        <Label>
          Feedback
          <Textarea name="feedback" rows={7} required />
        </Label>
        <Button disabled={busy}>Save grade and feedback</Button>
      </form>
    </FormModal>
  );
}

function AttendanceRoll({
  sessionId,
  roster,
  existing,
  busy,
  onClose,
  onSave,
}: {
  sessionId: string;
  roster: PlatformData["students"];
  existing: PlatformData["attendanceRecords"];
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [marks, setMarks] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      roster.flatMap((student) =>
        student.profileId
          ? [
              [
                student.profileId,
                existing.find(
                  (item) =>
                    item.sessionId === sessionId &&
                    item.profileId === student.profileId,
                )?.status ?? "present",
              ],
            ]
          : [],
      ),
    ),
  );
  return (
    <FormModal title="Mark attendance" onClose={onClose}>
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(
            () =>
              saveAttendance(
                sessionId,
                Object.entries(marks).map(([profileId, status]) => ({
                  profileId,
                  status,
                })),
              ),
            "Attendance saved.",
          );
        }}
      >
        <div className="lms-roll">
          {roster.map((student) =>
            student.profileId ? (
              <Label key={student.id}>
                <span>
                  <b>{student.name}</b>
                  <small>{student.studentNumber}</small>
                </span>
                <NativeSelect
                  value={marks[student.profileId]}
                  onChange={(event) =>
                    setMarks((current) => ({
                      ...current,
                      [student.profileId!]: event.target.value,
                    }))
                  }
                >
                  <NativeSelectOption value="present">Present</NativeSelectOption>
                  <NativeSelectOption value="late">Late</NativeSelectOption>
                  <NativeSelectOption value="absent">Absent</NativeSelectOption>
                  <NativeSelectOption value="excused">Excused</NativeSelectOption>
                </NativeSelect>
              </Label>
            ) : null,
          )}
        </div>
        <Button disabled={busy}>Save complete roll</Button>
      </form>
    </FormModal>
  );
}

export function StudentLmsLearning({
  data,
  currentUser,
  onChanged,
  onToast,
  mode = "student",
  initialSectionId = "",
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: Toast;
  mode?: "student" | "review" | "preview";
  initialSectionId?: string;
}) {
  const learnerMode = mode === "student";
  const publishedView = mode === "student" || mode === "preview";
  const [sectionId, setSectionId] = useState(
    data.courses.some((item) => item.sectionId === initialSectionId)
      ? initialSectionId
      : data.courses.find((course) => data.modules.some((module) => module.sectionId === course.sectionId))?.sectionId
        ?? data.courses[0]?.sectionId
        ?? "",
  );
  const [activeMaterial, setActiveMaterial] = useState<LearningMaterial | null>(
    null,
  );
  const [activePage, setActivePage] = useState(0);
  const [readerFocus, setReaderFocus] = useState(false);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [attendanceCorrectionRecord,setAttendanceCorrectionRecord]=useState<PlatformData["attendanceRecords"][number]|null>(null);
  const course =
    data.courses.find((item) => item.sectionId === sectionId) ??
    data.courses[0];
  const modules = data.modules.filter(
    (item) => item.sectionId === course?.sectionId && (!publishedView || (
      item.status === "published" && (!item.unlocksAt || new Date(item.unlocksAt) <= new Date())
    )),
  );
  const materials = data.materials.filter((item) =>
    modules.some((module) => module.id === item.moduleId) && (!publishedView || item.status === "published"),
  );
  const completed = data.progress.filter(
    (item) =>
      item.profileId === currentUser.id &&
      materials.some((material) => material.id === item.materialId) &&
      item.status === "completed",
  ).length;
  const assignments = data.assessments.filter(
    (item) =>
      item.sectionId === course?.sectionId &&
      ["assignment", "project"].includes(item.type),
  );
  const attendance = data.attendanceRecords.filter(
    (item) =>
      item.profileId === currentUser.id &&
      data.attendanceSessions.some(
        (session) =>
          session.id === item.sessionId &&
          session.sectionId === course?.sectionId,
      ),
  );
  const percent = materials.length
    ? Math.round((completed / materials.length) * 100)
    : 0;
  const materialPages = activeMaterial
    ? data.materialPages
        .filter((page) => page.materialId === activeMaterial.id)
        .sort((a, b) => a.position - b.position)
    : [];
  const displayedPage = materialPages[activePage];
  const activeMaterialIndex = materials.findIndex((item)=>item.id===activeMaterial?.id);
  const nextMaterial = activeMaterialIndex >= 0 ? materials[activeMaterialIndex + 1] : materials[0];

  useEffect(() => {
    const visibleModules=data.modules.filter((item)=>item.sectionId===sectionId && (!publishedView || (item.status === "published" && (!item.unlocksAt || new Date(item.unlocksAt) <= new Date()))));
    const first=data.materials.filter((item)=>visibleModules.some((module)=>module.id===item.moduleId) && (!publishedView || item.status === "published")).sort((a,b)=>a.position-b.position)[0] ?? null;
    setActiveMaterial(first);
    setActivePage(0);
  }, [sectionId, data.materials, data.modules, publishedView]);

  if (!course)
    return (
      <Empty
        title={learnerMode ? "No enrolled courses" : "No visible courses"}
        text={learnerMode ? "Your learning modules will appear after enrollment is completed." : "Live course sections will appear here when this role can access them."}
      />
    );
  return (
    <>
      <section className="lms-student-hero">
        <div>
          <span>{learnerMode ? "MY LEARNING" : mode === "preview" ? "STUDENT VIEW PREVIEW" : "LIVE LEARNING LIBRARY"}</span>
          <h1>{course.title}</h1>
          <p>
            {course.code} · {course.sectionCode} · {course.facultyName}
          </p>
        </div>
        <NativeSelect
          aria-label="Assigned class"
          value={course.sectionId}
          onChange={(event) => setSectionId(event.target.value)}
        >
          {data.courses.map((item) => (
            <NativeSelectOption key={item.sectionId} value={item.sectionId}>
              {item.code} · {item.sectionCode}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {learnerMode ? <div
          className="lms-progress-ring"
          style={{ "--progress": `${percent * 3.6}deg` } as CSSProperties}
        >
          <b>{percent}%</b>
          <small>complete</small>
        </div> : <div className="lms-progress-ring lms-library-count"><b>{materials.length}</b><small>{mode === "preview" ? "student-visible" : "materials"}</small></div>}
      </section>
      <section className="lms-student-stats">
        {learnerMode ? <><span>
          <b>
            {completed}/{materials.length}
          </b>{" "}
          materials completed
        </span>
        <span>
          <b>
            {
              assignments.filter((item) =>
                data.submissions.some(
                  (submission) =>
                    submission.assessmentId === item.id &&
                    submission.profileId === currentUser.id,
                ),
              ).length
            }
            /{assignments.length}
          </b>{" "}
          assignments submitted
        </span>
        <span>
          <b>
            {attendance.filter((item) => item.status === "present").length}/
            {attendance.length}
          </b>{" "}
          sessions present
        </span></> : mode === "preview" ? <><span><b>{modules.length}</b> published modules</span><span><b>{materials.length}</b> student-visible materials</span><span><b>{data.materials.filter((item)=>data.modules.some((module)=>module.sectionId===course.sectionId&&module.id===item.moduleId)&&item.status!=="published").length}</b> drafts hidden</span></> : <><span><b>{modules.length}</b> live modules</span><span><b>{materials.filter((item)=>item.status === "published").length}</b> published materials</span><span><b>{materials.filter((item)=>item.status !== "published").length}</b> drafts visible to this role</span></>}
      </section>
      {learnerMode ? <section className="lms-workspace">
        <header><div><span>MY ATTENDANCE</span><h2>Attendance records and corrections</h2><p>Review each class record and request a documented correction when needed.</p></div></header>
        {attendance.map((record) => {
          const session=data.attendanceSessions.find((item) => item.id === record.sessionId);
          const pending=data.attendanceCorrections.find((item) => item.attendanceRecordId === record.id && item.status === "pending");
          return <Card className="lms-attendance-card" key={record.id}><header><div><span>{record.status}</span><h3>{session?.title ?? "Class session"}</h3><p>{session ? dateTime(session.startsAt) : ""}{record.notes ? ` · ${record.notes}` : ""}</p></div>{pending ? <b>Correction pending: {pending.requestedStatus}</b> : <Button type="button" onClick={() => setAttendanceCorrectionRecord(record)}>Request correction</Button>}</header></Card>;
        })}
        {!attendance.length ? <Empty title="No attendance records" text="Your class attendance appears here after a teacher records a session." /> : null}
      </section> : null}
      <div className={`lms-learning-layout${readerFocus ? " reader-focus" : ""}`}>
        <aside aria-label="Course outline">
          <div className="lms-outline-heading"><span>COURSE OUTLINE</span><h2>Lessons and materials</h2><p>Select any lesson to open it.</p></div>
          {modules.map((module) => (
            <section key={module.id}>
              <header>
                <i>{module.position}</i>
                <div>
                  <b>{module.title}</b>
                  <small>
                    {
                      data.materials.filter(
                        (item) => item.moduleId === module.id,
                      ).length
                    }{" "}
                    materials
                  </small>
                </div>
              </header>
              {data.materials
                .filter((item) => item.moduleId === module.id)
                .map((material) => {
                  const done = data.progress.some(
                    (item) =>
                      item.materialId === material.id &&
                      item.profileId === currentUser.id &&
                      item.status === "completed",
                  );
                  return (
                    <Button
                      type="button"
                      key={material.id}
                      className={
                        activeMaterial?.id === material.id ? "active" : ""
                      }
                      aria-current={activeMaterial?.id === material.id ? "page" : undefined}
                      onClick={() => {
                        setActiveMaterial(material);
                        setActivePage(0);
                        if (learnerMode) void markLearningProgress(material.id, done).then(onChanged);
                      }}
                    >
                      <span>{learnerMode ? (done ? "✓" : "○") : (material.status === "published" ? "●" : "◐")}</span>
                      <div>
                        <b>{material.title}</b>
                        <small>
                          {material.type} · {material.minutes} min
                        </small>
                      </div>
                    </Button>
                  );
                })}
            </section>
          ))}
        </aside>
        <main>
          {activeMaterial ? (
            <Card className="lms-reader">
              <header className="lms-reader-toolbar"><span>IMMERSIVE LESSON</span><Button type="button" onClick={()=>setReaderFocus((value)=>!value)}>{readerFocus ? "Show course outline" : "Wide reading view"}</Button></header>
              <span>
                {activeMaterial.type} ·{" "}
                {activeMaterial.required ? "Required" : "Optional"}
              </span>
              <h2>{activeMaterial.title}</h2>
              <p className="lead">{activeMaterial.description}</p>
              {materialPages.length ? (
                <>
                  <nav className="lms-page-nav" aria-label="Lesson pages">
                    {materialPages.map((page, index) => (
                      <Button
                        type="button"
                        key={page.id}
                        className={index === activePage ? "active" : ""}
                        onClick={() => setActivePage(index)}
                      >
                        <span>{index + 1}</span>
                        {page.title}
                      </Button>
                    ))}
                  </nav>
                  <div className="lms-page-document">
                    <small>
                      PAGE {activePage + 1} OF {materialPages.length}
                    </small>
                    <h3>{displayedPage?.title}</h3>
                    <RichTextContent html={displayedPage?.content ?? ""} onOpenFile={openAttachedFile} />
                    <footer>
                      <Button
                        type="button"
                        disabled={activePage === 0}
                        onClick={() =>
                          setActivePage((page) => Math.max(0, page - 1))
                        }
                      >
                        ← Previous
                      </Button>
                      <Button
                        type="button"
                        disabled={activePage === materialPages.length - 1}
                        onClick={() =>
                          setActivePage((page) =>
                            Math.min(materialPages.length - 1, page + 1),
                          )
                        }
                      >
                        Next →
                      </Button>
                    </footer>
                  </div>
                </>
              ) : (
                <RichTextContent html={activeMaterial.content} onOpenFile={openAttachedFile} />
              )}
              {activeMaterial.storagePath ? (
                <Button
                  type="button"
                  className="lms-file-attachment lms-legacy-attachment"
                  onClick={() => void openAttachedFile(activeMaterial.storagePath!)}
                >
                  <span aria-hidden="true">↧</span><strong>{attachedFileName(activeMaterial.storagePath)}</strong><small>Attached file</small>
                </Button>
              ) : null}
              {learnerMode ? <Button
                type="button"
                className="complete"
                onClick={() =>
                  void markLearningProgress(activeMaterial.id, true).then(
                    () => {
                      onToast("Material marked complete.");
                      onChanged();
                    },
                  )
                }
              >
                ✓ Mark complete
              </Button> : null}
              {nextMaterial ? <Button type="button" className="lms-next-lesson" onClick={()=>{setActiveMaterial(nextMaterial);setActivePage(0);}}>Next lesson: {nextMaterial.title} →</Button> : null}
            </Card>
          ) : (
            <Empty
              title={modules.length ? "Choose a learning material" : "No learning content yet"}
              text={modules.length ? "Open a lesson from the course path to begin or continue learning." : "This live course section does not have a visible module or lesson yet."}
            />
          )}
          {learnerMode ? <section className="lms-student-assignments">
            <header>
              <h3>Assignments and projects</h3>
            </header>
            {assignments.map((item) => {
              const submission = data.submissions.find(
                (entry) =>
                  entry.assessmentId === item.id &&
                  entry.profileId === currentUser.id,
              );
              return (
                <Card key={item.id}>
                  <div>
                    <span>{submission?.status ?? item.status}</span>
                    <h4>{item.title}</h4>
                    <p>
                      Due {dateTime(item.dueAt)} · {item.maxScore} points
                    </p>
                    {submission?.feedback ? (
                      <blockquote>{submission.feedback}</blockquote>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    onClick={() => setAssignmentId(item.id)}
                  >
                    {submission ? "View / resubmit" : "Submit work"}
                  </Button>
                </Card>
              );
            })}
          </section> : null}
        </main>
      </div>
      {learnerMode && assignmentId ? (
        <StudentSubmission
          assessment={assignments.find((item) => item.id === assignmentId)!}
          course={course}
          busy={false}
          onClose={() => setAssignmentId(null)}
          onSave={async (action, message) => {
            try {
              await action();
              setAssignmentId(null);
              onToast(message);
              onChanged();
            } catch (error) {
              onToast(
                error instanceof Error ? error.message : "Submission failed.",
              );
            }
          }}
        />
      ) : null}
      {learnerMode&&attendanceCorrectionRecord?<FormModal title="Request attendance correction" onClose={()=>setAttendanceCorrectionRecord(null)}><form className="lms-form" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);void requestAttendanceCorrection({attendanceRecordId:attendanceCorrectionRecord.id,studentProfileId:currentUser.id,requestedStatus:String(form.get("requestedStatus")) as "present"|"absent"|"late"|"excused",reason:String(form.get("reason"))}).then(()=>{setAttendanceCorrectionRecord(null);onToast("Attendance correction requested.");onChanged();}).catch((error:unknown)=>onToast(error instanceof Error?error.message:"Correction request failed."));}}><Label>Requested status<NativeSelect name="requestedStatus" required defaultValue={attendanceCorrectionRecord.status}><NativeSelectOption value="present">Present</NativeSelectOption><NativeSelectOption value="late">Late</NativeSelectOption><NativeSelectOption value="absent">Absent</NativeSelectOption><NativeSelectOption value="excused">Excused</NativeSelectOption></NativeSelect></Label><Label>Reason<Textarea name="reason" required minLength={12} maxLength={1000} rows={5} placeholder="Explain the evidence for this correction."/></Label><Button>Submit correction request</Button></form></FormModal>:null}
    </>
  );
}

function StudentSubmission({
  assessment,
  course,
  busy,
  onClose,
  onSave,
}: {
  assessment: PlatformData["assessments"][number];
  course: SchoolCourse;
  busy: boolean;
  onClose: () => void;
  onSave: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <FormModal title={`Submit: ${assessment.title}`} onClose={onClose}>
      <form
        className="lms-form"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const file = f.get("file") as File;
          void onSave(
            () =>
              submitAssignment({
                assessmentId: assessment.id,
                sectionId: course.sectionId,
                text: String(f.get("text")),
                file: file?.size ? file : undefined,
              }),
            "Your work was submitted successfully.",
          );
        }}
      >
        <p>{assessment.instructions}</p>
        <Label>
          Written response
          <Textarea name="text" rows={10} />
        </Label>
        <Label>
          Attachment
          <Input name="file" type="file" />
        </Label>
        <small>
          Submitting again replaces the current response. Keep your own copy of
          uploaded work.
        </small>
        <Button disabled={busy}>Submit assignment</Button>
      </form>
    </FormModal>
  );
}
