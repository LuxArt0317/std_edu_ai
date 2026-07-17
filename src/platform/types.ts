export type PlatformRole =
  | 'owner'
  | 'admin'
  | 'president'
  | 'vice_president'
  | 'dean'
  | 'registrar'
  | 'department_head'
  | 'faculty'
  | 'advisor'
  | 'admissions'
  | 'finance'
  | 'support'
  | 'librarian'
  | 'student'

export type PortalSection = 'home' | 'academics' | 'learning' | 'teaching' | 'assessments' | 'grades' | 'schedule' | 'people'

export type RoleDefinition = {
  code: PlatformRole
  name: string
  level: number
  category: string
  description: string
  capabilities: string[]
}

export type PlatformProfile = {
  id: string
  name: string
  role: PlatformRole
  department: string
  jobTitle: string
  isOwner: boolean
}

export type SchoolCourse = {
  sectionId: string
  courseId: string
  code: string
  title: string
  description: string
  credits: number
  sectionCode: string
  term: string
  termStatus: string
  facultyId: string | null
  facultyName: string
  modality: string
  room: string
  capacity: number
  status: string
  enrolledStudentIds: string[]
  enrolledProfileIds: string[]
}

export type CourseTopic = {
  id: string
  sectionId: string
  title: string
  summary: string
  content: string
  position: number
  minutes: number
  published: boolean
}

export type AssessmentOption = { id: string; label: string; position: number }
export type AssessmentQuestion = {
  id: string
  assessmentId: string
  prompt: string
  type: 'multiple_choice' | 'true_false' | 'short_answer'
  points: number
  position: number
  explanation: string
  options: AssessmentOption[]
}

export type SchoolAssessment = {
  id: string
  sectionId: string
  title: string
  instructions: string
  type: string
  status: string
  opensAt: string | null
  dueAt: string | null
  durationMinutes: number | null
  attemptLimit: number
  maxScore: number
  questions: AssessmentQuestion[]
}

export type GradeItem = {
  id: string
  sectionId: string
  assessmentId: string | null
  title: string
  category: string
  maxScore: number
  weight: number
  dueAt: string | null
}

export type GradeRecord = {
  id: string
  gradeItemId: string
  studentId: string | null
  profileId: string | null
  studentName: string
  studentNumber: string
  score: number
  letterGrade: string
  feedback: string
  status: 'draft' | 'reviewed' | 'published'
  publishedAt: string | null
}

export type ScheduleEvent = {
  id: string
  sectionId: string | null
  title: string
  description: string
  type: string
  startsAt: string
  endsAt: string
  location: string
  ownerProfileId: string | null
  audienceRoles: string[]
  createdBy: string | null
}

export type Announcement = {
  id: string
  title: string
  body: string
  priority: string
  publishedAt: string
}

export type PlatformStudent = {
  id: string
  profileId: string | null
  studentNumber: string
  name: string
  program: string
  yearLevel: string
  email: string | null
}

export type AcademicTerm = {
  id: string
  code: string
  name: string
  startsOn: string
  endsOn: string
  enrollmentStartsOn: string | null
  enrollmentEndsOn: string | null
  status: string
}

export type CatalogCourse = {
  id: string
  departmentId: string
  programId: string | null
  code: string
  title: string
  description: string
  credits: number
  status: string
}

export type SectionEnrollment = {
  id: string
  sectionId: string
  studentId: string | null
  profileId: string | null
  status: string
  enrolledAt: string
}

export type AssessmentAttemptResult = { attemptId: string; score: number; maxScore: number; status: string }

export type ChatThread = { id: string; title: string; updatedAt: string }
export type ChatMessage = { id: string; threadId: string; role: 'user' | 'assistant' | 'system'; content: string; citations: string[]; createdAt: string }

export type PlatformData = {
  roles: RoleDefinition[]
  profiles: PlatformProfile[]
  students: PlatformStudent[]
  departments: Array<{ id: string; code: string; name: string; description: string; status: string; headId: string | null }>
  programs: Array<{ id: string; code: string; name: string; level: string; departmentId: string; description: string; durationYears: number; status: string }>
  terms: AcademicTerm[]
  catalogCourses: CatalogCourse[]
  courses: SchoolCourse[]
  enrollments: SectionEnrollment[]
  topics: CourseTopic[]
  assessments: SchoolAssessment[]
  gradeItems: GradeItem[]
  grades: GradeRecord[]
  schedule: ScheduleEvent[]
  announcements: Announcement[]
  threads: ChatThread[]
}

export type SchoolChatAnswer = {
  answer: string
  suggestedActions: string[]
  citations: string[]
  source: 'openai' | 'continuity'
}

export type GradeScanRow = { studentNumber: string; studentName: string; score: number | null; confidence: number; notes: string }
export type GradeScanResult = { rows: GradeScanRow[]; warnings: string[]; overallConfidence: number; requiresHumanReview: true; source: 'openai-vision' }
