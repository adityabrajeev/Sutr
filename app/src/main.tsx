import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from './auth'
import { ToastProvider, Loading } from './ui'
import { AppShell, WeddingLayout } from './shell'
import { Login, AcceptInvite, DemoHub } from './pages/auth'

const Agency = () => import('./pages/agency')
const Core = () => import('./pages/wedding-core')
const Ops = () => import('./pages/wedding-ops')
const Exec = () => import('./pages/wedding-exec')
const Biz = () => import('./pages/business')
const L = <M, K extends keyof M>(m: () => Promise<M>, k: K): React.ComponentType<any> => lazy(() => m().then(x => ({ default: x[k] as any })))

const Brief = L(Agency, 'Brief'), Weddings = L(Agency, 'Weddings'), CreateWedding = L(Agency, 'CreateWedding')
const Overview = L(Core, 'Overview'), Guests = L(Core, 'Guests'), Rsvp = L(Core, 'Rsvp'), Comms = L(Core, 'Comms')
const Travel = L(Ops, 'Travel'), Rooms = L(Ops, 'Rooms'), WeddingVendors = L(Ops, 'WeddingVendors'), Budget = L(Ops, 'Budget')
const Tasks = L(Exec, 'Tasks'), Calendar = L(Exec, 'Calendar'), Live = L(Exec, 'Live'), Media = L(Exec, 'Media'), Approvals = L(Exec, 'Approvals'), Documents = L(Exec, 'Documents'), Setup = L(Exec, 'Setup')
const Proposals = L(Biz, 'Proposals'), LeadDetail = L(Biz, 'LeadDetail'), Portfolio = L(Biz, 'Portfolio'), Analytics = L(Biz, 'Analytics'), Team = L(Biz, 'Team'), VendorDirectory = L(Biz, 'VendorDirectory'), Automation = L(Biz, 'Automation'), SettingsPage = L(Biz, 'Settings'), Profile = L(Biz, 'Profile')

const GuestPage = lazy(() => import('./links/guest'))
const HostPortal = lazy(() => import('./links/host'))
const VendorPage = lazy(() => import('./links/vendor'))
const ProspectPage = lazy(() => import('./links/prospect'))
const SharedDoc = lazy(() => import('./links/misc').then(m => ({ default: m.SharedDoc })))
const PublicPortfolio = lazy(() => import('./links/misc').then(m => ({ default: m.PublicPortfolio })))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading label="Signing you in…" />
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return <>{children}</>
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/demo" element={<DemoHub />} />
        <Route path="/g/:token" element={<GuestPage />} />
        <Route path="/h/:token" element={<HostPortal />} />
        <Route path="/v/:token" element={<VendorPage />} />
        <Route path="/p/:token" element={<ProspectPage />} />
        <Route path="/d/:token" element={<SharedDoc />} />
        <Route path="/studio/:slug" element={<PublicPortfolio />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Brief />} />
          <Route path="weddings" element={<Weddings />} />
          <Route path="weddings/new" element={<CreateWedding />} />
          <Route path="w/:wid" element={<WeddingLayout />}>
            <Route index element={<Overview />} />
            <Route path="guests" element={<Guests />} />
            <Route path="rsvp" element={<Rsvp />} />
            <Route path="comms" element={<Comms />} />
            <Route path="travel" element={<Travel />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="vendors" element={<WeddingVendors />} />
            <Route path="budget" element={<Budget />} />
            <Route path="tasks" element={<Tasks scoped />} />
            <Route path="calendar" element={<Calendar scoped />} />
            <Route path="live" element={<Live />} />
            <Route path="media" element={<Media />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="documents" element={<Documents scoped />} />
            <Route path="setup" element={<Setup />} />
          </Route>
          <Route path="calendar" element={<Calendar />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="proposals" element={<Proposals />} />
          <Route path="proposals/:id" element={<LeadDetail />} />
          <Route path="vendors" element={<VendorDirectory />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="documents" element={<Documents />} />
          <Route path="automation" element={<Automation />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider><App /></AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
