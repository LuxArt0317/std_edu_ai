import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../utils/supabase'
import type { PlatformRole } from '../platform/types'

export type CrmUser = {
  id: string
  email: string
  name: string
  role: PlatformRole
  initials: string
  isOwner: boolean
  jobTitle: string
  department: string
}

const platformRoles = new Set<PlatformRole>([
  'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head',
  'faculty', 'advisor', 'admissions', 'finance', 'support', 'librarian', 'student',
])

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ST'
}

export async function getCrmSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(error.message)
  return data.session
}

export async function getCrmUser(session: Session): Promise<CrmUser> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [{ data, error }, identity] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, is_platform_owner, job_title, department').eq('id', session.user.id).single(),
    supabase.auth.getUser(),
  ])
  if (error) throw new Error(error.message)
  if (identity.error || !identity.data.user) throw new Error('Your authenticated identity could not be verified.')
  const trustedRole = identity.data.user.app_metadata.role
  if (typeof trustedRole !== 'string' || !platformRoles.has(trustedRole as PlatformRole)) throw new Error('Your account does not have a recognized STU Nexus role.')
  const name = data.full_name || session.user.email?.split('@')[0] || 'STU user'
  return {
    id: session.user.id,
    email: session.user.email || '',
    name,
    role: trustedRole as PlatformRole,
    initials: initialsFor(name),
    isOwner: trustedRole === 'owner' && identity.data.user.app_metadata.platform_owner === true && data.is_platform_owner,
    jobTitle: data.job_title || '',
    department: data.department || '',
  }
}

export async function signInCrm(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message)
  if (!data.session) throw new Error('Supabase did not issue a session.')
  return data.session
}

export async function signOutCrm() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export function canUseCrm(user: CrmUser) {
  return platformRoles.has(user.role)
}

export function subscribeToCrmAuth(callback: (session: Session | null) => void) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export { hasSupabaseConfig }
