import { supabase } from '../utils/supabase'
import type { Json, Tables } from '../types/database.generated'
import type {
  AssessmentAttemptResult, AssessmentOption, AssessmentQuestion, ChatMessage, ChatThread,
  GradeScanResult, PlatformData, PlatformRole, SchoolAssessment,
} from './types'

type CourseRow = Tables<'courses'>
type SectionRow = Tables<'course_sections'>
type EnrollmentRow = Tables<'section_enrollments'>
type QuestionRow = Tables<'assessment_questions'>
type OptionRow = Tables<'assessment_options'>

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function rows<T>(result: { data: T[] | null; error: { message: string } | null }, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data ?? []
}

function shortDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export async function loadPlatformData(): Promise<PlatformData> {
  const client = requireClient()
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError || !authData.user) throw new Error('An authenticated STU Nexus session is required.')

  const [
    rolesResult, profilesResult, studentsResult, departmentsResult, programsResult, termsResult,
    coursesResult, sectionsResult, enrollmentsResult, topicsResult, assessmentsResult,
    questionsResult, optionsResult, gradeItemsResult, gradesResult, scheduleResult,
    announcementsResult, threadsResult,
  ] = await Promise.all([
    client.from('role_definitions').select('*').order('hierarchy_level', { ascending: false }),
    client.from('profiles').select('*').order('full_name'),
    client.from('students').select('*').order('full_name'),
    client.from('departments').select('*').order('name'),
    client.from('academic_programs').select('*').order('name'),
    client.from('academic_terms').select('*').order('starts_on', { ascending: false }),
    client.from('courses').select('*').order('code'),
    client.from('course_sections').select('*').order('section_code'),
    client.from('section_enrollments').select('*'),
    client.from('course_topics').select('*').order('position'),
    client.from('assessments').select('*').order('due_at'),
    client.from('assessment_questions').select('*').order('position'),
    client.from('assessment_options').select('*').order('position'),
    client.from('grade_items').select('*').order('due_at'),
    client.from('grades').select('*').order('updated_at', { ascending: false }),
    client.from('schedule_events').select('*').order('starts_at'),
    client.from('announcements').select('*').order('published_at', { ascending: false }),
    client.from('chat_threads').select('*').order('updated_at', { ascending: false }),
  ])

  const roleRows = rows(rolesResult, 'Roles')
  const profileRows = rows(profilesResult, 'People')
  const studentRows = rows(studentsResult, 'Students')
  const departmentRows = rows(departmentsResult, 'Departments')
  const programRows = rows(programsResult, 'Programs')
  const termRows = rows(termsResult, 'Terms')
  const courseRows = rows<CourseRow>(coursesResult, 'Courses')
  const sectionRows = rows<SectionRow>(sectionsResult, 'Course sections')
  const enrollmentRows = rows<EnrollmentRow>(enrollmentsResult, 'Enrollments')
  const topicRows = rows(topicsResult, 'Topics')
  const assessmentRows = rows(assessmentsResult, 'Assessments')
  const questionRows = rows<QuestionRow>(questionsResult, 'Assessment questions')
  const optionRows = rows<OptionRow>(optionsResult, 'Assessment choices')
  const gradeItemRows = rows(gradeItemsResult, 'Grade items')
  const gradeRows = rows(gradesResult, 'Grades')
  const scheduleRows = rows(scheduleResult, 'Schedule')
  const announcementRows = rows(announcementsResult, 'Announcements')
  const threadRows = rows(threadsResult, 'AI conversations')

  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]))
  const studentsById = new Map(studentRows.map((student) => [student.id, student]))
  const termsById = new Map(termRows.map((term) => [term.id, term]))
  const coursesById = new Map(courseRows.map((course) => [course.id, course]))

  const courses = sectionRows.map((section) => {
    const course = coursesById.get(section.course_id)
    const term = termsById.get(section.term_id)
    const faculty = section.faculty_id ? profilesById.get(section.faculty_id) : null
    const enrollments = enrollmentRows.filter((item) => item.section_id === section.id && item.status !== 'dropped')
    return {
      sectionId: section.id,
      courseId: section.course_id,
      code: course?.code ?? 'COURSE',
      title: course?.title ?? 'Course',
      description: course?.description ?? '',
      credits: Number(course?.credits ?? 0),
      sectionCode: section.section_code,
      term: term?.name ?? 'Academic term',
      termStatus: term?.status ?? 'planning',
      facultyId: section.faculty_id,
      facultyName: faculty?.full_name ?? 'Faculty assignment pending',
      modality: section.modality,
      room: section.room ?? 'To be announced',
      status: section.status,
      enrolledStudentIds: enrollments.flatMap((item) => item.student_id ? [item.student_id] : []),
      enrolledProfileIds: enrollments.flatMap((item) => item.student_profile_id ? [item.student_profile_id] : []),
    }
  })

  const questions: AssessmentQuestion[] = questionRows.map((question) => ({
    id: question.id,
    assessmentId: question.assessment_id,
    prompt: question.prompt,
    type: question.question_type as AssessmentQuestion['type'],
    points: Number(question.points),
    position: question.position,
    explanation: question.explanation,
    options: optionRows.filter((option) => option.question_id === question.id).map<AssessmentOption>((option) => ({ id: option.id, label: option.label, position: option.position })),
  }))

  const assessments: SchoolAssessment[] = assessmentRows.map((assessment) => ({
    id: assessment.id,
    sectionId: assessment.section_id,
    title: assessment.title,
    instructions: assessment.instructions,
    type: assessment.assessment_type,
    status: assessment.status,
    opensAt: assessment.opens_at,
    dueAt: assessment.due_at,
    durationMinutes: assessment.duration_minutes,
    attemptLimit: assessment.attempt_limit,
    maxScore: Number(assessment.max_score),
    questions: questions.filter((question) => question.assessmentId === assessment.id),
  }))

  return {
    roles: roleRows.map((role) => ({ code: role.role_code as PlatformRole, name: role.display_name, level: role.hierarchy_level, category: role.category, description: role.description, capabilities: role.capabilities })),
    profiles: profileRows.map((profile) => ({ id: profile.id, name: profile.full_name, role: profile.role as PlatformRole, department: profile.department ?? '', jobTitle: profile.job_title ?? '', isOwner: profile.is_platform_owner })),
    students: studentRows.map((student) => ({ id: student.id, profileId: student.profile_id, studentNumber: student.student_number, name: student.preferred_name || student.full_name, program: student.program, yearLevel: student.year_level })),
    departments: departmentRows.map((department) => ({ id: department.id, code: department.code, name: department.name, description: department.description })),
    programs: programRows.map((program) => ({ id: program.id, code: program.code, name: program.name, level: program.level, departmentId: program.department_id, description: program.description })),
    courses,
    topics: topicRows.map((topic) => ({ id: topic.id, sectionId: topic.section_id, title: topic.title, summary: topic.summary, content: topic.content_markdown, position: topic.position, minutes: topic.estimated_minutes, published: Boolean(topic.published_at) })),
    assessments,
    gradeItems: gradeItemRows.map((item) => ({ id: item.id, sectionId: item.section_id, assessmentId: item.assessment_id, title: item.title, category: item.category, maxScore: Number(item.max_score), weight: Number(item.weight_percent), dueAt: item.due_at })),
    grades: gradeRows.map((grade) => {
      const student = grade.student_id ? studentsById.get(grade.student_id) : null
      const profile = grade.student_profile_id ? profilesById.get(grade.student_profile_id) : null
      return { id: grade.id, gradeItemId: grade.grade_item_id, studentId: grade.student_id, profileId: grade.student_profile_id, studentName: student?.preferred_name || student?.full_name || profile?.full_name || 'Student', studentNumber: student?.student_number || 'Portal learner', score: Number(grade.score), letterGrade: grade.letter_grade ?? '', feedback: grade.feedback ?? '', status: grade.status as 'draft' | 'reviewed' | 'published', publishedAt: grade.published_at }
    }),
    schedule: scheduleRows.map((event) => ({ id: event.id, sectionId: event.section_id, title: event.title, description: event.description, type: event.event_type, startsAt: event.starts_at, endsAt: event.ends_at, location: event.location ?? 'Online' })),
    announcements: announcementRows.map((announcement) => ({ id: announcement.id, title: announcement.title, body: announcement.body, priority: announcement.priority, publishedAt: shortDate(announcement.published_at) ?? 'Draft' })),
    threads: threadRows.map((thread) => ({ id: thread.id, title: thread.title, updatedAt: thread.updated_at })),
  }
}

export async function submitAssessment(assessmentId: string, answers: Array<{ questionId: string; optionId?: string; text?: string }>): Promise<AssessmentAttemptResult> {
  const client = requireClient()
  const { data, error } = await client.rpc('submit_assessment', { p_assessment_id: assessmentId, p_answers: answers as unknown as Json })
  if (error) throw new Error(error.message)
  const result = data?.[0]
  if (!result) throw new Error('The assessment did not return a result.')
  return { attemptId: result.attempt_id, score: Number(result.score), maxScore: Number(result.max_score), status: result.status }
}

export async function createChatThread(title: string): Promise<ChatThread> {
  const client = requireClient()
  const { data: userData } = await client.auth.getUser()
  if (!userData.user) throw new Error('Authentication is required.')
  const { data, error } = await client.from('chat_threads').insert({ owner_id: userData.user.id, title: title.trim().slice(0, 120) || 'New conversation' }).select('*').single()
  if (error) throw new Error(error.message)
  return { id: data.id, title: data.title, updatedAt: data.updated_at }
}

export async function loadChatMessages(threadId: string): Promise<ChatMessage[]> {
  const client = requireClient()
  const { data, error } = await client.from('chat_messages').select('*').eq('thread_id', threadId).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((message) => ({ id: message.id, threadId: message.thread_id, role: message.author_role as ChatMessage['role'], content: message.content, citations: message.citations, createdAt: message.created_at }))
}

export async function appendChatMessage(threadId: string, role: ChatMessage['role'], content: string, citations: string[] = []) {
  const client = requireClient()
  const { error } = await client.from('chat_messages').insert({ thread_id: threadId, author_role: role, content, citations })
  if (error) throw new Error(error.message)
  await client.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId)
}

export async function recordGradeScan(sectionId: string, gradeItemId: string, sourceName: string, result: GradeScanResult) {
  const client = requireClient()
  const { data: userData } = await client.auth.getUser()
  if (!userData.user) throw new Error('Authentication is required.')
  const { data, error } = await client.from('grade_scan_jobs').insert({
    section_id: sectionId,
    grade_item_id: gradeItemId,
    uploaded_by: userData.user.id,
    source_name: sourceName.slice(0, 255),
    status: 'needs_review',
    extracted_payload: result as unknown as Json,
    confidence: result.overallConfidence,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function saveReviewedScan(jobId: string, result: GradeScanResult, students: PlatformData['students']) {
  const client = requireClient()
  const reviewedRows = []
  for (const row of result.rows) {
    if (row.score === null || row.confidence < 0.6) continue
    const student = students.find((item) => item.studentNumber.toLowerCase() === row.studentNumber.toLowerCase() || item.name.toLowerCase() === row.studentName.toLowerCase())
    if (!student) continue
    reviewedRows.push({ studentId: student.id, score: row.score, feedback: row.notes || 'Imported from reviewed grade-sheet scan.' })
  }
  const { data, error } = await client.rpc('approve_grade_scan', { p_job_id: jobId, p_rows: reviewedRows as unknown as Json })
  if (error) throw new Error(error.message)
  return Number(data?.[0]?.saved_count ?? 0)
}

export async function publishGrade(gradeId: string) {
  const client = requireClient()
  const { error } = await client.from('grades').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', gradeId)
  if (error) throw new Error(error.message)
}

export async function assignPlatformRole(profileId: string, role: PlatformRole, reason: string) {
  const client = requireClient()
  const { data, error } = await client.rpc('assign_platform_role', { p_profile_id: profileId, p_new_role: role, p_reason: reason })
  if (error) throw new Error(error.message)
  if (!data?.[0]) throw new Error('The role change was not confirmed.')
  return data[0]
}
