import { assertNewPassword } from '../auth/passwordPolicy'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../../utils/supabase'
import { withTimeout } from '../../utils/async'
import type { PlatformRole } from '../school/types'
export { shouldApplyCrmAuthEvent } from './authSessionPolicy'

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
  assertNewPassword(password)
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
  const completion = await supabase.functions.invoke('provision-role-account', { body: { action: 'complete_password_change' } })
  if (completion.error || completion.data?.must_change_password !== false) throw new Error(completion.error?.message || 'The required password change was not confirmed.')
  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error || !refreshed.data.session) throw new Error(refreshed.error?.message || 'The refreshed session was not returned.')
  return refreshed.data.session
}

export async function completeCrmPasswordRecovery(password: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  assertNewPassword(password)
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
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

export async function requestCrmPasswordReset(email: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Enter your institutional email address first.')
  const redirectTo = new URL('/signin', window.location.origin).toString()
  const { error } = await withTimeout(
    supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo }),
    authRequestTimeoutMs,
    'Password-reset delivery took too long. Check the connection and try again.',
  )
  if (error) throw new Error(error.message)
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

export function subscribeToCrmAuth(callback: (session: Session | null, event: AuthChangeEvent) => void) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event))
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

/** Roles are assigned by the server trigger; user metadata contains display information only. */
export async function signUpStudent(fullName: string, email: string, password: string) {
  if (!supabase) throw new Error('Registration is unavailable. Please try again later.')
  const name = fullName.trim()
  if (name.length < 2 || name.length > 120) throw new Error('Enter your full name (2–120 characters).')
  assertNewPassword(password)
  const { data, error } = await withTimeout(supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name }, emailRedirectTo: new URL('/signin', window.location.origin).toString() } }), authRequestTimeoutMs, 'Registration took too long. Please try again.')
  if (error) throw new Error(error.message)
  if (data.session) { await supabase.auth.signOut({ scope: 'local' }); throw new Error('Registration requires email confirmation. Contact the school administrator.') }
}

export async function resendStudentConfirmation(email: string) {
  if (!supabase) throw new Error('Registration is unavailable. Please try again later.')
  const { error } = await withTimeout(supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: new URL('/signin', window.location.origin).toString() } }), authRequestTimeoutMs, 'The confirmation request took too long. Please try again.')
  if (error) throw new Error(error.message)
}
