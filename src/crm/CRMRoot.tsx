import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import CRMApp from './CRMApp'
import { canUseCrm, getCrmSession, getCrmUser, hasSupabaseConfig, signInCrm, signOutCrm, subscribeToCrmAuth } from './authService'
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

  useEffect(() => {
    if (!hasSupabaseConfig) return
    let active = true
    void getCrmSession()
      .then((current) => { if (active) setSession(current) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to restore the CRM session.') })
      .finally(() => { if (active) setLoading(false) })
    const unsubscribe = subscribeToCrmAuth((current) => setSession(current))
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) {
      setUser(null)
      return
    }
    let active = true
    setLoading(true)
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

  if (!hasSupabaseConfig) return <CRMApp />

  if (loading) return <div className="nexus-auth-shell"><div className="nexus-auth-loading"><span>樹</span><strong>Securing STU Nexus</strong><p>Restoring your authenticated workspace…</p></div></div>

  if (session && user && canUseCrm(user)) return <CRMApp currentUser={user} onSignOut={() => void signOut()} />

  if (session && user) {
    return <div className="nexus-auth-shell"><section className="nexus-auth-card access-card"><div className="nexus-auth-mark">樹</div><p className="nexus-auth-kicker">ACCESS CONTROL</p><h1>Staff access is required</h1><p>Your account is authenticated as <strong>{user.email}</strong>, but its role does not permit CRM access. Contact an STU Nexus administrator for a staff role.</p>{error ? <div className="nexus-auth-error">{error}</div> : null}<button type="button" onClick={() => void signOut()}>Sign out</button></section></div>
  }

  return <div className="nexus-auth-shell"><section className="nexus-auth-card"><a href="/" className="nexus-auth-brand"><span>樹</span><div><b>STU NEXUS</b><small>Student Relationship Cloud</small></div></a><div className="nexus-auth-copy"><p className="nexus-auth-kicker">SECURE STAFF WORKSPACE</p><h1>Welcome back</h1><p>Sign in with your authorized Shu-Te University CRM account.</p></div><form onSubmit={submit}><label><span>Email address</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@stu.edu.tw" required /></label><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your secure password" required /></label>{error ? <div className="nexus-auth-error" role="alert">{error}</div> : null}<button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in to STU Nexus →'}</button></form><footer><span><i />Supabase Auth</span><span>RLS protected</span><span>Encrypted in transit</span></footer></section></div>
}

export default CRMRoot
