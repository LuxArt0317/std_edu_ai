import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../utils/supabase'

export type CrmUser = {
  id: string
  email: string
  name: string
  role: string
  initials: string
}

const staffRoles = new Set(['admin', 'advisor', 'admissions', 'support', 'faculty'])

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
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').eq('id', session.user.id).single()
  if (error) throw new Error(error.message)
  const name = data.full_name || session.user.email?.split('@')[0] || 'STU user'
  return {
    id: session.user.id,
    email: session.user.email || '',
    name,
    role: data.role,
    initials: initialsFor(name),
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
  return staffRoles.has(user.role)
}

export function subscribeToCrmAuth(callback: (session: Session | null) => void) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export { hasSupabaseConfig }
