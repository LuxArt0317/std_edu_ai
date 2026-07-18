import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import CRMApp from "../crm/CRMApp";
import { clearCrmDataSnapshot } from "../crm/crmRepository";
import type { CrmUser } from "../crm/authService";
import {
  askSchoolAssistant,
  recordSchoolAgentAction,
  scanGradeSheet,
} from "./platformAi";
import {
  addAgentObservation,
  runSafetyStop,
  startSchoolAgentRun,
  type SchoolAgentRun,
} from "./schoolAgentLoop";
import {
  appendChatMessage,
  assignPlatformRole,
  assignProfileResponsibilities,
  clearPlatformDataSnapshot,
  changeAccountLifecycle,
  createAttendanceSession,
  createChatThread,
  createCourseAnnouncement,
  createCourseAssessment,
  createLearningMaterialPage,
  createLearningMaterial,
  createLearningModule,
  createScheduleEvent,
  createStudentSupportRequest,
  getPlatformDataSnapshot,
  loadAccountDirectory,
  loadChatMessages,
  loadPlatformDataCached,
  inviteRoleAccount,
  markLearningProgress,
  markNotificationRead,
  createCommunicationRequest,
  decideCommunicationRequest,
  publishGrade,
  correctPublishedGrade,
  provisionRoleAccount,
  revokeAccountSessions,
  resendRoleInvitation,
  updateAccountIdentity,
  removeProfileSectionAssignment,
  updateDepartmentStaffProfile,
  recordGradeScan,
  saveReviewedScan,
  submitAssessment,
  updatePlatformProfile,
  updateGradeRecord,
  updateRoleCapabilities,
  createInstitutionalInitiative,
  transitionInstitutionalInitiative,
} from "./platformRepository";
import type {
  AssessmentAttemptResult,
  AuthDirectoryAccount,
  ChatMessage,
  GradeScanResult,
  PlatformData,
  PlatformProfile,
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

function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*_-";
  const bytes = crypto.getRandomValues(new Uint8Array(28));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
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
    },
    [currentUser.id],
  );

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
        <a className="school-skip-link" href="#school-workspace-content">
          Skip to workspace content
        </a>
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
                aria-current={view === item ? "page" : undefined}
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

        <main className="school-main" id="school-workspace-content">
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
                onClick={() => setNotificationsOpen(true)}
              >
                ♢<b>{data.notifications.filter((item) => !item.readAt).length}</b>
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

          <div className="school-content" data-workspace={view}>
            <section className="school-workspace-context" aria-label="Current workspace context">
              <span><i /> Live role-scoped data</span>
              <b>{navMeta[view].label}</b>
              <small>{roleNames[effectiveRole]} access</small>
            </section>
            {view === "home" ? (
              <HomeView
                data={data}
                role={effectiveRole}
                user={currentUser}
                onNavigate={setView}
                onAsk={() => setAssistantOpen(true)}
                onChanged={() => void refresh(true)}
                onToast={setToast}
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
          role={effectiveRole}
          onNavigate={setView}
          onDataChanged={() => void refresh(true)}
        />
        {notificationsOpen ? <NotificationCenter data={data} currentUser={currentUser} onClose={() => setNotificationsOpen(false)} onChanged={() => void refresh(true)} onToast={setToast} /> : null}
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
  onChanged,
  onToast,
}: {
  data: PlatformData;
  role: PlatformRole;
  user: CrmUser;
  onNavigate: (view: PortalView) => void;
  onAsk: () => void;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const [initiativeBusy, setInitiativeBusy] = useState(false);
  const greeting =
    role === "student"
      ? "Ready for your next learning step?"
      : role === "faculty"
        ? "Your classes are organized and ready."
        : "The whole university, in one clear view.";
  const upcoming = data.schedule.slice(0, 3);
  const roleDefinition = data.roles.find((item) => item.code === role);
  const student = data.students.find((item) => item.profileId === user.id);
  const supportRequests = student
    ? data.supportRequests.filter((item) => item.studentId === student.id)
    : [];
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
      {role === "student" ? (
        <section className="school-card student-support-center">
          <header>
            <div><span>HELP & SERVICES</span><h3>My support requests</h3></div>
            <button type="button" onClick={() => setSupportOpen(true)}>+ Request support</button>
          </header>
          {supportRequests.length ? supportRequests.map((request) => (
            <article key={request.id}>
              <div><b>{request.title}</b><span>{request.category}</span></div>
              <Pill tone={request.status === "resolved" ? "green" : "amber"}>{request.status.replaceAll("_", " ")}</Pill>
              <p>{request.description}</p>
              <small>Updated {formatMoment(request.updatedAt)}</small>
            </article>
          )) : <div className="school-empty">You have no support requests.</div>}
        </section>
      ) : null}
      {leadershipRoles.has(role) ? <section className="school-card institutional-initiatives"><header><div><span>POLICIES & STRATEGIC WORK</span><h3>Institutional initiatives</h3></div>{["owner","admin","president","vice_president","dean","department_head"].includes(role) ? <button type="button" onClick={() => setInitiativeOpen(true)}>+ Propose initiative</button> : null}</header>{data.initiatives.length ? data.initiatives.map((item) => <article key={item.id}><div><Pill tone={item.priority === "urgent" ? "coral" : item.priority === "high" ? "amber" : "teal"}>{item.status.replaceAll("_"," ")}</Pill><h4>{item.title}</h4><p>{item.description}</p><small>{item.type.replaceAll("_"," ")} · {item.scope} · Owner: {data.profiles.find((profile) => profile.id === item.ownerId)?.name ?? "Unassigned"}</small></div><div className="crm-inline-actions">{(["owner","admin","president","vice_president"].includes(role) || (role === "dean" && ["teaching_plan","content_correction"].includes(item.type))) && item.status === "proposed" ? <button type="button" onClick={() => {const reason=window.prompt("Approval reason (at least 12 characters)");if(reason) void transitionInstitutionalInitiative({initiativeId:item.id,action:"approve",ownerId:null,reason}).then(() => {onToast("Initiative approved with immutable evidence.");onChanged();}).catch((error:unknown)=>onToast(error instanceof Error?error.message:"Approval failed."));}}>Approve policy / initiative</button> : null}{["owner","admin","president","vice_president","dean","department_head"].includes(role) && item.status !== "completed" ? <button type="button" onClick={() => {const ownerId=window.prompt("Assign profile ID",item.ownerId ?? user.id);const reason=window.prompt("Assignment reason (at least 12 characters)");if(ownerId&&reason) void transitionInstitutionalInitiative({initiativeId:item.id,action:"assign",ownerId,reason}).then(() => {onToast("Strategic work assigned.");onChanged();}).catch((error:unknown)=>onToast(error instanceof Error?error.message:"Assignment failed."));}}>Assign owner</button> : null}{item.ownerId === user.id && item.status === "in_progress" ? <button type="button" onClick={() => {const reason=window.prompt("Completion outcome (at least 12 characters)");if(reason) void transitionInstitutionalInitiative({initiativeId:item.id,action:"complete",ownerId:null,reason}).then(() => {onToast("Initiative completed.");onChanged();}).catch((error:unknown)=>onToast(error instanceof Error?error.message:"Completion failed."));}}>Complete</button> : null}{role === "vice_president" ? <button type="button" onClick={() => {const reason=window.prompt("Escalation reason (at least 12 characters)");if(reason) void transitionInstitutionalInitiative({initiativeId:item.id,action:"escalate",ownerId:null,reason}).then(() => {onToast("Matter escalated to executive review.");onChanged();}).catch((error:unknown)=>onToast(error instanceof Error?error.message:"Escalation failed."));}}>Escalate</button> : null}</div></article>) : <div className="school-empty">No institutional initiatives are visible yet.</div>}</section> : null}
      {initiativeOpen ? <div className="academic-modal-layer"><button type="button" className="academic-modal-backdrop" aria-label="Close initiative form" onClick={() => setInitiativeOpen(false)} /><section className="academic-modal" role="dialog" aria-modal="true" aria-label="Propose institutional initiative"><header><div><span>GOVERNED STRATEGIC WORK</span><h2>Propose a policy or initiative</h2><p>Executive approval, assignment, escalation, and completion are reasoned audited transitions.</p></div><button type="button" onClick={() => setInitiativeOpen(false)}>×</button></header><form className="academic-form" onSubmit={(event)=>{event.preventDefault();const f=new FormData(event.currentTarget);setInitiativeBusy(true);void createInstitutionalInitiative({type:String(f.get("type")) as "policy"|"initiative"|"teaching_plan"|"content_correction",title:String(f.get("title")),description:String(f.get("description")),scope:String(f.get("scope")),priority:String(f.get("priority")) as "normal"|"high"|"urgent",dueAt:String(f.get("dueAt"))||null}).then(()=>{setInitiativeOpen(false);onToast("Initiative proposed for review.");onChanged();}).catch((error:unknown)=>onToast(error instanceof Error?error.message:"Proposal failed.")).finally(()=>setInitiativeBusy(false));}}><div className="academic-form-grid"><label><span>Type</span><select name="type"><option value="initiative">Institutional initiative</option><option value="policy">Policy</option><option value="teaching_plan">Teaching plan</option><option value="content_correction">Content correction</option></select></label><label><span>Priority</span><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label><span>Title</span><input name="title" minLength={3} maxLength={180} required /></label><label><span>Scope</span><input name="scope" defaultValue="Institution-wide" maxLength={180} required /></label><label className="wide"><span>Description and expected outcome</span><textarea name="description" minLength={12} maxLength={10000} rows={6} required /></label><label><span>Due date</span><input name="dueAt" type="datetime-local" /></label></div><footer><span>Submission creates a governed proposal, not automatic approval.</span><button disabled={initiativeBusy}>{initiativeBusy?"Saving…":"Submit proposal"}</button></footer></form></section></div> : null}
      {supportOpen && student ? (
        <div className="academic-modal-layer">
          <button type="button" className="academic-modal-backdrop" aria-label="Close support request" onClick={() => setSupportOpen(false)} />
          <section className="academic-modal" role="dialog" aria-modal="true" aria-label="Request support">
            <header><div><span>STUDENT SELF-SERVICE</span><h2>Request support</h2><p>Your request is linked only to your own student record and routed to authorized staff.</p></div><button type="button" onClick={() => setSupportOpen(false)}>×</button></header>
            <form className="academic-form" onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setSupportBusy(true);
              void createStudentSupportRequest({
                studentId: student.id,
                title: String(form.get("title")),
                category: String(form.get("category")),
                description: String(form.get("description")),
                priority: String(form.get("priority")) as "low" | "medium" | "high",
              }).then(() => { onToast("Support request submitted."); setSupportOpen(false); onChanged(); })
                .catch((error: unknown) => onToast(error instanceof Error ? error.message : "Support request failed."))
                .finally(() => setSupportBusy(false));
            }}>
              <div className="academic-form-grid">
                <label><span>Subject</span><input name="title" maxLength={160} required /></label>
                <label><span>Category</span><select name="category" defaultValue="academic"><option value="academic">Academic</option><option value="technical">Technical</option><option value="financial">Financial</option><option value="wellbeing">Wellbeing</option><option value="records">Records</option><option value="other">Other</option></select></label>
                <label><span>Priority</span><select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                <label className="wide"><span>What do you need help with?</span><textarea name="description" rows={6} maxLength={5000} required /></label>
              </div>
              <footer><span>You can track the request status here.</span><button disabled={supportBusy}>{supportBusy ? "Submitting…" : "Submit request"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
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
      onComplete(response.score === null ? "Assessment submitted. Your result is awaiting release." : `Assessment scored: ${response.score} / ${response.maxScore}`);
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
              {learnerMode ? (() => { const attempts = data.assessmentAttempts.filter((attempt) => attempt.assessmentId === assessment.id); const latest = attempts.at(-1); return latest ? <p><b>Attempt {latest.attemptNumber}:</b> {latest.score === null ? "Result awaiting teacher release" : `${latest.score} / ${latest.maxScore}`} · {latest.status.replaceAll("_", " ")}</p> : null; })() : null}
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
                <h2>{active.releaseScoresImmediately ? `${result.score} / ${result.maxScore}` : "Submitted for release"}</h2>
                <p>
                  {!active.releaseScoresImmediately
                    ? "Your attempt is recorded. Your score will appear after the teacher releases it."
                    : result.status === "needs_review"
                    ? "Objective answers were scored. A teacher will review the remaining response."
                    : "Your answers were checked against the protected answer key."}
                </p>
                <div>
                  {active.releaseExplanations ? active.questions.map((question) => (
                    <article key={question.id}>
                      <b>
                        {question.position}. {question.prompt}
                      </b>
                      <p>{question.explanation}</p>
                    </article>
                  )) : <p>Answer explanations have not been released by the teacher.</p>}
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
  const [publishingGradeId, setPublishingGradeId] = useState("");
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
                      onClick={() => setPublishingGradeId(grade.id)}
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
      {publishingGradeId ? (
        <div className="academic-modal-layer">
          <button type="button" className="academic-modal-backdrop" aria-label="Cancel grade publication" onClick={() => setPublishingGradeId("")} />
          <section className="academic-modal" role="dialog" aria-modal="true" aria-label="Publish final grade">
            <header><div><span>CONTROLLED ACADEMIC RECORD</span><h2>Publish this final grade?</h2><p>The student will see it immediately. Later changes require the audited correction workflow.</p></div><button type="button" onClick={() => setPublishingGradeId("")}>×</button></header>
            <form className="academic-form" onSubmit={(event) => { event.preventDefault(); const reason=String(new FormData(event.currentTarget).get("reason")); void publishGrade(publishingGradeId, reason).then(() => { setPublishingGradeId(""); onToast("Final grade published with immutable audit evidence."); onChanged(); }).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Grade could not be published.")); }}>
              <label><span>Publication reason</span><textarea name="reason" minLength={12} maxLength={1000} rows={4} required placeholder="Confirm grading review and publication basis." /></label>
              <footer><span>Actor, timestamp, reason, and before/after state are preserved.</span><button>Publish final grade</button></footer>
            </form>
          </section>
        </div>
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
                      const operation = grade.status === "published"
                        ? correctPublishedGrade({ gradeId: grade.id, score: Number(f.get("score")), letterGrade: String(f.get("letterGrade")), feedback: gradeFeedback, reason: String(f.get("reason")) })
                        : updateGradeRecord(grade.id, { score: Number(f.get("score")), letterGrade: String(f.get("letterGrade")), feedback: gradeFeedback, status: String(f.get("status")) as "draft" | "reviewed" | "published" });
                      void operation
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
                      {grade.status === "published" ? <label><span>Required correction reason</span><textarea name="reason" minLength={12} maxLength={1000} rows={4} required /></label> : null}
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
                        <select name="status" defaultValue={grade.status} disabled={grade.status === "published"}>
                          {grade.status === "published" ? <option value="published">Published</option> : null}
                          {grade.status !== "published" ? <option value="draft">Draft</option> : null}
                          {grade.status !== "published" ? <option value="reviewed">Reviewed</option> : null}
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

function NotificationCenter({ data, currentUser, onClose, onChanged, onToast }: { data: PlatformData; currentUser: CrmUser; onClose: () => void; onChanged: () => void; onToast: (message: string) => void }) {
  const canApprove = currentUser.isOwner || ["admin", "support"].includes(currentUser.role);
  const recipients = data.profiles.filter((profile) => profile.id !== currentUser.id && profile.accountStatus === "active" && (currentUser.role !== "student" || ["faculty", "advisor", "support", "admin"].includes(profile.role)));
  return <div className="academic-modal-layer"><button type="button" className="academic-modal-backdrop" aria-label="Close notifications" onClick={onClose} /><section className="academic-modal notification-center" role="dialog" aria-modal="true" aria-label="Notifications and messages"><header><div><span>NOTIFICATIONS & APPROVED COMMUNICATION</span><h2>Your notification center</h2><p>Read portal notices and contact an authorized teacher, advisor, or support team through the governed message workflow.</p></div><button type="button" onClick={onClose}>×</button></header><div className="notification-center-body"><section><h3>Notifications</h3>{data.notifications.map((item) => <article key={item.id} className={item.readAt ? "read" : "unread"}><div><b>{item.title}</b><small>{new Date(item.createdAt).toLocaleString()}</small></div><p>{item.body}</p><button type="button" onClick={() => void markNotificationRead(item.id,!item.readAt).then(onChanged).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Notification update failed."))}>{item.readAt ? "Mark unread" : "Mark read"}</button></article>)}{!data.notifications.length ? <p>No notifications yet.</p> : null}</section><section><h3>Contact school staff</h3><form className="academic-form" onSubmit={(event) => {event.preventDefault();const f=new FormData(event.currentTarget);void createCommunicationRequest({recipientId:String(f.get("recipientId")),subject:String(f.get("subject")),body:String(f.get("body")),channel:"portal"}).then(() => {onToast("Message submitted for approved delivery.");onChanged();event.currentTarget.reset();}).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Message could not be submitted."));}}><label><span>Recipient</span><select name="recipientId" required><option value="">Choose a recipient</option>{recipients.map((item) => <option key={item.id} value={item.id}>{item.name} · {roleNames[item.role]}</option>)}</select></label><label><span>Subject</span><input name="subject" required minLength={2} maxLength={160} /></label><label><span>Message</span><textarea name="body" required minLength={2} maxLength={10000} rows={5} /></label><button>Submit message</button></form></section>{canApprove ? <section><h3>Pending communication approval</h3>{data.communications.filter((item) => item.status === "pending").map((item) => <article key={item.id}><b>{item.subject}</b><p>{item.body}</p><small>{data.profiles.find((profile) => profile.id === item.senderId)?.name ?? "Sender"} → {data.profiles.find((profile) => profile.id === item.recipientId)?.name ?? "Recipient"}</small><div><button type="button" onClick={() => {const reason=window.prompt("Approval reason (at least 12 characters)");if(reason) void decideCommunicationRequest({requestId:item.id,approve:true,reason}).then(() => {onToast("Communication approved and delivered.");onChanged();}).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Approval failed."));}}>Approve & send</button><button type="button" onClick={() => {const reason=window.prompt("Rejection reason (at least 12 characters)");if(reason) void decideCommunicationRequest({requestId:item.id,approve:false,reason}).then(() => {onToast("Communication rejected.");onChanged();}).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Rejection failed."));}}>Reject</button></div></article>)}{!data.communications.some((item) => item.status === "pending") ? <p>No messages are waiting.</p> : null}</section> : null}</div></section></div>;
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
  const [managingProfileId, setManagingProfileId] = useState("");
  const [editingProfileId, setEditingProfileId] = useState("");
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    profileId: string;
    previousRole: PlatformRole;
    nextRole: PlatformRole;
  } | null>(null);
  const [pendingLifecycle, setPendingLifecycle] = useState<{
    profileId: string;
    action: "activate" | "suspend" | "archive" | "restore";
  } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [showProvisioner, setShowProvisioner] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [showBulkProvisioner, setShowBulkProvisioner] = useState(false);
  const [bulkAccounts, setBulkAccounts] = useState("");
  const [bulkResults, setBulkResults] = useState("");
  const [directory, setDirectory] = useState<AuthDirectoryAccount[]>([]);
  const [directoryError, setDirectoryError] = useState("");
  const [pendingSessionRevoke, setPendingSessionRevoke] = useState<string>("");
  const [rotatingProfileId, setRotatingProfileId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState(() =>
    generateTemporaryPassword(),
  );
  const [editingPermissionsRole, setEditingPermissionsRole] = useState<PlatformRole | "">("");
  const canManageAccounts = currentUser.isOwner || currentUser.role === "admin";
  const currentProfile = data.profiles.find((item) => item.id === currentUser.id);
  const canEditDirectoryProfile = (profile: PlatformProfile) => canManageAccounts || (currentUser.role === "department_head" && Boolean(currentProfile?.departmentId) && currentProfile?.departmentId === profile.departmentId);
  const editingProfile =
    data.profiles.find((profile) => profile.id === editingProfileId) ?? null;
  const rotatingProfile =
    data.profiles.find((profile) => profile.id === rotatingProfileId) ?? null;

  useEffect(() => {
    if (!canManageAccounts) return;
    let active = true;
    void loadAccountDirectory()
      .then((accounts) => {
        if (active) setDirectory(accounts);
      })
      .catch((error: unknown) => {
        if (active)
          setDirectoryError(
            error instanceof Error
              ? error.message
              : "Account activity could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [canManageAccounts, data.profiles]);

  async function changeRole(
    profileId: string,
    role: PlatformRole,
    reason: string,
  ) {
    setChanging(profileId);
    try {
      await assignPlatformRole(profileId, role, reason);
      onToast(
        "Role updated and written to the audit trail. The user must refresh their session.",
      );
      onChanged();
      setPendingRoleChange(null);
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
      {canManageAccounts ? (
        <section className="people-provision-callout school-card">
          <div>
            <span>OWNER ACCOUNT CONTROL</span>
            <h3>Add a school account</h3>
            <p>
              Create a confirmed non-owner identity and assign its trusted role.
              The temporary password is shown here only and is never stored.
            </p>
          </div>
          <div className="people-provision-actions">
            <button type="button" onClick={() => { setInviteMode(true); setShowProvisioner(true); }}>
              Invite by email
            </button>
            <button type="button" onClick={() => setShowBulkProvisioner(true)}>
              Bulk import
            </button>
            <button type="button" onClick={() => { setInviteMode(false); setShowProvisioner(true); }}>
              + Add account
            </button>
          </div>
        </section>
      ) : null}
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
          <div key={profile.id} className={managingProfileId === profile.id ? "selected" : ""}>
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
              {currentUser.isOwner ? (
                <small>
                  Last sign-in: {directory.find((item) => item.id === profile.id)?.lastSignInAt
                    ? formatMoment(directory.find((item) => item.id === profile.id)!.lastSignInAt!)
                    : "Never"}
                </small>
              ) : null}
              <small>
                Responsibilities: {[
                  data.departments.find((item) => item.id === profile.departmentId)?.code,
                  data.programs.find((item) => item.id === profile.programId)?.code,
                  ...data.sectionAssignments.filter((item) => item.profileId === profile.id).map((item) => {
                    const course = data.courses.find((courseItem) => courseItem.sectionId === item.sectionId);
                    return course ? `${course.code} (${item.responsibility})` : item.responsibility;
                  }),
                  ...data.students.filter((student) => student.advisorId === profile.id).map((student) => `Advisee: ${student.name}`),
                ].filter(Boolean).join(" · ") || "No assigned responsibilities"}
              </small>
            </p>
            {profile.isOwner ? (
              <Pill tone="owner">Protected owner</Pill>
            ) : canManageAccounts && managingProfileId === profile.id ? (
              <div className="people-account-controls">
                <Pill
                  tone={profile.accountStatus === "active" ? "green" : "amber"}
                >
                  {profile.accountStatus}
                </Pill>
                <select
                  value={profile.role}
                  disabled={changing === profile.id}
                  onChange={(event) =>
                    setPendingRoleChange({
                      profileId: profile.id,
                      previousRole: profile.role,
                      nextRole: event.target.value as PlatformRole,
                    })
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
                <button
                  type="button"
                  onClick={() =>
                    setPendingLifecycle({
                      profileId: profile.id,
                      action:
                        profile.accountStatus === "active"
                          ? "suspend"
                          : profile.accountStatus === "archived"
                            ? "restore"
                            : "activate",
                    })
                  }
                >
                  {profile.accountStatus === "active"
                    ? "Suspend"
                    : profile.accountStatus === "archived"
                      ? "Restore"
                      : "Activate"}
                </button>
                {profile.accountStatus !== "archived" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingLifecycle({
                        profileId: profile.id,
                        action: "archive",
                      })
                    }
                  >
                    Archive
                  </button>
                ) : null}
                <button type="button" onClick={() => setRotatingProfileId(profile.id)}>
                  Reset password
                </button>
                <button type="button" onClick={() => setPendingSessionRevoke(profile.id)}>
                  Revoke sessions
                </button>
                {(() => { const account=directory.find((item) => item.id === profile.id); return account?.invitedAt && !account.confirmedAt ? <button type="button" onClick={() => { setChanging(profile.id); void resendRoleInvitation(account.email).then(() => onToast("Institutional invitation resent.")).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Invitation resend failed.")).finally(() => setChanging("")); }}>Resend invite</button> : null; })()}
                <button type="button" onClick={() => setManagingProfileId("")}>Close actions</button>
              </div>
            ) : canManageAccounts ? <button type="button" className="people-manage-account" onClick={() => setManagingProfileId(profile.id)} aria-expanded={false}>Manage account →</button> : <Pill tone="teal">{roleNames[profile.role]}</Pill>}
            {canEditDirectoryProfile(profile) && (!canManageAccounts || managingProfileId === profile.id) ? <button
              type="button"
              onClick={() => setEditingProfileId(profile.id)}
            >
              Edit identity
            </button> : null}
          </div>
        ))}
      </section>
      {directoryError ? (
        <div className="school-inline-error" role="alert">{directoryError}</div>
      ) : null}
      {canManageAccounts ? (
        <section className="people-audit school-card">
          <header>
            <div>
              <span>IMMUTABLE GOVERNANCE EVIDENCE</span>
              <h3>Recent account and role activity</h3>
            </div>
          </header>
          {[...data.accountAudits, ...data.roleAudits, ...data.accessAudits]
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            )
            .slice(0, 20)
            .map((entry) => {
              const target = data.profiles.find(
                (profile) => profile.id === entry.targetProfileId,
              );
              const actor = data.profiles.find(
                (profile) => profile.id === entry.changedBy,
              );
              const transition =
                "action" in entry
                  ? entry.action
                  : "newStatus" in entry
                  ? `${entry.previousStatus} → ${entry.newStatus}`
                  : `${entry.previousRole} → ${entry.newRole}`;
              return (
                <article key={entry.id}>
                  <div>
                    <b>{target?.name ?? "Account"}</b>
                    <span>{transition.replaceAll("_", " ")}</span>
                  </div>
                  <p>{entry.reason}</p>
                  <small>
                    {actor?.name ?? "Authorized operator"} ·{" "}
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(entry.createdAt))}
                  </small>
                </article>
              );
            })}
          {!data.accountAudits.length && !data.roleAudits.length && !data.accessAudits.length ? (
            <div className="school-empty-state">
              No account or role changes have been recorded.
            </div>
          ) : null}
        </section>
      ) : null}
      {canManageAccounts ? <section className="school-card governance-boundary"><span>RETENTION SAFEGUARD</span><h3>Permanent deletion is disabled</h3><p>Institutional identities and records with academic, support, communication, or audit history must be archived or transitioned through a reasoned controlled workflow. Destructive deletion is not exposed.</p></section> : null}
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
                    {currentUser.isOwner && role.code !== "owner" ? <button type="button" onClick={() => setEditingPermissionsRole(role.code)}>Configure permissions</button> : null}
                  </article>
                ))}
            </div>
          ),
        )}
      </section>
      {editingPermissionsRole ? (() => { const definition=data.roles.find((item) => item.code === editingPermissionsRole); if(!definition) return null; return <div className="academic-modal-layer"><button type="button" className="academic-modal-backdrop" aria-label="Close permission editor" onClick={() => setEditingPermissionsRole("")} /><section className="academic-modal" role="dialog" aria-modal="true" aria-label="Configure role permissions"><header><div><span>OWNER POLICY CONTROL</span><h2>Configure {definition.name}</h2><p>Maintain the named capability catalog used for governance review. Database RLS remains the trusted enforcement boundary.</p></div><button type="button" onClick={() => setEditingPermissionsRole("")}>×</button></header><form className="academic-form" onSubmit={(event) => {event.preventDefault(); const capabilities=String(new FormData(event.currentTarget).get("capabilities")).split(/[\n,]+/); void updateRoleCapabilities(editingPermissionsRole as Exclude<PlatformRole,"owner">,capabilities).then(() => {setEditingPermissionsRole("");onToast("Role capability policy updated.");onChanged();}).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Permission update failed."));}}><label><span>Capabilities, one per line</span><textarea name="capabilities" rows={10} defaultValue={definition.capabilities.join("\n")} required /></label><footer><span>Owner protection and forbidden actions cannot be removed here.</span><button>Save role policy</button></footer></form></section></div>; })() : null}
      {showProvisioner ? (
        <div className="academic-modal-layer">
          <button
            type="button"
            className="academic-modal-backdrop"
            aria-label="Close account dialog"
            onClick={() => setShowProvisioner(false)}
          />
          <section
            className="academic-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add school account"
          >
            <header>
              <div>
                <span>PEOPLE & PERMISSIONS</span>
                <h2>{inviteMode ? "Invite school account" : "Add school account"}</h2>
                <p>{inviteMode ? "Send a secure institutional invitation. The recipient chooses their password." : "Create or securely rotate a confirmed non-owner identity."}</p>
              </div>
              <button type="button" onClick={() => setShowProvisioner(false)}>
                ×
              </button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setProvisioning(true);
                const accountInput = { fullName: String(form.get("fullName")), email: String(form.get("email")), role: String(form.get("role")) as Exclude<PlatformRole, "owner"> };
                void (inviteMode ? inviteRoleAccount(accountInput) : provisionRoleAccount({ ...accountInput, password: temporaryPassword }))
                  .then((result) => {
                    onToast(
                      result.status === "invited"
                        ? "Invitation sent. The recipient can choose a password securely."
                        : result.status === "created"
                        ? "Account created. Copy the temporary password before closing."
                        : "Existing account credentials and role were securely updated.",
                    );
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Account creation failed.",
                    ),
                  )
                  .finally(() => setProvisioning(false));
              }}
            >
              <div className="academic-form-grid">
                <label>
                  <span>Full name</span>
                  <input name="fullName" required maxLength={120} />
                </label>
                {!inviteMode ? <label>
                  <span>School email</span>
                  <input name="email" type="email" required maxLength={254} />
                </label> : null}
                <label>
                  <span>Role</span>
                  <select name="role" required defaultValue="faculty">
                    {data.roles
                      .filter((item) => item.code !== "owner")
                      .map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Temporary password</span>
                  <div className="password-generator-field">
                    <input value={temporaryPassword} readOnly />
                    <button
                      type="button"
                      onClick={() =>
                        setTemporaryPassword(generateTemporaryPassword())
                      }
                    >
                      Regenerate
                    </button>
                  </div>
                </label>
              </div>
              <footer>
                <span>Only the protected owner can perform this action.</span>
                <button disabled={provisioning}>
                  {provisioning ? "Working…" : inviteMode ? "Send invitation" : "Create account"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
      {showBulkProvisioner ? (
        <div className="academic-modal-layer">
          <button
            type="button"
            className="academic-modal-backdrop"
            aria-label="Close bulk account dialog"
            onClick={() => setShowBulkProvisioner(false)}
          />
          <section className="academic-modal" role="dialog" aria-modal="true" aria-label="Bulk import accounts">
            <header>
              <div>
                <span>CONTROLLED BULK PROVISIONING</span>
                <h2>Bulk import school accounts</h2>
                <p>One account per line: full name, email, role, optional temporary password. Maximum 100.</p>
              </div>
              <button type="button" onClick={() => setShowBulkProvisioner(false)}>×</button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const allowed = new Set(data.roles.filter((item) => item.code !== "owner").map((item) => item.code));
                const rows = bulkAccounts.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                if (!rows.length || rows.length > 100) {
                  onToast("Enter between 1 and 100 account rows.");
                  return;
                }
                setProvisioning(true);
                void (async () => {
                  const completed: string[] = [];
                  for (const [index, row] of rows.entries()) {
                    const [fullName = "", email = "", role = "", suppliedPassword = ""] = row.split(",").map((value) => value.trim());
                    if (!fullName || !email || !allowed.has(role as PlatformRole))
                      throw new Error(`Row ${index + 1} has an invalid name, email, or role.`);
                    const password = suppliedPassword || generateTemporaryPassword();
                    await provisionRoleAccount({
                      fullName,
                      email,
                      role: role as Exclude<PlatformRole, "owner">,
                      password,
                    });
                    completed.push(`${fullName},${email},${role},${password}`);
                  }
                  setBulkResults(completed.join("\n"));
                  onToast(`${completed.length} accounts were provisioned. Copy the one-time credentials now.`);
                  onChanged();
                })()
                  .catch((error: unknown) => onToast(error instanceof Error ? error.message : "Bulk provisioning failed."))
                  .finally(() => setProvisioning(false));
              }}
            >
              <label>
                <span>Account rows</span>
                <textarea rows={8} value={bulkAccounts} onChange={(event) => setBulkAccounts(event.target.value)} placeholder="Maria Santos,maria@stu.best,faculty" required />
              </label>
              {bulkResults ? (
                <label>
                  <span>One-time credentials — copy before closing</span>
                  <textarea rows={8} value={bulkResults} readOnly />
                </label>
              ) : null}
              <footer>
                <span>Passwords are displayed once and are never stored in the application database.</span>
                <button disabled={provisioning}>{provisioning ? "Provisioning…" : "Import accounts"}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
      {rotatingProfile ? (
        <div className="academic-modal-layer">
          <button type="button" className="academic-modal-backdrop" aria-label="Cancel password reset" onClick={() => setRotatingProfileId("")} />
          <section className="academic-modal" role="dialog" aria-modal="true" aria-label="Reset temporary password">
            <header>
              <div><span>CREDENTIAL ROTATION</span><h2>Reset {rotatingProfile.name}’s password</h2><p>The new temporary password is shown only in this dialog.</p></div>
              <button type="button" onClick={() => setRotatingProfileId("")}>×</button>
            </header>
            <form className="academic-form" onSubmit={(event) => {
              event.preventDefault();
              const authAccount = directory.find((item) => item.id === rotatingProfile.id);
              if (!authAccount?.email) { onToast("The Auth email is unavailable."); return; }
              setProvisioning(true);
              void provisionRoleAccount({ email: authAccount.email, password: temporaryPassword, role: rotatingProfile.role as Exclude<PlatformRole, "owner">, fullName: rotatingProfile.name })
                .then(() => { onToast("Temporary credentials rotated and audited. Copy the password before closing."); onChanged(); })
                .catch((error: unknown) => onToast(error instanceof Error ? error.message : "Credential rotation failed."))
                .finally(() => setProvisioning(false));
            }}>
              <label><span>New temporary password</span><div className="password-generator-field"><input value={temporaryPassword} readOnly /><button type="button" onClick={() => setTemporaryPassword(generateTemporaryPassword())}>Regenerate</button></div></label>
              <footer><span>Existing credentials will stop working immediately.</span><button disabled={provisioning}>{provisioning ? "Rotating…" : "Rotate credentials"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
      {pendingSessionRevoke
        ? (() => {
            const profile = data.profiles.find((item) => item.id === pendingSessionRevoke);
            if (!profile) return null;
            return (
              <div className="academic-modal-layer">
                <button type="button" className="academic-modal-backdrop" aria-label="Cancel session revocation" onClick={() => setPendingSessionRevoke("")} />
                <section className="academic-modal" role="dialog" aria-modal="true" aria-label="Revoke account sessions">
                  <header><div><span>ACCESS CONTROL</span><h2>Revoke {profile.name}’s sessions?</h2><p>Refresh sessions will be removed immediately. Short-lived access tokens expire at the configured JWT boundary.</p></div><button type="button" onClick={() => setPendingSessionRevoke("")}>×</button></header>
                  <form className="academic-form" onSubmit={(event) => {
                    event.preventDefault();
                    const reason = String(new FormData(event.currentTarget).get("reason"));
                    setChanging(profile.id);
                    void revokeAccountSessions({ targetId: profile.id, reason })
                      .then((result) => { onToast(`${result.revokedCount} active session records revoked and audited.`); setPendingSessionRevoke(""); })
                      .catch((error: unknown) => onToast(error instanceof Error ? error.message : "Session revocation failed."))
                      .finally(() => setChanging(""));
                  }}>
                    <label><span>Reason</span><textarea name="reason" minLength={12} maxLength={500} rows={4} required /></label>
                    <footer><span>This cannot target the protected owner.</span><button disabled={changing === profile.id}>{changing === profile.id ? "Revoking…" : "Revoke sessions"}</button></footer>
                  </form>
                </section>
              </div>
            );
          })()
        : null}
      {pendingRoleChange
        ? (() => {
            const profile = data.profiles.find(
              (item) => item.id === pendingRoleChange.profileId,
            );
            if (!profile) return null;
            return (
              <div className="academic-modal-layer">
                <button
                  type="button"
                  className="academic-modal-backdrop"
                  aria-label="Cancel role change"
                  onClick={() => setPendingRoleChange(null)}
                />
                <section
                  className="academic-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm role change"
                >
                  <header>
                    <div>
                      <span>CONTROLLED ROLE TRANSITION</span>
                      <h2>Change {profile.name}’s role?</h2>
                      <p>
                        {roleNames[pendingRoleChange.previousRole]} →{" "}
                        {roleNames[pendingRoleChange.nextRole]}. Their current
                        session must refresh before the new authorization takes
                        effect.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingRoleChange(null)}
                    >
                      ×
                    </button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void changeRole(
                        pendingRoleChange.profileId,
                        pendingRoleChange.nextRole,
                        String(form.get("reason")),
                      );
                    }}
                  >
                    <label>
                      <span>Reason for this authorization change</span>
                      <textarea
                        name="reason"
                        required
                        minLength={12}
                        maxLength={500}
                        rows={4}
                        placeholder="Describe the approved responsibility or staffing change."
                      />
                    </label>
                    <footer>
                      <span>
                        An immutable role-audit entry will be written.
                      </span>
                      <button disabled={changing === profile.id}>
                        {changing === profile.id
                          ? "Applying…"
                          : "Confirm role change"}
                      </button>
                    </footer>
                  </form>
                </section>
              </div>
            );
          })()
        : null}
      {pendingLifecycle
        ? (() => {
            const profile = data.profiles.find(
              (item) => item.id === pendingLifecycle.profileId,
            );
            if (!profile) return null;
            return (
              <div className="academic-modal-layer">
                <button
                  type="button"
                  className="academic-modal-backdrop"
                  aria-label="Cancel account change"
                  onClick={() => setPendingLifecycle(null)}
                />
                <section
                  className="academic-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm account lifecycle change"
                >
                  <header>
                    <div>
                      <span>ACCOUNT LIFECYCLE</span>
                      <h2>
                        {pendingLifecycle.action} {profile.name}’s account?
                      </h2>
                      <p>
                        Suspended and archived identities are blocked from new
                        Auth sessions. Existing access expires according to the
                        configured JWT lifetime.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingLifecycle(null)}
                    >
                      ×
                    </button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      setChanging(profile.id);
                      void changeAccountLifecycle({
                        targetId: profile.id,
                        action: pendingLifecycle.action,
                        reason: String(form.get("reason")),
                      })
                        .then(() => {
                          onToast("Account lifecycle updated and audited.");
                          setPendingLifecycle(null);
                          onChanged();
                        })
                        .catch((error: unknown) =>
                          onToast(
                            error instanceof Error
                              ? error.message
                              : "Account lifecycle change failed.",
                          ),
                        )
                        .finally(() => setChanging(""));
                    }}
                  >
                    <label>
                      <span>Reason</span>
                      <textarea
                        name="reason"
                        required
                        minLength={12}
                        maxLength={500}
                        rows={4}
                      />
                    </label>
                    <footer>
                      <span>
                        This action writes immutable lifecycle evidence.
                      </span>
                      <button disabled={changing === profile.id}>
                        {changing === profile.id
                          ? "Applying…"
                          : `Confirm ${pendingLifecycle.action}`}
                      </button>
                    </footer>
                  </form>
                </section>
              </div>
            );
          })()
        : null}
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
                const operations = canManageAccounts ? [
                  updatePlatformProfile(editingProfile.id, {
                    fullName: String(f.get("fullName")),
                    department: String(f.get("department")),
                    jobTitle: String(f.get("jobTitle")),
                  }),
                  updateAccountIdentity({
                    targetId: editingProfile.id,
                    email: String(f.get("email")),
                    phone: String(f.get("accountPhone")),
                    reason: String(f.get("assignmentReason")),
                  }),
                  assignProfileResponsibilities({
                    profileId: editingProfile.id,
                    departmentId: String(f.get("departmentId")) || null,
                    programId: String(f.get("programId")) || null,
                    sectionId: String(f.get("sectionId")) || null,
                    responsibility: String(f.get("responsibility")) as "faculty" | "assistant" | "coordinator" | "observer",
                    reason: String(f.get("assignmentReason")),
                  }),
                ] : [updateDepartmentStaffProfile({profileId:editingProfile.id,fullName:String(f.get("fullName")),department:String(f.get("department")),jobTitle:String(f.get("jobTitle")),reason:String(f.get("assignmentReason"))})];
                void Promise.all(operations)
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
                {canManageAccounts ? <><label><span>Account email</span><input name="email" type="email" required defaultValue={directory.find((item) => item.id === editingProfile.id)?.email ?? ""} /></label>
                <label><span>Phone</span><input name="accountPhone" maxLength={40} defaultValue={editingProfile.phone} /></label>
                <label><span>Assigned department</span><select name="departmentId" defaultValue={editingProfile.departmentId ?? ""}><option value="">No department assignment</option>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label><span>Assigned program</span><select name="programId" defaultValue={editingProfile.programId ?? ""}><option value="">No program assignment</option>{data.programs.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label><span>Class responsibility</span><select name="sectionId" defaultValue=""><option value="">No new class assignment</option>{data.courses.map((item) => <option key={item.sectionId} value={item.sectionId}>{item.code} · {item.sectionCode}</option>)}</select></label>
                <label><span>Class responsibility type</span><select name="responsibility" defaultValue="faculty"><option value="faculty">Faculty</option><option value="assistant">Teaching assistant</option><option value="coordinator">Coordinator</option><option value="observer">Observer</option></select></label></> : null}
                <label className="academic-form-wide"><span>Assignment reason</span><textarea name="assignmentReason" minLength={12} maxLength={500} rows={3} required defaultValue="Authorized directory and responsibility update." /></label>
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
              {data.sectionAssignments.filter((item) => item.profileId === editingProfile.id).map((assignment) => <div key={assignment.id} className="school-inline-governance"><span>{data.courses.find((course) => course.sectionId === assignment.sectionId)?.code ?? "Class"} · {assignment.responsibility}</span><button type="button" onClick={() => { const reason=window.prompt("Reason for removing this responsibility (at least 12 characters)"); if (!reason) return; void removeProfileSectionAssignment(assignment.id,reason).then(() => {onToast("Responsibility removed with immutable evidence.");onChanged();}).catch((error: unknown) => onToast(error instanceof Error ? error.message : "Responsibility removal failed.")); }}>Remove responsibility</button></div>)}
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
  role,
  onNavigate,
  onDataChanged,
}: {
  open: boolean;
  onClose: () => void;
  data: PlatformData;
  view: PortalView;
  role: PlatformRole;
  onNavigate: (view: PortalView) => void;
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
  const [agentRun, setAgentRun] = useState<SchoolAgentRun | null>(null);
  const activeRunId = useRef("");

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

  function addAssistantMessage(activeThread: string, content: string, citations: string[]) {
    const item: ChatMessage = {
      id: `assistant-${Date.now()}-${Math.random()}`,
      threadId: activeThread,
      role: "assistant",
      content,
      citations,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, item]);
    void appendChatMessage(activeThread, "assistant", content, citations);
  }

  async function advanceAgent(run: SchoolAgentRun, activeThread: string) {
    if (activeRunId.current !== run.id) return;
    const stopReason = runSafetyStop(run);
    if (stopReason) {
      const stopped = { ...run, status: "impossible" as const, terminalReason: stopReason };
      setAgentRun(stopped);
      addAssistantMessage(activeThread, stopReason, ["Nexus safety limit"]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const answer = await askSchoolAssistant(run.goal, messages, { view, data }, {
        runId: run.id,
        goal: run.goal,
        step: run.step,
        maxSteps: run.maxSteps,
        observations: run.observations,
      });
      if (activeRunId.current !== run.id) return;
      addAssistantMessage(activeThread, answer.answer, answer.citations);
      const decided: SchoolAgentRun = {
        ...run,
        status: answer.agent.status,
        summary: answer.agent.stepSummary,
        terminalReason: answer.agent.terminalReason,
      };
      if (answer.agent.status !== "working" || !answer.proposedAction) {
        setAgentRun(decided);
        setPendingAction(null);
        return;
      }
      const action = answer.proposedAction;
      if (action.type === "navigate") {
        if (!action.destination || !navigationFor(role).includes(action.destination)) {
          const blocked = addAgentObservation(decided, {
            step: run.step + 1, actionType: action.type, outcome: "blocked",
            summary: "The requested workspace is unavailable for this role.",
          }, action);
          await recordSchoolAgentAction(action.type, "blocked");
          setAgentRun(blocked);
          await advanceAgent(blocked, activeThread);
          return;
        }
        onNavigate(action.destination);
        await recordSchoolAgentAction(action.type, "success");
        const progressed = addAgentObservation(decided, {
          step: run.step + 1, actionType: action.type, outcome: "success",
          summary: `Opened ${navMeta[action.destination].label}.`,
        }, action);
        setAgentRun(progressed);
        addAssistantMessage(activeThread, `Step ${progressed.step} complete — opened ${navMeta[action.destination].label}.`, ["Observed portal action"]);
        await advanceAgent(progressed, activeThread);
        return;
      }
      setAgentRun({ ...decided, status: "awaiting_confirmation" });
      setPendingAction(action);
    } catch (reason) {
      if (activeRunId.current !== run.id) return;
      const detail = reason instanceof Error ? reason.message : "Nexus AI could not continue the goal.";
      setAgentRun({ ...run, status: "impossible", terminalReason: detail });
      setError(detail);
    } finally {
      if (activeRunId.current === run.id) setLoading(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt = message.trim();
    if (!prompt || loading) return;
    setError("");
    setMessage("");
    setPendingAction(null);
    try {
      let activeThread = threadId;
      if (!activeThread) {
        const created = await createChatThread(prompt.slice(0, 70));
        activeThread = created.id;
        setThreadId(created.id);
        onDataChanged();
      }
      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`, threadId: activeThread, role: "user",
        content: prompt, citations: [], createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, userMessage]);
      await appendChatMessage(activeThread, "user", prompt);
      const run = startSchoolAgentRun(prompt);
      activeRunId.current = run.id;
      setAgentRun(run);
      await advanceAgent(run, activeThread);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nexus AI could not start the goal.");
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction || loading) return;
    const action = pendingAction;
    const stopAsImpossible = (reason: string) => {
      setPendingAction(null);
      setError(reason);
      if (agentRun) setAgentRun({ ...agentRun, status: "impossible", terminalReason: reason });
    };
    const allowed =
      role === "student"
        ? new Set(["navigate", "mark_learning_progress"])
        : teachingRoles.has(role)
          ? new Set([
              "navigate",
              "create_module",
              "create_material",
              "create_material_page",
              "create_assessment",
              "create_announcement",
              "create_attendance",
              "create_schedule_event",
            ])
          : new Set(["navigate", "create_schedule_event"]);
    if (!allowed.has(action.type)) {
      void recordSchoolAgentAction(action.type, "blocked");
      setPendingAction(null);
      setError("That action is not available for your signed-in role.");
      if (agentRun) setAgentRun({ ...agentRun, status: "impossible", terminalReason: "The signed-in role is not authorized for the proposed action." });
      return;
    }
    if (role === "student" && action.type.includes("assessment")) {
      void recordSchoolAgentAction(action.type, "blocked");
      setPendingAction(null);
      setError("Nexus cannot complete or change assessed work for students.");
      if (agentRun) setAgentRun({ ...agentRun, status: "impossible", terminalReason: "Student assessed work is permanently outside Nexus action authority." });
      return;
    }
    if (action.type === "navigate") {
      if (
        !action.destination ||
        !navigationFor(role).includes(action.destination)
      ) {
        setError("That workspace is not available for your role.");
        return;
      }
      onNavigate(action.destination);
      void recordSchoolAgentAction(action.type, "success");
      const confirmation = `Done — I opened ${navMeta[action.destination].label}.`;
      setMessages((current) => [
        ...current,
        {
          id: `assistant-action-${Date.now()}`,
          threadId,
          role: "assistant",
          content: confirmation,
          citations: ["Confirmed portal action"],
          createdAt: new Date().toISOString(),
        },
      ]);
      if (threadId)
        void appendChatMessage(threadId, "assistant", confirmation, [
          "Confirmed portal action",
        ]);
      setPendingAction(null);
      return;
    }
    const course = data.courses.find(
      (item) => item.sectionId === action.sectionId,
    );
    const module = data.modules.find((item) => item.id === action.moduleId);
    const material = data.materials.find(
      (item) => item.id === action.materialId,
    );
    if (action.type === "mark_learning_progress") {
      if (!material || !action.materialId) {
        stopAsImpossible("That learning material is no longer available.");
        return;
      }
    } else if (action.type === "create_material_page") {
      if (!material || !action.materialId) {
        stopAsImpossible("That learning material is no longer available.");
        return;
      }
    } else if (
      action.type !== "create_material" &&
      action.type !== "create_schedule_event" &&
      !course
    ) {
      stopAsImpossible(
        "That course is no longer available. Ask Nexus to prepare the change again.",
      );
      return;
    }
    if (
      action.type === "create_material" &&
      (!module || module.sectionId !== action.sectionId)
    ) {
      stopAsImpossible(
        "That learning module is no longer available. Ask Nexus to prepare the change again.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      let createdId = "";
      if (action.type === "create_module")
        createdId = await createLearningModule({
          sectionId: action.sectionId!,
          title: action.title,
          description: action.description,
          position:
            data.modules.filter((item) => item.sectionId === action.sectionId)
              .length + 1,
          publish: action.publish,
        });
      if (action.type === "create_material")
        createdId = await createLearningMaterial({
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
      if (action.type === "create_material_page")
        await createLearningMaterialPage({
          materialId: action.materialId!,
          title: action.title,
          content: action.content,
          position:
            data.materialPages.filter(
              (item) => item.materialId === action.materialId,
            ).length + 1,
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
      if (action.type === "create_schedule_event")
        await createScheduleEvent({
          sectionId: action.sectionId ?? undefined,
          title: action.title,
          description: action.description || action.content,
          eventType: "school_event",
          startsAt: action.startsAt ?? new Date().toISOString(),
          endsAt:
            action.endsAt ??
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          location: action.location ?? undefined,
        });
      if (action.type === "mark_learning_progress")
        await markLearningProgress(
          action.materialId!,
          action.completed ?? true,
        );
      await recordSchoolAgentAction(action.type, "success");
      const confirmation =
        "Done — the confirmed change is saved and your workspace is refreshing.";
      setMessages((current) => [
        ...current,
        {
          id: `assistant-action-${Date.now()}`,
          threadId,
          role: "assistant",
          content: confirmation,
          citations: ["Confirmed platform action"],
          createdAt: new Date().toISOString(),
        },
      ]);
      if (threadId)
        void appendChatMessage(threadId, "assistant", confirmation, [
          "Confirmed platform action",
        ]);
      setPendingAction(null);
      onDataChanged();
      if (agentRun && activeRunId.current === agentRun.id) {
        const progressed = addAgentObservation(agentRun, {
          step: agentRun.step + 1,
          actionType: action.type,
          outcome: "success",
          summary: `The confirmed ${action.type.replaceAll("_", " ")} action was saved successfully${createdId ? ` with record ID ${createdId}` : ""}.`,
        }, action);
        setAgentRun(progressed);
        await advanceAgent(progressed, threadId);
      }
    } catch (reason) {
      void recordSchoolAgentAction(action.type, "error");
      setError(
        reason instanceof Error
          ? reason.message
          : "The proposed change could not be saved.",
      );
      if (agentRun) setAgentRun({ ...agentRun, status: "impossible", terminalReason: reason instanceof Error ? reason.message : "The confirmed action failed." });
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
              activeRunId.current = "";
              setAgentRun(null);
              setPendingAction(null);
              setThreadId("");
              setMessages([]);
            }}
          >
            +
          </button>
        </div>
        {agentRun ? (
          <section className={`chat-agent-run ${agentRun.status}`} aria-live="polite">
            <div>
              <span>ACTIVE GOAL</span>
              <strong>{agentRun.goal}</strong>
              <small>Step {agentRun.step} of {agentRun.maxSteps} · {agentRun.status.replaceAll("_", " ")}</small>
            </div>
            <p>{agentRun.terminalReason || agentRun.summary}</p>
            {agentRun.observations.length ? (
              <ol>{agentRun.observations.map((observation) => (
                <li key={`${observation.step}-${observation.actionType}`}><b>✓</b><span>{observation.summary}</span></li>
              ))}</ol>
            ) : null}
            {(agentRun.status === "working" || agentRun.status === "awaiting_confirmation") ? (
              <button type="button" onClick={() => {
                activeRunId.current = "";
                setPendingAction(null);
                setAgentRun({ ...agentRun, status: "cancelled", terminalReason: "Cancelled by you." });
                setLoading(false);
              }}>Cancel goal</button>
            ) : null}
          </section>
        ) : null}
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
              <button type="button" onClick={() => {
                activeRunId.current = "";
                setPendingAction(null);
                if (agentRun) setAgentRun({ ...agentRun, status: "cancelled", terminalReason: "The proposed change and goal were cancelled by you." });
              }}>
                Cancel goal
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
