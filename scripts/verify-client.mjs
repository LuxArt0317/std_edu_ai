import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { deploymentEnvironment } from './deployment-env.mjs'

const config = JSON.parse(await readFile('deployment.json', 'utf8'))
const env = deploymentEnvironment()
const ownerEnv = parseEnv(await readFile('.env.owner.local', 'utf8'))
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname, `${config.supabase.projectRef}.supabase.co`, 'Wrong Supabase project')
const sql = postgres(env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL, { max: 1, connect_timeout: 15, ssl: { rejectUnauthorized: true, ca: await readFile('supabase/certs/prod-ca-2021.crt', 'utf8') }, onnotice: () => {} })
const owner = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
try {
  const unprotected = await sql`select relname from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r' and not relrowsecurity`
  assert.equal(unprotected.length, 0, 'Every public application table must have RLS')
  const migrations = await sql`select version from supabase_migrations.schema_migrations`
  const owners = await sql`select p.id, u.email from public.profiles p join auth.users u on u.id=p.id where p.is_platform_owner`
  assert.equal(owners.length, 1)
  assert.equal(owners[0].email, config.supabase.ownerEmail)
  const buckets = await sql`select id, public from storage.buckets order by id`
  for (const id of ['lms-files', 'learning-media', 'nexus-attachments']) assert.ok(buckets.some(b => b.id === id), `Missing bucket ${id}`)
  for (const id of ['lms-files', 'nexus-attachments']) assert.equal(buckets.find(b => b.id === id).public, false)
  const login = await owner.auth.signInWithPassword({ email: ownerEnv.CRM_ADMIN_EMAIL, password: ownerEnv.CRM_ADMIN_PASSWORD })
  if (login.error) throw new Error(`Client owner login failed: ${login.error.message}`)
  assert.equal(login.data.user.app_metadata.role, 'owner')
  assert.equal(login.data.user.app_metadata.platform_owner, true)
  const self = await owner.from('profiles').select('id, role, is_platform_owner').eq('id', login.data.user.id).single()
  if (self.error) throw new Error(`Owner profile read failed: ${self.error.message}`)
  assert.equal(self.data.role, 'owner')
  const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const table of ['students', 'profiles', 'cases', 'knowledge_chunks']) {
    const result = await anonymous.from(table).select('id').limit(1)
    assert.equal((result.data || []).length, 0, `Anonymous exposure in ${table}`)
  }
  const suffix = randomUUID().slice(0, 8)
  let fixture
  try {
    const created = await owner.from('departments').insert({ code: `QC-${suffix}`, name: 'Client handoff verification', description: 'Temporary reversible verification fixture' }).select('id').single()
    if (created.error) throw new Error(`Owner CRUD create failed: ${created.error.message}`)
    fixture = created.data.id
    const update = await owner.from('departments').update({ name: 'Client handoff verified' }).eq('id', fixture).select('name').single()
    if (update.error) throw new Error(`Owner CRUD update failed: ${update.error.message}`)
    assert.equal(update.data.name, 'Client handoff verified')
  } finally {
    if (fixture) {
      const deleted = await owner.from('departments').delete().eq('id', fixture).select('id')
      if (deleted.error) throw new Error(`Verification cleanup failed: ${deleted.error.message}`)
      assert.equal(deleted.data.length, 1)
    }
  }
  console.log(JSON.stringify({ database: config.supabase.projectRef, migrationCount: migrations.length, ownerLogin: true, ownerProfile: true, rlsEnabledEverywhere: true, anonymousProtectedTables: 4, ownerCrudAndCleanup: true, buckets: buckets.map(b => b.id) }))
  if (!process.argv.includes('--database-only')) {
    const result = spawnSync(process.execPath, ['tests/integration/deployment-shell-live.mjs'], { encoding: 'utf8', env: { ...process.env, STU_BASE_URL: config.vercel.productionUrl, STU_EXPECTED_SUPABASE_HOST: `${config.supabase.projectRef}.supabase.co` } })
    process.stdout.write(result.stdout)
    assert.equal(result.status, 0, result.stderr || 'Live shell verification failed')
    for (const name of ['provision-role-account', 'manage-student-account']) {
      const preflight = await fetch(`${url}/functions/v1/${name}`, { method: 'OPTIONS', headers: { Origin: config.vercel.productionUrl, 'Access-Control-Request-Method': 'POST' }, signal: AbortSignal.timeout(20000) })
      assert.equal(preflight.status, 204, `${name} preflight unavailable`)
      assert.equal(preflight.headers.get('access-control-allow-origin'), config.vercel.productionUrl)
      const denied = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: '{}', signal: AbortSignal.timeout(20000) })
      assert.equal(denied.status, 401, `${name} must require authentication`)
    }
    const activity = await owner.functions.invoke('provision-role-account', { body: { action: 'directory' } })
    if (activity.error) throw new Error(`Owner account-management function failed: ${activity.error.message}`)
    console.log(JSON.stringify({ edgeFunctions: 2, corsAndAuthentication: true, ownerAccountDirectory: true }))
  }
} catch (error) {
  console.error(`Client verification failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await owner.auth.signOut().catch(() => {})
  await sql.end({ timeout: 5 })
}
