import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'
import './index.css'

const isCrmRoute = window.location.pathname === '/crm' || window.location.pathname.startsWith('/crm/')
export const RootApplication = lazy(() => isCrmRoute ? import('./crm/CRMRoot.tsx') : import('./App.tsx'))

function RouteLoading() {
  return <main className="route-loading" role="status" aria-live="polite"><section><span>樹</span><p>STU NEXUS</p><strong>Loading the latest workspace</strong><small>Your secure school portal is starting…</small><i aria-hidden="true" /></section></main>
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('The STU application root is unavailable.')

createRoot(rootElement).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <Suspense fallback={<RouteLoading />}>
        <RootApplication />
      </Suspense>
    </ApplicationErrorBoundary>
  </StrictMode>,
)
