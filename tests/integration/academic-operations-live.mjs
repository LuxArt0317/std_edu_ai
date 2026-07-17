import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const environment = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }),
)

function password(email) {
  const result = spawnSync('/usr/bin/security', ['find-internet-password', '-w', '-s', 'www.stu.best', '-a', email], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`The protected credential for ${email} is unavailable.`)
  return result.stdout.trim()
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const owner = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const ownerEmail = 'winsonbaring10@gmail.com'
const { data: ownerAuth, error: ownerAuthError } = await owner.auth.signInWithPassword({ email: ownerEmail, password: password(ownerEmail) })
if (ownerAuthError || ownerAuth.user?.app_metadata.role !== 'owner') throw ownerAuthError || new Error('Owner authentication failed.')

const { data: enrollment, error: enrollmentError } = await owner.from('section_enrollments').select('section_id,student_id,status').not('student_id', 'is', null).limit(1).single()
if (enrollmentError || !enrollment?.student_id) throw enrollmentError || new Error('No linked production enrollment is available for validation.')
const temporaryStatus = enrollment.status === 'waitlisted' ? 'enrolled' : 'waitlisted'
const { error: mutationError } = await owner.rpc('manage_section_enrollment', { p_section_id: enrollment.section_id, p_student_id: enrollment.student_id, p_status: temporaryStatus })
if (mutationError) throw mutationError
const { error: restoreError } = await owner.rpc('manage_section_enrollment', { p_section_id: enrollment.section_id, p_student_id: enrollment.student_id, p_status: enrollment.status })
if (restoreError) throw restoreError

const { data: section, error: sectionError } = await owner.from('course_sections').select('id,academic_terms(starts_on,ends_on)').eq('id', enrollment.section_id).single()
if (sectionError) throw sectionError
const start = new Date(`${section.academic_terms.starts_on}T12:00:00+08:00`)
start.setUTCDate(start.getUTCDate() + 1)
const end = new Date(start.getTime() + 60 * 60 * 1000)
const marker = `OPS-${Date.now()}`
const { data: event, error: eventError } = await owner.from('schedule_events').insert({
  section_id: section.id, title: marker, event_type: 'class', starts_at: start.toISOString(), ends_at: end.toISOString(), location: marker, created_by: ownerAuth.user.id,
}).select('id').single()
if (eventError) throw eventError
const { error: conflictError } = await owner.from('schedule_events').insert({ title: `${marker}-CONFLICT`, event_type: 'meeting', starts_at: start.toISOString(), ends_at: end.toISOString(), location: marker, created_by: ownerAuth.user.id })
const conflictValidationError = !conflictError || !/room conflict/i.test(conflictError.message)
  ? new Error('Overlapping room booking was not rejected.')
  : null
const { error: cleanupError } = await owner.from('schedule_events').delete().eq('id', event.id)
if (cleanupError) throw cleanupError
if (conflictValidationError) throw conflictValidationError

const student = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const studentEmail = 'winsonbaring10+student@gmail.com'
const { data: studentAuth, error: studentAuthError } = await student.auth.signInWithPassword({ email: studentEmail, password: password(studentEmail) })
if (studentAuthError || !studentAuth.session) throw studentAuthError || new Error('Student authentication failed.')
const denial = await fetch(`${environment.VITE_SUPABASE_URL}/functions/v1/manage-student-account`, {
  method: 'POST', headers: { apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${studentAuth.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
})
if (denial.status !== 403) throw new Error(`Student provisioning authorization returned ${denial.status}, expected 403.`)

console.log(JSON.stringify({ enrollmentWorkflow: 'verified-and-restored', roomConflict: 'rejected', studentProvisioning: 'denied-for-student', cleanup: true }))
