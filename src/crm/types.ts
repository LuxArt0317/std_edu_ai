export type CrmSection =
  | "command"
  | "students"
  | "success"
  | "admissions"
  | "cases"
  | "campaigns"
  | "knowledge"
  | "analytics";

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type CaseStatus = "open" | "in_progress" | "waiting" | "resolved";
export type LeadStage =
  "inquiry" | "engaged" | "application" | "review" | "admitted" | "closed";

export interface StudentSignal {
  id?: string;
  label: string;
  detail: string;
  severity?: string;
  active?: boolean;
  tone: "negative" | "warning" | "positive";
}

export interface StudentInteraction {
  id?: string;
  date: string;
  title: string;
  detail: string;
  interactionType?: string;
  type: "case" | "message" | "academic" | "system";
}

export interface Student {
  id: string;
  studentNumber: string;
  name: string;
  initials: string;
  program: string;
  yearLevel: string;
  email: string;
  phone: string;
  advisor: string;
  gpa: number;
  attendance: number;
  engagement: number;
  balance: number;
  riskScore: number;
  riskLevel: RiskLevel;
  tags: string[];
  nextAction: string;
  lastContact: string;
  signals: StudentSignal[];
  timeline: StudentInteraction[];
}

export interface SupportCase {
  id: string;
  title: string;
  studentId: string;
  category: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: CaseStatus;
  owner: string;
  updatedAt: string;
  dueAt: string;
  dueAtIso?: string;
  description?: string;
}

export interface AdmissionLead {
  id: string;
  name: string;
  program: string;
  source: string;
  stage: LeadStage;
  probability: number;
  owner: string;
  lastActivity: string;
  nextStep: string;
  email?: string;
  phone?: string;
}

export interface Campaign {
  id: string;
  name: string;
  audience: string;
  channel: "Email" | "SMS" | "LINE" | "Multi-channel";
  status: "draft" | "scheduled" | "active" | "completed";
  reach: number;
  engagement: number;
  scheduledFor: string;
  scheduledForIso?: string;
  message?: string;
}

export interface CrmTask {
  id: string;
  title: string;
  linkedTo: string;
  owner: string;
  dueAt: string;
  dueAtIso?: string;
  priority: "high" | "normal" | "low";
  completed: boolean;
  studentId?: string;
  caseId?: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  owner: string;
  status: "verified" | "review_due" | "draft" | "archived";
  updatedAt: string;
  sourceUrl: string;
  summary: string;
  content?: string;
  usageCount: number;
}

export interface CrmDatabase {
  students: Student[];
  cases: SupportCase[];
  leads: AdmissionLead[];
  campaigns: Campaign[];
  tasks: CrmTask[];
  knowledge: KnowledgeArticle[];
}

export interface AiCopilotResult {
  answer: string;
  actions: string[];
  citations: string[];
  source: "openai" | "local-fallback";
}
