import type { PlatformRole } from './types.ts'

export const ONBOARDING_JOURNEY_KEY = 'stu-nexus-role-foundations'
export const ONBOARDING_JOURNEY_VERSION = 1

export type OnboardingPlacement = 'top' | 'bottom'
export type OnboardingCheckResult = { correct: boolean; attempts: number }

export type OnboardingQuestion = {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

export type OnboardingStep = {
  key: string
  target: string
  eyebrow: string
  title: string
  description: string
  placement?: OnboardingPlacement
  actionKey?: string
  question?: OnboardingQuestion
}

export type OnboardingJourney = {
  role: PlatformRole
  roleName: string
  promise: string
  steps: OnboardingStep[]
}

export type OnboardingEvidence = {
  completedStepKeys: string[]
  verifiedActionKeys: string[]
  checkResults: Record<string, OnboardingCheckResult>
}

export type OnboardingReadiness = {
  score: number
  status: 'not_started' | 'in_progress' | 'ready'
  verified: number
  required: number
}

type RoleJourneySpec = {
  roleName: string
  promise: string
  primary: { view: string; label: string; title: string; description: string }
  secondary: { view: string; label: string; title: string; description: string }
  question: OnboardingQuestion
}

export const platformRoles: PlatformRole[] = [
  'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar',
  'department_head', 'faculty', 'advisor', 'admissions', 'finance', 'support',
  'librarian', 'student',
]

const roleSpecs: Record<PlatformRole, RoleJourneySpec> = {
  owner: {
    roleName: 'Platform Owner',
    promise: 'See the whole institution, audit every role, and protect the governance boundary.',
    primary: { view: 'people', label: 'People & Roles', title: 'Protect the role hierarchy', description: 'Open the real governance workspace. This is where you audit identities and role assignments without weakening the protected owner account.' },
    secondary: { view: 'academics', label: 'Academic Office', title: 'See the academic operating system', description: 'Open the institution-wide catalog of departments, programs, courses, terms, and live sections.' },
    question: { prompt: 'An administrator asks to replace the protected platform owner. What should happen?', options: ['Change the owner in People & Roles', 'Create a second owner for backup', 'Keep the owner immutable and assign the administrator an appropriate non-owner role'], correctIndex: 2, explanation: 'STU Nexus permits exactly one protected owner. All other authority is assigned through audited non-owner roles.' },
  },
  admin: {
    roleName: 'Administrator',
    promise: 'Coordinate school operations while every sensitive action remains role-governed and auditable.',
    primary: { view: 'people', label: 'People & Roles', title: 'Manage trusted access', description: 'Open the role directory to review provisioned identities and use the audited role-assignment workflow.' },
    secondary: { view: 'academics', label: 'Academic Office', title: 'Coordinate academic delivery', description: 'Open the shared academic catalog to see programs, active sections, faculty assignments, and delivery status.' },
    question: { prompt: 'What still protects school data if someone bypasses the interface?', options: ['The sidebar navigation', 'Supabase row-level security and trusted role metadata', 'The onboarding readiness score'], correctIndex: 1, explanation: 'The interface helps people work safely, but Supabase RLS and trusted roles enforce the actual data boundary.' },
  },
  president: {
    roleName: 'President',
    promise: 'Turn institutional visibility into accountable, student-centered executive decisions.',
    primary: { view: 'academics', label: 'Academic Office', title: 'Read the institution at a glance', description: 'Open academic delivery to inspect programs, sections, capacity, and school-wide operating context.' },
    secondary: { view: 'crm', label: 'Student CRM', title: 'Connect strategy to student success', description: 'Open the operational CRM to review aggregate student-success work, cases, and interventions within your authority.' },
    question: { prompt: 'Which is the responsible executive use of Nexus AI?', options: ['Let AI make final student decisions', 'Use grounded summaries to inform a human-reviewed decision', 'Send every student record to the model'], correctIndex: 1, explanation: 'AI supports judgment with minimized, grounded context. People remain responsible for decisions and communications.' },
  },
  vice_president: {
    roleName: 'Vice President',
    promise: 'Keep cross-functional execution aligned across schedules, services, and student outcomes.',
    primary: { view: 'schedule', label: 'Schedule', title: 'Coordinate the operating rhythm', description: 'Open the shared schedule to see classes, deadlines, meetings, and institutional events visible to your role.' },
    secondary: { view: 'crm', label: 'Student CRM', title: 'Follow work through to resolution', description: 'Open CRM operations to connect executive priorities with cases, tasks, campaigns, and accountable owners.' },
    question: { prompt: 'A cross-team student concern appears. What is the best next step?', options: ['Leave it in a private message', 'Create or review an owned CRM case with a due action', 'Ask AI to resolve it automatically'], correctIndex: 1, explanation: 'An owned, time-bound case keeps the concern visible and accountable while staff exercise judgment.' },
  },
  dean: {
    roleName: 'Dean',
    promise: 'Steward teaching quality, academic delivery, assessment, and evidence-based improvement.',
    primary: { view: 'teaching', label: 'Courses', title: 'See the course portfolio', description: 'Open Courses to review sections, learner counts, assessments, and the exact published student sequence.' },
    secondary: { view: 'grades', label: 'Grades', title: 'Review grading responsibly', description: 'Open Grades to inspect gradebook status and the AI-assisted scan workflow with mandatory human review.' },
    question: { prompt: 'What must happen before AI-extracted grade rows are saved?', options: ['They publish automatically', 'A teacher or authorized human reviews the candidates', 'Students approve the answer key'], correctIndex: 1, explanation: 'Grade scanning creates candidates only. A qualified human must review before any save or publication.' },
  },
  registrar: {
    roleName: 'Registrar',
    promise: 'Maintain accurate academic structures, enrollment context, and authoritative records.',
    primary: { view: 'academics', label: 'Academic Office', title: 'Work from the academic source of truth', description: 'Open Academic Office to review terms, programs, courses, sections, delivery modes, and roster counts.' },
    secondary: { view: 'people', label: 'People & Roles', title: 'Confirm trusted identities', description: 'Open People & Roles to verify that academic responsibilities are assigned to the correct provisioned account.' },
    question: { prompt: 'A learner appears in a section roster. What controls their portal visibility?', options: ['Their enrollment relationship plus RLS', 'A public course link', 'Their onboarding score'], correctIndex: 0, explanation: 'Enrollment relationships and RLS determine the learner’s actual academic data scope.' },
  },
  department_head: {
    roleName: 'Department Head',
    promise: 'Lead faculty delivery with clear course, content, assessment, and workload visibility.',
    primary: { view: 'teaching', label: 'Courses', title: 'Inspect department delivery', description: 'Open Courses to review active sections, faculty assignments, content coverage, and assessment counts.' },
    secondary: { view: 'people', label: 'People & Roles', title: 'Understand the responsibility map', description: 'Open People & Roles to see how academic and operational responsibilities fit into the school hierarchy.' },
    question: { prompt: 'A course topic is still marked draft. What can students see?', options: ['The draft immediately', 'Only content allowed by publication rules and RLS', 'Everything the department head can see'], correctIndex: 1, explanation: 'Learners receive only published, authorized content—not the broader staff view.' },
  },
  faculty: {
    roleName: 'Teacher / Faculty',
    promise: 'Teach, assess, give feedback, and support students from one connected workspace.',
    primary: { view: 'teaching', label: 'Courses', title: 'Open your course studio', description: 'Use Courses to author the learning sequence and preview exactly what students can currently see.' },
    secondary: { view: 'grades', label: 'Grades', title: 'Grade with human control', description: 'Open Grades to review results, publish deliberately, or scan a grade sheet into a review queue.' },
    question: { prompt: 'When should a student see a grade?', options: ['As soon as AI extracts it', 'Only after an authorized teacher reviews and publishes it', 'Whenever a draft row exists'], correctIndex: 1, explanation: 'Draft and reviewed grades stay staff-only. Students receive only explicitly published results.' },
  },
  advisor: {
    roleName: 'Academic Advisor',
    promise: 'Combine learning context and relationship history into timely, human support.',
    primary: { view: 'crm', label: 'Student CRM', title: 'Open the student-success workspace', description: 'Use CRM operations to review Student 360 context, success signals, cases, and accountable next actions.' },
    secondary: { view: 'learning', label: 'Courses', title: 'See the learning experience', description: 'Open Courses to understand the published lessons behind an advisee’s academic conversation.' },
    question: { prompt: 'A risk signal appears for a student. What does it mean?', options: ['The system has made a final judgment', 'It is evidence for staff review and a supportive next action', 'The student should be removed automatically'], correctIndex: 1, explanation: 'Signals prompt timely human review; they never make automatic high-impact decisions.' },
  },
  admissions: {
    roleName: 'Admissions Officer',
    promise: 'Guide prospective students from inquiry to enrollment with timely, accountable follow-up.',
    primary: { view: 'crm', label: 'Student CRM', title: 'Work the admissions relationship', description: 'Open CRM operations to see the admissions pipeline, likelihood signals, owners, and next follow-ups.' },
    secondary: { view: 'schedule', label: 'Schedule', title: 'Keep commitments visible', description: 'Open Schedule to coordinate interviews, deadlines, orientation events, and applicant-facing commitments.' },
    question: { prompt: 'What makes an admissions follow-up operationally complete?', options: ['A probability score alone', 'A clear owner, next step, and due commitment', 'An AI draft that was never reviewed'], correctIndex: 1, explanation: 'Ownership and a concrete next step turn pipeline information into accountable service.' },
  },
  finance: {
    roleName: 'Finance Officer',
    promise: 'Resolve financial concerns with appropriate context, privacy, and accountable service work.',
    primary: { view: 'crm', label: 'Student CRM', title: 'Connect balances to service', description: 'Open CRM operations to review finance-related cases and next actions within your authorized scope.' },
    secondary: { view: 'schedule', label: 'Schedule', title: 'Track financial deadlines', description: 'Open Schedule to keep payment, registration, and institutional deadlines visible.' },
    question: { prompt: 'How should sensitive financial context be used with Nexus AI?', options: ['Send all available personal data', 'Use only the minimum necessary, de-identified context and review the response', 'Let the model publish a decision'], correctIndex: 1, explanation: 'Privacy minimization and human review are mandatory for AI-assisted financial support.' },
  },
  support: {
    roleName: 'Student Support',
    promise: 'Turn student concerns into owned, compassionate, and measurable resolutions.',
    primary: { view: 'crm', label: 'Student CRM', title: 'Open support operations', description: 'Use CRM to review cases, student signals, relationship history, urgency, owners, and due actions.' },
    secondary: { view: 'learning', label: 'Courses', title: 'Understand academic context', description: 'Open Courses to see the live course experience behind a support request without exceeding your role scope.' },
    question: { prompt: 'A student reports an urgent concern. What is the strongest workflow?', options: ['Record an owned case, priority, due action, and follow-up', 'Keep it only in chat', 'Wait for the risk score to change'], correctIndex: 0, explanation: 'A structured case protects continuity, ownership, urgency, and follow-through.' },
  },
  librarian: {
    roleName: 'Librarian',
    promise: 'Connect learners and staff to organized, verified knowledge at the right moment.',
    primary: { view: 'learning', label: 'Courses', title: 'See where knowledge is needed', description: 'Open Courses to understand the published lessons and verified resources learners need in context.' },
    secondary: { view: 'crm', label: 'Student CRM', title: 'Maintain trusted knowledge', description: 'Open CRM operations to reach the institutional knowledge workspace and its source-verification workflow.' },
    question: { prompt: 'What makes a knowledge source safe for grounded AI use?', options: ['It is popular online', 'It has a verified source, owner, and review status', 'It was generated by AI'], correctIndex: 1, explanation: 'Grounding depends on attributable, owned, reviewed institutional sources.' },
  },
  student: {
    roleName: 'Student',
    promise: 'Learn, practice, check feedback, and stay ahead of your school day.',
    primary: { view: 'learning', label: 'Courses', title: 'Open your courses', description: 'Choose a course, read published lessons, and follow the same sequence your teacher manages.' },
    secondary: { view: 'assessments', label: 'Assessments', title: 'Practice and check understanding', description: 'Open Assessments to complete published quizzes and receive explainable results without seeing protected answer keys.' },
    question: { prompt: 'Where should you look for a score that is official and visible to you?', options: ['A teacher’s draft gradebook', 'The Grades workspace after the result is published', 'The protected answer-key table'], correctIndex: 1, explanation: 'Your Grades workspace shows results only after an authorized teacher publishes them.' },
  },
}

function buildJourney(role: PlatformRole, spec: RoleJourneySpec): OnboardingJourney {
  return {
    role,
    roleName: spec.roleName,
    promise: spec.promise,
    steps: [
      {
        key: 'welcome',
        target: 'onboarding-center',
        eyebrow: 'YOUR GUIDED START',
        title: `Welcome, ${spec.roleName}`,
        description: `${spec.promise} This guide watches for real interface actions and saves your progress, so you can pause and continue on any device.`,
        placement: 'bottom',
      },
      {
        key: `open-${spec.primary.view}`,
        target: `nav-${spec.primary.view}`,
        eyebrow: 'TRY IT NOW',
        title: spec.primary.title,
        description: `${spec.primary.description} Click the highlighted ${spec.primary.label} button to demonstrate the action.`,
        actionKey: `navigate:${spec.primary.view}`,
      },
      {
        key: `open-${spec.secondary.view}`,
        target: `nav-${spec.secondary.view}`,
        eyebrow: 'BUILD YOUR ROUTINE',
        title: spec.secondary.title,
        description: `${spec.secondary.description} Click the highlighted ${spec.secondary.label} button to continue.`,
        actionKey: `navigate:${spec.secondary.view}`,
      },
      {
        key: 'meet-nexus',
        target: 'assistant',
        eyebrow: 'ROLE-AWARE ASSISTANCE',
        title: 'Nexus AI works beside you',
        description: 'Ask for explanations, summaries, plans, or drafts. Nexus uses your role and visible school context, minimizes sensitive data, cites grounding, and leaves every decision with a person.',
        placement: 'top',
      },
      {
        key: 'understanding-check',
        target: 'onboarding-center',
        eyebrow: 'SHOW WHAT YOU KNOW',
        title: 'One real-world check',
        description: 'Choose the safest and most effective response. A correct answer completes your role foundations.',
        question: spec.question,
        placement: 'bottom',
      },
      {
        key: 'complete',
        target: 'onboarding-center',
        eyebrow: 'FOUNDATIONS COMPLETE',
        title: 'You are ready to work',
        description: 'Your actions and understanding check are recorded. Reopen the Readiness Center any time to review this journey or start it again.',
        placement: 'bottom',
      },
    ],
  }
}

export const onboardingJourneys = Object.fromEntries(
  platformRoles.map((role) => [role, buildJourney(role, roleSpecs[role])]),
) as Record<PlatformRole, OnboardingJourney>

export function getOnboardingJourney(role: PlatformRole) {
  return onboardingJourneys[role]
}

export function calculateOnboardingReadiness(journey: OnboardingJourney, evidence: OnboardingEvidence): OnboardingReadiness {
  const requiredActions = journey.steps.flatMap((step) => step.actionKey ? [step.actionKey] : [])
  const requiredChecks = journey.steps.flatMap((step) => step.question ? [step.key] : [])
  const actionCount = requiredActions.filter((key) => evidence.verifiedActionKeys.includes(key)).length
  const checkCount = requiredChecks.filter((key) => evidence.checkResults[key]?.correct).length
  const required = requiredActions.length + requiredChecks.length
  const verified = actionCount + checkCount
  const score = required ? Math.round((verified / required) * 100) : 100
  const started = evidence.completedStepKeys.length > 0 || verified > 0
  return { score, status: score === 100 ? 'ready' : started ? 'in_progress' : 'not_started', verified, required }
}
