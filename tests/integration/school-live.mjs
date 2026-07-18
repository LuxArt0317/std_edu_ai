import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const environment = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }),
)

const email = process.env.CRM_ADMIN_EMAIL
const password = process.env.CRM_ADMIN_PASSWORD
const studentEmail = process.env.CRM_STUDENT_EMAIL
const studentPassword = process.env.CRM_STUDENT_PASSWORD
if (!email || !password || !studentEmail || !studentPassword) throw new Error('Owner and student credentials are required for the live school test.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { data: anonymousRoles, error: anonymousError } = await anonymous.from('role_definitions').select('role_code')
if (anonymousError || anonymousRoles?.length) throw new Error('Anonymous role isolation failed.')

const client = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password })
if (authError || !auth.session) throw authError || new Error('No authenticated session was issued.')
if (auth.user.app_metadata.role !== 'owner' || auth.user.app_metadata.platform_owner !== true) throw new Error('The production account is not the protected platform owner.')

const tables = ['role_definitions', 'departments', 'academic_programs', 'courses', 'course_sections', 'course_topics', 'assessments', 'grade_items', 'schedule_events']
const counts = []
for (const table of tables) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  counts.push({ table, count })
}
const { data: governedQuestions, error: governedQuestionError } = await client.rpc('read_assessment_questions')
if (governedQuestionError || governedQuestions.length !== 5 || !governedQuestions.some((item) => item.explanation)) throw governedQuestionError || new Error('Owner governed assessment-question review is incomplete.')
counts.push({ table: 'governed_assessment_questions', count: governedQuestions.length })

const { count: answerKeyCount, error: keyError } = await client.from('assessment_answer_keys').select('*', { count: 'exact', head: true })
if (keyError || answerKeyCount !== 5) throw keyError || new Error('Protected answer keys are not available to the owner audit role.')

const answers = [
  { questionId: '57000000-0000-4000-8000-000000000001', optionId: '58000000-0000-4000-8000-000000000002' },
  { questionId: '57000000-0000-4000-8000-000000000002', optionId: '58000000-0000-4000-8000-000000000004' },
  { questionId: '57000000-0000-4000-8000-000000000003', optionId: '58000000-0000-4000-8000-000000000008' },
  { questionId: '57000000-0000-4000-8000-000000000004', optionId: '58000000-0000-4000-8000-000000000011' },
  { questionId: '57000000-0000-4000-8000-000000000005', text: 'human oversight' },
]
const studentClient = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { error: studentAuthError } = await studentClient.auth.signInWithPassword({ email: studentEmail, password: studentPassword })
if (studentAuthError) throw studentAuthError
const { data: result, error: quizError } = await studentClient.rpc('submit_assessment', { p_assessment_id: '56000000-0000-4000-8000-000000000001', p_answers: answers })
if (quizError || !result?.[0] || Number(result[0].score) !== 5 || result[0].status !== 'graded') throw quizError || new Error('Transactional assessment scoring failed.')
const { error: cleanupError } = await client.from('assessment_attempts').delete().eq('id', result[0].attempt_id)
if (cleanupError) throw cleanupError

const assessmentId = '56000000-0000-4000-8000-000000000001'
const { error: holdError } = await client.from('assessments').update({ release_scores_immediately: false }).eq('id', assessmentId)
if (holdError) throw holdError
let heldAttemptId = null
try {
  const { data: heldResult, error: heldError } = await studentClient.rpc('submit_assessment', { p_assessment_id: assessmentId, p_answers: answers })
  if (heldError || !heldResult?.[0]) throw heldError || new Error('Held-result assessment submission failed.')
  heldAttemptId = heldResult[0].attempt_id
  if (heldResult[0].score !== null || heldResult[0].max_score !== null) throw new Error('The submission response disclosed an unreleased result.')
  const directResult = await studentClient.from('assessment_attempts').select('id,score,max_score').eq('id', heldAttemptId).single()
  if (!directResult.error) throw new Error('The student directly selected an unreleased score.')
  const governedResult = await studentClient.rpc('read_assessment_attempts')
  if (governedResult.error) throw governedResult.error
  const heldRow = governedResult.data.find((item) => item.id === heldAttemptId)
  if (!heldRow || heldRow.score !== null || heldRow.max_score !== null) throw new Error('The governed result reader disclosed an unreleased score.')
} finally {
  if (heldAttemptId) await client.from('assessment_attempts').delete().eq('id', heldAttemptId)
  await client.from('assessments').update({ release_scores_immediately: true }).eq('id', assessmentId)
}
await studentClient.auth.signOut()

const ownerId = auth.user.id
const { error: protectionError } = await client.from('profiles').update({ role: 'admin', is_platform_owner: false }).eq('id', ownerId)
if (!protectionError) throw new Error('The platform owner could be demoted.')
const { data: owner, error: ownerError } = await client.from('profiles').select('role, is_platform_owner').eq('id', ownerId).single()
if (ownerError || owner.role !== 'owner' || !owner.is_platform_owner) throw ownerError || new Error('Owner protection did not preserve the account.')

const { data: temporaryItem, error: itemError } = await client.from('grade_items').insert({
  section_id: '54000000-0000-4000-8000-000000000001',
  title: 'Automated atomic-import validation',
  category: 'Validation',
  max_score: 10,
  weight_percent: 0,
}).select('id').single()
if (itemError) throw itemError
const { data: temporaryJob, error: jobError } = await client.from('grade_scan_jobs').insert({
  section_id: '54000000-0000-4000-8000-000000000001',
  grade_item_id: temporaryItem.id,
  uploaded_by: ownerId,
  source_name: 'automated-validation.png',
  status: 'needs_review',
  extracted_payload: { validation: true },
  confidence: 1,
}).select('id').single()
if (jobError) throw jobError

try {
  const { error: invalidApprovalError } = await client.rpc('approve_grade_scan', { p_job_id: temporaryJob.id, p_rows: [{ studentId: '10000000-0000-4000-8000-000000000002', score: 11, feedback: 'Must be rejected.' }] })
  if (!invalidApprovalError) throw new Error('An out-of-range grade scan was accepted.')
  const { count: prematureGradeCount } = await client.from('grades').select('*', { count: 'exact', head: true }).eq('grade_item_id', temporaryItem.id)
  const { data: pendingJob } = await client.from('grade_scan_jobs').select('status').eq('id', temporaryJob.id).single()
  if (prematureGradeCount !== 0 || pendingJob.status !== 'needs_review') throw new Error('Atomic grade-scan rollback failed.')

  const { data: approval, error: approvalError } = await client.rpc('approve_grade_scan', { p_job_id: temporaryJob.id, p_rows: [{ studentId: '10000000-0000-4000-8000-000000000002', score: 9.5, feedback: 'Reviewed validation row.' }] })
  if (approvalError || approval?.[0]?.saved_count !== 1) throw approvalError || new Error('Atomic grade-scan approval failed.')
  const { data: reviewedGrade, error: reviewedGradeError } = await client.from('grades').select('score, status').eq('grade_item_id', temporaryItem.id).single()
  if (reviewedGradeError || Number(reviewedGrade.score) !== 9.5 || reviewedGrade.status !== 'reviewed') throw reviewedGradeError || new Error('Reviewed grade was not saved correctly.')
} finally {
  await client.from('grade_scan_jobs').delete().eq('id', temporaryJob.id)
  await client.from('grade_items').delete().eq('id', temporaryItem.id)
}

await client.auth.signOut()
console.log(JSON.stringify({ anonymousIsolation: true, ownerProtected: true, quizScore: 5, quizCleanup: true, atomicGradeScan: true, answerKeyCount, counts }))
