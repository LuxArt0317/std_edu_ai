import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import UnifiedPortal from '../school/UnifiedPortal'
import { canUseCrm, clearLocalCrmSession, completeCrmPasswordRecovery, completeRequiredPasswordChange, getCrmSession, getCrmUser, hasSupabaseConfig, requestCrmPasswordReset, shouldApplyCrmAuthEvent, signInCrm, signOutCrm, subscribeToCrmAuth } from './authService'
import type { CrmUser } from './authService'
import './crm.css'

function CRMRoot() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<CrmUser | null>(null)
  const [loading, setLoading] = useState(hasSupabaseConfig)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  function recoverLocalSession() {
    clearLocalCrmSession()
    const target = new URL('/crm', window.location.origin)
    target.searchParams.set('recovery', Date.now().toString())
    window.location.replace(target)
  }

  useEffect(() => {
    if (!hasSupabaseConfig) return
    let active = true
    void getCrmSession()
      .then((current) => { if (active) setSession(current) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to restore the CRM session.') })
      .finally(() => { if (active) setLoading(false) })
    const unsubscribe = subscribeToCrmAuth((current, event) => {
      setSession((existing) => shouldApplyCrmAuthEvent(existing, current, event) ? current : existing)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) {
      setUser(null)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    void getCrmUser(session)
      .then((profile) => { if (active) setUser(profile) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your staff profile.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError('')
    try {
      const current = await signInCrm(email, password)
      setSession(current)
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  async function signOut() {
    setError('')
    try {
      await signOutCrm()
      setSession(null)
      setUser(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign out.')
    }
  }

  async function resetPassword() {
    setSubmitting(true)
    setError('')
    setResetMessage('')
    try {
      await requestCrmPasswordReset(email)
      setResetMessage('If that account exists, a secure password-reset link has been sent.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to request a password reset.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!hasSupabaseConfig) return <div className="nexus-auth-shell"><section className="nexus-auth-card"><h1>School connection is not configured</h1><p role="alert">Contact the school administrator to configure the secure database connection.</p></section></div>

  if (loading) return <div className="nexus-auth-shell"><div className="nexus-auth-loading"><span>樹</span><strong>Securing STU Nexus</strong><p>Restoring your authenticated workspace…</p><Button type="button" onClick={recoverLocalSession}>Start with a clean local session</Button></div></div>

  if (session && (user?.mustChangePassword || passwordRecovery)) return <div className="nexus-auth-shell"><section className="nexus-auth-card"><div className="nexus-auth-mark">樹</div><p className="nexus-auth-kicker">ACCOUNT SECURITY</p><h1>{passwordRecovery ? 'Choose a new password' : 'Replace your temporary password'}</h1><p>{passwordRecovery ? 'Complete the secure recovery request with a new private password.' : 'Your school account cannot open the portal until you choose a private password. The temporary password will stop working.'}</p><form onSubmit={(event) => { event.preventDefault(); if (newPassword !== confirmPassword) { setError('The two passwords do not match.'); return; } setSubmitting(true); setError(''); const action=passwordRecovery ? completeCrmPasswordRecovery(newPassword) : completeRequiredPasswordChange(newPassword); void action.then((current) => { setSession(current); setPasswordRecovery(false); setUser((value) => value ? { ...value, mustChangePassword: false } : value); setNewPassword(''); setConfirmPassword(''); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Password change failed.')).finally(() => setSubmitting(false)); }}><Label><span>New password</span><Input type="password" autoComplete="new-password" minLength={16} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></Label><Label><span>Confirm new password</span><Input type="password" autoComplete="new-password" minLength={16} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></Label>{error ? <div className="nexus-auth-error" role="alert">{error}</div> : null}<Button disabled={submitting}>{submitting ? 'Securing account…' : 'Set password and continue →'}</Button></form><Button className="nexus-auth-recovery" type="button" onClick={() => void signOut()}>Sign out</Button></section></div>

  if (session && user && canUseCrm(user)) return <UnifiedPortal currentUser={user} onSignOut={() => void signOut()} />

  if (session && user) {
    return <div className="nexus-auth-shell"><section className="nexus-auth-card access-card"><div className="nexus-auth-mark">樹</div><p className="nexus-auth-kicker">ACCESS CONTROL</p><h1>Platform access is required</h1><p>Your account is authenticated as <strong>{user.email}</strong>, but it does not have a recognized STU Nexus role. Contact the platform owner.</p>{error ? <div className="nexus-auth-error">{error}</div> : null}<Button type="button" onClick={() => void signOut()}>Sign out</Button></section></div>
  }

  return <div className="nexus-auth-shell"><section className="nexus-auth-card"><a href="/" className="nexus-auth-brand"><span>樹</span><div><b>STU NEXUS</b><small>School Operating Platform</small></div></a><div className="nexus-auth-copy"><p className="nexus-auth-kicker">SECURE SCHOOL WORKSPACE</p><h1>Welcome back</h1><p>Sign in with your authorized Shu-Te University platform account.</p></div><form onSubmit={submit}><Label><span>Email address</span><Input type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setResetMessage('') }} placeholder="name@stu.edu.tw" required /></Label><Label><span>Password</span><div className="nexus-password-field"><Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your secure password" required /><Button type="button" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</Button></div></Label>{error ? <div className="nexus-auth-error" role="alert">{error}</div> : null}{resetMessage ? <div className="nexus-auth-success" role="status">{resetMessage}</div> : null}<Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in to STU Nexus →'}</Button><Button className="nexus-auth-recovery" type="button" disabled={submitting} onClick={() => void resetPassword()}>Forgot password?</Button>{error ? <Button className="nexus-auth-recovery" type="button" onClick={recoverLocalSession}>Reset this device’s saved session</Button> : null}</form><footer><span><i />Supabase Auth</span><span>RLS protected</span><span>Encrypted in transit</span></footer></section></div>
}

export default CRMRoot
