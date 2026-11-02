import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Home, Stamp, Users, Heart, MessageCircle, CheckCircle2, BedDouble, Camera, Wallet, Crown, Accessibility, Plus, Star, Gift, ConciergeBell, MessageSquareHeart, FileText, Images, X, Check } from 'lucide-react'
import { post, patch, fileUrl } from '../api'
import { Badge, Button, Callout, cx, Input, Modal, Progress, Select, Textarea, Toggle, useToast } from '../ui'
import { date, dateLong, hhmm, inr, ago } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, TabBar, Section, WhatsAppPanel, Countdown, ActionCard } from './common'

type Tab = 'home' | 'decide' | 'guests' | 'wishes' | 'chat'

export default function HostPortal() {
  const { token } = useParams()
  const { data, error, reload } = useLink<any>(`/h/${token}`)
  const [tab, setTab] = useState<Tab>('home')
  const [open, setOpen] = useState<any>(null)
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const { wedding, host, functions, approvals, permissions: perms, totals } = data
  const pending = approvals.filter((a: any) => a.status === 'pending')
  const testimonialAsk = data.testimonial && ['requested', 'revision_requested'].includes(data.testimonial.status)
  return (
    <div className="min-h-dvh bg-paper pb-24">
      <LinkHeader agency={data.agency} title={wedding.couple || wedding.name} sub={<>Family portal for {host.name} · {dateLong(wedding.start_date)}<div className="mt-3"><Countdown to={wedding.start_date} /></div></>} />
      <main className="mx-auto -mt-4 max-w-2xl space-y-4 px-4">
        {tab === 'home' && <>
          {pending.length > 0 ? <ActionCard icon={Stamp} title={`${pending.length} decision${pending.length > 1 ? 's' : ''} waiting for you`} sub={pending.map((p: any) => p.title).slice(0, 2).join(' · ')} tone="warn" cta="Review" onClick={() => setTab('decide')} />
            : <ActionCard icon={CheckCircle2} title="Nothing needs you right now" sub="Your planner will message you when a decision is needed" tone="ok" />}
          {testimonialAsk && <ActionCard icon={Star} title="Share a few words about your experience?" sub="Your planner would love a testimonial" cta="Write" onClick={() => setTab('wishes')} />}
          <Section title="Guests at a glance">
            <div className="grid grid-cols-3 gap-3 text-center"><div><div className="text-2xl font-semibold">{totals.guests}</div><div className="text-xs text-mute">invited</div></div><div><div className="text-2xl font-semibold text-sage">{totals.attending}</div><div className="text-xs text-mute">attending</div></div><div><div className="text-2xl font-semibold text-amber">{totals.pending}</div><div className="text-xs text-mute">awaiting reply</div></div></div>
            <div className="mt-4 space-y-3">{functions.map((f: any) => (
              <div key={f.id}><div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold">{f.name} <span className="font-normal text-mute">· {date(f.date)}</span></span><span className="text-xs"><b>{f.headcount}</b> heads · <span className="text-amber">{f.pending} pending</span></span></div><Progress value={f.attending + f.declined} max={f.attending + f.declined + f.pending} tone="sage" /></div>
            ))}</div>
          </Section>
          <Section title="Timeline">
            <div className="space-y-3 border-l-2 border-line pl-4">{functions.map((f: any) => <div key={f.id} className="relative"><span className={cx('absolute top-1.5 -left-[21px] size-2.5 rounded-full', f.live_status === 'live' ? 'bg-rose' : f.live_status === 'done' ? 'bg-sage' : 'bg-line')} /><div className="text-xs text-mute">{date(f.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {hhmm(f.start_time)}</div><div className="font-semibold">{f.name}</div><div className="text-sm text-mute">{f.venue}{f.dress_code ? ` · ${f.dress_code}` : ''}</div></div>)}</div>
          </Section>
          {data.budget && <Section title={<span className="flex items-center gap-2"><Wallet className="size-4 text-saffron" />Budget</span>}>
            <div className="flex items-baseline justify-between"><span className="text-2xl font-semibold">{inr(data.budget.actual)}</span><span className="text-sm text-mute">of {inr(data.budget.planned)} planned</span></div>
            <Progress className="mt-2" value={data.budget.actual} max={data.budget.planned} tone={data.budget.actual > data.budget.planned ? 'rose' : 'sage'} />
            <div className="mt-4 space-y-2">{data.budget.categories.map((c: any) => <div key={c.category} className="flex justify-between text-sm"><span>{c.category}</span><span className={cx('tabular', c.actual > c.planned && 'font-semibold text-rose')}>{inr(c.actual)} <span className="text-mute">/ {inr(c.planned)}</span></span></div>)}</div>
          </Section>}
          {data.documents.length > 0 && <Section title="Shared documents">{data.documents.map((d: any) => <a key={d.id} href={fileUrl(d.file)} target="_blank" className="flex items-center gap-2 py-1.5 text-sm hover:text-saffron"><FileText className="size-4 text-mute" />{d.name}<span className="ml-auto text-xs text-mute">{d.category}</span></a>)}</Section>}
          {data.gallery.length > 0 && <Section title={<span className="flex items-center gap-2"><Images className="size-4 text-saffron" />Memories</span>}><div className="grid grid-cols-3 gap-1.5">{data.gallery.map((m: any) => <img key={m.id} src={fileUrl(m.file)} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />)}</div></Section>}
        </>}
        {tab === 'decide' && <>
          {!approvals.length && <Section><p className="text-sm text-mute">No decisions yet.</p></Section>}
          {approvals.map((a: any) => (
            <button key={a.id} onClick={() => a.status === 'pending' && setOpen(a)} className={cx('w-full rounded-2xl border bg-card p-4 text-left shadow-card', a.status === 'pending' ? 'border-marigold/50' : 'border-line opacity-75')}>
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{a.title}</div>{a.description && <div className="mt-0.5 text-sm text-mute">{a.description}</div>}</div><Badge tone={a.status === 'pending' ? 'amber' : a.status === 'approved' ? 'sage' : 'rose'}>{a.status.replace('_', ' ')}</Badge></div>
              {a.status === 'pending' && <div className="mt-2 text-sm font-semibold text-saffron">Review →</div>}
              {a.comment && a.status !== 'pending' && <div className="mt-1 text-xs text-mute">You said: “{a.comment}”</div>}
            </button>
          ))}
        </>}
        {tab === 'guests' && <HostGuests data={data} token={token!} onChange={reload} />}
        {tab === 'wishes' && <Wishes data={data} token={token!} onChange={reload} />}
        {tab === 'chat' && <WhatsAppPanel who={host.name.split(' ')[0]} messages={[...data.messages].reverse()} replyPath={`/h/${token}/reply`} onReplied={reload} />}
      </main>
      <TabBar value={tab} onChange={setTab} tabs={[{ value: 'home', label: 'Overview', icon: Home }, { value: 'decide', label: 'Decisions', icon: Stamp, badge: pending.length }, { value: 'guests', label: 'Guests', icon: Users }, { value: 'wishes', label: 'Requests', icon: Heart }, { value: 'chat', label: 'WhatsApp', icon: MessageCircle }]} />
      <Decision a={open} data={data} token={token!} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload() }} />
    </div>
  )
}

function Decision({ a, data, token, onClose, onDone }: any) {
  const toast = useToast()
  const [comment, setComment] = useState('')
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { setComment(''); if (a?.kind === 'media') setPick(Object.fromEntries((a.data?.media_ids || []).map((id: string) => [id, 'approved']))) }, [a])
  if (!a) return null
  const decide = async (status: string) => {
    setBusy(true)
    try { await post(`/l/h/${token}/approvals/${a.id}`, a.kind === 'media' ? { decisions: pick, comment } : { status, comment: comment || (a.data?.options && status === 'approved' ? undefined : comment) }); toast(status === 'approved' ? 'Approved — your planner has been notified' : 'Sent back with your comments'); onDone() }
    catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const media = data.media.filter((m: any) => (a.data?.media_ids || []).includes(m.id))
  return (
    <Modal open={!!a} onClose={onClose} title={a.title} sub={a.description} size="lg"
      footer={a.kind === 'media' ? <Button variant="primary" loading={busy} onClick={() => decide('approved')}>Submit ({Object.values(pick).filter(v => v === 'approved').length} approved)</Button>
        : a.data?.options?.length ? undefined
          : <><Button loading={busy} onClick={() => decide('changes_requested')} disabled={!comment}>Request changes</Button><Button variant="success" loading={busy} onClick={() => decide('approved')}>Approve</Button></>}>
      {a.kind === 'rooming' && <div className="mb-4 max-h-[50dvh] overflow-y-auto rounded-xl border border-line">
        {Object.entries((a.data?.rooms || []).reduce((m: any, r: any) => { const k = `${r.hotel} · ${r.number}`; (m[k] ||= []).push(r); return m }, {})).map(([room, gs]: any) => (
          <div key={room} className="flex items-start gap-3 border-b border-line px-3 py-2 last:border-0"><BedDouble className="mt-0.5 size-4 shrink-0 text-mute" /><div className="flex-1"><div className="text-sm font-semibold">{room} <span className="font-normal text-mute">· {gs[0].category}</span></div><div className="text-xs text-ink-2">{gs.map((g: any) => g.guest).join(', ')}</div></div></div>
        ))}
      </div>}
      {a.kind === 'media' && <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{media.map((m: any) => (
        <button key={m.id} onClick={() => setPick({ ...pick, [m.id]: pick[m.id] === 'approved' ? 'rejected' : 'approved' })} className={cx('relative overflow-hidden rounded-xl border-2', pick[m.id] === 'approved' ? 'border-sage' : 'border-rose')} aria-label={pick[m.id] === 'approved' ? 'Approved — tap to reject' : 'Rejected — tap to approve'}>
          <img src={fileUrl(m.file)} alt="" className="aspect-[4/3] w-full object-cover" />
          <span className={cx('absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-white', pick[m.id] === 'approved' ? 'bg-sage' : 'bg-rose')}>{pick[m.id] === 'approved' ? <Check className="size-4" /> : <X className="size-4" />}</span>
        </button>
      ))}<p className="col-span-full text-xs text-mute">Tap a photo to exclude it. Only approved photos are shared with guests.</p></div>}
      {a.kind === 'budget' && a.data && <div className="mb-4 rounded-xl bg-paper p-3 text-sm">Planned <b>{inr(a.data.planned)}</b> → now <b className="text-rose">{inr(a.data.actual)}</b></div>}
      {a.kind === 'case_study' && <Callout tone="sky">Your planner would like to feature your wedding (selected photos and a short story) on their portfolio. Nothing is published without your yes.</Callout>}
      {a.data?.options?.length > 0 && <div className="mb-4 space-y-2">{a.data.options.map((o: string) => <Button key={o} className="w-full" size="lg" variant="secondary" loading={busy} onClick={() => { setComment(o); post(`/l/h/${token}/approvals/${a.id}`, { status: 'approved', comment: o }).then(() => { toast(`You chose: ${o}`); onDone() }) }}>{o}</Button>)}<Button className="w-full" variant="ghost" disabled={!comment} onClick={() => decide('changes_requested')}>Something else (add a comment below)</Button></div>}
      <Textarea label="Comments for your planner" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder={a.kind === 'rooming' ? 'e.g. Please put Nani-ji on the ground floor near us' : 'Optional'} />
    </Modal>
  )
}

function HostGuests({ data, token, onChange }: any) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [add, setAdd] = useState(false)
  const [f, setF] = useState<any>({ name: '', phone: '', side: 'bride', relation: '' })
  const perms = data.permissions
  const list = data.guests.filter((g: any) => !q || g.name.toLowerCase().includes(q.toLowerCase()))
  const upd = async (g: any, p: any) => { try { await patch(`/l/h/${token}/guests/${g.id}`, p); toast('Updated — your planner has been notified'); onChange() } catch (e: any) { toast(e.message, 'error') } }
  return (
    <>
      <Section title={`Guest list (${data.guests.length})`} action={perms.guest_edits && <Button size="sm" icon={Plus} onClick={() => setAdd(true)}>Add guest</Button>}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search guests" className="mb-3 h-11 w-full rounded-xl border border-line px-3 text-[15px] focus:border-saffron focus:outline-none" />
        <div className="divide-y divide-line">{list.slice(0, 200).map((g: any) => (
          <div key={g.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{g.name}</div><div className="truncate text-xs text-mute">{g.household || '—'} · {g.attending_fns ? <span className="text-sage">attending</span> : g.pending_fns ? <span className="text-amber">awaiting reply</span> : <span className="text-rose">declined</span>}</div></div>
            <button onClick={() => upd(g, { vip: !g.vip })} aria-label={g.vip ? 'Remove VIP' : 'Mark VIP'} className={cx('grid size-9 place-items-center rounded-lg', g.vip ? 'bg-amber-50 text-marigold' : 'text-line hover:text-mute')}><Crown className="size-4" /></button>
            <button onClick={() => { const v = prompt(`Accessibility needs for ${g.name}`, g.accessibility || ''); if (v !== null) upd(g, { accessibility: v }) }} aria-label="Accessibility needs" className={cx('grid size-9 place-items-center rounded-lg', g.accessibility ? 'bg-sky-50 text-sky' : 'text-line hover:text-mute')}><Accessibility className="size-4" /></button>
          </div>
        ))}</div>
        <p className="mt-3 text-xs text-mute">Mark VIPs and accessibility needs here — your planner handles seating, rooms and pickups.</p>
      </Section>
      <Modal open={add} onClose={() => setAdd(false)} title="Add a guest" size="sm" footer={<><Button onClick={() => setAdd(false)}>Cancel</Button><Button variant="primary" disabled={!f.name} onClick={async () => { try { await post(`/l/h/${token}/guests`, f); toast(`${f.name} added — planner notified`); setAdd(false); setF({ name: '', phone: '', side: 'bride', relation: '' }); onChange() } catch (e: any) { toast(e.message, 'error') } }}>Add</Button></>}>
        <div className="space-y-3"><Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /><Input label="WhatsApp" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /><Select label="Side" value={f.side} onChange={e => setF({ ...f, side: e.target.value })} options={['bride', 'groom']} /><Input label="Relation" value={f.relation} onChange={e => setF({ ...f, relation: e.target.value })} /></div>
      </Modal>
    </>
  )
}

function Wishes({ data, token, onChange }: any) {
  const toast = useToast()
  const [kind, setKind] = useState('wishlist')
  const [f, setF] = useState({ title: '', body: '', rating: 5 })
  const [prefs, setPrefs] = useState<any>(data.preferences || {})
  const [t, setT] = useState({ body: '', rating: 5 })
  const send = async () => { try { await post(`/l/h/${token}/requests`, { kind, ...f }); toast('Sent to your planner'); setF({ title: '', body: '', rating: 5 }); onChange() } catch (e: any) { toast(e.message, 'error') } }
  const kinds = [['wishlist', 'Wish', Gift], ['concierge', 'Concierge', ConciergeBell], ['feedback', 'Feedback', MessageSquareHeart]] as const
  return (
    <>
      {data.testimonial && ['requested', 'revision_requested'].includes(data.testimonial.status) && (
        <Section title={<span className="flex items-center gap-2"><Star className="size-4 text-marigold" />Your testimonial</span>}>
          <div className="mb-3 flex gap-1">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setT({ ...t, rating: n })} aria-label={`${n} stars`}><Star className={cx('size-7', n <= t.rating ? 'fill-marigold text-marigold' : 'text-line')} /></button>)}</div>
          <Textarea rows={4} value={t.body} onChange={e => setT({ ...t, body: e.target.value })} placeholder="What was it like working with your planner?" aria-label="Testimonial" />
          <Button className="mt-3 w-full" variant="primary" disabled={!t.body} onClick={async () => { await post(`/l/h/${token}/testimonial`, t); toast('Thank you! 💛'); onChange() }}>Submit testimonial</Button>
        </Section>
      )}
      <Section title="Tell your planner">
        <div className="mb-3 flex gap-1.5">{kinds.map(([k, l, I]) => <button key={k} onClick={() => setKind(k)} className={cx('flex flex-1 flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold', kind === k ? 'border-saffron bg-saffron-50 text-saffron' : 'border-line text-ink-2')}><I className="size-4" />{l}</button>)}</div>
        <div className="space-y-3"><Input label={kind === 'wishlist' ? 'What would make it special?' : kind === 'concierge' ? 'What do you need?' : 'Subject'} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><Textarea label="Details" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
          {kind === 'feedback' && <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setF({ ...f, rating: n })} aria-label={`${n} stars`}><Star className={cx('size-6', n <= f.rating ? 'fill-marigold text-marigold' : 'text-line')} /></button>)}</div>}
          <Button variant="primary" className="w-full" disabled={!f.title && !f.body} onClick={send}>Send</Button></div>
      </Section>
      {data.requests.length > 0 && <Section title="Your requests">{data.requests.map((r: any) => <div key={r.id} className="border-b border-line py-2.5 last:border-0"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{r.title}</span><Badge tone={r.status === 'open' ? 'amber' : 'sage'}>{r.status === 'open' ? 'with planner' : 'done'}</Badge></div>{r.response && <div className="mt-1 text-sm text-sage">↳ {r.response}</div>}</div>)}</Section>}
      <Section title="Wedding preferences">
        <div className="space-y-3">
          <Input label="Colour palette / theme" value={prefs.theme || ''} onChange={e => setPrefs({ ...prefs, theme: e.target.value })} />
          <Textarea label="Must-haves" value={prefs.must_haves || ''} onChange={e => setPrefs({ ...prefs, must_haves: e.target.value })} />
          <Textarea label="Please avoid" value={prefs.avoid || ''} onChange={e => setPrefs({ ...prefs, avoid: e.target.value })} />
          <Toggle label="Keep the guest list private from vendors" checked={!!prefs.privacy} onChange={v => setPrefs({ ...prefs, privacy: v })} />
          <Button variant="dark" className="w-full" onClick={async () => { await post(`/l/h/${token}/preferences`, prefs); toast('Preferences saved') }}>Save preferences</Button>
        </div>
      </Section>
    </>
  )
}
