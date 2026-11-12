import { readFile, readdir, writeFile, chmod } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { deploymentEnvironment } from './deployment-env.mjs'

const env = deploymentEnvironment()
const configuration = JSON.parse(await readFile('deployment.json', 'utf8'))
const apply = process.argv.includes('--apply')
const only = process.argv.find(value => value.startsWith('--only='))?.slice(7)
if (only && !/^\d{14}$/.test(only)) throw new Error('--only must be an exact migration version.')
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL
if (!connection || !url || !key) throw new Error('Database connection, Supabase URL, and server-only service key are required. See docs/operations/SETUP.md.')
if (new URL(url).hostname !== `${configuration.supabase.projectRef}.supabase.co`) throw new Error('Refusing to target a Supabase project other than deployment.json.')
const connectionHost = new URL(connection).hostname
if (!connectionHost.endsWith('.supabase.com') && connectionHost !== `db.${configuration.supabase.projectRef}.supabase.co`) throw new Error('Unexpected database host.')
const sql = postgres(connection, { max: 1, connect_timeout: 15, idle_timeout: 10, ssl: { rejectUnauthorized: true, ca: await readFile('supabase/certs/prod-ca-2021.crt', 'utf8') }, onnotice: () => {} })
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
async function ensureOwner() {
  const rows = await sql`select id from auth.users where lower(email) = lower(${configuration.supabase.ownerEmail}) limit 1`
  if (rows.length) return

  const password = randomBytes(32).toString('base64url') + 'aA1!'
  const created = await admin.auth.admin.createUser({ email: configuration.supabase.ownerEmail, password, email_confirm: true, app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Lux Platform Owner' } })
  if (created.error) throw new Error(`Owner bootstrap failed: ${created.error.message}`)
  await writeFile('.env.owner.local', `CRM_ADMIN_EMAIL=${configuration.supabase.ownerEmail}\nCRM_ADMIN_PASSWORD=${password}\n`, { mode: 0o600 })
  await chmod('.env.owner.local', 0o600)
  console.log('Created owner bootstrap identity. Initial credential is in the ignored, owner-readable .env.owner.local file.')
}

let locked = false
try {
  const [lock] = await sql`select pg_try_advisory_lock(hashtext('stu-client-migrations')) as acquired`
  if (!lock.acquired) throw new Error('Another database migration run is active.')
  locked = true
  const history = await sql`select to_regclass('supabase_migrations.schema_migrations') as existing`
  const applied = history[0].existing ? await sql`select version from supabase_migrations.schema_migrations` : []
  const files = (await readdir('supabase/migrations')).filter(x => /^\d+_.+\.sql$/.test(x)).sort()
  const pending = files.filter(name => !applied.some(row => row.version === name.split('_')[0]))
  if (only && !files.some(name=>name.startsWith(only+'_'))) throw new Error('Requested migration is not present.')
  const selected = only ? pending.filter(name=>name.startsWith(only+'_')) : pending
  const [schema] = await sql`select count(*)::int as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`
  if (!applied.length && schema.count) throw new Error('Existing public tables have no migration history. Reconcile the schema before applying; this command never resets databases.')
  console.log(JSON.stringify({ project: configuration.supabase.projectRef, mode: apply ? 'apply' : 'dry-run', applied: applied.length, pending: pending.length, selected, deferred:pending.filter(name=>!selected.includes(name)) }))
  if (apply) {
    await sql.unsafe('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)')
    await sql`select set_config('app.bootstrap_owner_email', ${configuration.supabase.ownerEmail}, false)`
    if (applied.some(row => row.version === '20260716142102')) await ensureOwner()
    for (const name of selected) {
      const source = await readFile(`supabase/migrations/${name}`, 'utf8')
      await sql.begin(async tx => {
        await tx.unsafe(source)
        await tx`insert into supabase_migrations.schema_migrations(version, statements, name) values (${name.split('_')[0]}, ${[source]}, ${name.replace(/^\d+_/, '').replace(/\.sql$/, '')})`
      })
      console.log(`Applied ${name}`)
      if (name === '20260716142102_stu_nexus_crm.sql') await ensureOwner()
    }
  }
  const tables = await sql`select count(*)::int as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`
  console.log(JSON.stringify({ publicTables: tables[0].count, complete: pending.length === 0 || (apply && selected.length===pending.length), selectedComplete:selected.length===0||apply }))
} catch (error) {
  console.error(`Database deployment failed: ${error.message}`)
  process.exitCode = 1
} finally {
  if (locked) await sql`select pg_advisory_unlock(hashtext('stu-client-migrations'))`.catch(() => {})
  await sql.end({ timeout: 5 })
}
