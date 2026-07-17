import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import "./crm.css";
import { askCrmCopilot } from "./aiService";
import {
  createKnowledgeArticle,
  crmDataSource,
  deleteKnowledgeArticle,
  getCrmDataSnapshot,
  loadCrmData,
  persistCaseStatus,
  persistLeadStage,
  persistTaskCompletion,
  resetCrmData,
  saveCrmData,
  updateKnowledgeArticle,
} from "./crmRepository";
import { RichTextEditor } from "../platform/RichTextEditor";
import type { CrmUser } from "./authService";
import type {
  AiCopilotResult,
  CrmDatabase,
  CrmSection,
  LeadStage,
  KnowledgeArticle,
  Student,
} from "./types";

const navigation: Array<{ id: CrmSection; label: string; icon: string }> = [
  { id: "command", label: "Command Center", icon: "⌁" },
  { id: "students", label: "Student 360", icon: "◎" },
  { id: "success", label: "Success Radar", icon: "◇" },
  { id: "admissions", label: "Admissions", icon: "↗" },
  { id: "cases", label: "Cases", icon: "▣" },
  { id: "campaigns", label: "Campaigns", icon: "◌" },
  { id: "knowledge", label: "Knowledge Hub", icon: "◫" },
  { id: "analytics", label: "Analytics", icon: "⌁" },
];

const sectionMeta: Record<
  CrmSection,
  { eyebrow: string; title: string; description: string }
> = {
  command: {
    eyebrow: "TODAY",
    title: "Your student-success command center",
    description:
      "Here is the pulse of student success across Shu-Te University.",
  },
  students: {
    eyebrow: "RELATIONSHIP INTELLIGENCE",
    title: "Student 360",
    description:
      "One trusted view of every student, interaction, signal, and next step.",
  },
  success: {
    eyebrow: "EARLY INTERVENTION",
    title: "Success Radar",
    description:
      "Prioritize meaningful support before small barriers become major ones.",
  },
  admissions: {
    eyebrow: "ENROLLMENT GROWTH",
    title: "Admissions pipeline",
    description:
      "Guide every prospective student from first interest to successful enrollment.",
  },
  cases: {
    eyebrow: "CONNECTED SERVICE",
    title: "Case workspace",
    description:
      "Coordinate academic, financial, wellbeing, and administrative support.",
  },
  campaigns: {
    eyebrow: "STUDENT ENGAGEMENT",
    title: "Campaign studio",
    description:
      "Deliver timely, relevant outreach across the channels students use.",
  },
  knowledge: {
    eyebrow: "VERIFIED UNIVERSITY TRUTH",
    title: "Knowledge Hub",
    description:
      "Keep AI and staff answers grounded in owned, reviewed institutional information.",
  },
  analytics: {
    eyebrow: "OUTCOMES & IMPACT",
    title: "Institutional analytics",
    description:
      "Measure service quality, student momentum, and operational effectiveness.",
  },
};

const leadStages: Array<{ id: LeadStage; label: string }> = [
  { id: "inquiry", label: "Inquiry" },
  { id: "engaged", label: "Engaged" },
  { id: "application", label: "Application" },
  { id: "review", label: "Review" },
  { id: "admitted", label: "Admitted" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({
  label,
  value,
  detail,
  tone = "teal",
  children,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "teal" | "amber" | "coral" | "blue";
  children?: ReactNode;
}) {
  return (
    <article className={`nexus-metric tone-${tone}`}>
      <div className="metric-orb">{children ?? "↗"}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`nexus-pill ${tone}`}>{children}</span>;
}

function LoadingWorkspace() {
  return (
    <div className="nexus-loading">
      <div className="nexus-loader-mark">STU</div>
      <strong>Preparing STU Nexus</strong>
      <span>Connecting student success signals…</span>
    </div>
  );
}

function KnowledgeEditor({
  article,
  onClose,
  onSaved,
}: {
  article: KnowledgeArticle | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(
    article?.content || article?.summary || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="knowledge-editor-layer">
      <button
        type="button"
        aria-label="Close knowledge editor"
        onClick={onClose}
      />
      <section>
        <header>
          <div>
            <span>KNOWLEDGE PUBLISHER</span>
            <h2>
              {article
                ? "Edit institutional source"
                : "Add institutional source"}
            </h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const input = {
              title: String(form.get("title")),
              category: String(form.get("category")),
              summary: String(form.get("summary")),
              sourceUrl: String(form.get("sourceUrl")),
              status: String(form.get("status")) as
                "verified" | "review_due" | "draft",
              content,
            };
            setBusy(true);
            setError("");
            void (
              article
                ? updateKnowledgeArticle(article.id, input)
                : createKnowledgeArticle(input)
            )
              .then(onSaved)
              .catch((reason: unknown) =>
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Knowledge could not be saved.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <div className="knowledge-fields">
            <label>
              Title
              <input name="title" defaultValue={article?.title} required />
            </label>
            <label>
              Category
              <input
                name="category"
                defaultValue={article?.category || "Academic"}
                required
              />
            </label>
            <label className="wide">
              Summary
              <textarea
                name="summary"
                defaultValue={article?.summary}
                rows={2}
                required
              />
            </label>
            <label>
              Source URL
              <input
                name="sourceUrl"
                type="url"
                defaultValue={article?.sourceUrl}
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={article?.status || "draft"}>
                <option value="draft">Draft</option>
                <option value="review_due">Review due</option>
                <option value="verified">Verified</option>
              </select>
            </label>
          </div>
          <label className="knowledge-rich-label">
            Article content
            <RichTextEditor value={content} onChange={setContent} />
          </label>
          {error ? <p className="knowledge-editor-error">{error}</p> : null}
          <footer>
            <span>
              Verified sources become available for grounded school guidance.
            </span>
            <button disabled={busy}>{busy ? "Saving…" : "Save source"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CRMApp({
  currentUser,
  onSignOut,
}: {
  currentUser?: CrmUser;
  onSignOut?: () => void;
}) {
  const [section, setSection] = useState<CrmSection>("command");
  const [database, setDatabase] = useState<CrmDatabase | null>(() =>
    getCrmDataSnapshot(),
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  const [studentSearch, setStudentSearch] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState(
    "Create my action brief for today",
  );
  const [copilotResult, setCopilotResult] = useState<AiCopilotResult | null>(
    null,
  );
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [knowledgeEditor, setKnowledgeEditor] = useState<
    KnowledgeArticle | "new" | null
  >(null);

  useEffect(() => {
    void loadCrmData(Boolean(getCrmDataSnapshot())).then(setDatabase);
  }, []);

  useEffect(() => {
    if (!database) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveCrmData(database)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [database]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedStudent = database?.students.find(
    (student) => student.id === selectedStudentId,
  );
  const filteredStudents = useMemo(() => {
    if (!database) return [];
    const query = studentSearch.trim().toLowerCase();
    if (!query) return database.students;
    return database.students.filter((student) =>
      [student.name, student.studentNumber, student.program, ...student.tags]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [database, studentSearch]);

  if (!database) return <LoadingWorkspace />;

  const criticalStudents = database.students.filter(
    (student) => student.riskScore >= 60,
  );
  const openCases = database.cases.filter((item) => item.status !== "resolved");
  const admittedLeads = database.leads.filter(
    (lead) => lead.stage === "admitted",
  ).length;

  function updateDatabase(
    updater: (current: CrmDatabase) => CrmDatabase,
    confirmation?: string,
  ) {
    setDatabase((current) => (current ? updater(current) : current));
    if (confirmation) setToast(confirmation);
  }

  async function toggleTask(id: string) {
    if (!database) return;
    const original = database.tasks.find((task) => task.id === id);
    if (!original) return;
    const completed = !original.completed;
    updateDatabase((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, completed } : task,
      ),
    }));
    try {
      const live = await persistTaskCompletion(id, completed);
      setToast(
        live ? "Task saved to Supabase" : "Task updated in continuity mode",
      );
    } catch {
      updateDatabase((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === id ? original : task)),
      }));
      setToast("Task could not be saved; the previous state was restored");
    }
  }

  async function advanceLead(id: string) {
    if (!database) return;
    const order: LeadStage[] = [
      "inquiry",
      "engaged",
      "application",
      "review",
      "admitted",
    ];
    const original = database.leads.find((lead) => lead.id === id);
    if (!original) return;
    const index = order.indexOf(original.stage);
    const stage = order[Math.min(index + 1, order.length - 1)];
    const probability = Math.min(96, original.probability + 16);
    updateDatabase((current) => ({
      ...current,
      leads: current.leads.map((lead) => {
        if (lead.id !== id) return lead;
        return { ...lead, stage, probability, lastActivity: "Just now" };
      }),
    }));
    try {
      const live = await persistLeadStage(id, stage, probability);
      setToast(
        live
          ? "Applicant stage saved to Supabase"
          : "Applicant moved forward locally",
      );
    } catch {
      updateDatabase((current) => ({
        ...current,
        leads: current.leads.map((lead) => (lead.id === id ? original : lead)),
      }));
      setToast(
        "Applicant stage could not be saved; the previous state was restored",
      );
    }
  }

  async function advanceCase(id: string) {
    if (!database) return;
    const order = ["open", "in_progress", "waiting", "resolved"] as const;
    const original = database.cases.find((item) => item.id === id);
    if (!original) return;
    const index = order.indexOf(original.status);
    const status = order[Math.min(index + 1, order.length - 1)];
    updateDatabase((current) => ({
      ...current,
      cases: current.cases.map((item) => {
        if (item.id !== id) return item;
        return { ...item, status, updatedAt: "Just now" };
      }),
    }));
    try {
      const live = await persistCaseStatus(id, status);
      setToast(
        live ? "Case status saved to Supabase" : "Case advanced locally",
      );
    } catch {
      updateDatabase((current) => ({
        ...current,
        cases: current.cases.map((item) => (item.id === id ? original : item)),
      }));
      setToast("Case could not be saved; the previous state was restored");
    }
  }

  async function runCopilot(event?: FormEvent, queryOverride?: string) {
    event?.preventDefault();
    const query = queryOverride?.trim() || copilotQuery.trim();
    if (!query || copilotLoading) return;
    if (queryOverride) setCopilotQuery(queryOverride);
    setCopilotOpen(true);
    setCopilotLoading(true);
    setCopilotResult(null);
    const result = await askCrmCopilot(
      query,
      selectedStudent ? "brief" : "answer",
      selectedStudent,
    );
    setCopilotResult(result);
    setCopilotLoading(false);
  }

  const meta = sectionMeta[section];
  const headingTitle =
    section === "command"
      ? `Welcome, ${currentUser?.name || "school leader"}`
      : meta.title;
  const headingEyebrow =
    section === "command"
      ? new Intl.DateTimeFormat("en", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
          .format(new Date())
          .toUpperCase()
      : meta.eyebrow;
  const knowledgeCoverage = database.knowledge.length
    ? Math.round(
        (database.knowledge.filter((item) => item.status === "verified")
          .length /
          database.knowledge.length) *
          100,
      )
    : 0;

  return (
    <div className="nexus-shell">
      <aside className={`nexus-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <a className="nexus-brand" href="/">
          <span className="brand-emblem">樹</span>
          <span>
            <b>STU NEXUS</b>
            <small>Student Relationship Cloud</small>
          </span>
        </a>
        <nav aria-label="CRM navigation">
          <p>WORKSPACE</p>
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "active" : ""}
              onClick={() => {
                setSection(item.id);
                setMobileNavOpen(false);
              }}
            >
              <i>{item.icon}</i>
              <span>{item.label}</span>
              {item.id === "cases" && openCases.length ? (
                <b>{openCases.length}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="data-source">
            <span className="status-light" />
            <div>
              <b>{crmDataSource.label}</b>
              <small>
                {saveState === "saving"
                  ? "Saving changes…"
                  : saveState === "error"
                    ? "Save interrupted"
                    : "All changes saved"}
              </small>
            </div>
          </div>
          <button
            className="user-card"
            type="button"
            onClick={onSignOut}
            title={onSignOut ? "Sign out of STU Nexus" : undefined}
          >
            <span>{currentUser?.initials || "HB"}</span>
            <div>
              <b>{currentUser?.name || "Authorized user"}</b>
              <small>
                {currentUser
                  ? `${currentUser.role} · Supabase`
                  : "CRM Administrator"}
              </small>
            </div>
            <i>{onSignOut ? "↪" : "•••"}</i>
          </button>
        </div>
      </aside>

      {mobileNavOpen ? (
        <button
          type="button"
          className="nexus-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <main className="nexus-main">
        <header className="nexus-topbar">
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            ☰
          </button>
          <button
            className="global-search"
            type="button"
            onClick={() => setSection("students")}
          >
            <span>⌕</span>
            <p>Search students, cases, applicants…</p>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <button type="button" title="Updates">
              ◴<b>{database.tasks.filter((task) => !task.completed).length}</b>
            </button>
            <button type="button" title="Notifications">
              ♢<b>{openCases.length}</b>
            </button>
            <a href="/">University site ↗</a>
          </div>
        </header>

        <div className="nexus-page">
          <section className="nexus-page-heading">
            <div>
              <p>{headingEyebrow}</p>
              <h1>{headingTitle}</h1>
              <span>{meta.description}</span>
            </div>
            <div className="heading-actions">
              <button
                type="button"
                className="quiet-action"
                onClick={() =>
                  setToast("Report exported to your secure workspace")
                }
              >
                Export
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  setCopilotQuery(
                    section === "command"
                      ? "Create my action brief for today"
                      : `Help me prioritize the ${meta.title} workspace`,
                  );
                  setCopilotOpen(true);
                }}
              >
                ✦ Ask Nexus AI
              </button>
            </div>
          </section>

          {section === "command" ? (
            <>
              <section className="command-hero">
                <div className="hero-copy">
                  <span className="ai-kicker">✦ NEXUS INTELLIGENCE</span>
                  <h2>Your day, already prioritized.</h2>
                  <p>
                    Three students need timely human attention. Nexus connected
                    academic, engagement, financial, and service signals into
                    one actionable brief.
                  </p>
                  <div className="hero-actions">
                    <button
                      type="button"
                      onClick={() =>
                        void runCopilot(
                          undefined,
                          "Create a concise action brief for today using the highest priority student and case signals",
                        )
                      }
                    >
                      Generate my AI brief <span>→</span>
                    </button>
                    <button type="button" onClick={() => setSection("success")}>
                      Open Success Radar
                    </button>
                  </div>
                </div>
                <div className="hero-priority-list">
                  <div className="priority-header">
                    <span>PRIORITY QUEUE</span>
                    <b>Updated now</b>
                  </div>
                  {criticalStudents.slice(0, 3).map((student, index) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                      <i>{index + 1}</i>
                      <span className="avatar">{student.initials}</span>
                      <div>
                        <strong>{student.name}</strong>
                        <small>{student.nextAction}</small>
                      </div>
                      <StatusPill tone={student.riskLevel}>
                        {student.riskScore}
                      </StatusPill>
                    </button>
                  ))}
                </div>
              </section>

              <section className="metric-grid">
                <MetricCard
                  label="Active students"
                  value={database.students.length.toLocaleString()}
                  detail="Across 4 represented programs"
                  tone="teal"
                >
                  ◎
                </MetricCard>
                <MetricCard
                  label="Need attention"
                  value={criticalStudents.length.toString()}
                  detail="2 require action today"
                  tone="coral"
                >
                  ◇
                </MetricCard>
                <MetricCard
                  label="Open cases"
                  value={openCases.length.toString()}
                  detail="1 urgent · 1 waiting"
                  tone="amber"
                >
                  ▣
                </MetricCard>
                <MetricCard
                  label="Admissions momentum"
                  value={`${Math.round((admittedLeads / database.leads.length) * 100)}%`}
                  detail="Qualified leads admitted"
                  tone="blue"
                >
                  ↗
                </MetricCard>
              </section>

              <section className="command-grid">
                <article className="nexus-panel today-tasks">
                  <header>
                    <div>
                      <span>TODAY</span>
                      <h3>Your action list</h3>
                    </div>
                    <button type="button" onClick={() => setSection("cases")}>
                      View all
                    </button>
                  </header>
                  <div>
                    {database.tasks.slice(0, 5).map((task) => (
                      <label
                        key={task.id}
                        className={task.completed ? "completed" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => void toggleTask(task.id)}
                        />
                        <span className={`task-check ${task.priority}`} />{" "}
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {task.linkedTo} · {task.dueAt}
                          </small>
                        </div>
                        <StatusPill tone={task.priority}>
                          {task.priority}
                        </StatusPill>
                      </label>
                    ))}
                  </div>
                </article>
                <article className="nexus-panel signal-panel">
                  <header>
                    <div>
                      <span>LIVE SIGNALS</span>
                      <h3>What changed</h3>
                    </div>
                    <i>◴</i>
                  </header>
                  <div className="signal-stream">
                    <button
                      type="button"
                      onClick={() => setSelectedStudentId("stu-002")}
                    >
                      <span className="signal-icon coral">!</span>
                      <div>
                        <strong>Registration risk escalated</strong>
                        <p>
                          Vin’s balance and attendance now require same-day
                          follow-up.
                        </p>
                        <small>12 minutes ago</small>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection("admissions")}
                    >
                      <span className="signal-icon blue">↗</span>
                      <div>
                        <strong>Applicant intent surged</strong>
                        <p>
                          Three Information Management prospects revisited
                          program content.
                        </p>
                        <small>41 minutes ago</small>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection("knowledge")}
                    >
                      <span className="signal-icon amber">◫</span>
                      <div>
                        <strong>Knowledge review due</strong>
                        <p>Financial aid guidance needs owner verification.</p>
                        <small>2 hours ago</small>
                      </div>
                    </button>
                  </div>
                </article>
              </section>
            </>
          ) : null}

          {section === "students" ? (
            <section className="students-workspace">
              <div className="workspace-toolbar">
                <label>
                  <span>⌕</span>
                  <input
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search name, student number, program, or tag"
                  />
                </label>
                <div>
                  <button type="button" className="filter-chip active">
                    All students
                  </button>
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={() => setStudentSearch("International")}
                  >
                    International
                  </button>
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={() => setStudentSearch("Academic support")}
                  >
                    Needs support
                  </button>
                </div>
              </div>
              <div className="student-table-wrap">
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Program</th>
                      <th>Momentum</th>
                      <th>Attendance</th>
                      <th>Risk</th>
                      <th>Next best action</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => (
                      <tr
                        key={student.id}
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        <td>
                          <div className="student-identity">
                            <span>{student.initials}</span>
                            <div>
                              <strong>{student.name}</strong>
                              <small>
                                {student.studentNumber} · {student.yearLevel}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{student.program}</strong>
                          <small>{student.advisor}</small>
                        </td>
                        <td>
                          <div className="mini-meter">
                            <span style={{ width: `${student.engagement}%` }} />
                          </div>
                          <small>{student.engagement}% engagement</small>
                        </td>
                        <td>
                          <strong>{student.attendance}%</strong>
                        </td>
                        <td>
                          <StatusPill tone={student.riskLevel}>
                            {student.riskLevel} · {student.riskScore}
                          </StatusPill>
                        </td>
                        <td>
                          <p className="next-action-copy">
                            {student.nextAction}
                          </p>
                        </td>
                        <td>›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {section === "success" ? (
            <section className="success-layout">
              <div className="risk-overview nexus-panel">
                <header>
                  <div>
                    <span>RISK DISTRIBUTION</span>
                    <h3>Student momentum</h3>
                  </div>
                  <strong>{database.students.length}</strong>
                </header>
                <div className="risk-bar">
                  {(["critical", "high", "medium", "low"] as const).map(
                    (level) => {
                      const count = database.students.filter(
                        (student) => student.riskLevel === level,
                      ).length;
                      return (
                        <span
                          key={level}
                          className={level}
                          style={{
                            width: `${Math.max(7, (count / database.students.length) * 100)}%`,
                          }}
                          title={`${level}: ${count}`}
                        />
                      );
                    },
                  )}
                </div>
                <div className="risk-legend">
                  {(["critical", "high", "medium", "low"] as const).map(
                    (level) => (
                      <span key={level}>
                        <i className={level} />
                        {level}
                        <b>
                          {
                            database.students.filter(
                              (student) => student.riskLevel === level,
                            ).length
                          }
                        </b>
                      </span>
                    ),
                  )}
                </div>
              </div>
              <div className="intervention-list">
                <div className="list-heading">
                  <div>
                    <span>PRIORITIZED BY NEXUS AI</span>
                    <h3>Intervention queue</h3>
                  </div>
                  <button
                    type="button"
                    className="quiet-action"
                    onClick={() => setToast("Priority model refreshed")}
                  >
                    Refresh signals
                  </button>
                </div>
                {[...database.students]
                  .sort((a, b) => b.riskScore - a.riskScore)
                  .map((student, index) => (
                    <article key={student.id}>
                      <div className="rank">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <button
                        className="student-avatar"
                        type="button"
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        {student.initials}
                      </button>
                      <div className="intervention-main">
                        <div>
                          <h4>{student.name}</h4>
                          <StatusPill tone={student.riskLevel}>
                            {student.riskLevel} risk · {student.riskScore}
                          </StatusPill>
                        </div>
                        <p>{student.nextAction}</p>
                        <div className="signal-chips">
                          {student.signals.slice(0, 3).map((signal) => (
                            <span key={signal.label} className={signal.tone}>
                              {signal.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="intervention-metrics">
                        <span>
                          <small>ATTENDANCE</small>
                          <b>{student.attendance}%</b>
                        </span>
                        <span>
                          <small>ENGAGEMENT</small>
                          <b>{student.engagement}%</b>
                        </span>
                        <span>
                          <small>GPA</small>
                          <b>{student.gpa.toFixed(2)}</b>
                        </span>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setCopilotQuery(
                              `Create a supportive intervention plan for ${student.initials}`,
                            );
                            setCopilotOpen(true);
                          }}
                        >
                          ✦ Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          Open
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ) : null}

          {section === "admissions" ? (
            <section className="admissions-workspace">
              <div className="pipeline-summary">
                <MetricCard
                  label="Open pipeline"
                  value={database.leads.length.toString()}
                  detail="Across five enrollment stages"
                  tone="blue"
                />
                <MetricCard
                  label="Weighted forecast"
                  value={(
                    database.leads.reduce(
                      (sum, lead) => sum + lead.probability,
                      0,
                    ) / 100
                  ).toFixed(1)}
                  detail="Expected enrollments in sample"
                  tone="teal"
                />
                <MetricCard
                  label="Avg. response"
                  value="1h 24m"
                  detail="31% faster than last week"
                  tone="amber"
                />
              </div>
              <div className="pipeline-board">
                {leadStages.map((stage) => {
                  const leads = database.leads.filter(
                    (lead) => lead.stage === stage.id,
                  );
                  return (
                    <section key={stage.id}>
                      <header>
                        <h3>{stage.label}</h3>
                        <b>{leads.length}</b>
                      </header>
                      <div>
                        {leads.map((lead) => (
                          <article key={lead.id}>
                            <span className="lead-source">{lead.source}</span>
                            <h4>{lead.name}</h4>
                            <p>{lead.program}</p>
                            <div className="probability">
                              <span style={{ width: `${lead.probability}%` }} />
                              <small>{lead.probability}% likelihood</small>
                            </div>
                            <footer>
                              <span>{lead.owner}</span>
                              <button
                                type="button"
                                onClick={() => void advanceLead(lead.id)}
                              >
                                {lead.stage === "admitted"
                                  ? "Enrolled"
                                  : "Advance →"}
                              </button>
                            </footer>
                            <small className="next-step">
                              Next: {lead.nextStep}
                            </small>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          ) : null}

          {section === "cases" ? (
            <section className="cases-workspace">
              <div className="case-summary-row">
                {(["open", "in_progress", "waiting", "resolved"] as const).map(
                  (status) => (
                    <button key={status} type="button" className="case-summary">
                      <span>{status.replace("_", " ")}</span>
                      <strong>
                        {
                          database.cases.filter(
                            (item) => item.status === status,
                          ).length
                        }
                      </strong>
                      <i className={status} />
                    </button>
                  ),
                )}
              </div>
              <div className="case-table">
                <div className="case-table-head">
                  <span>Case</span>
                  <span>Student</span>
                  <span>Owner</span>
                  <span>Due</span>
                  <span>Status</span>
                  <span />
                </div>
                {database.cases.map((item) => {
                  const student = database.students.find(
                    (entry) => entry.id === item.studentId,
                  );
                  return (
                    <article key={item.id}>
                      <div>
                        <StatusPill tone={item.priority}>
                          {item.priority}
                        </StatusPill>
                        <strong>{item.title}</strong>
                        <small>
                          {item.id.toUpperCase()} · {item.category} · Updated{" "}
                          {item.updatedAt}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="case-student"
                        onClick={() => setSelectedStudentId(item.studentId)}
                      >
                        <span>{student?.initials}</span>
                        {student?.name}
                      </button>
                      <span>{item.owner}</span>
                      <span>{item.dueAt}</span>
                      <StatusPill tone={item.status}>
                        {item.status.replace("_", " ")}
                      </StatusPill>
                      <button
                        type="button"
                        className="advance-case"
                        onClick={() => void advanceCase(item.id)}
                      >
                        {item.status === "resolved" ? "✓" : "Advance"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {section === "campaigns" ? (
            <section className="campaign-workspace">
              <div className="campaign-hero nexus-panel">
                <div>
                  <span>AI CAMPAIGN STUDIO</span>
                  <h2>Reach the right students before they need to ask.</h2>
                  <p>
                    Turn CRM signals into timely, personalized outreach while
                    keeping every message reviewable by staff.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCopilotQuery(
                      "Draft a concise multi-channel registration readiness campaign with a supportive tone",
                    );
                    setCopilotOpen(true);
                  }}
                >
                  ✦ Draft with Nexus AI
                </button>
              </div>
              <div className="campaign-grid">
                {database.campaigns.map((campaign) => (
                  <article key={campaign.id}>
                    <header>
                      <StatusPill tone={campaign.status}>
                        {campaign.status}
                      </StatusPill>
                      <span>{campaign.channel}</span>
                    </header>
                    <h3>{campaign.name}</h3>
                    <p>{campaign.audience}</p>
                    <div className="campaign-stats">
                      <span>
                        <small>REACH</small>
                        <strong>{campaign.reach.toLocaleString()}</strong>
                      </span>
                      <span>
                        <small>ENGAGEMENT</small>
                        <strong>
                          {campaign.engagement || "—"}
                          {campaign.engagement ? "%" : ""}
                        </strong>
                      </span>
                    </div>
                    <footer>
                      <span>{campaign.scheduledFor}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setToast(`${campaign.name} opened in campaign editor`)
                        }
                      >
                        Open →
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {section === "knowledge" ? (
            <section className="knowledge-workspace">
              <div className="knowledge-health">
                <div>
                  <span>KNOWLEDGE HEALTH</span>
                  <strong>{knowledgeCoverage}%</strong>
                  <p>of high-demand answers are verified and current</p>
                </div>
                <div
                  className="knowledge-ring"
                  style={
                    { "--coverage": `${knowledgeCoverage}%` } as CSSProperties
                  }
                >
                  <span>
                    {knowledgeCoverage}
                    <small>%</small>
                  </span>
                </div>
                <div className="health-actions">
                  <span>
                    <i className="verified" />
                    {
                      database.knowledge.filter(
                        (item) => item.status === "verified",
                      ).length
                    }{" "}
                    verified
                  </span>
                  <span>
                    <i className="review_due" />
                    {
                      database.knowledge.filter(
                        (item) => item.status === "review_due",
                      ).length
                    }{" "}
                    review due
                  </span>
                  <span>
                    <i className="draft" />
                    {
                      database.knowledge.filter(
                        (item) => item.status === "draft",
                      ).length
                    }{" "}
                    draft
                  </span>
                </div>
              </div>
              <div className="knowledge-list">
                <div className="list-heading">
                  <div>
                    <span>INSTITUTIONAL SOURCES</span>
                    <h3>Verified knowledge</h3>
                  </div>
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => setKnowledgeEditor("new")}
                  >
                    + Add source
                  </button>
                </div>
                {database.knowledge.map((article) => (
                  <article key={article.id}>
                    <div className="doc-icon">◫</div>
                    <div>
                      <div>
                        <StatusPill tone={article.status}>
                          {article.status.replace("_", " ")}
                        </StatusPill>
                        <span>{article.category}</span>
                      </div>
                      <h4>{article.title}</h4>
                      <p>{article.summary}</p>
                      <small>
                        Owner: {article.owner} · Updated {article.updatedAt} ·
                        Used {article.usageCount.toLocaleString()} times
                      </small>
                    </div>
                    <div className="knowledge-row-actions">
                      <button
                        type="button"
                        onClick={() => setKnowledgeEditor(article)}
                      >
                        Edit
                      </button>
                      <a
                        href={article.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Delete “${article.title}”?`))
                            return;
                          void deleteKnowledgeArticle(article.id)
                            .then(() => loadCrmData(true))
                            .then(setDatabase)
                            .then(() => setToast("Knowledge source deleted."))
                            .catch((reason: unknown) =>
                              setToast(
                                reason instanceof Error
                                  ? reason.message
                                  : "Knowledge source could not be deleted.",
                              ),
                            );
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {section === "analytics" ? (
            <section className="analytics-workspace">
              <div className="analytics-metrics">
                <MetricCard
                  label="Student support SLA"
                  value="92%"
                  detail="Cases answered within target"
                  tone="teal"
                />
                <MetricCard
                  label="Information deflection"
                  value="67%"
                  detail="Questions resolved by verified AI"
                  tone="blue"
                />
                <MetricCard
                  label="Intervention response"
                  value="74%"
                  detail="Students engaging within 48 hours"
                  tone="amber"
                />
                <MetricCard
                  label="User satisfaction"
                  value="4.7"
                  detail="Average post-service rating"
                  tone="coral"
                />
              </div>
              <div className="analytics-grid">
                <article className="nexus-panel trend-chart">
                  <header>
                    <div>
                      <span>STUDENT MOMENTUM</span>
                      <h3>Intervention outcomes</h3>
                    </div>
                    <select aria-label="Date range">
                      <option>Last 8 weeks</option>
                    </select>
                  </header>
                  <div className="chart-area">
                    <div className="chart-y">
                      <span>100%</span>
                      <span>75%</span>
                      <span>50%</span>
                      <span>25%</span>
                      <span>0</span>
                    </div>
                    <svg
                      viewBox="0 0 700 240"
                      preserveAspectRatio="none"
                      aria-label="Intervention outcomes trend"
                    >
                      <defs>
                        <linearGradient
                          id="chartFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0"
                            stopColor="#3cb69e"
                            stopOpacity=".32"
                          />
                          <stop
                            offset="1"
                            stopColor="#3cb69e"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>
                      <path
                        className="fill"
                        d="M0 195 C90 180 100 166 180 170 S285 132 350 142 S445 105 520 112 S625 73 700 62 L700 240 L0 240 Z"
                      />
                      <path
                        className="line"
                        d="M0 195 C90 180 100 166 180 170 S285 132 350 142 S445 105 520 112 S625 73 700 62"
                      />
                    </svg>
                    <div className="chart-x">
                      <span>May 25</span>
                      <span>Jun 08</span>
                      <span>Jun 22</span>
                      <span>Jul 06</span>
                      <span>Jul 16</span>
                    </div>
                  </div>
                </article>
                <article className="nexus-panel outcomes">
                  <header>
                    <div>
                      <span>OUTCOME MIX</span>
                      <h3>Cases by domain</h3>
                    </div>
                  </header>
                  {[
                    "Academic advising",
                    "Financial aid",
                    "Registrar",
                    "Student care",
                    "Department",
                  ].map((label, index) => (
                    <div key={label}>
                      <span>{label}</span>
                      <div>
                        <i
                          style={{ width: `${[82, 64, 55, 47, 34][index]}%` }}
                        />
                      </div>
                      <b>{[82, 64, 55, 47, 34][index]}</b>
                    </div>
                  ))}
                </article>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      {selectedStudent ? (
        <StudentDrawer
          student={selectedStudent}
          cases={
            database.cases.filter(
              (item) => item.studentId === selectedStudent.id,
            ).length
          }
          onClose={() => setSelectedStudentId(null)}
          onAskAi={() => {
            setCopilotQuery(
              `Create a student success brief for ${selectedStudent.initials} with recommended next actions`,
            );
            setCopilotOpen(true);
          }}
        />
      ) : null}

      {knowledgeEditor ? (
        <KnowledgeEditor
          article={knowledgeEditor === "new" ? null : knowledgeEditor}
          onClose={() => setKnowledgeEditor(null)}
          onSaved={() => {
            setKnowledgeEditor(null);
            void loadCrmData(true)
              .then(setDatabase)
              .then(() => setToast("Knowledge source saved."));
          }}
        />
      ) : null}
      {copilotOpen ? (
        <div className="copilot-layer">
          <button
            className="copilot-backdrop"
            type="button"
            aria-label="Close AI"
            onClick={() => setCopilotOpen(false)}
          />
          <aside className="copilot-panel">
            <header>
              <div className="copilot-mark">✦</div>
              <div>
                <span>NEXUS INTELLIGENCE</span>
                <h2>AI Student Success Copilot</h2>
              </div>
              <button type="button" onClick={() => setCopilotOpen(false)}>
                ×
              </button>
            </header>
            <div className="copilot-context">
              {selectedStudent ? (
                <>
                  <span>{selectedStudent.initials}</span>
                  <div>
                    <b>Working with de-identified student context</b>
                    <small>
                      {selectedStudent.program} · {selectedStudent.riskLevel}{" "}
                      risk
                    </small>
                  </div>
                </>
              ) : (
                <>
                  <span>STU</span>
                  <div>
                    <b>Institutional workspace context</b>
                    <small>No direct identifiers are sent to OpenAI</small>
                  </div>
                </>
              )}
            </div>
            <form onSubmit={runCopilot}>
              <textarea
                value={copilotQuery}
                onChange={(event) => setCopilotQuery(event.target.value)}
                rows={4}
                placeholder="Ask Nexus to summarize, prioritize, or draft…"
              />
              <div>
                <span>Grounded in CRM signals and verified knowledge</span>
                <button type="submit" disabled={copilotLoading}>
                  {copilotLoading ? "Thinking…" : "Run copilot →"}
                </button>
              </div>
            </form>
            <div className="copilot-output">
              {copilotLoading ? (
                <div className="thinking">
                  <i />
                  <i />
                  <i />
                  <span>Connecting the evidence…</span>
                </div>
              ) : copilotResult ? (
                <>
                  <div className="output-source">
                    <StatusPill
                      tone={
                        copilotResult.source === "openai"
                          ? "verified"
                          : "warning"
                      }
                    >
                      {copilotResult.source === "openai"
                        ? "OpenAI · grounded"
                        : "Local continuity mode"}
                    </StatusPill>
                  </div>
                  <h3>Recommended response</h3>
                  <p>{copilotResult.answer}</p>
                  <h3>Next best actions</h3>
                  <ol>
                    {copilotResult.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                  <h3>Evidence used</h3>
                  <div className="citation-list">
                    {copilotResult.citations.map((citation) => (
                      <span key={citation}>◫ {citation}</span>
                    ))}
                  </div>
                  <button
                    className="copy-result"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(copilotResult.answer);
                      setToast("AI response copied");
                    }}
                  >
                    Copy response
                  </button>
                </>
              ) : (
                <div className="copilot-empty">
                  <div>✦</div>
                  <h3>Turn signals into thoughtful action</h3>
                  <p>
                    Ask for a daily brief, intervention plan, case summary, or a
                    ready-to-review student message.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {toast ? (
        <div className="nexus-toast">
          <span>✓</span>
          {toast}
        </div>
      ) : null}
      <button
        className="floating-copilot"
        type="button"
        onClick={() => setCopilotOpen(true)}
      >
        ✦<span>Ask Nexus AI</span>
      </button>
      {crmDataSource.mode !== "live" ? (
        <button
          className="demo-reset"
          type="button"
          title="Reset demo data"
          onClick={() => {
            void resetCrmData().then(setDatabase);
            setToast("Demo workspace reset");
          }}
        >
          ↻
        </button>
      ) : null}
    </div>
  );
}

function StudentDrawer({
  student,
  cases,
  onClose,
  onAskAi,
}: {
  student: Student;
  cases: number;
  onClose: () => void;
  onAskAi: () => void;
}) {
  return (
    <div className="student-drawer-layer">
      <button
        className="drawer-backdrop"
        type="button"
        aria-label="Close student profile"
        onClick={onClose}
      />
      <aside className="student-drawer">
        <header>
          <button type="button" onClick={onClose}>
            ×
          </button>
          <div className="drawer-avatar">{student.initials}</div>
          <div>
            <span>
              {student.studentNumber} · {student.yearLevel}
            </span>
            <h2>{student.name}</h2>
            <p>{student.program}</p>
          </div>
          <StatusPill tone={student.riskLevel}>
            {student.riskLevel} risk · {student.riskScore}
          </StatusPill>
        </header>
        <div className="drawer-actions">
          <button type="button" onClick={onAskAi}>
            ✦ AI success brief
          </button>
          <a href={`mailto:${student.email}`}>Send message</a>
          <button type="button">Create case</button>
        </div>
        <section className="student-vitals">
          <div>
            <span>GPA</span>
            <strong>{student.gpa.toFixed(2)}</strong>
          </div>
          <div>
            <span>Attendance</span>
            <strong>{student.attendance}%</strong>
          </div>
          <div>
            <span>Engagement</span>
            <strong>{student.engagement}%</strong>
          </div>
          <div>
            <span>Open cases</span>
            <strong>{cases}</strong>
          </div>
        </section>
        <section className="next-best-action">
          <span>NEXT BEST ACTION</span>
          <h3>{student.nextAction}</h3>
          <p>Last meaningful contact: {student.lastContact}</p>
        </section>
        <section className="drawer-section">
          <header>
            <h3>Success signals</h3>
            <span>{student.signals.length} active</span>
          </header>
          {student.signals.map((signal) => (
            <article className="drawer-signal" key={signal.label}>
              <i className={signal.tone} />
              <div>
                <strong>{signal.label}</strong>
                <p>{signal.detail}</p>
              </div>
            </article>
          ))}
        </section>
        <section className="drawer-section">
          <header>
            <h3>Relationship timeline</h3>
            <span>Recent</span>
          </header>
          <div className="timeline">
            {student.timeline.map((event) => (
              <article key={`${event.date}-${event.title}`}>
                <span>{event.date}</span>
                <i className={event.type} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="contact-details">
          <p>
            <span>Email</span>
            <a href={`mailto:${student.email}`}>{student.email}</a>
          </p>
          <p>
            <span>Phone</span>
            <a href={`tel:${student.phone}`}>{student.phone}</a>
          </p>
          <p>
            <span>Advisor</span>
            <strong>{student.advisor}</strong>
          </p>
          <p>
            <span>Balance</span>
            <strong>{formatCurrency(student.balance)}</strong>
          </p>
        </section>
      </aside>
    </div>
  );
}

export default CRMApp;
