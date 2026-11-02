import { Navigate, useLocation, useNavigate } from "react-router";
import { legacyAppPath, safeReturnPath } from "../school/portal/routes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import UnifiedPortal from "../school/UnifiedPortal";
import {
  canUseCrm,
  clearLocalCrmSession,
  completeCrmPasswordRecovery,
  completeRequiredPasswordChange,
  getCrmSession,
  getCrmUser,
  hasSupabaseConfig,
  requestCrmPasswordReset,
  shouldApplyCrmAuthEvent,
  signInCrm,
  signOutCrm,
  signUpStudent,
  resendStudentConfirmation,
  subscribeToCrmAuth,
} from "../crm/authService";
import type { CrmUser } from "../crm/authService";
import "../crm/crm.css";

function SchoolAuth() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSignup = location.pathname === "/signup";
  const isLogin = location.pathname === "/signin" || isSignup;
  const returnPath = safeReturnPath(
    new URLSearchParams(location.search).get("next"),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [fullName, setFullName] = useState("");
  const [registrationSent, setRegistrationSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("type") ===
      "recovery",
  );

  function recoverLocalSession() {
    clearLocalCrmSession();
    const target = new URL("/signin", window.location.origin);
    target.searchParams.set("recovery", Date.now().toString());
    window.location.replace(target);
  }

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    let active = true;
    void getCrmSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to restore your sign-in session.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = subscribeToCrmAuth((current, event) => {
      setSession((existing) =>
        shouldApplyCrmAuthEvent(existing, current, event) ? current : existing,
      );
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setUser(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void getCrmUser(session)
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load your staff profile.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSignedOut(false);
    setSubmitting(true);
    setError("");
    try {
      const current = await signInCrm(email, password);
      setSession(current);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await signUpStudent(fullName, email, password);
      setPassword("");
      setConfirmPassword("");
      setRegistrationSent(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create your account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setSignedOut(true);
    setSigningOut(true);
    setError("");
    try {
      await signOutCrm();
      setSession(null);
      setUser(null);
      setPasswordRecovery(false);
      navigate("/signin", { replace: true });
    } catch (reason) {
      setSignedOut(false);
      setError(
        reason instanceof Error ? reason.message : "Unable to sign out.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  async function resetPassword() {
    setSubmitting(true);
    setError("");
    setResetMessage("");
    try {
      await requestCrmPasswordReset(email);
      setResetMessage(
        "If that account exists, a secure password-reset link has been sent.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request a password reset.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasSupabaseConfig)
    return (
      <main className="nexus-auth-shell">
        <section className="nexus-auth-card">
          <h1>School connection is not configured</h1>
          <p role="alert">
            Contact the school administrator to configure the secure database
            connection.
          </p>
        </section>
      </main>
    );

  if (loading || signingOut || (session && !user && !error))
    return (
      <main className="nexus-auth-shell">
        <div className="nexus-auth-loading">
          <span>樹</span>
          <strong>Loading</strong>
          <p>Loading your account…</p>
          <Button variant="outline" type="button" onClick={recoverLocalSession}>
            Reset saved login
          </Button>
        </div>
      </main>
    );

  if (location.pathname === "/login")
    return (
      <Navigate to={"/signin" + location.search + location.hash} replace />
    );

  if (!isLogin) {
    if (!session || !user || user.mustChangePassword || passwordRecovery) {
      const next = location.pathname.startsWith("/crm")
        ? legacyAppPath(location.search, "")
        : location.pathname + location.search;
      return (
        <Navigate
          to={
            signedOut
              ? "/signin"
              : "/signin?next=" + encodeURIComponent(safeReturnPath(next))
          }
          replace
        />
      );
    }
    if (location.pathname === "/crm" || location.pathname.startsWith("/crm/"))
      return (
        <Navigate to={legacyAppPath(location.search, location.hash)} replace />
      );
  }
  if (
    isLogin &&
    session &&
    user &&
    canUseCrm(user) &&
    !user.mustChangePassword &&
    !passwordRecovery
  )
    return <Navigate to={user.isOwner && returnPath === "/app" ? "/app/knowledge" : returnPath} replace />;

  if (session && (user?.mustChangePassword || passwordRecovery))
    return (
      <main className="nexus-auth-shell">
        <section className="nexus-auth-card">
          <div className="nexus-auth-mark">樹</div>
          <p className="nexus-auth-kicker">Account security</p>
          <h1>
            {passwordRecovery
              ? "Choose a new password"
              : "Replace your temporary password"}
          </h1>
          <p>
            {passwordRecovery
              ? "Complete the secure recovery request with a new private password."
              : "Your school account cannot open the portal until you choose a private password. The temporary password will stop working."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newPassword !== confirmPassword) {
                setError("The two passwords do not match.");
                return;
              }
              setSubmitting(true);
              setError("");
              const action = passwordRecovery
                ? completeCrmPasswordRecovery(newPassword)
                : completeRequiredPasswordChange(newPassword);
              void action
                .then((current) => {
                  setSession(current);
                  setPasswordRecovery(false);
                  setUser((value) =>
                    value ? { ...value, mustChangePassword: false } : value,
                  );
                  setNewPassword("");
                  setConfirmPassword("");
                })
                .catch((reason: unknown) =>
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Password change failed.",
                  ),
                )
                .finally(() => setSubmitting(false));
            }}
          >
            <Label>
              <span>New password</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={16}
                maxLength={72}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </Label>
            <Label>
              <span>Confirm new password</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={16}
                maxLength={72}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </Label>
            {error ? (
              <div className="nexus-auth-error" role="alert">
                {error}
              </div>
            ) : null}
            <Button disabled={submitting}>
              {submitting ? "Securing account…" : "Set password and continue →"}
            </Button>
          </form>
          <Button
            variant="outline"
            className="nexus-auth-recovery"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </section>
      </main>
    );

  if (session && user && canUseCrm(user))
    return (
      <UnifiedPortal currentUser={user} onSignOut={() => void signOut()} />
    );

  if (session && user) {
    return (
      <main className="nexus-auth-shell">
        <section className="nexus-auth-card access-card">
          <div className="nexus-auth-mark">樹</div>
          <p className="nexus-auth-kicker">Access control</p>
          <h1>Access required</h1>
          <p>
            Your account is authenticated as <strong>{user.email}</strong>, but
            it does not have a recognized STU Nexus role. Contact the platform
            owner.
          </p>
          {error ? <div className="nexus-auth-error">{error}</div> : null}
          <Button
            variant="outline"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </section>
      </main>
    );
  }

  if (isSignup)
    return (
      <main className="nexus-auth-shell">
        <section className="nexus-auth-card">
          <a href="/" className="nexus-auth-brand">
            <span>樹</span>
            <div>
              <b>STU NEXUS</b>
              <small>School portal</small>
            </div>
          </a>
          <div className="nexus-auth-copy">
            <h1>
              {registrationSent
                ? "Check your email"
                : "Create a student account"}
            </h1>
            <p>
              {registrationSent
                ? "If registration is available for this email, you will receive a confirmation link. Verify your email, then sign in. Check spam if needed."
                : "Create your login. Your courses appear after the school enrolls you."}
            </p>
          </div>
          {!registrationSent ? (
            <form onSubmit={register}>
              <Label>
                Full name
                <Input
                  name="fullName"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </Label>
              <Label>
                Email address
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Label>
              <Label>
                Password
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={16}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Label>
              <p className="text-xs">
                Use 16–72 characters with uppercase, lowercase, a number and a
                symbol.
              </p>
              <Label>
                Confirm password
                <Input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={16}
                  maxLength={72}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </Label>
              {error ? (
                <div className="nexus-auth-error" role="alert">
                  {error}
                </div>
              ) : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-3">
              <p role="status">
                Email confirmation is required before you can sign in.
              </p>
              {error ? <p role="alert">{error}</p> : null}
              {resetMessage ? <p role="status">{resetMessage}</p> : null}
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setSubmitting(true);
                  setError("");
                  setResetMessage("");
                  void resendStudentConfirmation(email)
                    .then(() =>
                      setResetMessage(
                        "Confirmation requested. Check your inbox and spam folder.",
                      ),
                    )
                    .catch((reason: unknown) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Unable to request confirmation. Please try again.",
                      ),
                    )
                    .finally(() => setSubmitting(false));
                }}
              >
                {submitting ? "Requesting email…" : "Resend confirmation email"}
              </Button>
              <Button
                variant="link"
                onClick={() => {
                  setRegistrationSent(false);
                  setError("");
                  setResetMessage("");
                }}
              >
                Use another email
              </Button>
            </div>
          )}
          <p className="mt-5">
            Already have an account?{" "}
            <a className="font-medium text-primary underline" href="/signin">
              Sign in
            </a>
          </p>
        </section>
      </main>
    );

  return (
    <main className="nexus-auth-shell">
      <section className="nexus-auth-card">
        <a href="/" className="nexus-auth-brand">
          <span>樹</span>
          <div>
            <b>STU NEXUS</b>
            <small>School portal</small>
          </div>
        </a>
        <div className="nexus-auth-copy">
          <p className="nexus-auth-kicker">Knowledge management</p>
          <h1>Sign in</h1>
          <p>Use your Nexus management account. School Affairs student sign-in is separate.</p>
        </div>
        <form onSubmit={submit}>
          <Label>
            <span>Email address</span>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setResetMessage("");
              }}
              placeholder="you@school.edu"
              required
            />
          </Label>
          <div className="grid gap-2">
            <Label htmlFor="school-password">Password</Label>
            <div className="nexus-password-field">
              <Input
                id="school-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your secure password"
                required
              />
              <Button
                variant="outline"
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          {error ? (
            <div className="nexus-auth-error" role="alert">
              {error}
            </div>
          ) : null}
          {resetMessage ? (
            <div className="nexus-auth-success" role="status">
              {resetMessage}
            </div>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <Button
            variant="outline"
            className="nexus-auth-recovery"
            type="button"
            disabled={submitting}
            onClick={() => void resetPassword()}
          >
            Forgot password?
          </Button>
          {error ? (
            <Button
              variant="outline"
              className="nexus-auth-recovery"
              type="button"
              onClick={recoverLocalSession}
            >
              Reset this device’s saved session
            </Button>
          ) : null}
        </form>
        <p className="mt-5">
          Student access?{" "}
          <a className="font-medium text-primary underline" href="/school-affairs/login">
            Open School Affairs
          </a>
        </p>
      </section>
    </main>
  );
}

export default SchoolAuth;
