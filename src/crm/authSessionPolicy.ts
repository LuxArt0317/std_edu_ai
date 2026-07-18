import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export function shouldApplyCrmAuthEvent(
  current: Session | null,
  next: Session | null,
  event: AuthChangeEvent,
) {
  if (event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') return true
  if (!current || !next) return current?.user.id !== next?.user.id
  // Supabase owns token refresh internally. Replacing React session state for a
  // repeated same-user SIGNED_IN/TOKEN_REFRESHED event would reload the entire
  // identity shell whenever a background tab becomes visible again.
  return current.user.id !== next.user.id
}
