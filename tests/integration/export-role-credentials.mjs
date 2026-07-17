import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const outputPath = path.resolve('PRODUCTION_ROLE_CREDENTIALS.local.md')
const temporaryPath = `${outputPath}.${process.pid}.tmp`

if (process.platform !== 'darwin') {
  throw new Error('Credential export requires the protected macOS Keychain credentials.')
}

const environment = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }),
)

if (!environment.VITE_SUPABASE_URL || !environment.VITE_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('The production Supabase URL and publishable key are required in .env.')
}

const accounts = [
  ['Ownership', 'owner', 'winsonbaring10@gmail.com'],
  ['Leadership', 'admin', 'winsonbaring10+admin@gmail.com'],
  ['Leadership', 'president', 'winsonbaring10+president@gmail.com'],
  ['Leadership', 'vice_president', 'winsonbaring10+vice-president@gmail.com'],
  ['Leadership', 'dean', 'winsonbaring10+dean@gmail.com'],
  ['Leadership', 'registrar', 'winsonbaring10+registrar@gmail.com'],
  ['Academic', 'department_head', 'winsonbaring10+department-head@gmail.com'],
  ['Academic', 'faculty', 'winsonbaring10+faculty@gmail.com'],
  ['Academic', 'advisor', 'winsonbaring10+advisor@gmail.com'],
  ['Operations', 'admissions', 'winsonbaring10+admissions@gmail.com'],
  ['Operations', 'finance', 'winsonbaring10+finance@gmail.com'],
  ['Operations', 'support', 'winsonbaring10+support@gmail.com'],
  ['Operations', 'librarian', 'winsonbaring10+librarian@gmail.com'],
  ['Learner', 'student', 'winsonbaring10+student@gmail.com'],
]

const escapeCell = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('|', '&#124;')
  .replaceAll('\r', '')
  .replaceAll('\n', '')

const verified = []

try {
  for (const [tier, role, email] of accounts) {
    const keychain = spawnSync('/usr/bin/security', ['find-internet-password', '-w', '-s', 'www.stu.best', '-a', email], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const password = keychain.stdout.trim()
    if (keychain.status !== 0 || !password) throw new Error(`The Keychain credential for ${role} is missing.`)

    const loginResponse = await fetch(`${environment.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const login = await loginResponse.json().catch(() => ({}))
    if (!loginResponse.ok || !login.access_token || login.user?.app_metadata?.role !== role) {
      throw new Error(`Production authentication failed for ${role} (${loginResponse.status}).`)
    }
    if ((role === 'owner') !== (login.user.app_metadata.platform_owner === true)) {
      throw new Error(`The protected-owner claim is invalid for ${role}.`)
    }

    const profileResponse = await fetch(
      `${environment.VITE_SUPABASE_URL}/rest/v1/profiles?select=role,is_platform_owner&id=eq.${encodeURIComponent(login.user.id)}`,
      { headers: { apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${login.access_token}` } },
    )
    const profiles = await profileResponse.json().catch(() => [])
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (!profileResponse.ok || profile?.role !== role || profile.is_platform_owner !== (role === 'owner')) {
      throw new Error(`The Auth/profile authorization boundary is inconsistent for ${role}.`)
    }

    await fetch(`${environment.VITE_SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${login.access_token}` },
    })
    verified.push({ tier, role, email, password })
  }

  const rows = verified.map(({ tier, role, email, password }) =>
    `| ${escapeCell(tier)} | \`${escapeCell(role)}\` | ${escapeCell(email)} | \`${escapeCell(password)}\` | Verified |`,
  )
  const document = [
    '# STU Nexus production role credentials',
    '',
    '> Local POC credential sheet. Do not commit, upload, paste into tickets, or share outside authorized operators.',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Sign-in URL: https://www.stu.best/crm',
    '',
    '| Tier | Role | Email | Password | Production status |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Each account was authenticated against production immediately before this file was written. Auth app metadata, the protected-owner claim, and the RLS-visible profile role were verified.',
    '',
    'Regenerate safely with `npm run export:role-credentials`. The command replaces this file atomically and keeps mode `0600`.',
    '',
  ].join('\n')

  fs.writeFileSync(temporaryPath, document, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  fs.renameSync(temporaryPath, outputPath)
  fs.chmodSync(outputPath, 0o600)
} finally {
  if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath)
}

console.log(JSON.stringify({ file: path.basename(outputPath), accounts: verified.length, verified: true, mode: '0600' }))
