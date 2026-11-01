import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs'
export async function clientForRole(state, role) {
  const env = deploymentEnvironment()
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  // The protected owner may also be using the app during QA. Start each
  // independent owner check with a fresh session instead of replaying a token
  // that another session/recovery action may have invalidated.
  const credentials = role === 'owner' ? parseEnv(await readFile('.env.owner.local', 'utf8')) : null
  const result = credentials
    ? await client.auth.signInWithPassword({ email: credentials.CRM_ADMIN_EMAIL, password: credentials.CRM_ADMIN_PASSWORD })
    : await client.auth.setSession(state.users[role].session)
  if (result.error) throw new Error(`QA ${role} session could not be verified: ${result.error.message}`)
  return client
}
