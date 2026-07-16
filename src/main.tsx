import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const isCrmRoute = window.location.pathname === '/crm' || window.location.pathname.startsWith('/crm/')
export const RootApplication = lazy(() => isCrmRoute ? import('./crm/CRMRoot.tsx') : import('./App.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="route-loading" role="status">Loading STU…</div>}>
      <RootApplication />
    </Suspense>
  </StrictMode>,
)
