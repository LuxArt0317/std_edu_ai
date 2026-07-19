/* oxlint-disable react/only-export-components -- route constructors and the exported selector intentionally share the bootstrap boundary */
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'
import './index.css'

const isCrmRoute = window.location.pathname === '/crm' || window.location.pathname.startsWith('/crm/')
const isStudyRoute = window.location.pathname.startsWith('/study/')
const CrmApplication = lazy(() => import('./crm/CRMRoot.tsx'))
const StudyApplication = lazy(() => import('./research/StudyApp.tsx'))
const PublicApplication = lazy(() => import('./App.tsx'))
export const RootApplication = isCrmRoute ? CrmApplication : isStudyRoute ? StudyApplication : PublicApplication

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
