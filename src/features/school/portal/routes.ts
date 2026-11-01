import type { PortalView } from './shared'

const paths: Record<PortalView, string> = {
  home: '/app', academics: '/app/academics', learning: '/app/courses', teaching: '/app/courses',
  assessments: '/app/assessments', grades: '/app/grades', schedule: '/app/calendar', people: '/app/users',
  crm: '/app/tasks', students: '/app/students', success: '/app/alerts', admissions: '/app/admissions',
  cases: '/app/cases', campaigns: '/app/messages', knowledge: '/app/knowledge', analytics: '/app/reports',
}
export function pathForView(view: PortalView): string { return paths[view] }
export function viewForPath(pathname: string, teaches: boolean): PortalView | null {
  const path = pathname.replace(/\/$/, '')
  if (path === '/app/courses') return teaches ? 'teaching' : 'learning'
  return (Object.entries(paths).find(([, value]) => value === path)?.[0] as PortalView | undefined) ?? null
}
/** Restrict post-login navigation to known local school routes. */
export function safeReturnPath(value: string | null): string {
  if (!value || /[\\\x00-\x20]/.test(value)) return '/app'
  try {
    const url = new URL(value, 'https://school.invalid')
    if (!value.startsWith('/') || url.origin !== 'https://school.invalid' || !viewForPath(url.pathname, false)) return '/app'
    return url.pathname + url.search + url.hash
  } catch { return '/app' }
}
export function legacyAppPath(search: string, hash: string): string {
  const params = new URLSearchParams(search)
  const destination = params.has('curriculum_request') ? '/app/academics' : '/app'
  return destination + search + hash
}
