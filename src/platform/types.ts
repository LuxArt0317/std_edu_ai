export type PlatformRole =
  | "owner"
  | "admin"
  | "president"
  | "vice_president"
  | "dean"
  | "registrar"
  | "department_head"
  | "faculty"
  | "advisor"
  | "admissions"
  | "finance"
  | "support"
  | "librarian"
  | "student";

export type PortalSection =
  | "home"
  | "academics"
  | "learning"
  | "teaching"
  | "assessments"
  | "grades"
  | "schedule"
  | "people";

export type RoleDefinition = {
  code: PlatformRole;
  name: string;
  level: number;
  category: string;
  description: string;
  capabilities: string[];
};

export type PlatformProfile = {
  id: string;
  name: string;
  role: PlatformRole;
  department: string;
  departmentId: string | null;
  programId: string | null;
  jobTitle: string;
  phone: string;
  isOwner: boolean;
  accountStatus: "active" | "suspended" | "archived";
  statusChangedAt: string | null;
  statusReason: string;
};

export type ProfileSectionAssignment = {
  id: string;
  profileId: string;
  sectionId: string;
  responsibility: "faculty" | "assistant" | "coordinator" | "observer";
  assignedBy: string;
  reason: string;
  createdAt: string;
};

export type AttendanceCorrectionRequest = {
  id: string;
  attendanceRecordId: string;
  studentProfileId: string;
  requestedStatus: "present" | "absent" | "late" | "excused";
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionReason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type ControlledActionAudit = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  reason: string;
  createdAt: string;
};

export type AuthDirectoryAccount = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  confirmedAt: string | null;
  bannedUntil: string | null;
};

export type StudentSupportRequest = {
  id: string;
  studentId: string;
  title: string;
  category: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SchoolCourse = {
  sectionId: string;
  courseId: string;
  code: string;
  title: string;
  description: string;
  credits: number;
  sectionCode: string;
  term: string;
  termStatus: string;
  facultyId: string | null;
  facultyName: string;
  modality: string;
  room: string;
  capacity: number;
  status: string;
  enrolledStudentIds: string[];
  enrolledProfileIds: string[];
};

export type CourseTopic = {
  id: string;
  sectionId: string;
  title: string;
  summary: string;
  content: string;
  position: number;
  minutes: number;
  published: boolean;
};

export type LearningModule = {
  id: string;
  sectionId: string;
  title: string;
  description: string;
  position: number;
  status: string;
  unlocksAt: string | null;
  publishedAt: string | null;
};
export type LearningMaterial = {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  type: string;
  content: string;
  externalUrl: string | null;
  storagePath: string | null;
  position: number;
  minutes: number;
  required: boolean;
  status: string;
};
export type LearningMaterialPage = {
  id: string;
  materialId: string;
  title: string;
  content: string;
  position: number;
};
export type LearningProgress = {
  id: string;
  materialId: string;
  profileId: string;
  status: string;
  completedAt: string | null;
};
export type AssignmentSubmission = {
  id: string;
  assessmentId: string;
  profileId: string;
  text: string;
  storagePath: string | null;
  status: string;
  submittedAt: string | null;
  score: number | null;
  feedback: string;
};
export type AttendanceSession = {
  id: string;
  sectionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
};
export type AttendanceRecord = {
  id: string;
  sessionId: string;
  profileId: string;
  status: string;
  notes: string;
};

export type AssessmentOption = { id: string; label: string; position: number };
export type AssessmentQuestion = {
  id: string;
  assessmentId: string;
  prompt: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  points: number;
  position: number;
  explanation: string;
  options: AssessmentOption[];
  correctOption: number | null;
};

export type SchoolAssessment = {
  id: string;
  sectionId: string;
  title: string;
  instructions: string;
  type: string;
  status: string;
  opensAt: string | null;
  dueAt: string | null;
  durationMinutes: number | null;
  attemptLimit: number;
  maxScore: number;
  releaseExplanations: boolean;
  releaseScoresImmediately: boolean;
  questions: AssessmentQuestion[];
};

export type GradeItem = {
  id: string;
  sectionId: string;
  assessmentId: string | null;
  title: string;
  category: string;
  maxScore: number;
  weight: number;
  dueAt: string | null;
};

export type GradeRecord = {
  id: string;
  gradeItemId: string;
  studentId: string | null;
  profileId: string | null;
  studentName: string;
  studentNumber: string;
  score: number;
  letterGrade: string;
  feedback: string;
  status: "draft" | "reviewed" | "published";
  publishedAt: string | null;
};

export type ScheduleEvent = {
  id: string;
  sectionId: string | null;
  title: string;
  description: string;
  type: string;
  startsAt: string;
  endsAt: string;
  location: string;
  ownerProfileId: string | null;
  audienceRoles: string[];
  createdBy: string | null;
};

export type Announcement = {
  id: string;
  sectionId: string | null;
  title: string;
  body: string;
  priority: string;
  publishedAt: string;
};

export type PortalNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export type CommunicationRequest = {
  id: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  approvalReason: string;
  createdAt: string;
};

export type InstitutionalInitiative = { id: string; type: "policy" | "initiative" | "teaching_plan" | "content_correction"; title: string; description: string; scope: string; priority: "normal" | "high" | "urgent"; status: "proposed" | "approved" | "in_progress" | "completed" | "rejected" | "escalated"; ownerId: string | null; createdBy: string; dueAt: string | null; createdAt: string };

export type PlatformStudent = {
  id: string;
  profileId: string | null;
  studentNumber: string;
  name: string;
  program: string;
  programId: string | null;
  yearLevel: string;
  email: string | null;
  fullName: string;
  preferredName: string;
  phone: string;
  advisorId: string | null;
  recordStatus: "active" | "withdrawn" | "graduated" | "merged" | "archived";
  statusReason: string;
  mergedIntoId: string | null;
};

export type AcademicTerm = {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  enrollmentStartsOn: string | null;
  enrollmentEndsOn: string | null;
  status: string;
};

export type CatalogCourse = {
  id: string;
  departmentId: string;
  programId: string | null;
  code: string;
  title: string;
  description: string;
  credits: number;
  status: string;
};

export type SectionEnrollment = {
  id: string;
  sectionId: string;
  studentId: string | null;
  profileId: string | null;
  status: string;
  enrolledAt: string;
};

export type AssessmentAttemptResult = {
  attemptId: string;
  score: number | null;
  maxScore: number | null;
  status: string;
};

export type AssessmentAttempt = AssessmentAttemptResult & {
  assessmentId: string;
  studentProfileId: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
};

export type ChatThread = { id: string; title: string; updatedAt: string };
export type ChatMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: string[];
  createdAt: string;
};

export type PlatformData = {
  roles: RoleDefinition[];
  profiles: PlatformProfile[];
  students: PlatformStudent[];
  departments: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    status: string;
    headId: string | null;
  }>;
  programs: Array<{
    id: string;
    code: string;
    name: string;
    level: string;
    departmentId: string;
    description: string;
    durationYears: number;
    status: string;
  }>;
  curricula: Array<{
    id: string;
    programId: string;
    effectiveYear: number;
    status: string;
    createdAt: string;
    source: AcademicCurriculumInput;
  }>;
  terms: AcademicTerm[];
  catalogCourses: CatalogCourse[];
  courses: SchoolCourse[];
  enrollments: SectionEnrollment[];
  topics: CourseTopic[];
  modules: LearningModule[];
  materials: LearningMaterial[];
  materialPages: LearningMaterialPage[];
  progress: LearningProgress[];
  submissions: AssignmentSubmission[];
  attendanceSessions: AttendanceSession[];
  attendanceRecords: AttendanceRecord[];
  assessments: SchoolAssessment[];
  assessmentAttempts: AssessmentAttempt[];
  gradeItems: GradeItem[];
  grades: GradeRecord[];
  schedule: ScheduleEvent[];
  announcements: Announcement[];
  threads: ChatThread[];
  roleAudits: Array<{
    id: string;
    targetProfileId: string;
    changedBy: string;
    previousRole: string;
    newRole: string;
    reason: string;
    createdAt: string;
  }>;
  accountAudits: Array<{
    id: string;
    targetProfileId: string;
    changedBy: string;
    previousStatus: string;
    newStatus: string;
    reason: string;
    createdAt: string;
  }>;
  accessAudits: Array<{
    id: string;
    targetProfileId: string;
    changedBy: string;
    action: string;
    reason: string;
    createdAt: string;
  }>;
  supportRequests: StudentSupportRequest[];
  sectionAssignments: ProfileSectionAssignment[];
  attendanceCorrections: AttendanceCorrectionRequest[];
  controlledAudits: ControlledActionAudit[];
  notifications: PortalNotification[];
  communications: CommunicationRequest[];
  initiatives: InstitutionalInitiative[];
};

export type SchoolChatAnswer = {
  answer: string;
  suggestedActions: string[];
  citations: string[];
  proposedAction: SchoolAiAction | null;
  agent: SchoolAgentDecision;
  source: "openai" | "continuity";
};

export type SchoolAgentStatus = "working" | "needs_input" | "complete" | "impossible";

export type SchoolAgentClarification = {
  question: string;
  reason: string;
  options: string[];
};

export type SchoolAgentObservation = {
  step: number;
  actionType: SchoolAiAction["type"] | "reasoning";
  outcome: "success" | "blocked" | "error";
  summary: string;
};

export type SchoolAgentDecision = {
  status: SchoolAgentStatus;
  goalSummary: string;
  stepSummary: string;
  terminalReason: string;
  plan: string[];
  remainingWork: string[];
  clarification: SchoolAgentClarification | null;
};

export type SchoolAgentRequestState = {
  runId: string;
  goal: string;
  step: number;
  maxSteps: number;
  observations: SchoolAgentObservation[];
};

export type CurriculumSubjectInput = {
  code: string;
  title: string;
  description: string;
  units: number;
  yearLevel: number;
  semester: number;
  category: "general_education" | "core" | "professional" | "elective" | "capstone" | "internship" | "physical_education" | "nstp";
  sortOrder: number;
  prerequisiteCodes: string[];
};

export type AcademicCurriculumInput = {
  programCode: string;
  programName: string;
  description: string;
  durationYears: number;
  effectiveYear: number;
  subjects: CurriculumSubjectInput[];
  blocks: Array<{ yearLevel: number; blockCode: string; capacity: number }>;
};

export type AcademicCurriculumResult = {
  status: "created" | "reused";
  planId: string;
  programId: string;
  subjects: number;
  blocks: number;
  prerequisites: number;
};

export type SchoolAiAction = {
  type:
    | "navigate"
    | "create_module"
    | "create_material"
    | "create_material_page"
    | "create_assessment"
    | "create_announcement"
    | "create_attendance"
    | "create_schedule_event"
    | "create_department"
    | "create_program"
    | "create_academic_term"
    | "create_subject"
    | "create_section"
    | "enroll_student"
    | "update_department"
    | "update_program"
    | "update_academic_term"
    | "update_subject"
    | "update_section"
    | "update_module"
    | "delete_module"
    | "update_material"
    | "delete_material"
    | "update_material_page"
    | "delete_material_page"
    | "delete_assessment"
    | "update_announcement"
    | "delete_announcement"
    | "update_attendance"
    | "delete_attendance"
    | "update_schedule_event"
    | "delete_schedule_event"
    | "create_support_request"
    | "create_communication_request"
    | "request_attendance_correction"
    | "decide_attendance_correction"
    | "create_initiative"
    | "transition_initiative"
    | "create_curriculum"
    | "mark_learning_progress";
  confirmation: string;
  code: string;
  targetId: string | null;
  sectionId: string | null;
  moduleId: string | null;
  materialId: string | null;
  departmentId: string | null;
  programId: string | null;
  termId: string | null;
  courseId: string | null;
  studentId: string | null;
  facultyId: string | null;
  recipientId: string | null;
  requestId: string | null;
  initiativeId: string | null;
  ownerId: string | null;
  attendanceRecordId: string | null;
  destination: PortalSection | "crm" | null;
  title: string;
  description: string;
  content: string;
  materialType: "lesson" | "link" | "video" | "activity" | null;
  externalUrl: string | null;
  minutes: number | null;
  required: boolean | null;
  assessmentType: "quiz" | "exam" | "assignment" | "project" | null;
  questions?: Array<{
    prompt: string;
    points: number;
    options: string[];
    correctOption: number;
    explanation: string;
  }>;
  dueAt: string | null;
  maxScore: number | null;
  priority: "normal" | "important" | "urgent" | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  completed: boolean | null;
  durationYears: number | null;
  credits: number | null;
  capacity: number | null;
  level: string;
  modality: string;
  room: string;
  status: string;
  operation: string;
  reason: string;
  approve: boolean | null;
  publish: boolean;
  curriculum: AcademicCurriculumInput | null;
};

export type GradeScanRow = {
  studentNumber: string;
  studentName: string;
  score: number | null;
  confidence: number;
  notes: string;
};
export type GradeScanResult = {
  rows: GradeScanRow[];
  warnings: string[];
  overallConfidence: number;
  requiresHumanReview: true;
  source: "openai-vision";
};
