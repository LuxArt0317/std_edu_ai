import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';
import { clearAssistantConversation } from '@/services/assistantConversation';
import { permanentCoursesPath } from './permanentCourseRouting.js';
import { venuePaths,venueScheduleSelection } from './venueContract.js';
import { healthExaminationPath } from '../../../../server/healthExaminationContract.js';
import { aidPaymentsMaxPage,aidPaymentsPaths } from '../../../../server/aidPaymentsContract.js';
import { elearningCatalogPageRoute } from '../../../../server/elearningCatalogPageIntent.js';
import { clubAttendancePath, clubAttendancePagePattern } from '../../../../server/clubAttendanceIntent.js';
import { clubEquipmentNewPath, clubUuid } from '../../../../server/clubServicesContract.js';
import {chargePaymentHistoryPath, chargePaymentOperationStoragePrefix} from '../../../../server/chargePaymentContract.js';
import {chargePaymentHistorySelection,chargePaymentHistoryUrl} from './chargePaymentHistoryRoute';
import { catalogDetailRoute } from '../../../../server/catalogDetailIntent.js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const affairsStorageKey = 'stu-school-affairs-auth';
export const affairsCallbackPath = '/school-affairs/auth/callback';
const returnKey = 'stu-school-affairs-return';
export function safeSchoolReturnPath(value:string|null,fallback='/school-affairs') {
  const selectedOffering=catalogDetailRoute(value);
  if(selectedOffering)return selectedOffering.path;
  if(value?.startsWith('/elearning/')){
    const catalog=elearningCatalogPageRoute(value);
    if(catalog)return catalog.path;
  }
  if(value?.startsWith(chargePaymentHistoryPath+'?')&&value.length<=240&&!value.includes('#')){
    const selection=chargePaymentHistorySelection(new URLSearchParams(value.slice(chargePaymentHistoryPath.length+1)));
    if(selection)return chargePaymentHistoryUrl(selection);
  }
  if(value?.includes('?')){
    const [path,query]=value.split('?');
    if(path===clubAttendancePath&&query.startsWith('page=')&&clubAttendancePagePattern.test(query.slice(5))
      &&value===path+'?'+query)return value;
    if(path===clubEquipmentNewPath&&query.startsWith('edit=')&&clubUuid.test(query.slice(5))
      &&value===path+'?'+query)return value;
    if(path===healthExaminationPath||Object.values(aidPaymentsPaths).includes(path)){
      const match=/^page=([1-9]\d{0,2})$/u.exec(query);
      if(match&&value===path+'?'+match[0]&&Number(match[1])<=aidPaymentsMaxPage)return value;
    }
  }
  if (value?.startsWith(venuePaths.schedule+'?') && value.length<=240 && !value.includes('#')) {
    const venue=venueScheduleSelection(new URLSearchParams(value.slice(venuePaths.schedule.length+1)));
    if(venue)return venuePaths.schedule+'?'+new URLSearchParams(venue);
  }
  if (value?.startsWith(permanentCoursesPath+'?') && value.length<=240 && !value.includes('#')) {
    const query=new URLSearchParams(value.slice(permanentCoursesPath.length+1));
    const course=query.get('course');
    if ([...query.keys()].length===1 && course && /^[A-Z]{2}[UGJ]\d{5}$/.test(course))
      return permanentCoursesPath+'?course='+course;
  }
  if (value && /^\/school-affairs\/services\/(?:6-5(?:\/notice)?\?year|11-1\?summerYear)=[1-9][0-9]{2}$/.test(value)) return value;
  if (!value || value.length>240 || !/^\/(?:school-affairs|dtm|elearning)(?:\/[a-z0-9_-]+)*(?:#[a-z0-9_-]+)?$/i.test(value)) return fallback;
  if (/\/(?:login|auth|signed-out)(?:\/|#|$)/i.test(value)) return fallback;
  return value;
}
export function consumeGoogleReturnPath() {
  const value = sessionStorage.getItem(returnKey);
  sessionStorage.removeItem(returnKey);
  return safeSchoolReturnPath(value);
}
// Never borrow the Nexus session or its PKCE verifier.
export const affairsClient = url && key ? createClient<Database>(url, key, {
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) },
  auth: { storageKey: affairsStorageKey, flowType: 'pkce', persistSession: true,
    autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

export async function startGoogleSignIn(returnPath = '/school-affairs') {
  if (!affairsClient || !url || !key) throw new Error('Google sign-in is not configured. Please contact the site administrator.');
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(10000),
  });
  const settings = await response.json().catch(() => null);
  if (!response.ok || !settings?.external?.google)
    throw new Error('Google sign-in is awaiting site administrator setup. Please try again later.');
  sessionStorage.setItem(returnKey, safeSchoolReturnPath(returnPath));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      affairsClient.auth.signInWithOAuth({
        provider: 'google', options: {
          redirectTo: new URL(affairsCallbackPath, window.location.origin).href,
          scopes: 'openid email profile', queryParams: { prompt: 'select_account' },
          skipBrowserRedirect: true,
        },
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Google sign-in timed out. Please try again.')), 15000);
      }),
    ]);
    if (error || !data?.url) throw new Error('Google sign-in could not start. Please try again.');
    const destination = new URL(data.url);
    if (destination.origin !== new URL(url).origin || destination.pathname !== '/auth/v1/authorize')
      throw new Error('Google sign-in returned an invalid destination.');
    window.location.assign(destination.href);
  } finally {
    clearTimeout(timeout);
  }
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
    clearAssistantConversation();
    try {
      for (let index=sessionStorage.length-1;index>=0;index--) {
        const key=sessionStorage.key(index);
        if (key?.startsWith(chargePaymentOperationStoragePrefix)) sessionStorage.removeItem(key);
      }
    } catch { /* A blocked storage API cannot prevent sign-out. */ }
  })().finally(() => { signOutTask = null; });
  return signOutTask;
}
