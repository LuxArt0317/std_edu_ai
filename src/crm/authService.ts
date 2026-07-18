import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../utils/supabase'
import { withTimeout } from '../utils/async'
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
  mustChangePassword: boolean
}

const platformRoles = new Set<PlatformRole>([
  'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head',
  'faculty', 'advisor', 'admissions', 'finance', 'support', 'librarian', 'student',
])

const sessionRestoreTimeoutMs = 10_000
const authRequestTimeoutMs = 15_000

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ST'
}

export async function getCrmSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    sessionRestoreTimeoutMs,
    'Session restoration took too long. Reset the local session and sign in again.',
  )
  if (error) throw new Error(error.message)
  return data.session
}

export async function getCrmUser(session: Session): Promise<CrmUser> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [{ data, error }, identity] = await withTimeout(
    Promise.all([
      supabase.from('profiles').select('id, full_name, role, is_platform_owner, job_title, department').eq('id', session.user.id).single(),
      supabase.auth.getUser(),
    ]),
    authRequestTimeoutMs,
    'Identity verification took too long. Check the connection and try again.',
  )
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
    mustChangePassword: identity.data.user.app_metadata.must_change_password === true,
  }
}

export async function completeRequiredPasswordChange(password: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (password.length < 16 || password.length > 128) throw new Error('Use a new password between 16 and 128 characters.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
  const completion = await supabase.functions.invoke('provision-role-account', { body: { action: 'complete_password_change' } })
  if (completion.error || completion.data?.must_change_password !== false) throw new Error(completion.error?.message || 'The required password change was not confirmed.')
  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error || !refreshed.data.session) throw new Error(refreshed.error?.message || 'The refreshed session was not returned.')
  return refreshed.data.session
}

export async function signInCrm(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({ email: email.trim(), password }),
    authRequestTimeoutMs,
    'Sign-in took too long. Check the connection and try again.',
  )
  if (error) throw new Error(error.message)
  if (!data.session) throw new Error('Supabase did not issue a session.')
  return data.session
}

export async function signOutCrm() {
  if (!supabase) return
  const { error } = await withTimeout(
    supabase.auth.signOut(),
    authRequestTimeoutMs,
    'Sign-out took too long. Reset the local session to continue.',
  )
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

export function clearLocalCrmSession() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('stu-nexus-auth')
  } catch {
    // Storage may be blocked by the browser; recovery still reloads the app.
  }
}

export { hasSupabaseConfig }
