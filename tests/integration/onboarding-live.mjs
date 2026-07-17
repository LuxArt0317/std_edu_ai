import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (process.platform !== 'darwin') throw new Error('The live onboarding test requires protected macOS Keychain credentials.')

const environment = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }),
)

const accounts = [
  ['owner', 'winsonbaring10@gmail.com'],
  ['admin', 'winsonbaring10+admin@gmail.com'],
  ['president', 'winsonbaring10+president@gmail.com'],
  ['vice_president', 'winsonbaring10+vice-president@gmail.com'],
  ['dean', 'winsonbaring10+dean@gmail.com'],
  ['registrar', 'winsonbaring10+registrar@gmail.com'],
  ['department_head', 'winsonbaring10+department-head@gmail.com'],
  ['faculty', 'winsonbaring10+faculty@gmail.com'],
  ['advisor', 'winsonbaring10+advisor@gmail.com'],
  ['admissions', 'winsonbaring10+admissions@gmail.com'],
  ['finance', 'winsonbaring10+finance@gmail.com'],
  ['support', 'winsonbaring10+support@gmail.com'],
  ['librarian', 'winsonbaring10+librarian@gmail.com'],
  ['student', 'winsonbaring10+student@gmail.com'],
]

const journeyKey = `acceptance-onboarding-${Date.now()}`
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const makeClient = () => createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const sessions = []

for (const [role, email] of accounts) {
  const keychain = spawnSync('/usr/bin/security', ['find-internet-password', '-w', '-s', 'www.stu.best', '-a', email], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const password = keychain.stdout.trim()
  if (keychain.status !== 0 || !password) throw new Error(`The Keychain credential for ${role} is missing.`)

  const client = makeClient()
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password })
  if (authError || !auth.user || auth.user.app_metadata.role !== role) throw authError || new Error(`The ${role} session is invalid.`)

  const { data: progress, error: progressError } = await client.from('onboarding_progress').insert({
    user_id: auth.user.id,
    role,
    journey_key: journeyKey,
    journey_version: 1,
    current_step_key: 'complete',
    completed_step_keys: ['welcome', 'primary', 'secondary', 'understanding-check'],
    verified_action_keys: ['primary', 'secondary'],
    check_results: { 'understanding-check': { correct: true, attempts: 1 } },
    understanding_score: 100,
    status: 'ready',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).select('id,user_id,role,status,understanding_score').single()
  if (progressError || !progress || progress.role !== role || progress.status !== 'ready' || progress.understanding_score !== 100) {
    throw progressError || new Error(`The ${role} onboarding progress write was not confirmed.`)
  }

  const { error: eventError } = await client.from('onboarding_events').insert({
    progress_id: progress.id,
    user_id: auth.user.id,
    role,
    step_key: 'understanding-check',
    event_type: 'answer_submitted',
    event_data: { correct: true, acceptance: true },
  })
  if (eventError) throw eventError

  const { count: selfCount, error: selfError } = await client.from('onboarding_progress').select('*', { count: 'exact', head: true }).eq('journey_key', journeyKey)
  if (selfError || (!['owner', 'admin'].includes(role) && selfCount !== 1)) throw selfError || new Error(`${role} can read another user's onboarding evidence.`)
  sessions.push({ role, client })
  console.log(`${role} progress=verified event=verified`)
}

const owner = sessions.find((session) => session.role === 'owner')?.client
const student = sessions.find((session) => session.role === 'student')?.client
if (!owner || !student) throw new Error('Owner/student acceptance sessions are missing.')

const { count: ownerCount, error: ownerReadError } = await owner.from('onboarding_progress').select('*', { count: 'exact', head: true }).eq('journey_key', journeyKey)
if (ownerReadError || ownerCount !== accounts.length) throw ownerReadError || new Error('The owner cannot read institution-wide onboarding readiness.')

const { error: spoofError } = await student.from('onboarding_progress').insert({
  user_id: (await student.auth.getUser()).data.user.id,
  role: 'faculty',
  journey_key: `${journeyKey}-spoof`,
  journey_version: 1,
})
if (!spoofError) throw new Error('A student could forge faculty onboarding evidence.')

const { error: deleteError } = await student.from('onboarding_progress').delete().eq('journey_key', journeyKey)
if (!deleteError) throw new Error('A learner could delete append-only onboarding evidence.')

for (const { client } of sessions) await client.auth.signOut()
console.log(JSON.stringify({ journeyKey, roles: accounts.length, ownerAggregate: ownerCount, roleSpoofDenied: true, userDeleteDenied: true, status: 'verified', cleanupRequired: true }))
