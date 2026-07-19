import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from "react";
import "./crm.css";
import { askCrmCopilot } from "./aiService";
import { WorkloadEvidencePanel } from "../research/WorkloadEvidencePanel";
import { IngestionHealthPanel } from "../research/IngestionHealthPanel";
import { PublicAiEvidencePanel } from "../research/PublicAiEvidencePanel";
import { RagEvaluationPanel } from "../research/RagEvaluationPanel";
import { GovernedKnowledgeWorkspace } from "../research/GovernedKnowledgeWorkspace";
import {
  createKnowledgeArticle,
  crmDataSource,
  getCrmDataSnapshot,
  loadCrmData,
  persistCaseStatus,
  persistLeadStage,
  persistTaskCompletion,
  resetCrmData,
  saveCrmData,
  updateKnowledgeArticle,
  uploadInstitutionalImage,
  saveCampaign,
  requestAdmissionHandoff,
  approveAndSendCampaign,
  recordSensitiveCaseAccess,
  saveAdmissionLead,
} from "./crmRepository";
import { RichTextEditor } from "../platform/RichTextEditor";
import { CrmRecordEditor } from "./CrmRecordEditor";
import type { EditableCrmRecord } from "./CrmRecordEditor";
import type { CrmUser } from "./authService";
import type {
  AiCopilotResult,
  AdmissionLead,
  CrmDatabase,
  CrmSection,
  LeadStage,
  KnowledgeArticle,
  KnowledgeSourceEvent,
  Student,
  StudentSignal,
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

const leadStageProbability: Record<Exclude<LeadStage, "closed">, number> = {
  inquiry: 12,
  engaged: 35,
  application: 55,
  review: 75,
  admitted: 96,
};

type LeadRequirement = "owner" | "contact" | "email" | "phone" | "nextStep";

const leadStageRequirements: Record<Exclude<LeadStage, "closed">, LeadRequirement[]> = {
  inquiry: [],
  engaged: ["owner", "contact", "nextStep"],
  application: ["owner", "email", "phone", "nextStep"],
  review: ["owner", "email", "phone", "nextStep"],
  admitted: ["owner", "email", "phone", "nextStep"],
};

function missingLeadRequirements(lead: AdmissionLead, stage: Exclude<LeadStage, "closed">) {
  return leadStageRequirements[stage].filter((field) => {
    if (field === "owner") return !lead.owner || lead.owner === "Unassigned";
    if (field === "contact") return !lead.email?.trim() && !lead.phone?.trim();
    if (field === "nextStep") return !lead.nextStep?.trim() || lead.nextStep === "Review applicant record";
    return !lead[field]?.trim();
  });
}

function LeadTransitionDialog({
  lead,
  targetStage,
  currentUser,
  busy,
  onCancel,
  onConfirm,
}: {
  lead: AdmissionLead;
  targetStage: Exclude<LeadStage, "closed">;
  currentUser?: CrmUser;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (values: Pick<AdmissionLead, "email" | "phone" | "nextStep">) => void;
}) {
  const missing = missingLeadRequirements(lead, targetStage);
  const [validationError, setValidationError] = useState("");
  const needsContact = missing.includes("contact");
  const needsEmail = needsContact || missing.includes("email");
  const needsPhone = needsContact || missing.includes("phone");
  const stageLabel = leadStages.find((item) => item.id === targetStage)?.label ?? targetStage;
  return (
    <div className="academic-modal-layer lead-transition-layer">
      <button type="button" className="academic-modal-backdrop" aria-label="Cancel pipeline move" onClick={onCancel} />
      <section className="academic-modal lead-transition-dialog" role="dialog" aria-modal="true" aria-labelledby="lead-transition-title">
        <header>
          <div>
            <span>COMPLETE BEFORE MOVING</span>
            <h2 id="lead-transition-title">Move {lead.name} to {stageLabel}</h2>
            <p>Only information required for this pipeline stage is requested.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onCancel}>×</button>
        </header>
        <form
          className="lead-transition-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const values = {
              email: String(form.get("email") ?? lead.email ?? "").trim(),
              phone: String(form.get("phone") ?? lead.phone ?? "").trim(),
              nextStep: String(form.get("nextStep") ?? lead.nextStep ?? "").trim(),
            };
            if (needsContact && !values.email && !values.phone) {
              setValidationError("Add at least one reliable contact method before moving this prospect.");
              return;
            }
            setValidationError("");
            onConfirm(values);
          }}
        >
          <div className="lead-transition-summary">
            <span>{lead.stage} → <strong>{targetStage}</strong></span>
            <small>{missing.length} required item{missing.length === 1 ? "" : "s"} to complete</small>
          </div>
          {missing.includes("owner") ? (
            <div className="lead-owner-assignment">
              <span aria-hidden="true">◎</span>
              <div><strong>Assign an accountable owner</strong><small>This prospect will be assigned to {currentUser?.name || "the signed-in admissions officer"}.</small></div>
            </div>
          ) : null}
          <div className="academic-form-grid">
            {needsEmail ? <label><span>Email address{needsContact ? " (email or phone required)" : ""}</span><input name="email" type="email" required={!needsContact} autoFocus defaultValue={lead.email} placeholder="applicant@example.com" /></label> : <input type="hidden" name="email" value={lead.email ?? ""} />}
            {needsPhone ? <label><span>Phone number{needsContact ? " (email or phone required)" : ""}</span><input name="phone" type="tel" required={!needsContact} autoFocus={!needsEmail} defaultValue={lead.phone} placeholder="Applicant contact number" /></label> : <input type="hidden" name="phone" value={lead.phone ?? ""} />}
            {missing.includes("nextStep") ? <label className="wide"><span>Next accountable step</span><textarea name="nextStep" required rows={3} autoFocus={!needsEmail && !needsPhone} defaultValue={lead.nextStep === "Review applicant record" ? "" : lead.nextStep} placeholder="What happens next, who owns it, and when?" /></label> : <input type="hidden" name="nextStep" value={lead.nextStep} />}
          </div>
          {validationError ? <p className="lead-transition-error" role="alert">{validationError}</p> : null}
          <footer>
            <button type="button" className="lead-transition-cancel" onClick={onCancel}>Keep in {lead.stage}</button>
            <button type="submit" className="lead-transition-confirm" disabled={busy}>{busy ? "Saving…" : `Complete & move to ${stageLabel}`}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function exportWorkspaceSnapshot(section: CrmSection, database: CrmDatabase) {
  const records: Record<CrmSection, unknown> = {
    command: {
      students: database.students,
      tasks: database.tasks,
      cases: database.cases,
    },
    students: database.students,
    success: database.students,
    admissions: database.leads,
    cases: database.cases,
    campaigns: database.campaigns,
    knowledge: database.knowledge,
    analytics: {
      students: database.students,
      cases: database.cases,
      campaigns: database.campaigns,
      leads: database.leads,
    },
  };
  const payload = JSON.stringify(
    { section, exportedAt: new Date().toISOString(), records: records[section] },
    null,
    2,
  );
  const url = URL.createObjectURL(
    new Blob([payload], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `stu-nexus-${section}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
  sourceEvents,
  canVerify,
  onClose,
  onSaved,
}: {
  article: KnowledgeArticle | null;
  sourceEvents: KnowledgeSourceEvent[];
  canVerify: boolean;
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
              sourceType: String(form.get("sourceType")) as NonNullable<KnowledgeArticle["sourceType"]>,
              sourceEventId: String(form.get("sourceEventId")),
              audienceScope: String(form.get("audienceScope")) as NonNullable<KnowledgeArticle["audienceScope"]>,
              audienceRoles: form.getAll("audienceRoles").map(String),
              sectionId: sourceEvents.find((item) => item.id === String(form.get("sourceEventId")))?.sectionId ?? article?.sectionId ?? "",
              reviewNotes: String(form.get("reviewNotes")),
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
              Knowledge origin
              <select name="sourceType" defaultValue={article?.sourceType || "manual"}>
                <option value="manual">Direct staff contribution</option>
                <option value="personal_event">User or personal event</option>
                <option value="class_event">Class event</option>
                <option value="campus_event">Whole-campus event</option>
                <option value="policy">Policy or official decision</option>
                <option value="service">Student service experience</option>
                <option value="learning">Teaching or learning practice</option>
              </select>
            </label>
            <label className="wide">
              Related calendar event
              <select name="sourceEventId" defaultValue={article?.sourceEventId || ""}>
                <option value="">No related event</option>
                {sourceEvents.map((item) => <option key={item.id} value={item.id}>{item.title} · {new Date(item.startsAt).toLocaleDateString()} · {item.type}</option>)}
              </select>
            </label>
            <label>
              Audience
              <select name="audienceScope" defaultValue={article?.audienceScope || "institution"}>
                <option value="institution">Whole institution</option>
                <option value="staff">All staff</option>
                <option value="role">Selected roles</option>
                <option value="class">Related class</option>
              </select>
            </label>
            <label>
              Audience roles
              <select name="audienceRoles" multiple defaultValue={article?.audienceRoles || []}>
                {["student","faculty","advisor","support","admissions","finance","librarian","registrar","department_head","dean","admin"].map((role)=><option key={role} value={role}>{role.replaceAll("_"," ")}</option>)}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={article?.status || "draft"}>
                <option value="draft">Draft</option>
                <option value="review_due">Review due</option>
                {canVerify ? <option value="verified">Verified and published</option> : null}
              </select>
            </label>
            <label className="wide">
              Review context
              <textarea name="reviewNotes" rows={2} defaultValue={article?.reviewNotes} placeholder="Why this is trustworthy, what changed, and who should review it." />
            </label>
          </div>
          <label className="knowledge-rich-label">
            Article content
            <RichTextEditor
              value={content}
              onChange={setContent}
              onImageUpload={uploadInstitutionalImage}
            />
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
  const [recordEditor, setRecordEditor] = useState<EditableCrmRecord | null>(
    null,
  );
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragTargetStage, setDragTargetStage] = useState<Exclude<LeadStage, "closed"> | null>(null);
  const [leadTransition, setLeadTransition] = useState<{
    leadId: string;
    targetStage: Exclude<LeadStage, "closed">;
  } | null>(null);
  const [leadTransitionBusy, setLeadTransitionBusy] = useState(false);

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
  const transitioningLead = leadTransition
    ? database?.leads.find((lead) => lead.id === leadTransition.leadId)
    : undefined;
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

  async function moveLead(
    id: string,
    stage: Exclude<LeadStage, "closed">,
    completion?: Pick<AdmissionLead, "email" | "phone" | "nextStep">,
  ) {
    if (!database) return;
    const original = database.leads.find((lead) => lead.id === id);
    if (!original || original.stage === stage) return;
    const probability = leadStageProbability[stage];
    const completedLead = {
      ...original,
      ...completion,
      owner: completion && original.owner === "Unassigned"
        ? currentUser?.name || "Assigned staff"
        : original.owner,
      ownerId: completion && !original.ownerId ? currentUser?.id ?? null : original.ownerId,
      stage,
      probability,
      lastActivity: "Just now",
    };
    updateDatabase((current) => ({
      ...current,
      leads: current.leads.map((lead) => lead.id === id ? completedLead : lead),
    }));
    try {
      let live = true;
      if (completion) {
        await saveAdmissionLead(id, {
          name: completedLead.name,
          email: completedLead.email ?? "",
          phone: completedLead.phone ?? "",
          programId: completedLead.programId ?? "",
          ownerId: completedLead.ownerId ?? currentUser?.id ?? "",
          source: completedLead.source,
          stage,
          probability,
          nextStep: completedLead.nextStep,
        });
      } else {
        live = await persistLeadStage(id, stage, probability);
      }
      setToast(
        live
          ? `${original.name} moved to ${leadStages.find((item) => item.id === stage)?.label}.`
          : "Applicant stage updated in continuity mode.",
      );
    } catch {
      updateDatabase((current) => ({
        ...current,
        leads: current.leads.map((lead) => (lead.id === id ? original : lead)),
      }));
      setToast(
        "Applicant stage could not be saved; the previous state was restored",
      );
      throw new Error("Applicant stage could not be saved.");
    }
  }

  function requestLeadMove(id: string, targetStage: Exclude<LeadStage, "closed">) {
    if (!database) return;
    const lead = database.leads.find((item) => item.id === id);
    if (!lead || lead.stage === targetStage) return;
    if (missingLeadRequirements(lead, targetStage).length) {
      setLeadTransition({ leadId: id, targetStage });
      return;
    }
    void moveLead(id, targetStage);
  }

  function advanceLead(id: string) {
    if (!database) return;
    const lead = database.leads.find((item) => item.id === id);
    if (!lead || lead.stage === "closed" || lead.stage === "admitted") return;
    const index = leadStages.findIndex((item) => item.id === lead.stage);
    const target = leadStages[index + 1]?.id;
    if (target && target !== "closed") requestLeadMove(id, target);
  }

  function startLeadDrag(event: DragEvent<HTMLElement>, id: string) {
    setDraggedLeadId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function dropLead(event: DragEvent<HTMLElement>, stage: Exclude<LeadStage, "closed">) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggedLeadId;
    setDraggedLeadId(null);
    setDragTargetStage(null);
    if (id) requestLeadMove(id, stage);
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
      <a className="nexus-skip-link" href="#learner-support-content">
        Skip to Learner Support content
      </a>
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
              aria-current={section === item.id ? "page" : undefined}
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

      <main className="nexus-main" id="learner-support-content">
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
            <button type="button" title="Open today's action list" aria-label="Open today's action list" onClick={() => setSection("command")}>
              ◴<b>{database.tasks.filter((task) => !task.completed).length}</b>
            </button>
            <button type="button" title="Open case notifications" aria-label="Open case notifications" onClick={() => setSection("cases")}>
              ♢<b>{openCases.length}</b>
            </button>
            <a href="/">University site ↗</a>
          </div>
        </header>

        <div className="nexus-page" data-section={section}>
          <section className="nexus-workspace-context" aria-label="Current Learner Support context">
            <span><i /> Live role-scoped data</span>
            <b>{meta.title}</b>
            <small>{currentUser?.role || "authorized"} access</small>
          </section>
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
                onClick={() => {
                  exportWorkspaceSnapshot(section, database);
                  setToast(`${meta.title} data exported.`);
                }}
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
                    <button
                      type="button"
                      onClick={() =>
                        setRecordEditor({ kind: "task", record: null })
                      }
                    >
                      + Task
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
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            setRecordEditor({ kind: "task", record: task });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            if (!window.confirm(`Complete and retain task “${task.title}”?`))
                              return;
                            void persistTaskCompletion(task.id,true)
                              .then(() => loadCrmData(true))
                              .then(setDatabase)
                              .then(() => setToast("Task completed and retained."));
                          }}
                        >
                          Complete
                        </button>
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
                        <td>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRecordEditor({
                                kind: "student",
                                record: student,
                              });
                            }}
                          >
                            Edit
                          </button>
                        </td>
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
              <div className="crm-lifecycle-toolbar">
                <div>
                  <span>ADMISSIONS RECORDS</span>
                  <h3>Prospect pipeline</h3>
                </div>
                <button
                  type="button"
                  className="pipeline-add-prospect-action"
                  onClick={() =>
                    setRecordEditor({ kind: "lead", record: null })
                  }
                >
                  + Add prospect
                </button>
              </div>
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
              <p className="pipeline-drag-hint"><span aria-hidden="true">↔</span> Drag a prospect to another stage. If that stage needs more information, you’ll complete it before the move is saved.</p>
              <div className={`pipeline-board${draggedLeadId ? " is-dragging" : ""}`}>
                {leadStages.map((stage) => {
                  const leads = database.leads.filter(
                    (lead) => lead.stage === stage.id,
                  );
                  return (
                    <section
                      key={stage.id}
                      data-stage={stage.id}
                      className={dragTargetStage === stage.id ? "drag-target" : ""}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        if (draggedLeadId) setDragTargetStage(stage.id as Exclude<LeadStage, "closed">);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTargetStage(null);
                      }}
                      onDrop={(event) => dropLead(event, stage.id as Exclude<LeadStage, "closed">)}
                    >
                      <header>
                        <h3>{stage.label}</h3>
                        <b>{leads.length}</b>
                      </header>
                      <div className="pipeline-stage-content">
                        {leads.map((lead) => (
                          <article
                            key={lead.id}
                            draggable
                            className={draggedLeadId === lead.id ? "is-dragged" : ""}
                            onDragStart={(event) => startLeadDrag(event, lead.id)}
                            onDragEnd={() => { setDraggedLeadId(null); setDragTargetStage(null); }}
                            aria-label={`${lead.name}, currently in ${stage.label}. Drag to move pipeline stage.`}
                          >
                            <span className="pipeline-drag-handle" aria-hidden="true">⠿</span>
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
                                className="pipeline-advance-action"
                                onClick={() => advanceLead(lead.id)}
                                disabled={lead.stage === "admitted"}
                              >
                                {lead.stage === "admitted"
                                  ? "Ready for handoff"
                                  : "Advance →"}
                              </button>
                            </footer>
                            <small className="next-step">
                              Next: {lead.nextStep}
                            </small>
                            <div className="crm-inline-actions">
                              <button
                                type="button"
                                className="pipeline-edit-action"
                                onClick={() =>
                                  setRecordEditor({
                                    kind: "lead",
                                    record: lead,
                                  })
                                }
                              >
                                Edit
                              </button>
                              {lead.stage === "admitted" ? <button type="button" className="pipeline-handoff-action" onClick={() => { const notes=window.prompt("Registrar handoff notes (at least 12 characters)","Accepted applicant verified for student-account conversion."); if (!notes) return; void requestAdmissionHandoff(lead.id,notes).then(() => setToast("Registrar handoff created. Convert to student request is now pending.")).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Handoff failed.")); }}>Registrar handoff</button> : null}
                              <button
                                type="button"
                                className="pipeline-archive-action"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Delete prospect “${lead.name}”?`,
                                    )
                                  )
                                    return;
                                  void persistLeadStage(lead.id,"closed",0)
                                    .then(() => loadCrmData(true))
                                    .then(setDatabase)
                                    .then(() => setToast("Prospect archived as closed."));
                                }}
                              >
                                Archive
                              </button>
                            </div>
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
              <div className="crm-lifecycle-toolbar">
                <div>
                  <span>SUPPORT LIFECYCLE</span>
                  <h3>Cases</h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRecordEditor({ kind: "case", record: null })
                  }
                >
                  + Create case
                </button>
              </div>
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
                      <div className="crm-inline-actions">
                        <button
                          type="button"
                          onClick={() =>
                            setRecordEditor({ kind: "case", record: item })
                          }
                        >
                          Edit
                        </button>
                        <button type="button" onClick={() => { const purpose=window.prompt("Purpose for opening sensitive case details (at least 12 characters)"); if (!purpose) return; void recordSensitiveCaseAccess(item.id,purpose).then(() => {setSelectedStudentId(item.studentId);setToast("Sensitive-case access recorded.");}).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Sensitive access denied.")); }}>Open sensitive details</button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`Delete case “${item.title}”?`))
                              return;
                            void persistCaseStatus(item.id,"resolved")
                              .then(() => loadCrmData(true))
                              .then(setDatabase)
                              .then(() => setToast("Case retained and resolved."));
                          }}
                        >
                          Resolve &amp; retain
                        </button>
                      </div>
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
                <button
                  type="button"
                  onClick={() =>
                    setRecordEditor({ kind: "campaign", record: null })
                  }
                >
                  + New campaign
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
                          setRecordEditor({
                            kind: "campaign",
                            record: campaign,
                          })
                        }
                      >
                        Edit →
                      </button>
                      <button type="button" onClick={() => { const reason=window.prompt("Bulk communication approval reason (at least 12 characters)"); if (!reason) return; void approveAndSendCampaign(campaign.id,reason).then(() => loadCrmData(true)).then(setDatabase).then(() => setToast("Bulk campaign approved and sent through portal notifications.")).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Campaign approval failed.")); }}>Approve &amp; send campaign</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete campaign “${campaign.name}”?`,
                            )
                          )
                            return;
                          void saveCampaign(campaign.id,{name:campaign.name,audienceScope:campaign.audienceScope??"institution",programId:campaign.programId??undefined,sectionId:campaign.sectionId??undefined,studentIds:campaign.recipientStudentIds,channel:campaign.channel,status:"completed",scheduledFor:campaign.scheduledForIso ?? "",message:campaign.message ?? ""})
                            .then(() => loadCrmData(true))
                            .then(setDatabase)
                            .then(() => setToast("Campaign archived as completed."));
                        }}
                      >
                        Archive
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
              <GovernedKnowledgeWorkspace currentUser={currentUser} onMessage={setToast}/>
              <IngestionHealthPanel currentUser={currentUser} onMessage={setToast}/>
              <PublicAiEvidencePanel currentUser={currentUser} onMessage={setToast}/>
              <RagEvaluationPanel currentUser={currentUser} onMessage={setToast}/>
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
                    + Contribute knowledge
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
                      <div className="knowledge-source-context">
                        <span>{(article.sourceType ?? "manual").replaceAll("_", " ")}</span>
                        <span>{(article.audienceScope ?? "institution").replaceAll("_", " ")}</span>
                        {article.sourceEventId ? <span>Linked event</span> : null}
                      </div>
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
                          if (!window.confirm(`Archive “${article.title}”?`))
                            return;
                          void updateKnowledgeArticle(article.id,{title:article.title,category:article.category,summary:article.summary,content:article.content ?? "",sourceUrl:article.sourceUrl,status:"archived",sourceType:article.sourceType ?? "manual",sourceEventId:article.sourceEventId ?? "",audienceScope:article.audienceScope ?? "institution",audienceRoles:article.audienceRoles ?? [],sectionId:article.sectionId ?? "",reviewNotes:article.reviewNotes ?? ""})
                            .then(() => loadCrmData(true))
                            .then(setDatabase)
                            .then(() => setToast("Knowledge source archived."))
                            .catch((reason: unknown) =>
                              setToast(
                                reason instanceof Error
                                  ? reason.message
                                  : "Knowledge source could not be archived.",
                              ),
                            );
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {section === "analytics" ? (
            <section className="analytics-workspace">
              <WorkloadEvidencePanel currentUser={currentUser} onMessage={setToast}/>
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
          onEdit={() =>
            setRecordEditor({ kind: "student", record: selectedStudent })
          }
          onCreateCase={() =>
            setRecordEditor({
              kind: "case",
              record: null,
              studentId: selectedStudent.id,
            })
          }
          onLogInteraction={() =>
            setRecordEditor({
              kind: "interaction",
              record: null,
              studentId: selectedStudent.id,
            })
          }
          onCreateSignal={() =>
            setRecordEditor({
              kind: "signal",
              record: null,
              studentId: selectedStudent.id,
            })
          }
          onEditSignal={(signal) =>
            setRecordEditor({
              kind: "signal",
              record: signal,
              studentId: selectedStudent.id,
            })
          }
        />
      ) : null}

      {leadTransition && transitioningLead ? (
        <LeadTransitionDialog
          lead={transitioningLead}
          targetStage={leadTransition.targetStage}
          currentUser={currentUser}
          busy={leadTransitionBusy}
          onCancel={() => {
            if (!leadTransitionBusy) setLeadTransition(null);
          }}
          onConfirm={(completion) => {
            setLeadTransitionBusy(true);
            void moveLead(transitioningLead.id, leadTransition.targetStage, completion)
              .then(() => setLeadTransition(null))
              .catch(() => undefined)
              .finally(() => setLeadTransitionBusy(false));
          }}
        />
      ) : null}

      {recordEditor ? (
        <CrmRecordEditor
          value={recordEditor}
          database={database}
          onClose={() => setRecordEditor(null)}
          onError={setToast}
          onSaved={(message) => {
            setRecordEditor(null);
            void loadCrmData(true)
              .then(setDatabase)
              .then(() => setToast(message));
          }}
        />
      ) : null}

      {knowledgeEditor ? (
        <KnowledgeEditor
          article={knowledgeEditor === "new" ? null : knowledgeEditor}
          sourceEvents={database.knowledgeEvents ?? []}
          canVerify={Boolean(currentUser?.isOwner || ["owner","admin","librarian"].includes(currentUser?.role || ""))}
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
  onEdit,
  onCreateCase,
  onLogInteraction,
  onCreateSignal,
  onEditSignal,
}: {
  student: Student;
  cases: number;
  onClose: () => void;
  onAskAi: () => void;
  onEdit: () => void;
  onCreateCase: () => void;
  onLogInteraction: () => void;
  onCreateSignal: () => void;
  onEditSignal: (signal: StudentSignal) => void;
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
          <button type="button" onClick={onEdit}>
            Edit student
          </button>
          <button type="button" onClick={onCreateCase}>
            Create case
          </button>
          <button type="button" onClick={onLogInteraction}>
            Log interaction
          </button>
          <button type="button" onClick={onCreateSignal}>
            Add signal
          </button>
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
            <article className="drawer-signal" key={signal.id ?? signal.label}>
              <i className={signal.tone} />
              <div>
                <strong>{signal.label}</strong>
                <p>{signal.detail}</p>
              </div>
              {signal.id ? (
                <button type="button" onClick={() => onEditSignal(signal)}>
                  Edit
                </button>
              ) : null}
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
