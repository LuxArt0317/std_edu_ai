import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

if (process.platform !== 'darwin') {
  throw new Error('The live role-account test requires the protected macOS Keychain credentials.')
}

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

for (const [role, email] of accounts) {
  const keychain = spawnSync('/usr/bin/security', ['find-internet-password', '-w', '-s', 'www.stu.best', '-a', email], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const password = keychain.stdout.trim()
  if (keychain.status !== 0 || !password) throw new Error(`The Keychain credential for ${role} is missing.`)

  const loginResponse = await fetch(`${environment.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const login = await loginResponse.json().catch(() => ({}))
  if (!loginResponse.ok || login.user?.app_metadata?.role !== role || !login.access_token) {
    throw new Error(`Production authentication failed for ${role} (${loginResponse.status}).`)
  }
  if ((role === 'owner') !== (login.user.app_metadata.platform_owner === true)) {
    throw new Error(`The protected-owner claim is invalid for ${role}.`)
  }

  const profileResponse = await fetch(
    `${environment.VITE_SUPABASE_URL}/rest/v1/profiles?select=role,is_platform_owner&id=eq.${encodeURIComponent(login.user.id)}`,
    {
      headers: {
        apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${login.access_token}`,
      },
    },
  )
  const profiles = await profileResponse.json().catch(() => [])
  const profile = Array.isArray(profiles) ? profiles[0] : null
  if (!profileResponse.ok || profile?.role !== role || profile.is_platform_owner !== (role === 'owner')) {
    throw new Error(`The Auth/profile authorization boundary is inconsistent for ${role}.`)
  }

  await fetch(`${environment.VITE_SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: {
      apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${login.access_token}`,
    },
  })
  console.log(`${role} ${email} login=verified profile=verified`)
}

console.log(JSON.stringify({ accounts: accounts.length, distinctRoles: new Set(accounts.map(([role]) => role)).size, status: 'verified' }))
