import { ThemeProvider } from "next-themes"
import { InteractionProvider } from '@/components/interaction-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
/* oxlint-disable react/only-export-components -- route constructors and the exported selector intentionally share the bootstrap boundary */
import { lazy, StrictMode, Suspense } from 'react'
import { BrowserRouter } from 'react-router'
import { createRoot } from 'react-dom/client'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'
import './index.css'

const isCrmRoute = ['/crm', '/login', '/app'].some(path => window.location.pathname === path || window.location.pathname.startsWith(path + '/'))
const isStudyRoute = window.location.pathname.startsWith('/study/')
const CrmApplication = lazy(() => import('./features/crm/CRMRoot.tsx'))
const StudyApplication = lazy(() => import('./features/research/StudyApp.tsx'))
const PublicApplication = lazy(() => import('./App.tsx'))
export const RootApplication = isCrmRoute ? CrmApplication : isStudyRoute ? StudyApplication : PublicApplication

function RouteLoading() {
  return <main className="route-loading" role="status" aria-live="polite"><section><span>樹</span><p>STU NEXUS</p><strong>Loading the latest workspace</strong><small>Your secure school portal is starting…</small><i aria-hidden="true" /></section></main>
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('The STU application root is unavailable.')

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={isCrmRoute ? undefined : "light"} disableTransitionOnChange>
    <TooltipProvider>
    <InteractionProvider />
    <Toaster richColors />
    <ApplicationErrorBoundary>
      <Suspense fallback={<RouteLoading />}>
        <BrowserRouter><RootApplication /></BrowserRouter>
      </Suspense>
    </ApplicationErrorBoundary>
  </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
