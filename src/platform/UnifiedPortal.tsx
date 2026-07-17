import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import CRMApp from "../crm/CRMApp";
import { clearCrmDataSnapshot } from "../crm/crmRepository";
import type { CrmUser } from "../crm/authService";
import { askSchoolAssistant, scanGradeSheet } from "./platformAi";
import {
  appendChatMessage,
  assignPlatformRole,
  clearPlatformDataSnapshot,
  createAttendanceSession,
  createChatThread,
  createCourseAnnouncement,
  createCourseAssessment,
  createLearningMaterial,
  createLearningModule,
  getPlatformDataSnapshot,
  loadChatMessages,
  loadPlatformDataCached,
  publishGrade,
  recordGradeScan,
  saveReviewedScan,
  submitAssessment,
  updatePlatformProfile,
  updateGradeRecord,
} from "./platformRepository";
import type {
  AssessmentAttemptResult,
  ChatMessage,
  GradeScanResult,
  PlatformData,
  PlatformRole,
  PortalSection,
  SchoolAiAction,
  SchoolAssessment,
  SchoolCourse,
} from "./types";
import { AcademicOperations, ScheduleOperations } from "./AcademicOperations";
import { StudentLmsLearning, TeacherLmsStudio } from "./LmsWorkspace";
import { RichTextContent, RichTextEditor } from "./RichTextEditor";
import "./platform.css";

type PortalView = PortalSection | "crm";

const leadershipRoles = new Set<PlatformRole>([
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
  "registrar",
  "department_head",
]);
const teachingRoles = new Set<PlatformRole>([
  "owner",
  "admin",
  "dean",
  "department_head",
  "faculty",
]);
const crmRoles = new Set<PlatformRole>([
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
  "registrar",
  "department_head",
  "faculty",
  "advisor",
  "admissions",
  "finance",
  "support",
  "librarian",
]);

const roleNames: Record<PlatformRole, string> = {
  owner: "Platform Owner",
  admin: "Administrator",
  president: "President",
  vice_president: "Vice President",
  dean: "Dean",
  registrar: "Registrar",
  department_head: "Department Head",
  faculty: "Teacher / Faculty",
  advisor: "Academic Advisor",
  admissions: "Admissions Officer",
  finance: "Finance Officer",
  support: "Student Support",
  librarian: "Librarian",
  student: "Student",
};

const navMeta: Record<PortalView, { label: string; icon: string }> = {
  home: { label: "My Day", icon: "⌂" },
  academics: { label: "Academic Office", icon: "▦" },
  learning: { label: "Learning", icon: "◫" },
  teaching: { label: "Teaching", icon: "✎" },
  assessments: { label: "Assessments", icon: "✓" },
  grades: { label: "Grades", icon: "▤" },
  schedule: { label: "Schedule", icon: "◷" },
  people: { label: "People & Roles", icon: "◎" },
  crm: { label: "Learner Support", icon: "◇" },
};

function navigationFor(role: PlatformRole): PortalView[] {
  if (role === "student")
    return ["home", "learning", "assessments", "grades", "schedule"];
  if (role === "faculty")
    return [
      "home",
      "teaching",
      "learning",
      "assessments",
      "grades",
      "schedule",
      "crm",
    ];
  if (leadershipRoles.has(role))
    return [
      "home",
      "academics",
      "teaching",
      "learning",
      "assessments",
      "grades",
      "schedule",
      "people",
      "crm",
    ];
  return [
    "home",
    "learning",
    "schedule",
    ...(crmRoles.has(role) ? ["crm" as const] : []),
  ];
}

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function Pill({
  children,
  tone = "teal",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`school-pill ${tone}`}>{children}</span>;
}

function PortalLoading() {
  return (
    <div className="school-loading">
      <span>樹</span>
      <strong>Building your school day</strong>
      <p>Loading the work your role is allowed to see…</p>
    </div>
  );
}

function UnifiedPortal({
  currentUser,
  onSignOut,
}: {
  currentUser: CrmUser;
  onSignOut: () => void;
}) {
  const [data, setData] = useState<PlatformData | null>(() =>
    getPlatformDataSnapshot(currentUser.id),
  );
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<PortalView>("home");
  const [previewRole, setPreviewRole] = useState<PlatformRole>(
    currentUser.role,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      setData(await loadPlatformDataCached(currentUser.id, true));
      setLoadError("");
    } catch (error) {
      if (!silent && !getPlatformDataSnapshot(currentUser.id)) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "The platform could not be loaded.",
        );
      } else {
        setToast(
          "Could not sync the latest updates. Showing your saved workspace.",
        );
      }
    }
  }, [currentUser.id]);

  useEffect(() => {
    void refresh(Boolean(getPlatformDataSnapshot(currentUser.id)));
  }, [currentUser.id, refresh]);

  function signOut() {
    clearPlatformDataSnapshot();
    clearCrmDataSnapshot();
    onSignOut();
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const effectiveRole = currentUser.isOwner ? previewRole : currentUser.role;
  const navigation = navigationFor(effectiveRole);

  useEffect(() => {
    if (!navigation.includes(view)) setView("home");
  }, [navigation, view]);

  const showingCrm = view === "crm" && crmRoles.has(effectiveRole);

  if (!data && !loadError) return <PortalLoading />;
  if (!data)
    return (
      <div className="school-loading error">
        <span>!</span>
        <strong>Unable to load STU Nexus</strong>
        <p>{loadError}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );

  return (
    <>
      <div className="school-shell" hidden={showingCrm}>
        <aside className={`school-sidebar ${sidebarOpen ? "open" : ""}`}>
          <a className="school-brand" href="/">
            <span>樹</span>
            <div>
              <b>STU NEXUS</b>
              <small>One School · One Platform</small>
            </div>
          </a>
          <div className="school-role-card">
            <span>{currentUser.initials}</span>
            <div>
              <b>{currentUser.name}</b>
              <small>{roleNames[currentUser.role]}</small>
            </div>
            {currentUser.isOwner ? <i>OWNER</i> : null}
          </div>
          <nav>
            <p>YOUR WORKSPACE</p>
            {navigation.map((item) => (
              <button
                key={item}
                type="button"
                className={view === item ? "active" : ""}
                onClick={() => {
                  setView(item);
                  setSidebarOpen(false);
                }}
              >
                <i>{navMeta[item].icon}</i>
                <span>{navMeta[item].label}</span>
                {item === "assessments" && data.assessments.length ? (
                  <b>{data.assessments.length}</b>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="school-sidebar-foot">
            <button type="button" onClick={() => setAssistantOpen(true)}>
              ✦ <span>Ask Nexus AI</span>
            </button>
            <div>
              <span className="live-dot" />
              <p>
                <b>Production connected</b>
                <small>Supabase RLS active</small>
              </p>
            </div>
          </div>
        </aside>
        {sidebarOpen ? (
          <button
            className="school-nav-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <main className="school-main">
          <header className="school-topbar">
            <button
              className="school-menu"
              type="button"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div className="school-breadcrumb">
              <span>STU Nexus</span>
              <b>/</b>
              <strong>{navMeta[view].label}</strong>
            </div>
            <div className="school-top-actions">
              {currentUser.isOwner ? (
                <label className="role-preview">
                  <span>View as</span>
                  <select
                    value={previewRole}
                    onChange={(event) =>
                      setPreviewRole(event.target.value as PlatformRole)
                    }
                  >
                    {data.roles.map((role) => (
                      <option key={role.code} value={role.code}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="school-alert"
                title="Notifications"
              >
                ♢<b>{data.announcements.length}</b>
              </button>
              <button type="button" className="school-user" onClick={signOut}>
                {currentUser.initials}
                <span>Sign out</span>
              </button>
            </div>
          </header>

          {currentUser.isOwner && effectiveRole !== "owner" ? (
            <div className="preview-banner">
              <span>OWNER PREVIEW</span>
              <p>
                You are safely previewing the{" "}
                <strong>{roleNames[effectiveRole]}</strong> interface. Your
                database permissions remain owner-level for auditing.
              </p>
              <button type="button" onClick={() => setPreviewRole("owner")}>
                Exit preview
              </button>
            </div>
          ) : null}

          <div className="school-content">
            {view === "home" ? (
              <HomeView
                data={data}
                role={effectiveRole}
                user={currentUser}
                onNavigate={setView}
                onAsk={() => setAssistantOpen(true)}
              />
            ) : null}
            {view === "academics" ? (
              <AcademicsView
                data={data}
                currentUser={currentUser}
                onChanged={() => void refresh(true)}
                onToast={setToast}
              />
            ) : null}
            {view === "learning" ? (
              effectiveRole === "student" ? (
                <StudentLmsLearning
                  data={data}
                  currentUser={currentUser}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                />
              ) : (
                <LearningView data={data} role={effectiveRole} />
              )
            ) : null}
            {view === "teaching" ? (
              <TeacherLmsStudio
                data={data}
                currentUser={currentUser}
                onChanged={() => void refresh(true)}
                onToast={setToast}
              />
            ) : null}
            {view === "assessments" ? (
              <AssessmentsView
                data={data}
                role={effectiveRole}
                onComplete={(message) => {
                  setToast(message);
                  void refresh(true);
                }}
              />
            ) : null}
            {view === "grades" ? (
              <GradesView
                data={data}
                role={effectiveRole}
                currentUser={currentUser}
                onChanged={() => void refresh(true)}
                onToast={setToast}
              />
            ) : null}
            {view === "schedule" ? (
              <ScheduleView
                data={data}
                currentUser={currentUser}
                onChanged={() => void refresh(true)}
                onToast={setToast}
              />
            ) : null}
            {view === "people" ? (
              <PeopleView
                data={data}
                currentUser={currentUser}
                onChanged={() => void refresh(true)}
                onToast={setToast}
              />
            ) : null}
          </div>
        </main>

        <SchoolAssistant
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          data={data}
          view={view}
          onDataChanged={() => void refresh(true)}
        />
        {toast ? (
          <div className="school-toast">
            <span>✓</span>
            {toast}
          </div>
        ) : null}
        <button
          className="school-ai-fab"
          type="button"
          onClick={() => setAssistantOpen(true)}
        >
          ✦<span>Ask Nexus</span>
        </button>
      </div>
      {crmRoles.has(effectiveRole) ? (
        <div className="crm-bridge" hidden={!showingCrm}>
          <div className="crm-bridge-bar">
            <button type="button" onClick={() => setView("home")}>
              ← Back to School OS
            </button>
            <span>STU Nexus · Learner Support</span>
            {currentUser.isOwner ? (
              <Pill tone="owner">Owner workspace</Pill>
            ) : null}
          </div>
          <CRMApp currentUser={currentUser} onSignOut={signOut} />
        </div>
      ) : null}
    </>
  );
}

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="school-page-intro">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}

function HomeView({
  data,
  role,
  user,
  onNavigate,
  onAsk,
}: {
  data: PlatformData;
  role: PlatformRole;
  user: CrmUser;
  onNavigate: (view: PortalView) => void;
  onAsk: () => void;
}) {
  const greeting =
    role === "student"
      ? "Ready for your next learning step?"
      : role === "faculty"
        ? "Your classes are organized and ready."
        : "The whole university, in one clear view.";
  const upcoming = data.schedule.slice(0, 3);
  const roleDefinition = data.roles.find((item) => item.code === role);
  return (
    <>
      <PageIntro
        eyebrow={`${roleNames[role].toUpperCase()} WORKSPACE`}
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={greeting}
        action={
          <button className="school-primary" type="button" onClick={onAsk}>
            ✦ Ask Nexus AI
          </button>
        }
      />
      <section className="school-hero">
        <div>
          <Pill tone={role === "owner" ? "owner" : "teal"}>
            {role === "owner" ? "Protected platform owner" : roleNames[role]}
          </Pill>
          <h2>
            {role === "student"
              ? "Learn, practice, and stay on track."
              : role === "faculty"
                ? "Teach with clarity. Grade with confidence."
                : "Every role aligned around student success."}
          </h2>
          <p>
            {roleDefinition?.description ||
              "Your role-aware workspace brings together the information and actions you need."}
          </p>
          <div>
            {roleDefinition?.capabilities.slice(0, 4).map((capability) => (
              <span key={capability}>✓ {capability.replaceAll("_", " ")}</span>
            ))}
          </div>
        </div>
        <div className="school-hero-orbit">
          <span>STU</span>
          <i />
          <i />
          <i />
          <b>ONE</b>
        </div>
      </section>
      <section className="school-stat-grid">
        <article>
          <span>COURSES</span>
          <strong>{data.courses.length}</strong>
          <p>
            {role === "student"
              ? "available to your learning view"
              : "visible within your authority"}
          </p>
        </article>
        <article>
          <span>ASSESSMENTS</span>
          <strong>{data.assessments.length}</strong>
          <p>published or managed in your scope</p>
        </article>
        <article>
          <span>UPCOMING</span>
          <strong>{data.schedule.length}</strong>
          <p>classes, deadlines, and campus events</p>
        </article>
        <article>
          <span>ANNOUNCEMENTS</span>
          <strong>{data.announcements.length}</strong>
          <p>current messages for your role</p>
        </article>
      </section>
      <section className="school-home-grid">
        <article className="school-card next-events">
          <header>
            <div>
              <span>UP NEXT</span>
              <h3>Your schedule</h3>
            </div>
            <button type="button" onClick={() => onNavigate("schedule")}>
              Full calendar →
            </button>
          </header>
          {upcoming.length ? (
            upcoming.map((event) => (
              <div key={event.id}>
                <time>{formatMoment(event.startsAt)}</time>
                <span className={`event-icon ${event.type}`}>◷</span>
                <p>
                  <b>{event.title}</b>
                  <small>{event.location}</small>
                </p>
              </div>
            ))
          ) : (
            <div className="school-empty">
              No upcoming events are visible for this role.
            </div>
          )}
        </article>
        <article className="school-card announcement-feed">
          <header>
            <div>
              <span>SCHOOL PULSE</span>
              <h3>Announcements</h3>
            </div>
          </header>
          {data.announcements.slice(0, 3).map((item) => (
            <div key={item.id}>
              <Pill tone={item.priority === "urgent" ? "coral" : "blue"}>
                {item.priority}
              </Pill>
              <p>
                <b>{item.title}</b>
                <span>{item.body}</span>
                <small>{item.publishedAt}</small>
              </p>
            </div>
          ))}
        </article>
      </section>
    </>
  );
}

function AcademicsView({
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
  return (
    <>
      <PageIntro
        eyebrow="ACADEMIC OPERATING SYSTEM"
        title="Academic Office"
        description="One catalog for departments, programs, terms, courses, sections, and institutional delivery."
      />
      <AcademicOperations
        data={data}
        currentUser={currentUser}
        onChanged={onChanged}
        onToast={onToast}
      />
    </>
  );
}

function CourseTile({
  course,
  onClick,
  active,
}: {
  course: SchoolCourse;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`course-tile ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div>
        <span>{course.code}</span>
        <Pill tone="blue">{course.modality}</Pill>
      </div>
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <footer>
        <span>{course.facultyName}</span>
        <small>{course.room}</small>
      </footer>
    </button>
  );
}

function LearningView({
  data,
  role,
}: {
  data: PlatformData;
  role: PlatformRole;
}) {
  const [sectionId, setSectionId] = useState(data.courses[0]?.sectionId ?? "");
  const course =
    data.courses.find((item) => item.sectionId === sectionId) ??
    data.courses[0];
  const [topicId, setTopicId] = useState("");
  const topics = data.topics.filter(
    (topic) => topic.sectionId === course?.sectionId,
  );
  const topic = topics.find((item) => item.id === topicId) ?? topics[0];
  return (
    <>
      <PageIntro
        eyebrow={role === "student" ? "MY LEARNING" : "LEARNING EXPERIENCE"}
        title="Courses and topics"
        description={
          role === "student"
            ? "Everything you need to learn, practice, and prepare—organized by course."
            : "Review the student learning experience and verified course content."
        }
      />
      <div className="learning-layout">
        <aside>
          {data.courses.map((item) => (
            <CourseTile
              key={item.sectionId}
              course={item}
              active={item.sectionId === course?.sectionId}
              onClick={() => {
                setSectionId(item.sectionId);
                setTopicId("");
              }}
            />
          ))}
        </aside>
        <section>
          {course ? (
            <>
              <div className="course-banner">
                <div>
                  <span>
                    {course.code} · SECTION {course.sectionCode}
                  </span>
                  <h2>{course.title}</h2>
                  <p>
                    {course.term} · {course.facultyName}
                  </p>
                </div>
                <b>
                  {topics.length}
                  <small>topics</small>
                </b>
              </div>
              <div className="topic-workspace">
                <nav>
                  {topics.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={item.id === topic?.id ? "active" : ""}
                      onClick={() => setTopicId(item.id)}
                    >
                      <i>{String(item.position).padStart(2, "0")}</i>
                      <span>
                        <b>{item.title}</b>
                        <small>
                          {item.minutes} min ·{" "}
                          {item.published ? "Published" : "Draft"}
                        </small>
                      </span>
                    </button>
                  ))}
                </nav>
                {topic ? (
                  <article className="topic-reader">
                    <Pill tone="teal">Topic {topic.position}</Pill>
                    <h2>{topic.title}</h2>
                    <p className="topic-summary">{topic.summary}</p>
                    {topic.content
                      .split("\n")
                      .filter(Boolean)
                      .map((line, index) =>
                        line.startsWith("#") ? (
                          <h3 key={`${line}-${index}`}>
                            {line.replace(/^#+\s*/, "")}
                          </h3>
                        ) : line.startsWith("- ") ? (
                          <li key={`${line}-${index}`}>{line.slice(2)}</li>
                        ) : (
                          <p key={`${line}-${index}`}>
                            {line.replaceAll("**", "")}
                          </p>
                        ),
                      )}
                  </article>
                ) : (
                  <div className="school-empty">
                    No published topics are available.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="school-empty">
              No courses are visible for this role yet.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function AssessmentsView({
  data,
  role,
  onComplete,
}: {
  data: PlatformData;
  role: PlatformRole;
  onComplete: (message: string) => void;
}) {
  const [active, setActive] = useState<SchoolAssessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const learnerMode = role === "student";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!active || submitting) return;
    setSubmitting(true);
    try {
      const submission = active.questions.map((question) =>
        question.type === "short_answer"
          ? { questionId: question.id, text: answers[question.id] ?? "" }
          : { questionId: question.id, optionId: answers[question.id] },
      );
      const response = await submitAssessment(active.id, submission);
      setResult(response);
      onComplete(`Assessment scored: ${response.score} / ${response.maxScore}`);
    } catch (error) {
      onComplete(
        error instanceof Error
          ? error.message
          : "Assessment submission failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow={learnerMode ? "PRACTICE & CHECK" : "ASSESSMENT OPERATIONS"}
        title="Assessments"
        description={
          learnerMode
            ? "Complete published quizzes and receive immediate, explainable feedback."
            : "Preview and review assessments with protected answer keys and deterministic scoring."
        }
      />
      <section className="assessment-list">
        {data.assessments.map((assessment) => {
          const course = data.courses.find(
            (item) => item.sectionId === assessment.sectionId,
          );
          return (
            <article key={assessment.id}>
              <header>
                <span>{course?.code || "COURSE"}</span>
                <Pill
                  tone={assessment.status === "published" ? "teal" : "amber"}
                >
                  {assessment.status}
                </Pill>
              </header>
              <h3>{assessment.title}</h3>
              {assessment.instructions ? (
                <RichTextContent html={assessment.instructions} />
              ) : (
                <p>No instructions provided.</p>
              )}
              <div>
                <span>◷ {assessment.durationMinutes ?? "Untimed"} min</span>
                <span>↻ {assessment.attemptLimit} attempts</span>
                <span>✓ {assessment.maxScore} points</span>
              </div>
              <footer>
                <small>Due {formatDate(assessment.dueAt)}</small>
                <button
                  type="button"
                  onClick={() => {
                    setActive(assessment);
                    setAnswers({});
                    setResult(null);
                  }}
                >
                  {learnerMode ? "Start assessment →" : "Preview assessment →"}
                </button>
              </footer>
            </article>
          );
        })}
      </section>
      {active ? (
        <div className="quiz-layer">
          <button
            className="quiz-backdrop"
            type="button"
            aria-label="Close assessment"
            onClick={() => setActive(null)}
          />
          <section className="quiz-panel">
            <header>
              <div>
                <span>ASSESSMENT</span>
                <h2>{active.title}</h2>
                {active.instructions ? (
                  <RichTextContent html={active.instructions} />
                ) : (
                  <p>No instructions provided.</p>
                )}
              </div>
              <button type="button" onClick={() => setActive(null)}>
                ×
              </button>
            </header>
            {result ? (
              <div className="quiz-result">
                <span>✓</span>
                <h2>
                  {result.score} / {result.maxScore}
                </h2>
                <p>
                  {result.status === "needs_review"
                    ? "Objective answers were scored. A teacher will review the remaining response."
                    : "Your answers were checked against the protected answer key."}
                </p>
                <div>
                  {active.questions.map((question) => (
                    <article key={question.id}>
                      <b>
                        {question.position}. {question.prompt}
                      </b>
                      <p>{question.explanation}</p>
                    </article>
                  ))}
                </div>
                <button type="button" onClick={() => setActive(null)}>
                  Return to assessments
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                {active.questions.map((question) => (
                  <fieldset key={question.id}>
                    <legend>
                      <span>{question.position}</span>
                      {question.prompt}
                      <small>
                        {question.points} point
                        {question.points === 1 ? "" : "s"}
                      </small>
                    </legend>
                    {question.type === "short_answer" ? (
                      <input
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder="Type a concise answer"
                        required
                      />
                    ) : (
                      <div className="quiz-options">
                        {question.options.map((option) => (
                          <label key={option.id}>
                            <input
                              type="radio"
                              name={question.id}
                              value={option.id}
                              checked={answers[question.id] === option.id}
                              onChange={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: option.id,
                                }))
                              }
                              required
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ))}
                <footer>
                  <span>
                    {Object.keys(answers).length} of {active.questions.length}{" "}
                    answered
                  </span>
                  <button type="submit" disabled={submitting}>
                    {submitting ? "Checking answers…" : "Submit and check →"}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function GradesView({
  data,
  role,
  currentUser,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  role: PlatformRole;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const teacherMode = teachingRoles.has(role);
  const [gradeItemId, setGradeItemId] = useState(data.gradeItems[0]?.id ?? "");
  const [scan, setScan] = useState<GradeScanResult | null>(null);
  const [scanJobId, setScanJobId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [editingGradeId, setEditingGradeId] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const selectedItem =
    data.gradeItems.find((item) => item.id === gradeItemId) ??
    data.gradeItems[0];
  const selectedCourse = data.courses.find(
    (course) => course.sectionId === selectedItem?.sectionId,
  );
  const previewStudent = data.students[0];
  const studentGrades =
    currentUser.role === "student"
      ? data.grades.filter((grade) => grade.profileId === currentUser.id)
      : data.grades.filter(
          (grade) =>
            grade.studentId === previewStudent?.id &&
            grade.status === "published",
        );

  async function handleScan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedItem || !selectedCourse) return;
    setScanning(true);
    setScan(null);
    try {
      const result = await scanGradeSheet(
        file,
        `${selectedCourse.code} · ${selectedItem.title}`,
        selectedItem.maxScore,
        data.students.filter((student) =>
          selectedCourse.enrolledStudentIds.includes(student.id),
        ),
      );
      const jobId = await recordGradeScan(
        selectedCourse.sectionId,
        selectedItem.id,
        file.name,
        result,
      );
      setScan(result);
      setScanJobId(jobId);
      onToast("Grade candidates extracted. Review is required before saving.");
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "The grade sheet could not be scanned.",
      );
    } finally {
      setScanning(false);
      event.target.value = "";
    }
  }

  async function approveScan() {
    if (!scan || !scanJobId || !selectedItem) return;
    try {
      const count = await saveReviewedScan(scanJobId, scan, data.students);
      onToast(
        `${count} reviewed grade${count === 1 ? "" : "s"} saved as drafts.`,
      );
      setScan(null);
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Reviewed grades could not be saved.",
      );
    }
  }

  if (!teacherMode)
    return (
      <>
        <PageIntro
          eyebrow="MY ACADEMIC RECORD"
          title="Grades and feedback"
          description="Only your own published grades appear here. Draft and teacher-review records remain private."
        />
        {currentUser.isOwner ? (
          <div className="student-preview-note">
            Preview learner:{" "}
            <strong>
              {previewStudent?.name || "No demonstration learner"}
            </strong>
          </div>
        ) : null}
        <section className="student-grade-grid">
          {studentGrades.length ? (
            studentGrades.map((grade) => {
              const item = data.gradeItems.find(
                (entry) => entry.id === grade.gradeItemId,
              );
              const course = data.courses.find(
                (entry) => entry.sectionId === item?.sectionId,
              );
              const percentage = item
                ? Math.round((grade.score / item.maxScore) * 100)
                : 0;
              return (
                <article key={grade.id}>
                  <header>
                    <span>{course?.code}</span>
                    <Pill tone="teal">published</Pill>
                  </header>
                  <h3>{item?.title}</h3>
                  <div className="grade-score">
                    <strong>{grade.score}</strong>
                    <span>
                      / {item?.maxScore}
                      <small>
                        {percentage}% · {grade.letterGrade}
                      </small>
                    </span>
                  </div>
                  {grade.feedback ? (
                    <RichTextContent html={grade.feedback} />
                  ) : (
                    <p>No feedback yet.</p>
                  )}
                </article>
              );
            })
          ) : (
            <div className="school-empty">
              No published grades are available yet.
            </div>
          )}
        </section>
      </>
    );

  const itemGrades = data.grades.filter(
    (grade) => grade.gradeItemId === selectedItem?.id,
  );
  const roster = data.students.filter((student) =>
    selectedCourse?.enrolledStudentIds.includes(student.id),
  );
  return (
    <>
      <PageIntro
        eyebrow="TEACHER GRADEBOOK"
        title="Grades and AI scan review"
        description="Review the class record, scan handwritten or printed grade sheets, and publish only after human confirmation."
        action={
          <label
            className={`school-primary upload-button ${scanning ? "disabled" : ""}`}
          >
            {scanning ? "Scanning image…" : "▣ Scan grade sheet"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={scanning}
              onChange={(event) => void handleScan(event)}
            />
          </label>
        }
      />
      <div className="grade-controls">
        <label>
          <span>Grade item</span>
          <select
            value={selectedItem?.id ?? ""}
            onChange={(event) => {
              setGradeItemId(event.target.value);
              setScan(null);
            }}
          >
            {data.gradeItems.map((item) => {
              const course = data.courses.find(
                (entry) => entry.sectionId === item.sectionId,
              );
              return (
                <option key={item.id} value={item.id}>
                  {course?.code} · {item.title} ({item.maxScore})
                </option>
              );
            })}
          </select>
        </label>
        <div>
          <span>HUMAN REVIEW</span>
          <b>AI never publishes grades</b>
        </div>
      </div>
      <section className="school-card gradebook">
        <header>
          <div>
            <span>
              {selectedCourse?.code || "COURSE"} · {selectedItem?.category}
            </span>
            <h3>{selectedItem?.title}</h3>
          </div>
          <Pill tone="blue">{selectedItem?.weight}% weight</Pill>
        </header>
        <div className="gradebook-head">
          <span>Student</span>
          <span>Score</span>
          <span>Grade</span>
          <span>Status</span>
          <span />
        </div>
        {roster.map((student) => {
          const grade = itemGrades.find(
            (item) => item.studentId === student.id,
          );
          return (
            <div className="gradebook-row" key={student.id}>
              <span>
                <b>{student.name}</b>
                <small>{student.studentNumber}</small>
              </span>
              <strong>
                {grade ? `${grade.score} / ${selectedItem?.maxScore}` : "—"}
              </strong>
              <span>{grade?.letterGrade || "Pending"}</span>
              <Pill
                tone={
                  grade?.status === "published"
                    ? "teal"
                    : grade?.status === "reviewed"
                      ? "blue"
                      : "amber"
                }
              >
                {grade?.status || "not graded"}
              </Pill>
              {grade ? (
                <div className="grade-row-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGradeId(grade.id);
                      setGradeFeedback(grade.feedback);
                    }}
                  >
                    Edit
                  </button>
                  {grade.status !== "published" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void publishGrade(grade.id)
                          .then(() => {
                            onToast("Grade published to the student portal.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            onToast(
                              error instanceof Error
                                ? error.message
                                : "Grade could not be published.",
                            ),
                          )
                      }
                    >
                      Publish
                    </button>
                  ) : null}
                </div>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </section>
      {scan ? (
        <section className="scan-review">
          <header>
            <div>
              <span>AI EXTRACTION · REVIEW REQUIRED</span>
              <h3>{scan.rows.length} candidate grades</h3>
              <p>
                Overall confidence {Math.round(scan.overallConfidence * 100)}%.
                Low-confidence or unmatched rows will not be saved.
              </p>
            </div>
            <button type="button" onClick={() => void approveScan()}>
              Approve reviewed drafts →
            </button>
          </header>
          {scan.warnings.length ? (
            <div className="scan-warnings">
              {scan.warnings.map((warning) => (
                <span key={warning}>! {warning}</span>
              ))}
            </div>
          ) : null}
          <div className="scan-table">
            <div>
              <span>Student number</span>
              <span>Name</span>
              <span>Score</span>
              <span>Confidence</span>
              <span>Review note</span>
            </div>
            {scan.rows.map((row, index) => (
              <div
                key={`${row.studentNumber}-${index}`}
                className={row.confidence < 0.6 ? "low-confidence" : ""}
              >
                <span>{row.studentNumber || "Unmatched"}</span>
                <span>{row.studentName}</span>
                <strong>{row.score ?? "Unreadable"}</strong>
                <span>{Math.round(row.confidence * 100)}%</span>
                <small>{row.notes}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {editingGradeId
        ? (() => {
            const grade = data.grades.find(
              (item) => item.id === editingGradeId,
            );
            const item = data.gradeItems.find(
              (entry) => entry.id === grade?.gradeItemId,
            );
            if (!grade) return null;
            return (
              <div className="academic-modal-layer">
                <button
                  type="button"
                  className="academic-modal-backdrop"
                  aria-label="Close grade editor"
                  onClick={() => setEditingGradeId("")}
                />
                <section
                  className="academic-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Edit grade"
                >
                  <header>
                    <div>
                      <span>TEACHER GRADEBOOK</span>
                      <h2>Edit {grade.studentName}'s grade</h2>
                      <p>
                        Correct the score, letter grade, feedback, and
                        publication state.
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditingGradeId("")}>
                      ×
                    </button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      void updateGradeRecord(grade.id, {
                        score: Number(f.get("score")),
                        letterGrade: String(f.get("letterGrade")),
                        feedback: gradeFeedback,
                        status: String(f.get("status")) as
                          "draft" | "reviewed" | "published",
                      })
                        .then(() => {
                          setEditingGradeId("");
                          onToast("Grade updated.");
                          onChanged();
                        })
                        .catch((error: unknown) =>
                          onToast(
                            error instanceof Error
                              ? error.message
                              : "Grade update failed.",
                          ),
                        );
                    }}
                  >
                    <div className="academic-form-grid">
                      <label>
                        <span>Score out of {item?.maxScore}</span>
                        <input
                          name="score"
                          type="number"
                          min="0"
                          max={item?.maxScore ?? 100}
                          step="0.01"
                          required
                          defaultValue={grade.score}
                        />
                      </label>
                      <label>
                        <span>Letter grade</span>
                        <input
                          name="letterGrade"
                          maxLength={8}
                          defaultValue={grade.letterGrade}
                        />
                      </label>
                      <label>
                        <span>Status</span>
                        <select name="status" defaultValue={grade.status}>
                          <option value="draft">Draft</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="published">Published</option>
                        </select>
                      </label>
                      <label className="wide">
                        <span>Feedback</span>
                        <RichTextEditor
                          value={gradeFeedback}
                          onChange={setGradeFeedback}
                        />
                      </label>
                    </div>
                    <footer>
                      <button
                        type="button"
                        onClick={() => setEditingGradeId("")}
                      >
                        Cancel
                      </button>
                      <button type="submit">Save grade changes</button>
                    </footer>
                  </form>
                </section>
              </div>
            );
          })()
        : null}
    </>
  );
}

function ScheduleView({
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
  const grouped = useMemo(
    () =>
      data.schedule.reduce<Record<string, typeof data.schedule>>(
        (result, event) => {
          const key = new Intl.DateTimeFormat("en", {
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(new Date(event.startsAt));
          (result[key] ??= []).push(event);
          return result;
        },
        {},
      ),
    [data.schedule],
  );
  return (
    <>
      <PageIntro
        eyebrow="ONE CALENDAR"
        title="Schedule"
        description="Classes, exams, deadlines, meetings, and campus events—filtered automatically for your role."
      />
      <ScheduleOperations
        data={data}
        currentUser={currentUser}
        onChanged={onChanged}
        onToast={onToast}
      />
      <div className="schedule-layout">
        <section>
          {Object.entries(grouped).map(([day, events]) => (
            <article key={day}>
              <header>
                <span>{day}</span>
                <b>
                  {events.length} event{events.length === 1 ? "" : "s"}
                </b>
              </header>
              {events.map((event) => (
                <div key={event.id}>
                  <time>
                    <b>
                      {new Intl.DateTimeFormat("en", {
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(event.startsAt))}
                    </b>
                    <small>
                      {new Intl.DateTimeFormat("en", {
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(event.endsAt))}
                    </small>
                  </time>
                  <i className={event.type} />
                  <p>
                    <b>{event.title}</b>
                    <span>{event.description}</span>
                    <small>⌖ {event.location}</small>
                  </p>
                  <Pill tone="blue">{event.type}</Pill>
                </div>
              ))}
            </article>
          ))}
        </section>
        <aside>
          <span>CALENDAR HEALTH</span>
          <h3>This role sees {data.schedule.length} relevant events</h3>
          <p>
            Section enrollment, teaching assignments, personal ownership, and
            role audiences are evaluated by database policy.
          </p>
          <div>
            {["class", "exam", "deadline", "meeting", "campus"].map((type) => (
              <span key={type}>
                <i className={type} />
                {type}
                <b>
                  {data.schedule.filter((event) => event.type === type).length}
                </b>
              </span>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

function PeopleView({
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
  const [changing, setChanging] = useState("");
  const [editingProfileId, setEditingProfileId] = useState("");
  const editingProfile =
    data.profiles.find((profile) => profile.id === editingProfileId) ?? null;

  async function changeRole(profileId: string, role: PlatformRole) {
    setChanging(profileId);
    try {
      await assignPlatformRole(
        profileId,
        role,
        `Role updated by ${currentUser.email} from the People & Roles workspace.`,
      );
      onToast(
        "Role updated and written to the audit trail. The user must refresh their session.",
      );
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "The role could not be updated.",
      );
    } finally {
      setChanging("");
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="ROLE HIERARCHY & GOVERNANCE"
        title="People and permissions"
        description="Every provisioned identity receives a clear school role. Supabase policies enforce access even if the interface is bypassed."
      />
      <section className="owner-protection">
        <span>{currentUser.initials}</span>
        <div>
          <Pill tone="owner">PROTECTED OWNER</Pill>
          <h2>{currentUser.name}</h2>
          <p>
            {currentUser.email} is the immutable root steward. Ordinary
            administrators cannot demote, replace, or create a second owner.
          </p>
        </div>
        <b>
          100<small>authority level</small>
        </b>
      </section>
      <section className="people-directory school-card">
        <header>
          <div>
            <span>ACTIVE IDENTITIES</span>
            <h3>Role assignments</h3>
          </div>
        </header>
        {data.profiles.map((profile) => (
          <div key={profile.id}>
            <span>
              {profile.name
                .split(/\s+/)
                .slice(0, 2)
                .map((item) => item[0])
                .join("")}
            </span>
            <p>
              <b>{profile.name}</b>
              <small>
                {profile.jobTitle ||
                  profile.department ||
                  roleNames[profile.role]}
              </small>
            </p>
            {profile.isOwner ? (
              <Pill tone="owner">Protected owner</Pill>
            ) : (
              <select
                value={profile.role}
                disabled={changing === profile.id}
                onChange={(event) =>
                  void changeRole(
                    profile.id,
                    event.target.value as PlatformRole,
                  )
                }
              >
                {data.roles
                  .filter((role) => role.code !== "owner")
                  .map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setEditingProfileId(profile.id)}
            >
              Edit profile
            </button>
          </div>
        ))}
      </section>
      <section className="role-hierarchy">
        {["ownership", "leadership", "academic", "operations", "learner"].map(
          (category) => (
            <div key={category}>
              <header>{category}</header>
              {data.roles
                .filter((role) => role.category === category)
                .map((role) => (
                  <article key={role.code}>
                    <span>{role.level}</span>
                    <div>
                      <h3>{role.name}</h3>
                      <p>{role.description}</p>
                      <div>
                        {role.capabilities.map((item) => (
                          <small key={item}>{item.replaceAll("_", " ")}</small>
                        ))}
                      </div>
                    </div>
                    <b>
                      {
                        data.profiles.filter(
                          (profile) => profile.role === role.code,
                        ).length
                      }
                      <small>assigned</small>
                    </b>
                  </article>
                ))}
            </div>
          ),
        )}
      </section>
      {editingProfile ? (
        <div className="academic-modal-layer">
          <button
            type="button"
            className="academic-modal-backdrop"
            aria-label="Close dialog"
            onClick={() => setEditingProfileId("")}
          />
          <section
            className="academic-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile"
          >
            <header>
              <div>
                <span>PEOPLE & PERMISSIONS</span>
                <h2>Edit {editingProfile.name}</h2>
                <p>
                  Update directory information. Trusted role changes remain a
                  separate audited action.
                </p>
              </div>
              <button type="button" onClick={() => setEditingProfileId("")}>
                ×
              </button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                setChanging(editingProfile.id);
                void updatePlatformProfile(editingProfile.id, {
                  fullName: String(f.get("fullName")),
                  department: String(f.get("department")),
                  jobTitle: String(f.get("jobTitle")),
                })
                  .then(() => {
                    onToast("Profile updated.");
                    setEditingProfileId("");
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Profile update failed.",
                    ),
                  )
                  .finally(() => setChanging(""));
              }}
            >
              <div className="academic-form-grid">
                <label>
                  <span>Full name</span>
                  <input
                    name="fullName"
                    required
                    defaultValue={editingProfile.name}
                  />
                </label>
                <label>
                  <span>Department</span>
                  <input
                    name="department"
                    defaultValue={editingProfile.department}
                  />
                </label>
                <label>
                  <span>Job title</span>
                  <input
                    name="jobTitle"
                    defaultValue={editingProfile.jobTitle}
                  />
                </label>
              </div>
              <footer>
                <span>Authorization is not changed by this form.</span>
                <button disabled={changing === editingProfile.id}>
                  {changing ? "Saving…" : "Save profile changes"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function SchoolAssistant({
  open,
  onClose,
  data,
  view,
  onDataChanged,
}: {
  open: boolean;
  onClose: () => void;
  data: PlatformData;
  view: PortalView;
  onDataChanged: () => void;
}) {
  const [threadId, setThreadId] = useState(data.threads[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<SchoolAiAction | null>(
    null,
  );

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    void loadChatMessages(threadId)
      .then(setMessages)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Conversation history is unavailable.",
        ),
      );
  }, [threadId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt = message.trim();
    if (!prompt || loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      let activeThread = threadId;
      if (!activeThread) {
        const created = await createChatThread(prompt.slice(0, 70));
        activeThread = created.id;
        setThreadId(created.id);
        onDataChanged();
      }
      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        threadId: activeThread,
        role: "user",
        content: prompt,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      await appendChatMessage(activeThread, "user", prompt);
      const answer = await askSchoolAssistant(prompt, messages, { view, data });
      setPendingAction(answer.proposedAction);
      await appendChatMessage(
        activeThread,
        "assistant",
        answer.answer,
        answer.citations,
      );
      setMessages([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          threadId: activeThread,
          role: "assistant",
          content: answer.answer,
          citations: answer.citations,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Nexus AI could not answer.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction || loading) return;
    const action = pendingAction;
    const course = data.courses.find(
      (item) => item.sectionId === action.sectionId,
    );
    const module = data.modules.find((item) => item.id === action.moduleId);
    if (action.type !== "create_material" && !course) {
      setError(
        "That course is no longer available. Ask Nexus to prepare the change again.",
      );
      return;
    }
    if (
      action.type === "create_material" &&
      (!module || module.sectionId !== action.sectionId)
    ) {
      setError(
        "That learning module is no longer available. Ask Nexus to prepare the change again.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (action.type === "create_module")
        await createLearningModule({
          sectionId: action.sectionId!,
          title: action.title,
          description: action.description,
          position:
            data.modules.filter((item) => item.sectionId === action.sectionId)
              .length + 1,
          publish: action.publish,
        });
      if (action.type === "create_material")
        await createLearningMaterial({
          moduleId: action.moduleId!,
          title: action.title,
          description: action.description,
          type: action.materialType ?? "lesson",
          content: action.content,
          externalUrl: action.externalUrl ?? undefined,
          position:
            data.materials.filter((item) => item.moduleId === action.moduleId)
              .length + 1,
          minutes: Math.max(1, Math.min(1440, action.minutes ?? 20)),
          required: action.required ?? true,
          publish: action.publish,
        });
      if (action.type === "create_assessment")
        await createCourseAssessment({
          sectionId: action.sectionId!,
          title: action.title,
          instructions: action.content || action.description,
          type: action.assessmentType ?? "assignment",
          dueAt: action.dueAt ?? undefined,
          maxScore: Math.max(1, Math.min(1000, action.maxScore ?? 100)),
          publish: action.publish,
        });
      if (action.type === "create_announcement")
        await createCourseAnnouncement({
          sectionId: action.sectionId!,
          title: action.title,
          body: action.content || action.description,
          priority: action.priority ?? "normal",
        });
      if (action.type === "create_attendance")
        await createAttendanceSession({
          sectionId: action.sectionId!,
          title: action.title,
          startsAt: action.startsAt ?? new Date().toISOString(),
          endsAt:
            action.endsAt ??
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      setPendingAction(null);
      onDataChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The proposed change could not be saved.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
  return (
    <div className="school-ai-layer">
      <button
        className="school-ai-backdrop"
        type="button"
        aria-label="Close Nexus AI"
        onClick={onClose}
      />
      <aside>
        <header>
          <span>✦</span>
          <div>
            <small>STU NEXUS</small>
            <h2>School AI Assistant</h2>
            <p>Role-aware · grounded · persistent</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="chat-thread-bar">
          <select
            value={threadId}
            onChange={(event) => setThreadId(event.target.value)}
          >
            <option value="">New conversation</option>
            {data.threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setThreadId("");
              setMessages([]);
            }}
          >
            +
          </button>
        </div>
        <div className="chat-messages">
          {messages.length ? (
            messages.map((item) => (
              <article key={item.id} className={item.role}>
                <span>{item.role === "assistant" ? "✦" : "YOU"}</span>
                <div>
                  <p>{item.content}</p>
                  {item.citations.length ? (
                    <footer>
                      {item.citations.map((citation) => (
                        <small key={citation}>◫ {citation}</small>
                      ))}
                    </footer>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="chat-welcome">
              <span>✦</span>
              <h3>What can I help you accomplish?</h3>
              <p>
                Ask about your courses, schedule, assessments, teaching work,
                student support, or verified school information.
              </p>
              <div>
                {[
                  "Summarize my day",
                  "Explain the next topic",
                  "Help plan this class",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {loading ? (
            <article className="assistant thinking">
              <span>✦</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </article>
          ) : null}
        </div>
        {error ? <div className="chat-error">{error}</div> : null}
        {pendingAction ? (
          <section className="chat-action-card">
            <span>READY FOR REVIEW</span>
            <strong>{pendingAction.confirmation || pendingAction.title}</strong>
            <p>
              Nexus prepared this change but has not saved it. Review and
              confirm to apply it with your account permissions.
            </p>
            <div>
              <button type="button" onClick={() => setPendingAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmAction()}
              >
                Confirm change
              </button>
            </div>
          </section>
        ) : null}
        <form onSubmit={send}>
          <textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Message Nexus AI…"
          />
          <div>
            <span>No passwords or sensitive unnecessary data</span>
            <button type="submit" disabled={loading || !message.trim()}>
              Send →
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export default UnifiedPortal;
