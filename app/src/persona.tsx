import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, Crown, Heart, Users2, Home, UserRound, Store, Car, Camera, Handshake, Check } from 'lucide-react'
import { useApi, get } from './api'
import { useAuth } from './auth'
import { cx, Modal, Spinner } from './ui'

/** Demo-only "View as" switcher: one click into any of the nine persona views. Hidden when /api/demo is off (production). */
type P = { key: string; label: string; who: string; job: string; icon: any; staff?: string; link?: () => Promise<string> }

export function PersonaSwitcher() {
  const { data } = useApi<any>('/demo')
  const { me, login } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  if (!data || loc.pathname === '/demo' || loc.pathname === '/login') return null

  const udaipur = data.weddings.find((w: any) => w.status === 'planning' && w.guests.length && w.hosts.length) || data.weddings[0]
  const live = data.weddings.find((w: any) => w.status === 'live') || udaipur
  const mint = (kind: string, id: string, wedding?: string) => async () => (await get<any>(`/l/demo-mint?kind=${kind}&id=${id}${wedding ? `&wedding=${wedding}` : ''}`)).url
  const staff = (role: string) => data.staff.find((s: any) => s.role === role && s.status === 'active')
  const vendor = udaipur.vendors.find((v: any) => !['Driver', 'Photographer', 'Videographer'].includes(v.kind))
  const driver = live.vendors.find((v: any) => v.kind === 'Driver')
  const photo = live.vendors.find((v: any) => v.kind === 'Photographer')
  const lead = data.leads.find((l: any) => l.status === 'proposal_sent') || data.leads[0]
  const host = udaipur.hosts.find((h: any) => h.token)
  const guest = udaipur.guests[0]

  const people: P[] = [
    { key: 'owner', label: 'Agency owner', who: staff('owner')?.name, job: 'Runs the whole agency', icon: Crown, staff: staff('owner')?.email },
    { key: 'planner', label: 'Planner', who: staff('planner')?.name, job: 'Plans and operates weddings', icon: Heart, staff: staff('planner')?.email },
    { key: 'coordinator', label: 'Coordinator', who: staff('coordinator')?.name, job: 'Works their shift on assigned weddings', icon: Users2, staff: staff('coordinator')?.email },
    host && { key: 'host', label: 'Host', who: host.name, job: 'Approves and stays informed', icon: Home, link: async () => `/h/${host.token}` },
    guest && { key: 'guest', label: 'Guest', who: guest.name, job: 'RSVPs, travels, attends', icon: UserRound, link: mint('guest', guest.id, udaipur.id) },
    vendor && { key: 'vendor', label: 'Vendor', who: vendor.name, job: 'Confirms and reports status', icon: Store, link: mint('vendor', vendor.id, udaipur.id) },
    driver && { key: 'driver', label: 'Driver', who: driver.name, job: 'Runs today’s airport pickups', icon: Car, link: mint('vendor', driver.id, live.id) },
    photo && { key: 'photographer', label: 'Photographer', who: photo.name, job: 'Uploads photos for approval', icon: Camera, link: mint('vendor', photo.id, live.id) },
    lead && { key: 'prospect', label: 'Prospect', who: lead.name, job: 'Reviews a proposal', icon: Handshake, link: mint('prospect', lead.id) },
  ].filter(Boolean) as P[]

  const p = loc.pathname
  const current = p.startsWith('/h/') ? 'host' : p.startsWith('/g/') ? 'guest' : p.startsWith('/p/') ? 'prospect' : p.startsWith('/v/') ? null : me ? me.user.role : null
  const go = async (x: P) => {
    setBusy(x.key)
    try {
      if (x.staff) { await login(x.staff, 'sutr-demo-2026'); nav('/') }
      else if (x.link) nav(await x.link())
      setOpen(false)
    } finally { setBusy(null) }
  }
  return (
    <>
      <button onClick={() => setOpen(true)} title="View as another persona" className="fixed right-3 bottom-[84px] z-[60] flex size-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white shadow-pop lg:right-5 lg:bottom-5 lg:size-auto lg:h-10 lg:px-4" aria-label="Switch persona">
        <Eye className="size-5 text-haldi" /><span className="hidden lg:inline">View as</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="View the app as…" sub="Demo builds only. Staff are signed in for you; everyone else opens their own secure link." size="md">
        <ul className="-mx-2">
          {people.map(x => (
            <li key={x.key}>
              <button onClick={() => go(x)} disabled={!!busy} className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-wash', current === x.key && 'bg-brand-50')}>
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', current === x.key ? 'bg-brand text-white' : 'bg-wash text-ink')}><x.icon className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{x.label}<span className="font-normal text-mute">, {x.who}</span></span><span className="block text-sm text-mute">{x.job}</span></span>
                {busy === x.key ? <Spinner /> : current === x.key ? <Check className="size-5 text-brand" aria-label="Current" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
