import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const environment = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }),
)

const required = ['CRM_ADMIN_EMAIL', 'CRM_ADMIN_PASSWORD', 'CRM_FACULTY_EMAIL', 'CRM_FACULTY_PASSWORD', 'CRM_STUDENT_EMAIL', 'CRM_STUDENT_PASSWORD']
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required for the live role test.`)

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const makeClient = () => createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)

const faculty = makeClient()
const { data: facultyAuth, error: facultyAuthError } = await faculty.auth.signInWithPassword({ email: process.env.CRM_FACULTY_EMAIL, password: process.env.CRM_FACULTY_PASSWORD })
if (facultyAuthError || facultyAuth.user?.app_metadata.role !== 'faculty') throw facultyAuthError || new Error('Faculty JWT role is invalid.')
const { count: facultySections, error: facultySectionsError } = await faculty.from('course_sections').select('*', { count: 'exact', head: true })
const { count: facultyKeys, error: facultyKeysError } = await faculty.from('assessment_answer_keys').select('*', { count: 'exact', head: true })
if (facultySectionsError || facultyKeysError || facultySections !== 2 || facultyKeys !== 5) throw facultySectionsError || facultyKeysError || new Error('Faculty teaching access is incomplete.')

const student = makeClient()
const { data: studentAuth, error: studentAuthError } = await student.auth.signInWithPassword({ email: process.env.CRM_STUDENT_EMAIL, password: process.env.CRM_STUDENT_PASSWORD })
if (studentAuthError || studentAuth.user?.app_metadata.role !== 'student') throw studentAuthError || new Error('Student JWT role is invalid.')
const studentChecks = {}
for (const table of ['course_sections', 'course_topics', 'assessments', 'grades', 'schedule_events']) {
  const { count, error } = await student.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  studentChecks[table] = count
}
const { count: studentKeys, error: studentKeyError } = await student.from('assessment_answer_keys').select('*', { count: 'exact', head: true })
if (studentKeyError || studentKeys !== 0) throw studentKeyError || new Error('The student could read protected answer keys.')
if (studentChecks.course_sections !== 2 || studentChecks.course_topics !== 4 || studentChecks.assessments !== 1 || studentChecks.grades !== 1) throw new Error(`Student portal scope is incomplete: ${JSON.stringify(studentChecks)}`)

await student.from('profiles').update({ role: 'faculty' }).eq('id', studentAuth.user.id)
const { data: unchangedStudentProfile, error: unchangedStudentProfileError } = await student.from('profiles').select('role').eq('id', studentAuth.user.id).single()
if (unchangedStudentProfileError || unchangedStudentProfile.role !== 'student') throw unchangedStudentProfileError || new Error('The student could change their trusted platform role.')

const protectedGradeId = '5d000000-0000-4000-8000-000000000001'
await student.from('grades').update({ score: 0 }).eq('id', protectedGradeId)
const { data: protectedGrade, error: protectedGradeError } = await student.from('grades').select('score').eq('id', protectedGradeId).single()
if (protectedGradeError || Number(protectedGrade.score) !== 5) throw protectedGradeError || new Error('The student could mutate a published grade.')

const answers = [
  { questionId: '57000000-0000-4000-8000-000000000001', optionId: '58000000-0000-4000-8000-000000000002' },
  { questionId: '57000000-0000-4000-8000-000000000002', optionId: '58000000-0000-4000-8000-000000000004' },
  { questionId: '57000000-0000-4000-8000-000000000003', optionId: '58000000-0000-4000-8000-000000000008' },
  { questionId: '57000000-0000-4000-8000-000000000004', optionId: '58000000-0000-4000-8000-000000000011' },
  { questionId: '57000000-0000-4000-8000-000000000005', text: 'responsible human' },
]
const { data: attempt, error: attemptError } = await student.rpc('submit_assessment', { p_assessment_id: '56000000-0000-4000-8000-000000000001', p_answers: answers })
if (attemptError || !attempt?.[0] || Number(attempt[0].score) !== 5) throw attemptError || new Error('Student quiz scoring failed.')

const owner = makeClient()
const { data: ownerAuth, error: ownerAuthError } = await owner.auth.signInWithPassword({ email: process.env.CRM_ADMIN_EMAIL, password: process.env.CRM_ADMIN_PASSWORD })
if (ownerAuthError || ownerAuth.user?.app_metadata.role !== 'owner') throw ownerAuthError || new Error('Owner cleanup session failed.')
const { error: cleanupError } = await owner.from('assessment_attempts').delete().eq('id', attempt[0].attempt_id)
if (cleanupError) throw cleanupError

await Promise.all([faculty.auth.signOut(), student.auth.signOut(), owner.auth.signOut()])
console.log(JSON.stringify({ faculty: { role: 'faculty', sections: facultySections, protectedAnswerKeys: facultyKeys }, student: { role: 'student', ...studentChecks, protectedAnswerKeys: studentKeys, roleMutationDenied: true, gradeMutationDenied: true, quizScore: 5 }, quizCleanup: true }))
