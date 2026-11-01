import { toDatabasePriority } from "@/lib/priorities";
import { supabase } from "../../utils/supabase";
import type { Tables } from "../../types/database.generated.ts";
import { SessionCache } from "@/lib/session-cache";
import type {
  AdmissionLead,
  Campaign,
  CaseStatus,
  CrmDatabase,
  CrmTask,
  KnowledgeArticle,
  KnowledgeAudienceScope,
  KnowledgeSourceType,
  LeadStage,
  RiskLevel,
  Student,
  SupportCase,
} from "./types";

const STORAGE_KEY = "stu-nexus-crm-v1";

type StudentRow = Tables<"students">;
type SignalRow = Tables<"student_signals">;
type InteractionRow = Tables<"interactions">;
type CaseRow = Tables<"cases">;
type LeadRow = Tables<"admission_leads">;
type CampaignRow = Tables<"campaigns">;
type RecipientRow = Tables<"campaign_recipients">;
type TaskRow = Tables<"crm_tasks">;
type KnowledgeRow = Tables<"knowledge_articles">;
type ScheduleRow = Tables<"schedule_events">;
type ProfileRow = Tables<"profiles">;

function discardLegacyCache() {
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* Storage may be unavailable; it is never read. */ }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "ST"
  );
}

function relativeTime(value: string | null) {
  if (!value) return "No contact recorded";
  const milliseconds = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.round(milliseconds / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function shortDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function riskLevel(value: string): RiskLevel {
  return value === "critical" || value === "high" || value === "medium"
    ? value
    : "low";
}

function leadStage(value: string): LeadStage {
  return value === "engaged" ||
    value === "application" ||
    value === "review" ||
    value === "admitted" ||
    value === "closed"
    ? value
    : "inquiry";
}

function caseStatus(value: string): CaseStatus {
  return value === "in_progress" || value === "waiting" || value === "resolved"
    ? value
    : "open";
}

function casePriority(value: string): SupportCase["priority"] {
  if (value === "urgent" || value === "high" || value === "low") return value;
  return "normal";
}

function taskPriority(value: string): CrmTask["priority"] {
  if (value === "high" || value === "low") return value;
  return value === "urgent" ? "high" : "normal";
}

function campaignChannel(value: string): Campaign["channel"] {
  if (value === "sms") return "SMS";
  if (value === "line") return "LINE";
  if (value === "multichannel") return "Multi-channel";
  return "Email";
}

function campaignStatus(value: string): Campaign["status"] {
  if (value === "scheduled" || value === "active" || value === "completed")
    return value;
  return "draft";
}

function knowledgeStatus(value: string): KnowledgeArticle["status"] {
  if (value === "verified" || value === "review_due" || value === "archived") return value;
  return "draft";
}

function requireRows<T>(
  result: { data: T[] | null; error: { message: string } | null },
  label: string,
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

async function loadRemoteData(): Promise<CrmDatabase> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user)
    throw new Error("An authenticated staff session is required.");

  const [
    studentsResult,
    signalsResult,
    interactionsResult,
    casesResult,
    leadsResult,
    campaignsResult,
    recipientsResult,
    tasksResult,
    knowledgeResult,
    scheduleResult,
    profilesResult,
    programsResult,
    coursesResult,
    sectionsResult,
    rolesResult,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .order("risk_score", { ascending: false }),
    supabase
      .from("student_signals")
      .select("*")
      .order("observed_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("*")
      .order("occurred_at", { ascending: false }),
    supabase
      .from("cases")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase
      .from("admission_leads")
      .select("*")
      .order("last_activity_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("campaign_recipients").select("*"),
    supabase.from("crm_tasks").select("*").order("due_at", { ascending: true }),
    supabase
      .from("knowledge_articles")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase.from("schedule_events").select("*").order("starts_at", { ascending: false }).limit(250),
    supabase.from("profiles").select("*"),
    supabase.from("academic_programs").select("*").eq("status","active").order("name"),
    supabase.from("courses").select("id,program_id,code,title"),
    supabase.from("course_sections").select("id,course_id,section_code"),
    supabase.from("role_definitions").select("role_code,display_name").order("hierarchy_level",{ascending:false}),
  ]);

  const studentRows = requireRows<StudentRow>(studentsResult, "Students");
  const signalRows = requireRows<SignalRow>(signalsResult, "Signals");
  const interactionRows = requireRows<InteractionRow>(
    interactionsResult,
    "Interactions",
  );
  const caseRows = requireRows<CaseRow>(casesResult, "Cases");
  const leadRows = requireRows<LeadRow>(leadsResult, "Admissions");
  const campaignRows = requireRows<CampaignRow>(campaignsResult, "Campaigns");
  const recipientRows = requireRows<RecipientRow>(
    recipientsResult,
    "Campaign recipients",
  );
  const taskRows = requireRows<TaskRow>(tasksResult, "Tasks");
  const knowledgeRows = requireRows<KnowledgeRow>(knowledgeResult, "Knowledge");
  const scheduleRows = requireRows<ScheduleRow>(scheduleResult, "Knowledge event sources");
  const profileRows = requireRows<ProfileRow>(profilesResult, "Profiles");
  const programRows = requireRows(programsResult,"Academic programs");
  const courseRows = requireRows(coursesResult,"Catalog subjects");
  const sectionRows = requireRows(sectionsResult,"Class sections");
  const roleRows = requireRows(rolesResult,"Canonical roles");

  const profiles = new Map(
    profileRows.map((profile) => [profile.id, profile.full_name]),
  );
  const studentNames = new Map(
    studentRows.map((student) => [
      student.id,
      student.preferred_name || student.full_name,
    ]),
  );
  const caseNames = new Map(caseRows.map((item) => [item.id, item.title]));
  const coursesById=new Map(courseRows.map((course)=>[course.id,course]));

  const students: Student[] = studentRows.map((row) => {
    const name = row.preferred_name || row.full_name;
    const signals = signalRows
      .filter((signal) => signal.student_id === row.id)
      .map((signal) => ({
        id: signal.id,
        label: signal.label,
        detail: signal.detail,
        severity: signal.severity,
        active: !signal.resolved_at,
        tone:
          signal.severity === "positive"
            ? ("positive" as const)
            : signal.severity === "critical"
              ? ("negative" as const)
              : ("warning" as const),
      }));
    const timeline = interactionRows
      .filter((interaction) => interaction.student_id === row.id)
      .map((interaction) => ({
        id: interaction.id,
        date: shortDate(interaction.occurred_at),
        title: interaction.subject,
        detail: interaction.summary,
        interactionType: interaction.interaction_type,
        type:
          interaction.interaction_type === "campaign" ||
          interaction.interaction_type === "email" ||
          interaction.interaction_type === "call"
            ? ("message" as const)
            : interaction.interaction_type === "portal"
              ? ("system" as const)
              : ("case" as const),
      }));
    return {
      id: row.id,
      studentNumber: row.student_number,
      name,
      initials: initials(name),
      program: row.program,
      programId: row.program_id,
      yearLevel: row.year_level,
      email: row.email || "",
      phone: row.phone || "",
      advisor: row.advisor_id
        ? profiles.get(row.advisor_id) || "Assigned staff"
        : "Unassigned",
      gpa: Number(row.gpa),
      attendance: row.attendance_percent,
      engagement: row.engagement_score,
      balance: Number(row.outstanding_balance),
      riskScore: row.risk_score,
      riskLevel: riskLevel(row.risk_level),
      tags: row.tags,
      nextAction: row.next_best_action || "Review the latest student signals",
      lastContact: relativeTime(row.last_contact_at),
      signals,
      timeline: timeline.length
        ? timeline
        : [
            {
              id: `profile-${row.id}`,
              date: relativeTime(row.created_at),
              title: "Student profile activated",
              detail: "The student record is available in STU Nexus.",
              interactionType: "system",
              type: "system",
            },
          ],
    };
  });

  const cases: SupportCase[] = caseRows.map((row) => ({
    id: row.id,
    title: row.title,
    studentId: row.student_id,
    category: row.category,
    priority: casePriority(row.priority),
    status: caseStatus(row.status),
    owner: row.owner_id
      ? profiles.get(row.owner_id) || "Assigned staff"
      : "Unassigned",
    ownerId: row.owner_id,
    updatedAt: relativeTime(row.updated_at),
    dueAt: shortDate(row.due_at),
    dueAtIso: row.due_at ?? "",
    description: row.description,
  }));

  const leads: AdmissionLead[] = leadRows.map((row) => ({
    id: row.id,
    name: row.full_name,
    program: row.program_interest,
    programId: row.program_id,
    source: row.source,
    stage: leadStage(row.stage),
    probability: row.probability,
    owner: row.owner_id
      ? profiles.get(row.owner_id) || "Assigned staff"
      : "Unassigned",
    ownerId: row.owner_id,
    lastActivity: relativeTime(row.last_activity_at),
    nextStep: row.next_step || "Review applicant record",
    email: row.email || "",
    phone: row.phone || "",
  }));

  const campaigns: Campaign[] = campaignRows.map((row) => {
    const recipients = recipientRows.filter(
      (item) => item.campaign_id === row.id,
    );
    const engaged = recipients.filter(
      (item) => item.opened_at || item.delivery_status === "clicked",
    ).length;
    const audience =
      row.audience_definition &&
      typeof row.audience_definition === "object" &&
      !Array.isArray(row.audience_definition) &&
      typeof row.audience_definition.segment === "string"
        ? row.audience_definition.segment
        : "Defined CRM segment";
    return {
      id: row.id,
      name: row.name,
      audience,
      channel: campaignChannel(row.channel),
      status: campaignStatus(row.status),
      reach: recipients.length,
      engagement: recipients.length
        ? Math.round((engaged / recipients.length) * 100)
        : 0,
      scheduledFor: shortDate(row.scheduled_for),
      scheduledForIso: row.scheduled_for ?? "",
      message: row.message_template,
      audienceScope: row.audience_scope as Campaign["audienceScope"],
      programId: row.program_id,
      sectionId: row.section_id,
      recipientStudentIds: recipients.map((recipient)=>recipient.student_id),
      audienceRoles:row.audience_definition&&typeof row.audience_definition==="object"&&!Array.isArray(row.audience_definition)&&Array.isArray(row.audience_definition.roles)?row.audience_definition.roles.filter((role):role is string=>typeof role==="string"):[],
      recipients:recipients.map((recipient)=>({studentId:recipient.student_id,status:recipient.delivery_status,deliveredAt:recipient.delivered_at,openedAt:recipient.opened_at})),
    };
  });

  const tasks: CrmTask[] = taskRows.map((row) => ({
    id: row.id,
    title: row.title,
    linkedTo:
      (row.student_id && studentNames.get(row.student_id)) ||
      (row.case_id && caseNames.get(row.case_id)) ||
      "CRM workspace",
    owner: profiles.get(row.assigned_to) || "Assigned staff",
    dueAt: shortDate(row.due_at),
    dueAtIso: row.due_at ?? "",
    priority: taskPriority(row.priority),
    completed: Boolean(row.completed_at),
    studentId: row.student_id || "",
    caseId: row.case_id || "",
    assignedTo: row.assigned_to,
  }));

  const knowledge: KnowledgeArticle[] = knowledgeRows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    owner: row.owner_id
      ? profiles.get(row.owner_id) || "Assigned staff"
      : "Institutional owner",
    status: knowledgeStatus(row.status),
    updatedAt: relativeTime(row.updated_at),
    sourceUrl: row.source_url || "https://www.stu.edu.tw",
    summary: row.summary,
    content: row.content,
    usageCount: row.usage_count,
    sourceType: row.source_type as KnowledgeArticle["sourceType"],
    sourceEventId: row.source_event_id ?? "",
    audienceScope: row.audience_scope as KnowledgeArticle["audienceScope"],
    audienceRoles: row.audience_roles,
    sectionId: row.section_id ?? "",
    reviewNotes: row.review_notes,
  }));

  const knowledgeEvents = scheduleRows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.event_type,
    startsAt: row.starts_at,
    sectionId: row.section_id ?? "",
    audienceRoles: row.audience_roles,
  }));

  return {
    students,cases,leads,campaigns,tasks,knowledge,knowledgeEvents,
    programs:programRows.map((program)=>({id:program.id,code:program.code,name:program.name,departmentId:program.department_id})),
    sections:sectionRows.map((section)=>{const course=coursesById.get(section.course_id);return{id:section.id,code:`${course?.code??"Subject"} · ${section.section_code}`,title:course?.title??"Class",programId:course?.program_id??null};}),
    staff:profileRows.filter((profile)=>profile.account_status==="active"&&profile.role!=="student").map((profile)=>({id:profile.id,name:profile.full_name,role:profile.role,departmentId:profile.department_id,programId:profile.program_id})),
    roles:roleRows.map((role)=>({code:role.role_code,name:role.display_name})),
  };
}

export const crmDataSource: { mode: "live" | "fallback" | "unavailable"; label: string; detail: string } = {
  mode: "unavailable", label: "Connecting workspace", detail: "Waiting for authenticated data.",
};
class CrmIdentityChanged extends Error {}
const crmCache = new SessionCache<CrmDatabase>()
let crmIdentity = ''
let crmLoad: Promise<CrmDatabase> | null = null
let crmLoadIdentity = ''
export function getCrmDataSnapshot(userId?: string, role?: string) {
  if (!userId || crmIdentity.split(':')[0] !== userId || (role && crmIdentity !== `${userId}:${role}`)) return null
  return crmCache.read(crmIdentity)
}
export function clearCrmDataSnapshot() {
  crmCache.clear(); crmIdentity = ''; crmLoad = null; crmLoadIdentity = ''; discardLegacyCache()
}
async function authenticatedIdentity() {
  if (!supabase) throw new Error('Supabase is not configured. Contact your administrator.')
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Sign in again to load your authorized workspace.')
  const user = data.user
  return `${user.id}:${String(user.app_metadata.role ?? '')}`
}
export async function loadCrmData(force = false): Promise<CrmDatabase> {
  discardLegacyCache()
  const identity = await authenticatedIdentity()
  const generation = crmCache.begin(identity)
  crmIdentity = identity
  const cached = crmCache.read(identity)
  if (!force && cached) return cached
  if (crmLoad && crmLoadIdentity === identity) return crmLoad
  crmLoadIdentity = identity
  const loading = (async () => {
    try {
      const remote = await loadRemoteData()
      if (crmIdentity !== identity || await authenticatedIdentity() !== identity) throw new CrmIdentityChanged('The active account changed while loading. Retry your workspace.')
      crmCache.write(identity, generation, remote)
      if (crmIdentity === identity) Object.assign(crmDataSource, { mode: 'live', label: 'Live workspace', detail: 'Your authorized school records are up to date.' })
      return remote
    } catch (error) {
      if (error instanceof CrmIdentityChanged || crmIdentity !== identity) throw error
      const saved = crmCache.read(identity)
      const detail = error instanceof Error ? error.message : 'The workspace could not be loaded.'
      if (crmIdentity === identity) Object.assign(crmDataSource, { mode: saved ? 'fallback' : 'unavailable', label: saved ? 'Saved session view' : 'Connection unavailable', detail })
      if (saved) return saved
      throw new Error(detail)
    }
  })()
  crmLoad = loading
  try { return await loading }
  finally { if (crmLoad === loading) { crmLoad = null; crmLoadIdentity = '' } }
}
export async function saveCrmData(data: CrmDatabase): Promise<void> {
  const identity = await authenticatedIdentity()
  if (identity !== crmIdentity) throw new Error('The active account changed. Reload your workspace.')
  const generation = crmCache.begin(identity)
  crmCache.write(identity, generation, data)
}
async function canPersistRemotely() { await authenticatedIdentity(); return true }

export async function persistTaskCompletion(id: string, completed: boolean) {
  await canPersistRemotely();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("crm_tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id).select("id").single();
  if (error) throw new Error(error.message);
  return true;
}

export async function persistLeadStage(
  id: string,
  stage: LeadStage,
  probability: number,
) {
  await canPersistRemotely();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("admission_leads")
    .update({ stage, probability, last_activity_at: new Date().toISOString() })
    .eq("id", id).select("id").single();
  if (error) throw new Error(error.message);
  return true;
}

export async function persistCaseStatus(id: string, status: CaseStatus) {
  await canPersistRemotely();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("cases")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", id).select("id").single();
  if (error) throw new Error(error.message);
  return true;
}

export async function createKnowledgeArticle(input: {
  title: string;
  category: string;
  summary: string;
  content: string;
  sourceUrl: string;
  status: "verified" | "review_due" | "draft";
  sourceType: KnowledgeSourceType;
  sourceEventId: string;
  audienceScope: KnowledgeAudienceScope;
  audienceRoles: string[];
  sectionId: string;
  reviewNotes: string;
}) {
  if (!supabase)
    throw new Error("Supabase is required to publish institutional knowledge.");
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const { error } = await supabase.from("knowledge_articles").insert({
    title: input.title.trim().slice(0, 180),
    category: input.category.trim().slice(0, 80),
    summary: input.summary.trim().slice(0, 2000),
    content: input.content.trim().slice(0, 150000),
    source_url: input.sourceUrl.trim() || null,
    status: input.status,
    owner_id: user.user.id,
    source_profile_id: user.user.id,
    source_type: input.sourceType,
    source_event_id: input.sourceEventId || null,
    audience_scope: input.audienceScope,
    audience_roles: input.audienceRoles,
    section_id: input.sectionId || null,
    review_notes: input.reviewNotes.trim().slice(0, 4000),
    reviewed_by: input.status === "verified" ? user.user.id : null,
    verified_at: input.status === "verified" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
}

export async function updateKnowledgeArticle(
  id: string,
  input: {
    title: string;
    category: string;
    summary: string;
    content: string;
    sourceUrl: string;
    status: "verified" | "review_due" | "draft" | "archived";
    sourceType: KnowledgeSourceType;
    sourceEventId: string;
    audienceScope: KnowledgeAudienceScope;
    audienceRoles: string[];
    sectionId: string;
    reviewNotes: string;
  },
) {
  if (!supabase)
    throw new Error("Supabase is required to update institutional knowledge.");
  const { error } = await supabase
    .from("knowledge_articles")
    .update({
      title: input.title.trim().slice(0, 180),
      category: input.category.trim().slice(0, 80),
      summary: input.summary.trim().slice(0, 2000),
      content: input.content.trim().slice(0, 150000),
      source_url: input.sourceUrl.trim() || null,
      source_type: input.sourceType,
      source_event_id: input.sourceEventId || null,
      audience_scope: input.audienceScope,
      audience_roles: input.audienceRoles,
      section_id: input.sectionId || null,
      review_notes: input.reviewNotes.trim().slice(0, 4000),
      reviewed_by: input.status === "verified" ? (await supabase.auth.getUser()).data.user?.id ?? null : null,
      status: input.status,
      verified_at:
        input.status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

function requireCrmClient() {
  if (!supabase) throw new Error("Supabase is required for CRM changes.");
  return supabase;
}

export async function uploadInstitutionalImage(file: File) {
  const client = requireCrmClient();
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
  if (file.size > 8_388_608) throw new Error("Images must be 8 MB or smaller.");
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const extension =
    file.name
      .split(".")
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8) || "img";
  const path = `${user.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from("institutional-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return client.storage.from("institutional-media").getPublicUrl(path).data
    .publicUrl;
}

export async function saveCrmStudent(
  id: string,
  input: {
    name: string;
    studentNumber: string;
    programId: string;
    program: string;
    yearLevel: string;
    email: string;
    phone: string;
    gpa: number;
    attendance: number;
    engagement: number;
    balance: number;
    riskScore: number;
    riskLevel: RiskLevel;
    nextAction: string;
    tags: string[];
  },
) {
  const client = requireCrmClient();
  const { error } = await client
    .from("students")
    .update({
      full_name: input.name.trim().slice(0, 120),
      student_number: input.studentNumber.trim().slice(0, 32),
      program_id: input.programId,
      program: input.program.trim().slice(0, 160),
      year_level: input.yearLevel.trim().slice(0, 40),
      email: input.email.trim().toLowerCase().slice(0, 254) || null,
      phone: input.phone.trim().slice(0, 40) || null,
      gpa: input.gpa,
      attendance_percent: input.attendance,
      engagement_score: input.engagement,
      outstanding_balance: input.balance,
      risk_score: input.riskScore,
      risk_level: input.riskLevel,
      next_best_action: input.nextAction.trim().slice(0, 1000),
      tags: input.tags,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveCrmCase(
  id: string | null,
  input: {
    studentId: string;
    title: string;
    description: string;
    category: string;
    priority: SupportCase["priority"];
    status: CaseStatus;
    dueAt: string;
    ownerId: string;
  },
) {
  const client = requireCrmClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const values = {
    student_id: input.studentId,
    title: input.title.trim().slice(0, 180),
    description: input.description.trim().slice(0, 10000),
    category: input.category.trim().slice(0, 80),
    priority: toDatabasePriority(input.priority),
    status: input.status,
    due_at: input.dueAt || null,
    owner_id: input.ownerId,
    resolved_at: input.status === "resolved" ? new Date().toISOString() : null,
  };
  const result = id
    ? await client.from("cases").update(values).eq("id", id).select("id").single()
    : await client.from("cases").insert(values).select("id").single();
  if (result.error) throw new Error(result.error.message);
}

export async function saveAdmissionLead(
  id: string | null,
  input: {
    name: string;
    email: string;
    phone: string;
    programId: string;
    ownerId: string;
    source: string;
    stage: LeadStage;
    probability: number;
    nextStep: string;
  },
) {
  const client = requireCrmClient();
  const values = {
    full_name: input.name.trim().slice(0, 120),
    email: input.email.trim().toLowerCase().slice(0, 254) || null,
    phone: input.phone.trim().slice(0, 40) || null,
    program_id: input.programId,
    program_interest: "",
    source: input.source.trim().slice(0, 80),
    stage: input.stage,
    probability: input.probability,
    next_step: input.nextStep.trim().slice(0, 1000),
    owner_id: input.ownerId,
    last_activity_at: new Date().toISOString(),
  };
  const result = id
    ? await client.from("admission_leads").update(values).eq("id", id)
    : await client.from("admission_leads").insert(values);
  if (result.error) throw new Error(result.error.message);
}

export async function saveCrmTask(
  id: string | null,
  input: {
    title: string;
    studentId: string;
    caseId: string;
    dueAt: string;
    priority: CrmTask["priority"];
    completed: boolean;
    assignedTo: string;
  },
) {
  const client = requireCrmClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const values = {
    title: input.title.trim().slice(0, 180),
    student_id: input.studentId || null,
    case_id: input.caseId || null,
    due_at: input.dueAt || null,
    priority: toDatabasePriority(input.priority),
    assigned_to: input.assignedTo,
    completed_at: input.completed ? new Date().toISOString() : null,
  };
  const result = id
    ? await client.from("crm_tasks").update(values).eq("id", id).select("id").single()
    : await client.from("crm_tasks").insert(values).select("id").single();
  if (result.error) throw new Error(result.error.message);
}

export async function saveCampaign(
  id: string | null,
  input: {
    name: string;
    audienceScope: NonNullable<Campaign["audienceScope"]>;
    programId?: string;
    sectionId?: string;
    studentIds?: string[];
    riskLevels?: string[];
    roles?: string[];
    channel: Campaign["channel"];
    status: Campaign["status"];
    scheduledFor: string;
    message: string;
  },
) {
  const client = requireCrmClient();
  const { data: user } = await client.auth.getUser();
  const channel =
    input.channel === "Multi-channel"
      ? "multichannel"
      : input.channel.toLowerCase();
  const values = {
    name: input.name.trim().slice(0, 180),
    audience_scope: input.audienceScope,
    program_id: input.audienceScope==="program"?input.programId||null:null,
    section_id: input.audienceScope==="class"?input.sectionId||null:null,
    audience_definition: {riskLevels:input.riskLevels??[],roles:input.roles??[]},
    channel,
    status: input.status,
    scheduled_for: input.scheduledFor || null,
    message_template: input.message.trim().slice(0, 150000),
    created_by: user.user?.id,
  };
  const result = id
    ? await client.from("campaigns").update(values).eq("id", id).select("id").single()
    : await client.from("campaigns").insert(values).select("id").single();
  if (result.error) throw new Error(result.error.message);
  if(input.status==="draft"||input.status==="scheduled"){
    const {error:recipientError}=await client.rpc("sync_campaign_recipients",{p_campaign_id:result.data.id,p_student_ids:input.audienceScope==="explicit"?input.studentIds??[]:undefined});
    if(recipientError)throw new Error(recipientError.message);
  }
}

export async function saveStudentSignal(
  id: string | null,
  input: {
    studentId: string;
    label: string;
    detail: string;
    severity: string;
    signalType: string;
    active: boolean;
  },
) {
  const client = requireCrmClient();
  const values = {
    student_id: input.studentId,
    label: input.label.trim().slice(0, 120),
    detail: input.detail.trim().slice(0, 2000),
    severity: input.severity,
    signal_type: input.signalType,
    source_system: "staff",
    resolved_at: input.active ? null : new Date().toISOString(),
  };
  const result = id
    ? await client.from("student_signals").update(values).eq("id", id)
    : await client.from("student_signals").insert(values);
  if (result.error) throw new Error(result.error.message);
}

export async function logStudentInteraction(input: {
  studentId: string;
  subject: string;
  summary: string;
  interactionType: string;
}) {
  const client = requireCrmClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const { error } = await client.from("interactions").insert({
    student_id: input.studentId,
    actor_id: user.user.id,
    subject: input.subject.trim().slice(0, 180),
    summary: input.summary.trim().slice(0, 10000),
    interaction_type: input.interactionType,
  });
  if (error) throw new Error(error.message);
}

export async function requestAdmissionHandoff(leadId: string, notes: string) {
  const { error } = await requireCrmClient().rpc("request_admission_handoff", { p_lead_id: leadId, p_notes: notes.trim() });
  if (error) throw new Error(error.message);
}

export async function approveAndSendCampaign(campaignId: string, reason: string) {
  const { error } = await requireCrmClient().rpc("approve_and_send_campaign", { p_campaign_id: campaignId, p_reason: reason.trim() });
  if (error) throw new Error(error.message);
}

export async function recordSensitiveCaseAccess(caseId: string, purpose: string) {
  const { error } = await requireCrmClient().rpc("record_sensitive_case_access", { p_case_id: caseId, p_purpose: purpose.trim() });
  if (error) throw new Error(error.message);
}

export async function resetCrmData(): Promise<CrmDatabase> {
  clearCrmDataSnapshot()
  return loadCrmData(true)
}
