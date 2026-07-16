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
if (!email || !password) throw new Error('CRM_ADMIN_EMAIL and CRM_ADMIN_PASSWORD are required for the live test.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { data: anonymousRows } = await anonymous.from('students').select('id')
if (anonymousRows?.length) throw new Error('Anonymous users unexpectedly received student rows.')

const client = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password })
if (authError || !auth.session) throw authError || new Error('No authenticated session was issued.')
if (auth.user.app_metadata.role !== 'admin') throw new Error('The live test account is not an administrator.')

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

await client.auth.signOut()
console.log(JSON.stringify({ anonymousIsolation: true, authenticatedRole: 'admin', counts, mutationRestored: true }))
