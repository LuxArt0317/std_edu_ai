import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CRMRoot from './crm/CRMRoot.tsx'

const isCrmRoute = window.location.pathname === '/crm' || window.location.pathname.startsWith('/crm/')
const RootApplication = isCrmRoute ? CRMRoot : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApplication />
  </StrictMode>,
)
