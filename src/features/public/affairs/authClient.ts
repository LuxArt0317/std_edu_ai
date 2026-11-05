import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const affairsStorageKey = 'stu-school-affairs-auth';
export const affairsCallbackPath = '/school-affairs/auth/callback';
const returnKey = 'stu-school-affairs-return';
export function consumeGoogleReturnPath() {
  const value = sessionStorage.getItem(returnKey);
  sessionStorage.removeItem(returnKey);
  return value === '/dtm' ? value : '/school-affairs';
}
// Never borrow the Nexus session or its PKCE verifier.
export const affairsClient = url && key ? createClient<Database>(url, key, {
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) },
  auth: { storageKey: affairsStorageKey, flowType: 'pkce', persistSession: true,
    autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

export async function startGoogleSignIn(returnPath: '/dtm' | '/school-affairs' = '/school-affairs') {
  if (!affairsClient || !url || !key) throw new Error('Google sign-in is not configured. Please contact the site administrator.');
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(10000),
  });
  const settings = await response.json().catch(() => null);
  if (!response.ok || !settings?.external?.google)
    throw new Error('Google sign-in is awaiting site administrator setup. Please try again later.');
  sessionStorage.setItem(returnKey, returnPath);
  const { error } = await affairsClient.auth.signInWithOAuth({
    provider: 'google', options: {
      redirectTo: new URL(affairsCallbackPath, window.location.origin).href,
      scopes: 'openid email profile', queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw new Error('Google sign-in could not start. Please try again.');
}

// StrictMode and rerenders must not consume the same one-use authorization code twice.
let callback: { code: string; promise: Promise<void> } | null = null;
export function completeGoogleSignIn(search: string) {
  const params = new URLSearchParams(search);
  if (params.has('error') || !params.get('code'))
    return Promise.reject(new Error('Google sign-in was cancelled or the link is invalid. Please sign in again.'));
  const code = params.get('code')!;
  if (callback?.code === code) return callback.promise;
  const promise = (async () => {
    if (!affairsClient) throw new Error('Sign-in is not configured.');
    const { error } = await affairsClient.auth.exchangeCodeForSession(code);
    if (error) throw new Error('This sign-in link expired or was opened in another browser. Please start again.');
  })();
  callback = { code, promise };
  return promise;
}

let signOutTask: Promise<void> | null = null;
export function signOutAffairs() {
  if (!affairsClient) return Promise.resolve();
  const client = affairsClient;
  if (!signOutTask) signOutTask = (async () => {
    // Revoke only this session; do not sign out a separately authenticated Nexus session.
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Sign out failed. Check your connection and try again.');
  })().finally(() => { signOutTask = null; });
  return signOutTask;
}
