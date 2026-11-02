import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import {
  Sun, CalendarDays, CheckSquare, Handshake, Store, Images, BarChart3, FolderOpen, Zap, Users2, Settings, Heart, LogOut, Bell, Search, Menu as MenuIcon, X,
  LayoutDashboard, UserRound, MailCheck, MessagesSquare, Plane, BedDouble, Truck, Wallet, Radio, Camera, Stamp, SlidersHorizontal, WifiOff, RefreshCw, ChevronDown, Plus,
} from 'lucide-react'
import { useAuth, useMe } from './auth'
import { useApi, get, post, offlineQueue, flushQueue } from './api'
import { cx, Avatar, Badge, HealthRing, IconButton, Spinner, Status } from './ui'
import { ago, date, daysTo } from './format'

// `admin: true` items never appear for coordinators (hide, don't disable). `perm` gates the rest.
const AGENCY_NAV = [
  { to: '/', label: 'Today', coordLabel: 'My shift', icon: Sun, end: true },
  { to: '/weddings', label: 'Weddings', icon: Heart },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/proposals', label: 'Proposals', icon: Handshake, admin: true },
  { to: '/vendors', label: 'Vendors', icon: Store },
  { to: '/portfolio', label: 'Portfolio', icon: Images, admin: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics' },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/automation', label: 'Automation', icon: Zap, admin: true },
  { to: '/team', label: 'Team', icon: Users2, admin: true },
  { to: '/settings', label: 'Settings', icon: Settings, admin: true },
]
const agencyNavFor = (me: any) => AGENCY_NAV.filter(n => (!n.admin || me.admin) && (!n.perm || me.can[n.perm])).map(n => ({ ...n, label: !me.admin && n.coordLabel ? n.coordLabel : n.label }))
export const weddingNavFor = (me: any) => WEDDING_NAV.filter(n => (!n.perm || me.can[n.perm]) && (me.admin || !(n as any).admin))
export const WEDDING_NAV = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'guests', label: 'Guests', icon: UserRound },
  { to: 'rsvp', label: 'RSVP', icon: MailCheck },
  { to: 'comms', label: 'Messages', icon: MessagesSquare },
  { to: 'travel', label: 'Travel', icon: Plane },
  { to: 'rooms', label: 'Rooms', icon: BedDouble },
  { to: 'vendors', label: 'Vendors', icon: Truck },
  { to: 'budget', label: 'Budget', icon: Wallet, perm: 'budget' },
  { to: 'tasks', label: 'Tasks', icon: CheckSquare },
  { to: 'calendar', label: 'Calendar', icon: CalendarDays },
  { to: 'live', label: 'Command Center', icon: Radio },
  { to: 'media', label: 'Media', icon: Camera },
  { to: 'approvals', label: 'Approvals', icon: Stamp, admin: true },
  { to: 'documents', label: 'Documents', icon: FolderOpen },
  { to: 'setup', label: 'Setup', icon: SlidersHorizontal, admin: true },
]

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(offlineQueue().length)
  useEffect(() => {
    const u = () => { setOnline(navigator.onLine); setQueued(offlineQueue().length) }
    window.addEventListener('online', u); window.addEventListener('offline', u); window.addEventListener('sutr-queue', u)
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); window.removeEventListener('sutr-queue', u) }
  }, [])
  return { online, queued }
}

function Brand({ compact }: { compact?: boolean }) {
  const me = useMe()
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
      {!compact && <div className="min-w-0 leading-tight"><div className="display text-[17px] font-semibold text-canvas">SUTR</div><div className="truncate text-[11px] text-canvas/55">{me.agency.name}</div></div>}
    </Link>
  )
}

function NavItem({ to, label, icon: Icon, end, onClick, badge }: any) {
  return (
    <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => cx('flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors', isActive ? 'bg-canvas/10 text-canvas' : 'text-canvas/60 hover:bg-canvas/5 hover:text-canvas')}>
      <Icon className="size-[17px] shrink-0" /><span className="flex-1 truncate">{label}</span>{badge}
    </NavLink>
  )
}

function WeddingSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe()
  const { wid } = useParams()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const current = me.weddings.find(w => w.id === wid)
  const active = me.weddings.filter(w => w.status !== 'archived')
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg border border-canvas/10 px-3 py-2 text-left hover:bg-canvas/5">
        <Heart className="size-4 shrink-0 text-haldi" />
        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-canvas">{current?.name || 'Open a wedding'}</div>{current && <div className="text-[11px] text-canvas/50">{date(current.start_date)} · {current.city}</div>}</div>
        <ChevronDown className="size-4 text-canvas/50" />
      </button>
      {open && (
        <div className="anim-pop absolute inset-x-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-pop">
          {active.map(w => (
            <button key={w.id} onClick={() => { setOpen(false); onNavigate?.(); nav(`/w/${w.id}`) }} className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-wash', w.id === wid && 'bg-wash')}>
              <span className="min-w-0"><span className="block truncate font-semibold">{w.name}</span><span className="text-xs text-mute">{date(w.start_date)}</span></span><Status s={w.status} />
            </button>
          ))}
          {me.can.createWedding && <button onClick={() => { setOpen(false); onNavigate?.(); nav('/weddings/new') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-wash"><Plus className="size-4" />New wedding</button>}
        </div>
      )}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe()
  const { logout } = useAuth()
  const { wid } = useParams()
  return (
    <div className="flex h-full flex-col gap-4 bg-ink px-3 py-4">
      <Brand />
      <WeddingSwitcher onNavigate={onNavigate} />
      <nav className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {wid && <>
          <div className="px-3 pt-1 pb-1 text-xs font-medium text-white/45">This wedding</div>
          {weddingNavFor(me).map(n => <NavItem key={n.to} {...n} to={`/w/${wid}${n.to ? '/' + n.to : ''}`} onClick={onNavigate}
            badge={n.to === 'live' && me.weddings.find(w => w.id === wid)?.status === 'live' ? <span className="live-dot size-2 rounded-full bg-[#ff6b6b]" /> : null} />)}
          <div className="px-3 pt-4 pb-1 text-xs font-medium text-white/45">{me.admin ? "Agency" : "My work"}</div>
        </>}
        {agencyNavFor(me).map(n => <NavItem key={n.to} {...n} onClick={onNavigate} />)}
      </nav>
      <div className="flex items-center gap-2.5 rounded-xl bg-canvas/5 p-2">
        <Link to="/profile" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={me.user.name} tone="saffron" size={32} />
          <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-canvas">{me.user.name}</div><div className="truncate text-[11px] capitalize text-canvas/50">{me.user.role}</div></div>
        </Link>
        <button onClick={logout} aria-label="Sign out" title="Sign out" className="grid size-8 place-items-center rounded-lg text-canvas/60 hover:bg-canvas/10 hover:text-canvas"><LogOut className="size-4" /></button>
      </div>
    </div>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<any[] | null>(null)
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); ref.current?.focus() } }
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k)
  }, [])
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return }
    const t = setTimeout(() => get(`/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => setRes([])), 180)
    return () => clearTimeout(t)
  }, [q])
  const go = (r: any) => {
    setOpen(false); setQ('')
    if (r.kind === 'wedding') nav(`/w/${r.id}`)
    else if (r.kind === 'guest') nav(`/w/${r.wedding_id}/guests?q=${encodeURIComponent(r.title)}`)
    else if (r.kind === 'vendor') nav(`/vendors?q=${encodeURIComponent(r.title)}`)
    else nav(`/documents?q=${encodeURIComponent(r.title)}`)
  }
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" />
      <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search guests, vendors, weddings, documents…" aria-label="Search"
        className="h-10 w-full rounded-xl border border-line bg-card pr-12 pl-9 text-sm placeholder:text-mute focus:border-brand focus:outline-none" />
      <span className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 text-[11px] font-semibold text-mute sm:block">Ctrl K</span>
      {open && res && (
        <div className="anim-pop absolute inset-x-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-pop">
          {res.length ? res.map(r => (
            <button key={r.kind + r.id} onMouseDown={() => go(r)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-wash">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.title}</span><span className="block truncate text-xs text-mute">{r.sub}</span></span>
              <Badge>{r.kind}</Badge>
            </button>
          )) : <div className="px-3 py-4 text-center text-sm text-mute">No matches</div>}
        </div>
      )}
    </div>
  )
}

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, reload } = useApi<any[]>('/notifications', { poll: 30000 })
  const nav = useNavigate()
  useEffect(() => { if (open) reload() }, [open])
  if (!open) return null
  const markAll = async () => { await post('/notifications/read'); reload(); window.dispatchEvent(new Event('sutr-notif')) }
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="Notifications">
      <div className="anim-fade absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="anim-pop absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-card shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-sans text-base font-semibold">Notifications</h2>
          <div className="flex items-center gap-1"><button onClick={markAll} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-wash">Mark all read</button><IconButton icon={X} label="Close" onClick={onClose} /></div>
        </div>
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {!data ? <div className="p-6 text-center"><Spinner /></div> : !data.length ? <div className="p-8 text-center text-sm text-mute">You're all caught up.</div> : data.map(n => (
            <button key={n.id} onClick={async () => { await post('/notifications/read', { id: n.id }); onClose(); if (n.link) nav(n.link) }}
              className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-canvas', !n.read && 'bg-brand-50/40')}>
              <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.severity === 'critical' ? 'bg-bad' : n.severity === 'warning' ? 'bg-haldi' : 'bg-info', n.read && 'opacity-30')} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{n.title}</span>{n.body && <span className="block text-xs text-ink-2">{n.body}</span>}<span className="mt-0.5 block text-[11px] text-mute">{ago(n.created_at)}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AppShell() {
  const [drawer, setDrawer] = useState(false)
  const [notif, setNotif] = useState(false)
  const { data: notes, reload } = useApi<any[]>('/notifications', { poll: 30000 })
  const unread = (notes || []).filter(n => !n.read).length
  const { online, queued } = useOnline()
  const loc = useLocation()
  useEffect(() => { const r = () => reload(); window.addEventListener('sutr-notif', r); return () => window.removeEventListener('sutr-notif', r) }, [])
  useEffect(() => { setDrawer(false) }, [loc.pathname])

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block"><Sidebar /></aside>
      {drawer && (
        <div className="fixed inset-0 z-[85] lg:hidden">
          <div className="anim-fade absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="anim-pop absolute inset-y-0 left-0 w-[82%] max-w-xs"><Sidebar onNavigate={() => setDrawer(false)} /></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-3 backdrop-blur sm:px-5 lg:h-16">
          <IconButton icon={MenuIcon} label="Menu" onClick={() => setDrawer(true)} className="lg:hidden" />
          <div className="lg:hidden"><Link to="/"><img src="/icon.svg" alt="SUTR" className="size-7 rounded-lg" /></Link></div>
          <div className="flex flex-1 justify-center lg:justify-start"><GlobalSearch /></div>
          <button onClick={() => setNotif(true)} aria-label={`Notifications (${unread} unread)`} className="relative grid size-10 place-items-center rounded-xl hover:bg-wash">
            <Bell className="size-5 text-ink-2" />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </header>
        {(!online || queued > 0) && (
          <div className={cx('flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold', online ? 'bg-info-50 text-info' : 'bg-warn-50 text-warn')}>
            {online ? <RefreshCw className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {online ? `${queued} offline update(s) waiting to sync` : `You're offline${queued ? ` — ${queued} update(s) saved locally` : ' — changes will be saved and synced'}`}
            {online && queued > 0 && <button onClick={() => flushQueue()} className="underline">Sync now</button>}
          </div>
        )}
        <main className="pb-nav flex-1"><Outlet /></main>
      </div>
      <MobileTabs unread={unread} onMore={() => setDrawer(true)} onInbox={() => setNotif(true)} />
      <Notifications open={notif} onClose={() => { setNotif(false); reload() }} />
    </div>
  )
}

function MobileTabs({ unread, onMore, onInbox }: { unread: number; onMore: () => void; onInbox: () => void }) {
  const { wid } = useParams()
  const me = useMe()
  const live = me.weddings.find(w => w.status === 'live')
  // Coordinators get a task-first bar (the hamburger still opens the full menu); planners keep agency navigation.
  const focus = live || me.weddings.find(w => w.id === wid) || me.weddings.find(w => w.status === 'planning')
  const items = me.admin ? [
    { to: '/', label: 'Today', icon: Sun, end: true },
    { to: wid ? `/w/${wid}` : '/weddings', label: wid ? 'Wedding' : 'Weddings', icon: Heart, end: !!wid },
    live ? { to: `/w/${live.id}/live`, label: 'Live', icon: Radio, live: true } : { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  ] : [
    { to: '/', label: 'Shift', icon: Sun, end: true },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    focus ? { to: `/w/${focus.id}/live`, label: 'Live', icon: Radio, live: focus.status === 'live' } : { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  ]
  if (!me.admin && focus) items.splice(2, 0, { to: `/w/${focus.id}/guests`, label: 'Guests', icon: UserRound } as any)
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur lg:hidden" aria-label="Primary">
      <div className="grid h-16 grid-cols-5">
        {items.map((i: any) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cx('relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-mute')}>
            <i.icon className="size-5" />{i.label}{i.live && <span className="live-dot absolute top-2.5 right-[30%] size-2 rounded-full bg-bad" />}
          </NavLink>
        ))}
        <button onClick={onInbox} className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-mute"><Bell className="size-5" />Inbox{unread > 0 && <span className="absolute top-2 right-[28%] grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] text-white">{unread > 9 ? '9+' : unread}</span>}</button>
        {items.length < 4 && <button onClick={onMore} className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-mute"><MenuIcon className="size-5" />More</button>}
      </div>
    </nav>
  )
}

export const Page = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) =>
  <div className={cx('mx-auto w-full px-4 py-5 sm:px-6 lg:py-8', wide ? 'max-w-[1500px]' : 'max-w-6xl')}>{children}</div>

// ---------------------------------------------------------------- Wedding layout
const WCtx = createContext<{ w: any; reload: () => void }>(null as any)
export const useWedding = () => useContext(WCtx)

export function WeddingLayout() {
  const { wid } = useParams()
  const me = useMe()
  const { data: w, error, reload } = useApi<any>(`/weddings/${wid}`)
  const loc = useLocation()
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => { stripRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [loc.pathname, w?.id])
  const value = useMemo(() => ({ w, reload }), [w])
  if (error) return <div className="p-6"><div className="mx-auto max-w-md rounded-2xl border border-line bg-card p-6 text-center"><div className="font-semibold">{error.status === 403 ? 'This wedding is not assigned to you' : 'Could not load wedding'}</div><p className="mt-1 text-sm text-mute">{error.message}</p><Link to="/weddings" className="mt-4 inline-block text-sm font-semibold text-brand">Back to weddings</Link></div></div>
  if (!w) return <div className="grid place-items-center py-24"><Spinner /></div>
  const d = daysTo(w.start_date)
  return (
    <WCtx.Provider value={value}>
      <div className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 pt-4 pb-3 sm:px-6">
          <HealthRing score={w.health?.score ?? 0} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-medium sm:text-2xl">{w.name}</h1><Status s={w.status} /></div>
            <div className="truncate text-sm text-mute">{date(w.start_date, { day: 'numeric', month: 'short' })}–{date(w.end_date, { day: 'numeric', month: 'short', year: 'numeric' })} · {w.venue || w.city}{d !== null && d >= 0 && w.status !== 'live' ? ` · ${d === 0 ? 'today' : `${d} days to go`}` : ''}</div>
          </div>
          {w.status === 'live' && <Link to={`/w/${w.id}/live`} className="hidden items-center gap-2 rounded-xl bg-bad px-3 py-2 text-sm font-semibold text-white sm:flex"><span className="live-dot size-2 rounded-full bg-white" />Live now</Link>}
        </div>
        <div ref={stripRef} className="scroll-x mx-auto flex max-w-[1500px] gap-1 px-3 pb-2 sm:px-5 lg:hidden">
          {weddingNavFor(me).map(n => (
            <NavLink key={n.to} to={`/w/${wid}${n.to ? '/' + n.to : ''}`} end={n.end} className={({ isActive }) => cx('flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold', isActive ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-wash')}>
              <n.icon className="size-3.5" />{n.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </WCtx.Provider>
  )
}
