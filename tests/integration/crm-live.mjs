import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const environment = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }),
)

const email = process.env.CRM_ADMIN_EMAIL || 'winsonbaring10+admin@gmail.com'
const keychain = spawnSync('/usr/bin/security', ['find-internet-password', '-w', '-s', 'www.stu.best', '-a', email], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const password = process.env.CRM_ADMIN_PASSWORD || keychain.stdout.trim()
if (!password) throw new Error('A protected CRM administrator credential is required for the live test.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { data: anonymousRows } = await anonymous.from('students').select('id')
if (anonymousRows?.length) throw new Error('Anonymous users unexpectedly received student rows.')

const client = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password })
if (authError || !auth.session) throw authError || new Error('No authenticated session was issued.')
if (!['owner', 'admin'].includes(auth.user.app_metadata.role)) throw new Error('The live test account is not a platform owner or administrator.')

const tables = ['students', 'cases', 'admission_leads', 'crm_tasks', 'campaigns', 'knowledge_articles']
const counts = []
for (const table of tables) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  counts.push({ table, count })
}

const caseId = '20000000-0000-4000-8000-000000000002'
const { data: original, error: originalError } = await client.from('cases').select('status').eq('id', caseId).single()
if (originalError) throw originalError
const testStatus = original.status === 'waiting' ? 'in_progress' : 'waiting'
const { error: mutationError } = await client.from('cases').update({ status: testStatus }).eq('id', caseId)
if (mutationError) throw mutationError
const { error: restoreError } = await client.from('cases').update({ status: original.status }).eq('id', caseId)
if (restoreError) throw restoreError

const marker = `CRUD-${Date.now()}`
const { data: student, error: studentError } = await client.from('students').select('id,next_best_action').limit(1).single()
if (studentError) throw studentError
let createdCase, createdLead, createdCampaign, createdTask, createdKnowledge, createdSignal, createdInteraction, mediaPath
try {
  const studentEdit = await client.from('students').update({ next_best_action: marker }).eq('id', student.id).select('next_best_action').single()
  if (studentEdit.error || studentEdit.data.next_best_action !== marker) throw studentEdit.error || new Error('Student editing failed.')
  const newCase = await client.from('cases').insert({ student_id: student.id, title: marker, description: '<p>Rich case plan</p>', category: 'Verification', owner_id: auth.user.id }).select('id').single()
  if (newCase.error) throw newCase.error; createdCase = newCase.data.id
  const caseEdit = await client.from('cases').update({ priority: 'high', status: 'in_progress' }).eq('id', createdCase).select('priority,status').single()
  if (caseEdit.error || caseEdit.data.status !== 'in_progress') throw caseEdit.error || new Error('Case editing failed.')
  const newLead = await client.from('admission_leads').insert({ full_name: marker, program_interest: 'BSIM', source: 'Verification', owner_id: auth.user.id }).select('id').single()
  if (newLead.error) throw newLead.error; createdLead = newLead.data.id
  const leadEdit = await client.from('admission_leads').update({ stage: 'engaged', probability: 35 }).eq('id', createdLead).select('stage').single()
  if (leadEdit.error || leadEdit.data.stage !== 'engaged') throw leadEdit.error || new Error('Lead editing failed.')
  const newCampaign = await client.from('campaigns').insert({ name: marker, channel: 'email', message_template: '<p>Rich message</p>', created_by: auth.user.id }).select('id').single()
  if (newCampaign.error) throw newCampaign.error; createdCampaign = newCampaign.data.id
  const campaignEdit = await client.from('campaigns').update({ status: 'scheduled' }).eq('id', createdCampaign).select('status').single()
  if (campaignEdit.error || campaignEdit.data.status !== 'scheduled') throw campaignEdit.error || new Error('Campaign editing failed.')
  const newTask = await client.from('crm_tasks').insert({ title: marker, assigned_to: auth.user.id, student_id: student.id }).select('id').single()
  if (newTask.error) throw newTask.error; createdTask = newTask.data.id
  const taskEdit = await client.from('crm_tasks').update({ priority: 'high' }).eq('id', createdTask).select('priority').single()
  if (taskEdit.error || taskEdit.data.priority !== 'high') throw taskEdit.error || new Error('Task editing failed.')
  const newKnowledge = await client.from('knowledge_articles').insert({ title: marker, category: 'Verification', summary: 'Temporary', content: '<p>Rich knowledge</p>', owner_id: auth.user.id }).select('id').single()
  if (newKnowledge.error) throw newKnowledge.error; createdKnowledge = newKnowledge.data.id
  const knowledgeEdit = await client.from('knowledge_articles').update({ status: 'verified' }).eq('id', createdKnowledge).select('status').single()
  if (knowledgeEdit.error || knowledgeEdit.data.status !== 'verified') throw knowledgeEdit.error || new Error('Knowledge editing failed.')
  mediaPath = `${auth.user.id}/${crypto.randomUUID()}.gif`
  const image = Uint8Array.from(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'))
  const media = await client.storage.from('institutional-media').upload(mediaPath, image, { contentType: 'image/gif' })
  if (media.error) throw media.error
  const signal = await client.from('student_signals').insert({ student_id: student.id, label: marker, detail: '<p>Editable signal</p>', severity: 'warning', signal_type: 'support', source_system: 'staff' }).select('id').single()
  if (signal.error) throw signal.error; createdSignal = signal.data.id
  const signalEdit = await client.from('student_signals').update({ severity: 'critical', resolved_at: new Date().toISOString() }).eq('id', createdSignal).select('severity,resolved_at').single()
  if (signalEdit.error || signalEdit.data.severity !== 'critical' || !signalEdit.data.resolved_at) throw signalEdit.error || new Error('Signal editing failed.')
  const interaction = await client.from('interactions').insert({ student_id: student.id, actor_id: auth.user.id, subject: marker, summary: '<p>Append-only interaction</p>', interaction_type: 'meeting' }).select('id').single()
  if (interaction.error) throw interaction.error; createdInteraction = interaction.data.id
} finally {
  await client.from('students').update({ next_best_action: student.next_best_action }).eq('id', student.id)
  if (createdTask) await client.from('crm_tasks').delete().eq('id', createdTask)
  if (createdCampaign) await client.from('campaigns').delete().eq('id', createdCampaign)
  if (createdLead) await client.from('admission_leads').delete().eq('id', createdLead)
  if (createdCase) await client.from('cases').delete().eq('id', createdCase)
  if (createdKnowledge) await client.from('knowledge_articles').delete().eq('id', createdKnowledge)
  if (createdSignal) await client.from('student_signals').delete().eq('id', createdSignal)
  if (createdInteraction) await client.from('interactions').delete().eq('id', createdInteraction)
  if (mediaPath) await client.storage.from('institutional-media').remove([mediaPath])
}

await client.auth.signOut()
console.log(JSON.stringify({ anonymousIsolation: true, authenticatedRole: auth.user.app_metadata.role, counts, mutationRestored: true, studentEditing: true, caseCrud: true, leadCrud: true, campaignCrud: true, taskCrud: true, knowledgeCrud: true, signalCrud: true, interactionLogging: true, institutionalImages: true, cleanup: true }))
