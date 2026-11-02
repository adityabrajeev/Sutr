import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Heart, UserRound, Store, Handshake, Crown, Users2, Truck, Camera, Sparkles } from 'lucide-react'
import { useAuth } from '../auth'
import { useApi, post } from '../api'
import { Button, Input, ErrorBox, Badge, Status, Loading, cx } from '../ui'
import { date } from '../format'

function Split({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-canvas lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><img src="/icon.svg" className="size-10 rounded-xl" alt="" /><span className="display text-2xl">SUTR</span></div>
        <div>
          <p className="display max-w-lg text-[44px] leading-[1.08]">Every guest, vendor and minute of the wedding — <em className="text-haldi">in one place.</em></p>
          <p className="mt-5 max-w-md text-canvas/60">The Wedding Operations OS: automate the repetitive, surface the exceptions, keep the judgement with you.</p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm text-canvas/70">
          {[['Guest ops', 'RSVP, travel, rooms'], ['Vendor ops', 'Confirm, ETA, deliver'], ['Wedding day', 'Live command center']].map(([a, b]) => <div key={a}><div className="font-semibold text-canvas">{a}</div>{b}</div>)}
        </div>
        <svg className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] opacity-[0.08]" viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" stroke="#E8B12B" strokeWidth="2" fill="none" /><circle cx="100" cy="100" r="60" stroke="#E8B12B" strokeWidth="2" fill="none" /><circle cx="100" cy="100" r="30" stroke="#E8B12B" strokeWidth="2" fill="none" /></svg>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  )
}

export function Login() {
  const { me, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const loc = useLocation() as any
  const nav = useNavigate()
  if (me) return <Navigate to={loc.state?.from || '/'} replace />
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await login(email, password); nav(loc.state?.from || '/', { replace: true }) } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  return (
    <Split>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="mb-8 flex items-center gap-3 lg:hidden"><img src="/icon.svg" className="size-10 rounded-xl" alt="" /><span className="display text-2xl">SUTR</span></div>
        <div><h1 className="text-3xl font-medium">Welcome back</h1><p className="mt-1 text-sm text-mute">Sign in to your agency workspace.</p></div>
        <ErrorBox error={err} />
        <Input label="Email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <Button variant="dark" size="lg" className="w-full" loading={busy} type="submit">Sign in<ArrowRight className="size-4" /></Button>
        <div className="rounded-2xl border border-dashed border-line p-4 text-sm">
          <div className="font-semibold">Exploring locally?</div>
          <p className="mt-0.5 text-mute">The demo hub lists every staff login and the guest, host, vendor and prospect links.</p>
          <Link to="/demo" className="mt-2 inline-flex items-center gap-1 font-semibold text-brand">Open demo hub<ArrowRight className="size-3.5" /></Link>
        </div>
      </form>
    </Split>
  )
}

export function AcceptInvite() {
  const { token } = useParams()
  const { data, error, loading } = useApi<any>(`/auth/invite/${token}`)
  const { setSession } = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try { const { token: t } = await post<any>(`/auth/invite/${token}`, { password: pw }); await setSession(t); nav('/') } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  return (
    <Split>
      {loading ? <Loading /> : error ? <div className="max-w-sm text-center"><h1 className="text-2xl font-medium">Invite unavailable</h1><p className="mt-2 text-sm text-mute">{error.message}</p></div> : (
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div><Badge tone="saffron">You're invited</Badge><h1 className="mt-3 text-3xl font-medium">Join {data.agency}</h1><p className="mt-1 text-sm text-mute">Hi {data.name} — set a password to activate your <span className="capitalize">{data.role}</span> account ({data.email}).</p></div>
          <ErrorBox error={err} />
          <Input label="Choose a password" type="password" minLength={8} required value={pw} onChange={e => setPw(e.target.value)} hint="8+ characters" autoComplete="new-password" />
          <Button variant="dark" size="lg" className="w-full" loading={busy} type="submit">Activate account</Button>
        </form>
      )}
    </Split>
  )
}

export function DemoHub() {
  const { data } = useApi<any>('/demo')
  const { login } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const signIn = async (email: string) => { setBusy(email); try { await login(email, 'sutr-demo-2026'); nav('/') } finally { setBusy(null) } }
  if (!data) return <Loading />
  const roleIcon: any = { owner: Crown, planner: Heart, coordinator: Users2 }
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="bg-ink px-5 py-10 text-canvas sm:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3"><img src="/icon.svg" className="size-9 rounded-xl" alt="" /><span className="display text-xl">SUTR · Demo hub</span></div>
          <h1 className="display mt-6 max-w-3xl text-4xl leading-tight sm:text-5xl">Step into any persona.</h1>
          <p className="mt-3 max-w-2xl text-canvas/65">Everything here runs against your local database, seeded for <b className="text-canvas">{data.agency.name}</b>. Staff use the web app; hosts, guests, vendors and prospects use secure one-purpose links, with no accounts. WhatsApp and OCR are simulated, so every message shows up in each person's link page.</p>
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-10">
        <section>
          <h2 className="mb-3 text-xl font-medium">Planner web app</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.staff.filter((s: any) => s.status === 'active').map((s: any) => {
              const I = roleIcon[s.role] || UserRound
              return (
                <button key={s.email} onClick={() => signIn(s.email)} disabled={!!busy} className="group flex items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left shadow-card hover:border-brand/50">
                  <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand"><I className="size-5" /></div>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{s.name}</div><div className="truncate text-xs text-mute">{s.title} · <span className="capitalize">{s.role}</span></div></div>
                  <ArrowRight className={cx('size-4 text-mute group-hover:text-brand', busy === s.email && 'animate-pulse')} />
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-mute">Coordinators only see their assigned weddings and permissioned modules. Shared demo password: see <code>README.md</code>.</p>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-medium">Wedding links</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.weddings.map((w: any) => (
              <div key={w.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
                <div className="flex items-center justify-between gap-2"><div><div className="font-semibold">{w.name}</div><div className="text-xs text-mute">{date(w.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><Status s={w.status} /></div>
                <div className="mt-3 space-y-2 text-sm">
                  {w.hosts.map((h: any) => h.token && <LinkRow key={h.id} icon={Crown} label={`${h.name}`} sub={`Host portal · ${h.relation}`} to={`/h/${h.token}`} />)}
                  {w.guests.map((g: any) => <GuestLinkRow key={g.id} guest={g} wedding={w.id} />)}
                  {w.vendors.map((v: any) => <VendorLinkRow key={v.id} vendor={v} wedding={w.id} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-medium">Sales: prospects & portfolio</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LinkRow icon={Sparkles} label="Public portfolio" sub={`/studio/${data.agency.slug}`} to={`/studio/${data.agency.slug}`} card />
            {data.leads.map((l: any) => <ProspectLinkRow key={l.id} lead={l} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

function LinkRow({ icon: I, label, sub, to, card }: any) {
  return (
    <Link to={to} target="_blank" className={cx('flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-wash', card && 'border border-line bg-card shadow-card')}>
      <I className="size-4 shrink-0 text-brand" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{label}</span><span className="block truncate text-xs text-mute">{sub}</span></span><ArrowRight className="size-3.5 text-mute" />
    </Link>
  )
}
// Guest/vendor/prospect links are minted on demand through the public demo endpoints below.
function useMint(kind: string, id: string, wedding?: string) {
  return useApi<any>(`/l/demo-mint?kind=${kind}&id=${id}${wedding ? `&wedding=${wedding}` : ''}`)
}
function GuestLinkRow({ guest, wedding }: any) { const { data } = useMint('guest', guest.id, wedding); return data ? <LinkRow icon={UserRound} label={guest.name} sub="Guest page (WhatsApp + personalized link)" to={data.url} /> : null }
function VendorLinkRow({ vendor, wedding }: any) { const { data } = useMint('vendor', vendor.id, wedding); const I = vendor.kind === 'Driver' ? Truck : /photo|video/i.test(vendor.kind) ? Camera : Store; return data ? <LinkRow icon={I} label={vendor.name} sub={`${vendor.kind} link`} to={data.url} /> : null }
function ProspectLinkRow({ lead }: any) { const { data } = useMint('prospect', lead.id); return data ? <LinkRow icon={Handshake} label={lead.name} sub={`Make Your Own Wedding · ${lead.status.replace('_', ' ')}`} to={data.url} card /> : null }
