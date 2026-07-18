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
  source: "openai" | "continuity";
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
    | "mark_learning_progress";
  confirmation: string;
  targetId: string | null;
  sectionId: string | null;
  moduleId: string | null;
  materialId: string | null;
  destination: PortalSection | "crm" | null;
  title: string;
  description: string;
  content: string;
  materialType: "lesson" | "link" | "video" | "activity" | null;
  externalUrl: string | null;
  minutes: number | null;
  required: boolean | null;
  assessmentType: "quiz" | "exam" | "assignment" | "project" | null;
  dueAt: string | null;
  maxScore: number | null;
  priority: "normal" | "important" | "urgent" | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  completed: boolean | null;
  publish: boolean;
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
