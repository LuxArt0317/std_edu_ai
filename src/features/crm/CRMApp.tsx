import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ListTodo, Download, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { summarizeCrm } from './crmSummary'
import { Badge } from '@/components/ui/badge'
import { confirmAction, requestText } from '@/lib/decisions'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { CheckboxField } from '@/components/form-controls'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import "./crm.css";
import { askCrmCopilot } from "./aiService";
import { WorkloadEvidencePanel } from "../research/WorkloadEvidencePanel";
import { IngestionHealthPanel } from "../research/IngestionHealthPanel";
import { PublicAiEvidencePanel } from "../research/PublicAiEvidencePanel";
import { RagEvaluationPanel } from "../research/RagEvaluationPanel";
import { ResearchOperationsPanel } from "../research/ResearchOperationsPanel";
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
import { RichTextEditor } from "@/components/rich-text-editor";
import { CrmRecordEditor } from "./CrmRecordEditor";
import type { EditableCrmRecord } from "./CrmRecordEditor";
import type { CrmUser } from "./authService";
import type {
  AiCopilotResult,
  AdmissionLead,
  CrmDatabase,
  CaseStatus,
  CrmSection,
  LeadStage,
  KnowledgeArticle,
  KnowledgeSourceEvent,
  Student,
  StudentSignal,
} from "./types";

const sectionMeta: Record<
  CrmSection,
  { eyebrow: string; title: string; description: string }
> = {
  command: {
    eyebrow: "TODAY",
    title: "Tasks",
    description:
      "Manage follow-ups and support cases.",
  },
  students: {
    eyebrow: "Students",
    title: "Students",
    description:
      "Student records and support history.",
  },
  success: {
    eyebrow: "Alerts",
    title: "Alerts",
    description:
      "Review students who may need help.",
  },
  admissions: {
    eyebrow: "Admissions",
    title: "Admissions pipeline",
    description:
      "Track applications and enrollment.",
  },
  cases: {
    eyebrow: "Cases",
    title: "Cases",
    description:
      "Create, assign and update cases.",
  },
  campaigns: {
    eyebrow: "Messages",
    title: "Messages",
    description:
      "Create messages and review delivery.",
  },
  knowledge: {
    eyebrow: "Knowledge",
    title: "Knowledge",
    description:
      "Manage sources, documents and approvals.",
  },
  analytics: {
    eyebrow: "Reports",
    title: "Reports",
    description:
      "View student and service reports.",
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
    <Dialog open onOpenChange={(open) => { if (!open) (onCancel)(); }}><DialogContent showCloseButton={false} className="academic-modal lead-transition-dialog max-h-[90dvh] overflow-y-auto sm:max-w-4xl" role="dialog" aria-modal="true" aria-labelledby="lead-transition-title"><DialogDescription className="sr-only">Update the fields and save.</DialogDescription>
        <header>
          <div>
            <span>Complete before moving</span>
            <DialogTitle asChild><h2 id="lead-transition-title">Move {lead.name} to {stageLabel}</h2></DialogTitle>
            <p>Only information required for this pipeline stage is requested.</p>
          </div>
          <Button variant="outline" type="button" aria-label="Close" onClick={onCancel}>×</Button>
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
            {needsEmail ? <Label><span>Email address{needsContact ? " (email or phone required)" : ""}</span><Input name="email" type="email" required={!needsContact} autoFocus defaultValue={lead.email} placeholder="applicant@example.com" /></Label> : <Input type="hidden" name="email" value={lead.email ?? ""} />}
            {needsPhone ? <Label><span>Phone number{needsContact ? " (email or phone required)" : ""}</span><Input name="phone" type="tel" required={!needsContact} autoFocus={!needsEmail} defaultValue={lead.phone} placeholder="Applicant contact number" /></Label> : <Input type="hidden" name="phone" value={lead.phone ?? ""} />}
            {missing.includes("nextStep") ? <Label className="wide"><span>Next accountable step</span><Textarea name="nextStep" required rows={3} autoFocus={!needsEmail && !needsPhone} defaultValue={lead.nextStep === "Review applicant record" ? "" : lead.nextStep} placeholder="What happens next, who owns it, and when?" /></Label> : <Input type="hidden" name="nextStep" value={lead.nextStep} />}
          </div>
          {validationError ? <p className="lead-transition-error" role="alert">{validationError}</p> : null}
          <footer>
            <Button variant="outline" type="button" className="lead-transition-cancel" onClick={onCancel}>Keep in {lead.stage}</Button>
            <Button type="submit" className="lead-transition-confirm" disabled={busy}>{busy ? "Saving…" : `Complete & move to ${stageLabel}`}</Button>
          </footer>
        </form>
      </DialogContent></Dialog>
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
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "teal" | "amber" | "coral" | "blue";
  children?: ReactNode;
}) {
  return (
    <div className="metric-summary-item">
      <span>{label}</span><strong>{value}</strong><small>{detail}</small>
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: string }) {
  const colors = ['critical','urgent','negative'].includes(tone) ? 'border-red-200 bg-red-50 text-red-800' : ['high','medium','warning','waiting','review_due'].includes(tone) ? 'border-amber-200 bg-amber-50 text-amber-900' : ['low','resolved','verified','admitted'].includes(tone) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={`nexus-pill ${tone} ${colors}`}>{children}</Badge>;
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
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-4xl"><DialogDescription className="sr-only">Edit a verified institutional knowledge source.</DialogDescription>
      <section>
        <header>
          <div>
            <span>Knowledge publisher</span>
            <DialogTitle asChild><h2>
              {article
                ? "Edit institutional source"
                : "Add institutional source"}
            </h2></DialogTitle>
          </div>
          <Button variant="outline" aria-label="Close" type="button" onClick={onClose}>
            ×
          </Button>
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
            <Label>
              Title
              <Input name="title" defaultValue={article?.title} required />
            </Label>
            <Label>
              Category
              <Input
                name="category"
                defaultValue={article?.category || "Academic"}
                required
              />
            </Label>
            <Label className="wide">
              Summary
              <Textarea
                name="summary"
                defaultValue={article?.summary}
                rows={2}
                required
              />
            </Label>
            <Label>
              Source URL
              <Input
                name="sourceUrl"
                type="url"
                defaultValue={article?.sourceUrl}
              />
            </Label>
            <Label>
              Knowledge origin
              <NativeSelect name="sourceType" defaultValue={article?.sourceType || "manual"}>
                <NativeSelectOption value="manual">Direct staff contribution</NativeSelectOption>
                <NativeSelectOption value="personal_event">User or personal event</NativeSelectOption>
                <NativeSelectOption value="class_event">Class event</NativeSelectOption>
                <NativeSelectOption value="campus_event">Whole-campus event</NativeSelectOption>
                <NativeSelectOption value="policy">Policy or official decision</NativeSelectOption>
                <NativeSelectOption value="service">Student service experience</NativeSelectOption>
                <NativeSelectOption value="learning">Teaching or learning practice</NativeSelectOption>
              </NativeSelect>
            </Label>
            <Label className="wide">
              Related calendar event
              <NativeSelect name="sourceEventId" defaultValue={article?.sourceEventId || ""}>
                <NativeSelectOption value="">No related event</NativeSelectOption>
                {sourceEvents.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.title} · {new Date(item.startsAt).toLocaleDateString()} · {item.type}</NativeSelectOption>)}
              </NativeSelect>
            </Label>
            <Label>
              Audience
              <NativeSelect name="audienceScope" defaultValue={article?.audienceScope || "institution"}>
                <NativeSelectOption value="institution">Whole institution</NativeSelectOption>
                <NativeSelectOption value="staff">All staff</NativeSelectOption>
                <NativeSelectOption value="role">Selected roles</NativeSelectOption>
                <NativeSelectOption value="class">Related class</NativeSelectOption>
              </NativeSelect>
            </Label>
            <Label>
              Audience roles
              <NativeSelect name="audienceRoles" multiple defaultValue={article?.audienceRoles || []}>
                {["student","faculty","advisor","support","admissions","finance","librarian","registrar","department_head","dean","admin"].map((role)=><NativeSelectOption key={role} value={role}>{role.replaceAll("_"," ")}</NativeSelectOption>)}
              </NativeSelect>
            </Label>
            <Label>
              Status
              <NativeSelect name="status" defaultValue={article?.status || "draft"}>
                <NativeSelectOption value="draft">Draft</NativeSelectOption>
                <NativeSelectOption value="review_due">Review due</NativeSelectOption>
                {canVerify ? <NativeSelectOption value="verified">Verified and published</NativeSelectOption> : null}
              </NativeSelect>
            </Label>
            <Label className="wide">
              Review context
              <Textarea name="reviewNotes" rows={2} defaultValue={article?.reviewNotes} placeholder="Why this is trustworthy, what changed, and who should review it." />
            </Label>
          </div>
          <Label className="knowledge-rich-label">
            Article content
            <RichTextEditor
              value={content}
              onChange={setContent}
              onImageUpload={uploadInstitutionalImage}
            />
          </Label>
          {error ? <p className="knowledge-editor-error">{error}</p> : null}
          <footer>
            <span>
              Verified sources become available for grounded school guidance.
            </span>
            <Button disabled={busy}>{busy ? "Saving…" : "Save source"}</Button>
          </footer>
        </form>
      </section>
    </DialogContent></Dialog>
  );
}

function CRMApp({
  currentUser,
  activeSection,
  onSectionChange,
}: {
  currentUser: CrmUser;
  activeSection: CrmSection;
  onSectionChange: (section: CrmSection) => void;
}) {
  const [caseFilter, setCaseFilter] = useState<CaseStatus | "all">("all");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const section = activeSection;
  const setSection = onSectionChange;
  const [database, setDatabase] = useState<CrmDatabase | null>(() =>
    getCrmDataSnapshot(currentUser?.id, currentUser?.role),
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  const [studentSearch, setStudentSearch] = useState("");
  const [toast, setToast] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState(
    "Create my action brief for today",
  );
  const [copilotResult, setCopilotResult] = useState<AiCopilotResult | null>(
    null,
  );
  const [copilotLoading, setCopilotLoading] = useState(false);
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
    let active = true;
    void loadCrmData(Boolean(getCrmDataSnapshot(currentUser?.id, currentUser?.role))).then(next => { if (active) { setDatabase(next); setLoadError(""); } }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "The workspace could not be loaded."); });
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.role, loadAttempt]);

  useEffect(() => {
    if (!database) return;
    const timer = window.setTimeout(() => {
      void saveCrmData(database)
        .catch(() => setToast("Session cache could not be updated. Reload the workspace before continuing."));
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

  if (!database && loadError) return <Card className="m-6 p-6"><h2 className="text-xl font-semibold">Learner Support is unavailable</h2><p role="alert">{loadError}</p><Button variant="outline" type="button" onClick={() => { setLoadError(""); setLoadAttempt(attempt => attempt+1); }}>Retry connection</Button></Card>;
  if (!database) return <LoadingWorkspace />;

  const summary = summarizeCrm(database);
  const criticalStudents = database.students.filter(
    (student) => student.riskScore >= 60,
  );
  const openCases = database.cases.filter((item) => item.status !== "resolved");


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
        ? currentUser?.name || "Assigned to"
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
  const headingTitle = meta.title;
  const knowledgeCoverage = database.knowledge.length
    ? Math.round(
        (database.knowledge.filter((item) => item.status === "verified")
          .length /
          database.knowledge.length) *
          100,
      )
    : 0;

  return (
    <div className="nexus-shell nexus-embedded min-w-0">
      <div className="nexus-main ml-0! min-w-0" id="learner-support-content">
        <div className="nexus-page" data-section={section}>
          <section className="nexus-page-heading">
            <div>
              <h1>{headingTitle}</h1>
              <span>{meta.description}</span>
            </div>
            <div className="heading-actions">
              <Button
                type="button"
                variant="outline"
                className="quiet-action"
                onClick={() => {
                  exportWorkspaceSnapshot(section, database);
                  setToast(`${meta.title} data exported.`);
                }}
              >
                <Download className="size-4" aria-hidden="true" />Export
              </Button>
              <Button
                type="button"
                variant="outline"
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
                <Sparkles className="size-4" aria-hidden="true" />Summarize
              </Button>
            </div>
          </section>

          {section === "command" ? (
            <>
              <section className="metric-grid compact-metrics">
                <MetricCard
                  label="Active students"
                  value={database.students.length.toLocaleString()}
                  detail={`Across ${summary.programCount} represented programs`}
                  tone="teal"
                >
                  ◎
                </MetricCard>
                <MetricCard
                  label="Need attention"
                  value={criticalStudents.length.toString()}
                  detail={`${summary.highPriorityTasks} open high priority tasks`}
                  tone="coral"
                >
                  ◇
                </MetricCard>
                <MetricCard
                  label="Open cases"
                  value={openCases.length.toString()}
                  detail={`${summary.urgentCases} urgent · ${summary.waitingCases} waiting`}
                  tone="amber"
                >
                  ▣
                </MetricCard>
                <MetricCard
                  label="Admission rate"
                  value={`${summary.admissionRate}%`}
                  detail="Qualified leads admitted"
                  tone="blue"
                >
                  ↗
                </MetricCard>
              </section>

              <section className="command-grid">
                <Card className="nexus-panel today-tasks">
                  <header>
                    <div>
                      <ListTodo className="size-4 text-muted-foreground" aria-hidden="true" />
                      <h3>Follow-ups</h3>
                    </div>
                    <Button variant="outline" type="button" onClick={() => setSection("cases")}>
                      View all
                    </Button>
                    <Button variant="outline"
                      type="button"
                      onClick={() =>
                        setRecordEditor({ kind: "task", record: null })
                      }
                    >
                      + Task
                    </Button>
                  </header>
                  <div>
                    {database.tasks.slice(0, 5).map((task) => (
                      <Label
                        key={task.id}
                        className={task.completed ? "completed" : ""}
                      >
                        <CheckboxField
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
                        <Button variant="outline"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            setRecordEditor({ kind: "task", record: task });
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline"
                          type="button"
                          onClick={async (event) => {
                            event.preventDefault();
                            if (!(await confirmAction(`Complete and retain task “${task.title}”?`)))
                              return;
                            void persistTaskCompletion(task.id,true)
                              .then(() => loadCrmData(true))
                              .then(setDatabase)
                              .then(() => setToast("Task completed and retained."));
                          }}
                        >
                          Complete
                        </Button>
                      </Label>
                    ))}
                  </div>
                </Card>
                <Card className="nexus-panel signal-panel">
                  <header>
                    <div>
                      <h3>Student signals</h3>
                    </div>
                    <i>◴</i>
                  </header>
                  <div className="signal-stream">
                    {summary.signals.map(signal => <Button key={signal.key} variant="ghost" type="button" onClick={() => setSelectedStudentId(signal.studentId)}><span className={`signal-icon ${signal.tone === 'negative' ? 'coral' : signal.tone === 'warning' ? 'amber' : 'teal'}`} aria-hidden="true">◈</span><div><strong>{signal.label}</strong><p>{signal.detail}</p><small>{signal.studentName} · {signal.tone} signal</small></div></Button>)}
                    {!summary.signals.length ? <p className="p-4 text-sm text-muted-foreground">No student signals are recorded in your authorized scope.</p> : null}
                  </div>
                </Card>
              </section>
            </>
          ) : null}

          {section === "students" ? (
            <section className="students-workspace">
              <div className="workspace-toolbar">
                <Label>
                  <span>⌕</span>
                  <Input
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search name, student number, program, or tag"
                  />
                </Label>
                <div>
                  <Badge variant="secondary" className="filter-chip active">All students</Badge>
                  <Button variant="outline"
                    type="button"
                    className="filter-chip"
                    onClick={() => setStudentSearch("International")}
                  >
                    International
                  </Button>
                  <Button variant="outline"
                    type="button"
                    className="filter-chip"
                    onClick={() => setStudentSearch("Academic support")}
                  >
                    Needs support
                  </Button>
                </div>
              </div>
              <div className="student-table-wrap">
                <Table className="student-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Next action</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => (
                      <TableRow
                        key={student.id}
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        <TableCell>
                          <div className="student-identity">
                            <span>{student.initials}</span>
                            <div>
                              <strong>{student.name}</strong>
                              <small>
                                {student.studentNumber} · {student.yearLevel}
                              </small>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <strong>{student.program}</strong>
                          <small>{student.advisor}</small>
                        </TableCell>
                        <TableCell>
                          <div className="mini-meter">
                            <span style={{ width: `${student.engagement}%` }} />
                          </div>
                          <small>{student.engagement}% engagement</small>
                        </TableCell>
                        <TableCell>
                          <strong>{student.attendance}%</strong>
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={student.riskLevel}>
                            {student.riskLevel} · {student.riskScore}
                          </StatusPill>
                        </TableCell>
                        <TableCell>
                          <p className="next-action-copy">
                            {student.nextAction}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline"
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
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}

          {section === "success" ? (
            <section className="success-layout">
              <div className="risk-overview nexus-panel">
                <header>
                  <div>
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
                    <h3>Intervention queue</h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                className="quiet-action"
                    onClick={() => setToast("Priority model refreshed")}
                  >
                    Refresh signals
                  </Button>
                </div>
                {[...database.students]
                  .sort((a, b) => b.riskScore - a.riskScore)
                  .map((student, index) => (
                    <Card key={student.id}>
                      <div className="rank">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <Button variant="outline"
                        className="student-avatar"
                        type="button"
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        {student.initials}
                      </Button>
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
                          <small>Attendance</small>
                          <b>{student.attendance}%</b>
                        </span>
                        <span>
                          <small>Engagement</small>
                          <b>{student.engagement}%</b>
                        </span>
                        <span>
                          <small>GPA</small>
                          <b>{student.gpa.toFixed(2)}</b>
                        </span>
                      </div>
                      <div className="row-actions">
                        <Button variant="outline"
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
                        </Button>
                        <Button variant="outline"
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          Open
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
            </section>
          ) : null}

          {section === "admissions" ? (
            <section className="admissions-workspace">
              <div className="crm-lifecycle-toolbar">
                <div>
                  <h3>Prospect pipeline</h3>
                </div>
                <Button variant="outline"
                  type="button"
                  className="pipeline-add-prospect-action"
                  onClick={() =>
                    setRecordEditor({ kind: "lead", record: null })
                  }
                >
                  + Add prospect
                </Button>
              </div>
              <div className="pipeline-summary">
                <MetricCard
                  label="Open pipeline"
                  value={summary.openLeads.toString()}
                  detail="Across five enrollment stages"
                  tone="blue"
                />
                <MetricCard
                  label="Weighted forecast"
                  value={(
                    summary.weightedOpenForecast
                  ).toFixed(1)}
                  detail="Weighted open applicant probabilities"
                  tone="teal"
                />
                <MetricCard
                  label="Unassigned prospects"
                  value={summary.unassignedLeads.toString()}
                  detail="Active prospects needing an owner"
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
                          <Card
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
                              <Button variant="outline"
                                type="button"
                                className="pipeline-advance-action"
                                onClick={() => advanceLead(lead.id)}
                                disabled={lead.stage === "admitted"}
                              >
                                {lead.stage === "admitted"
                                  ? "Ready for handoff"
                                  : "Advance →"}
                              </Button>
                            </footer>
                            <small className="next-step">
                              Next: {lead.nextStep}
                            </small>
                            <div className="crm-inline-actions">
                              <Button variant="outline"
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
                              </Button>
                              {lead.stage === "admitted" ? <Button variant="outline" type="button" className="pipeline-handoff-action" onClick={async () => { const notes=(await requestText("Registrar handoff notes (at least 12 characters)","Accepted applicant verified for student-account conversion.")); if (!notes) return; void requestAdmissionHandoff(lead.id,notes).then(() => setToast("Registrar handoff created. Convert to student request is now pending.")).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Handoff failed.")); }}>Registrar handoff</Button> : null}
                              <Button variant="outline"
                                type="button"
                                className="pipeline-archive-action"
                                onClick={async () => {
                                  if (
                                    !(await confirmAction(
                                      `Delete prospect “${lead.name}”?`,
                                    ))
                                  )
                                    return;
                                  void persistLeadStage(lead.id,"closed",0)
                                    .then(() => loadCrmData(true))
                                    .then(setDatabase)
                                    .then(() => setToast("Prospect archived as closed."));
                                }}
                              >
                                Archive
                              </Button>
                            </div>
                          </Card>
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
                  <p>{database.cases.length} cases</p>
                </div>
                <Button variant="outline"
                  type="button"
                  onClick={() =>
                    setRecordEditor({ kind: "case", record: null })
                  }
                >
                  + Create case
                </Button>
              </div>
              <div className="case-summary-row">
                {(["open", "in_progress", "waiting", "resolved"] as const).map(
                  (status) => (
                    <Button key={status} type="button" className="case-summary" aria-pressed={caseFilter === status} variant={caseFilter === status ? "default" : "outline"} onClick={() => setCaseFilter(current => current === status ? "all" : status as CaseStatus)}>
                      <span>{status.replace("_", " ")}</span>
                      <strong>
                        {
                          database.cases.filter(
                            (item) => item.status === status,
                          ).length
                        }
                      </strong>
                      <i className={status} />
                    </Button>
                  ),
                )}
              </div>
              <div className="case-table">
                <Table aria-label="Support cases">
                  <TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Student</TableHead><TableHead>Assigned to</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {database.cases.filter(item => caseFilter === "all" || item.status === caseFilter).map(item => {
                      const student = database.students.find(entry => entry.id === item.studentId);
                      return <TableRow key={item.id}>
                        <TableCell className="min-w-56"><strong className="block text-sm font-medium">{item.title}</strong><div className="mt-1 flex items-center gap-2"><StatusPill tone={item.priority}>{item.priority}</StatusPill><span className="text-xs text-muted-foreground">{item.category}</span></div></TableCell>
                        <TableCell><Button variant="link" className="h-auto p-0 text-left" onClick={() => setSelectedStudentId(item.studentId)}>{student?.name ?? "Student"}</Button></TableCell>
                        <TableCell>{item.owner}</TableCell><TableCell className="whitespace-nowrap">{item.dueAt}</TableCell>
                        <TableCell><StatusPill tone={item.status}>{item.status.replaceAll("_", " ")}</StatusPill></TableCell>
                        <TableCell><div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => setRecordEditor({kind:"case",record:item})}>Edit</Button>
                          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void advanceCase(item.id)}>{({open:"Start case",in_progress:"Mark waiting",waiting:"Resolve case",resolved:"Reopen case"} as const)[item.status]}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { void requestText("Reason for accessing case details (at least 12 characters)").then(purpose => { if(purpose) return recordSensitiveCaseAccess(item.id,purpose).then(() => {setSelectedStudentId(item.studentId);setToast("Case access recorded.");}); }).catch(error => setToast(error instanceof Error ? error.message : "Access denied.")); }}>Access details</DropdownMenuItem>
                            {item.status !== "resolved" ? <DropdownMenuItem onSelect={() => { void confirmAction(`Resolve case “${item.title}”?`).then(confirmed => { if(confirmed) return persistCaseStatus(item.id,"resolved").then(() => loadCrmData(true)).then(setDatabase).then(() => setToast("Case resolved.")); }).catch(error => setToast(error instanceof Error ? error.message : "The case could not be resolved.")); }}>Resolve case</DropdownMenuItem> : null}
                          </DropdownMenuContent></DropdownMenu>
                        </div></TableCell>
                      </TableRow>;
                    })}
                    {!database.cases.some(item => caseFilter === "all" || item.status === caseFilter) ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No cases match this filter.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}

          {section === "campaigns" ? (
            <section className="campaign-workspace">
              <div className="campaign-hero nexus-panel">
                <div>
                  <h2>Messages</h2>
                  <p>
                    Write a message, select recipients and submit it for review.
                  </p>
                </div>
                <Button variant="outline"
                  type="button"
                  onClick={() => {
                    setCopilotQuery(
                      "Draft a concise multi-channel registration readiness campaign with a supportive tone",
                    );
                    setCopilotOpen(true);
                  }}
                >
                  ✦ Draft with Nexus AI
                </Button>
                <Button variant="outline"
                  type="button"
                  onClick={() =>
                    setRecordEditor({ kind: "campaign", record: null })
                  }
                >
                  + New campaign
                </Button>
              </div>
              <div className="campaign-grid">
                {database.campaigns.map((campaign) => (
                  <Card key={campaign.id}>
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
                        <small>Reach</small>
                        <strong>{campaign.reach.toLocaleString()}</strong>
                      </span>
                      <span>
                        <small>Engagement</small>
                        <strong>
                          {campaign.engagement || "-"}
                          {campaign.engagement ? "%" : ""}
                        </strong>
                      </span>
                    </div>
                    <footer>
                      <span>{campaign.scheduledFor}</span>
                      <Button variant="outline"
                        type="button"
                        onClick={() =>
                          setRecordEditor({
                            kind: "campaign",
                            record: campaign,
                          })
                        }
                      >
                        Edit →
                      </Button>
                      <Button variant="outline" type="button" onClick={async () => { const reason=(await requestText("Bulk communication approval reason (at least 12 characters)")); if (!reason) return; void approveAndSendCampaign(campaign.id,reason).then(() => loadCrmData(true)).then(setDatabase).then(() => setToast("Bulk campaign approved and sent through portal notifications.")).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Campaign approval failed.")); }}>Approve &amp; send campaign</Button>
                      <Button variant="outline"
                        type="button"
                        onClick={async () => {
                          if (
                            !(await confirmAction(
                              `Delete campaign “${campaign.name}”?`,
                            ))
                          )
                            return;
                          void saveCampaign(campaign.id,{name:campaign.name,audienceScope:campaign.audienceScope??"institution",programId:campaign.programId??undefined,sectionId:campaign.sectionId??undefined,studentIds:campaign.recipientStudentIds,channel:campaign.channel,status:"completed",scheduledFor:campaign.scheduledForIso ?? "",message:campaign.message ?? ""})
                            .then(() => loadCrmData(true))
                            .then(setDatabase)
                            .then(() => setToast("Campaign archived as completed."));
                        }}
                      >
                        Archive
                      </Button>
                    </footer>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {section === "knowledge" ? (
            <section className="knowledge-workspace">
              <div className="knowledge-health">
                <div>
                  <span>Document review</span>
                  <strong>{knowledgeCoverage}%</strong>
                  <p>of documents verified</p>
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
              <details className="advanced-section"><summary>Import status</summary><IngestionHealthPanel currentUser={currentUser} onMessage={setToast}/></details>
              <details className="advanced-section"><summary>Assistant usage</summary><PublicAiEvidencePanel currentUser={currentUser} onMessage={setToast}/></details>
              <details className="advanced-section"><summary>Answer tests</summary><RagEvaluationPanel currentUser={currentUser} onMessage={setToast}/></details>
              <details className="advanced-section"><summary>Service status</summary><ResearchOperationsPanel currentUser={currentUser} onMessage={setToast}/></details>
              <div className="knowledge-list">
                <div className="list-heading">
                  <div>
                    <h3>Articles</h3>
                  </div>
                  <Button variant="outline"
                    className="primary-action"
                    type="button"
                    onClick={() => setKnowledgeEditor("new")}
                  >
                    Add article
                  </Button>
                </div>
                {database.knowledge.map((article) => (
                  <Card key={article.id}>
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
                      <Button variant="outline"
                        type="button"
                        onClick={() => setKnowledgeEditor(article)}
                      >
                        Edit
                      </Button>
                      <a
                        href={article.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source ↗
                      </a>
                      <Button variant="outline"
                        type="button"
                        onClick={async () => {
                          if (!(await confirmAction(`Archive “${article.title}”?`)))
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
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {section === "analytics" ? (
            <section className="analytics-workspace">
              <details className="advanced-section"><summary>Workload</summary><WorkloadEvidencePanel currentUser={currentUser} onMessage={setToast}/></details>
            </section>
          ) : null}
        </div>
      </div>

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
              .then(() => setToast(message))
              .catch(() => setToast("The record was saved, but the view could not refresh. Reopen this module to load it."));
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
          <Button
            className="copilot-backdrop"
            type="button"
            aria-label="Close AI"
            onClick={() => setCopilotOpen(false)} variant="ghost"
          />
          <aside className="copilot-panel">
            <header>
              <div className="copilot-mark">✦</div>
              <div>
                <h2>AI Student Success Copilot</h2>
              </div>
              <Button variant="outline" type="button" onClick={() => setCopilotOpen(false)}>
                ×
              </Button>
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
                    <b>Current page</b>
                    <small>No direct identifiers are sent to OpenAI</small>
                  </div>
                </>
              )}
            </div>
            <form onSubmit={runCopilot}>
              <Textarea
                value={copilotQuery}
                onChange={(event) => setCopilotQuery(event.target.value)}
                rows={4}
                placeholder="Ask a question or describe a task"
              />
              <div>
                <span>Grounded in CRM signals and verified knowledge</span>
                <Button type="submit" disabled={copilotLoading}>
                  {copilotLoading ? "Thinking…" : "Run copilot →"}
                </Button>
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
                  <h3>Next actions</h3>
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
                  <Button variant="outline"
                    className="copy-result"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(copilotResult.answer);
                      setToast("AI response copied");
                    }}
                  >
                    Copy response
                  </Button>
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
      {crmDataSource.mode !== "live" ? (
        <Button variant="outline"
          className="demo-reset"
          type="button"
          title="Retry live connection"
          onClick={() => {
            void resetCrmData().then(setDatabase).catch(error => setToast(error instanceof Error ? error.message : "Connection failed."));
          }}
        >
          ↻
        </Button>
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
    <Sheet open onOpenChange={open => { if (!open) onClose() }}><SheetContent showCloseButton={false} className="student-drawer w-full overflow-y-auto p-0 sm:max-w-[620px]"><SheetDescription className="sr-only">Student record, support signals, interactions and contact details.</SheetDescription>
        <header>
          <Button variant="outline" type="button" aria-label="Close student profile" onClick={onClose}>
            ×
          </Button>
          <div className="drawer-avatar">{student.initials}</div>
          <div>
            <span>
              {student.studentNumber} · {student.yearLevel}
            </span>
            <SheetTitle asChild><h2>{student.name}</h2></SheetTitle>
            <p>{student.program}</p>
          </div>
          <StatusPill tone={student.riskLevel}>
            {student.riskLevel} risk · {student.riskScore}
          </StatusPill>
        </header>
        <div className="drawer-actions">
          <Button variant="outline" type="button" onClick={onAskAi}>
            ✦ AI success brief
          </Button>
          <a href={`mailto:${student.email}`}>Send message</a>
          <Button variant="outline" type="button" onClick={onEdit}>
            Edit student
          </Button>
          <Button type="button" onClick={onCreateCase}>
            Create case
          </Button>
          <Button variant="outline" type="button" onClick={onLogInteraction}>
            Log interaction
          </Button>
          <Button type="button" onClick={onCreateSignal}>
            Add signal
          </Button>
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
          <h3>{student.nextAction}</h3>
          <p>Last meaningful contact: {student.lastContact}</p>
        </section>
        <section className="drawer-section">
          <header>
            <h3>Success signals</h3>
            <span>{student.signals.length} active</span>
          </header>
          {student.signals.map((signal) => (
            <Card className="drawer-signal" key={signal.id ?? signal.label}>
              <i className={signal.tone} />
              <div>
                <strong>{signal.label}</strong>
                <p>{signal.detail}</p>
              </div>
              {signal.id ? (
                <Button variant="outline" type="button" onClick={() => onEditSignal(signal)}>
                  Edit
                </Button>
              ) : null}
            </Card>
          ))}
        </section>
        <section className="drawer-section">
          <header>
            <h3>Relationship timeline</h3>
            <span>Recent</span>
          </header>
          <div className="timeline">
            {student.timeline.map((event) => (
              <Card key={`${event.date}-${event.title}`}>
                <span>{event.date}</span>
                <i className={event.type} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </Card>
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
    </SheetContent></Sheet>
  );
}

export default CRMApp;
