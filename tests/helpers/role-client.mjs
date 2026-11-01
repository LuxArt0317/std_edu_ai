import { createClient } from '@supabase/supabase-js'
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs'
export async function clientForRole(state, role) {
  const env = deploymentEnvironment()
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const result = await client.auth.setSession(state.users[role].session)
  if (result.error) throw new Error(`QA ${role} session could not be verified: ${result.error.message}`)
  return client
}
