import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, MessageCircle, MapPin, Clock, Phone, CheckCircle2, Navigation, Timer, PartyPopper, Hammer, Flag, Upload, Car, RotateCcw, UserX, Check, AlertTriangle, Shirt } from 'lucide-react'
import { post } from '../api'
import { Button, Callout, cx, Input, Modal, Progress, Select, useToast, Ticket, useCountdown } from '../ui'
import { date, dateTime, hhmm, time } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, TabBar, Section, WhatsAppPanel } from './common'

type Tab = 'jobs' | 'trips' | 'upload' | 'chat'
const STEPS = [['checkin', 'Checked in', CheckCircle2], ['enroute', 'Leaving now', Navigation], ['arrived', 'Reached', Flag], ['setup', 'Setup started', Hammer], ['ready', 'Ready', PartyPopper], ['complete', 'Done', Check]] as const
const NEXT_LABEL: Record<string, string> = { checkin: "I'm checked in", enroute: "I'm leaving now", arrived: "I've reached", setup: 'Setup started', ready: "We're ready", complete: 'Mark job done' }
const stepIndex = (a: any) => STEPS.findIndex(s => s[0] === (a.live_status === 'en_route' ? 'enroute' : a.live_status === 'checked_in' ? 'checkin' : a.live_status === 'completed' ? 'complete' : a.live_status))

export default function VendorPage() {
  const { token } = useParams()
  const { data, error, reload, setData } = useLink<any>(`/v/${token}`)
  const [tab, setTab] = useState<Tab | null>(null)
  const [delay, setDelay] = useState<any>(null)
  const toast = useToast()
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const act = async (a: any, action: string, extra: any = {}) => {
    try { setData(await post(`/l/v/${token}/assignments/${a.id}/status`, { action, ...extra })); toast(action === 'confirm' ? 'Confirmed. Thank you!' : action === 'delay' ? 'Delay sent. The team is replanning.' : action === 'decline' ? 'The planner has been told' : 'Status sent') }
    catch (e: any) { toast(e.message, 'error') }
  }
  // Each kind of vendor lands on their real job: drivers on the trip sheet, photographers on upload.
  const tabs: any[] = []
  if (data.trips.length) tabs.push({ value: 'trips', label: 'Trips', icon: Car })
  if (data.can_upload) tabs.push({ value: 'upload', label: 'Upload', icon: Upload })
  if (data.assignments.length || !tabs.length) tabs.push({ value: 'jobs', label: data.assignments.length > 1 ? 'Jobs' : 'Job', icon: ClipboardList, badge: data.assignments.filter((a: any) => a.status === 'pending').length })
  tabs.push({ value: 'chat', label: 'WhatsApp', icon: MessageCircle })
  const current: Tab = tab || tabs[0].value
  const active = data.assignments.filter((a: any) => a.status !== 'completed')
  const [first, ...rest] = active
  return (
    <div className="min-h-dvh bg-canvas pb-24">
      <LinkHeader agency={data.agency} title={data.vendor.name} sub={data.wedding.name}
        right={data.contact && <a href={`tel:${data.contact.phone}`} className="flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3 text-sm font-semibold"><Phone className="size-4 text-brand" />{data.contact.name.split(' ')[0]}</a>} />
      <main className="mx-auto max-w-2xl space-y-4 px-4">
        {current === 'jobs' && <>
          {first ? <JobTicket a={first} onAct={act} onLate={() => setDelay(first)} /> : <Ticket stub="All done" stubIcon={CheckCircle2} title="No open jobs" sub="Thank you. Your planner will message you with anything new." />}
          {first && stepIndex(first) >= 0 && <Stepper a={first} />}
          {first && (first.deliverables || []).length > 0 && <Deliverables a={first} token={token!} onChange={setData} />}
          {rest.length > 0 && <h2 className="pt-2 text-[17px]">Also booked</h2>}
          {rest.map((a: any) => (
            <Section key={a.id}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{a.role}</div><div className="text-sm text-mute">{a.function_name || 'All functions'}, report {dateTime(a.report_at)}</div></div>{a.status === 'pending' ? <Button size="sm" variant="primary" onClick={() => act(a, 'confirm')}>Confirm</Button> : <span className="text-sm font-semibold text-ok">Confirmed</span>}</div>
            </Section>
          ))}
        </>}
        {current === 'trips' && data.trips.map((t: any) => <TripSheet key={t.id} t={t} token={token!} onChange={setData} />)}
        {current === 'upload' && <Uploader data={data} token={token!} onDone={reload} />}
        {current === 'chat' && <>
          <WhatsAppPanel who={data.vendor.contact || data.vendor.name} messages={data.messages} replyPath={`/v/${token}/reply`} onReplied={reload} />
          <p className="text-sm text-mute">You can also just reply in words, for example “running 30 min late, traffic” or “reached the venue”. Your status updates and the team is told.</p>
        </>}
      </main>
      <TabBar value={current} onChange={setTab} tabs={tabs} />
      <DelayModal a={delay} onClose={() => setDelay(null)} onSubmit={(m: number, note: string) => { act(delay, 'delay', { minutes: m, note }); setDelay(null) }} />
    </div>
  )
}

/** One job, one next step. The button changes as the vendor moves through their day. */
function JobTicket({ a, onAct, onLate }: { a: any; onAct: (a: any, action: string) => void; onLate: () => void }) {
  const cd = useCountdown(a.report_at)
  const idx = stepIndex(a)
  const next = STEPS[idx + 1]
  const rows = [
    { icon: Clock, text: `Report ${date(a.report_at, { weekday: 'short', day: 'numeric', month: 'short' })} at ${time(a.report_at)}` },
    { icon: MapPin, text: <>{a.report_location || a.venue}{a.map_url && <a href={a.map_url} target="_blank" className="ml-2 font-semibold text-haldi underline">Map</a>}</> },
    ...(a.dress_code ? [{ icon: Shirt, text: `Dress code ${a.dress_code}` }] : []),
  ]
  if (a.status === 'pending') return (
    <Ticket stub="Please confirm this job" stubIcon={AlertTriangle} title={a.role} sub={a.function_name || 'All functions'} sign={cd?.text} signLabel="until you report" rows={rows}
      actions={<><Button variant="haldi" size="lg" icon={Check} onClick={() => onAct(a, 'confirm')}>Confirm</Button><Button variant="onDark" size="lg" onClick={() => { if (window.confirm('Decline this job? The planner will be told right away.')) onAct(a, 'decline') }}>I can't make it</Button></>} />
  )
  return (
    <Ticket stub={a.live_status === 'delayed' ? `Running ${a.delay_min} min late` : 'Your job'} stubIcon={a.live_status === 'delayed' ? Timer : ClipboardList} title={a.role} sub={a.function_name || 'All functions'}
      sign={cd && !cd.past ? cd.text : idx >= 0 ? STEPS[idx][1] : 'now'} signLabel={cd && !cd.past ? 'until you report' : undefined} rows={rows}
      actions={<>{next && <Button variant="haldi" size="lg" icon={next[2]} onClick={() => onAct(a, next[0])}>{NEXT_LABEL[next[0]]}</Button>}<Button variant="onDark" size="lg" icon={Timer} onClick={onLate}>Running late</Button></>} />
  )
}

function Stepper({ a }: { a: any }) {
  const idx = stepIndex(a)
  return (
    <ol className="flex gap-1" aria-label="Progress">
      {STEPS.map(([k, l], i) => <li key={k} className="flex-1"><div className={cx('h-1.5 rounded-full', i <= idx ? 'bg-ok' : 'bg-line')} /><div className={cx('mt-1.5 text-[11px] font-semibold', i <= idx ? 'text-ok' : 'text-mute')}>{l}</div></li>)}
    </ol>
  )
}

function Deliverables({ a, token, onChange }: { a: any; token: string; onChange: (d: any) => void }) {
  const done = a.deliverables.filter((d: any) => d.done).length
  return (
    <Section title="What you're delivering" action={<span className="text-sm text-mute">{done} of {a.deliverables.length}</span>}>
      <ul className="-my-1">{a.deliverables.map((d: any, i: number) => (
        <li key={i}><label className="flex min-h-12 items-center gap-3 text-[15px]"><input type="checkbox" className="size-6 accent-[#23794A]" checked={!!d.done} onChange={async e => onChange(await post(`/l/v/${token}/assignments/${a.id}/deliverables`, { index: i, done: e.target.checked }))} /><span className={d.done ? 'text-mute line-through' : ''}>{d.text}</span></label></li>
      ))}</ul>
    </Section>
  )
}

function DelayModal({ a, onClose, onSubmit }: any) {
  const [m, setM] = useState(15)
  const [note, setNote] = useState('')
  return (
    <Modal open={!!a} onClose={onClose} title="Report a delay" sub="The planner sees the impact on the timeline immediately" size="sm" footer={<Button variant="danger" className="w-full" onClick={() => onSubmit(m, note)}>Send delay ({m} min)</Button>}>
      <div className="mb-3 grid grid-cols-4 gap-2">{[10, 15, 30, 45, 60, 90, 120].map(v => <button key={v} onClick={() => setM(v)} className={cx('h-12 rounded-xl border text-sm font-semibold', m === v ? 'border-bad bg-bad-50 text-bad' : 'border-line')}>{v < 60 ? `${v}m` : `${v / 60}h`}</button>)}</div>
      <Input label="Reason (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="Traffic near the venue" />
    </Modal>
  )
}

function TripSheet({ t, token, onChange }: any) {
  const toast = useToast()
  const set = async (s: any, status: string) => { try { onChange(await post(`/l/v/${token}/trips/${t.id}/stop`, { travel_id: s.travel_id, status })); toast(status === 'picked_up' ? `${s.name} picked up` : status === 'dropped' ? `${s.name} dropped` : 'Marked no-show — planner alerted') } catch (e: any) { toast(e.message, 'error') } }
  const left = (t.stops || []).filter((s: any) => !['dropped', 'no_show'].includes(s.status))
  const pax = left.reduce((n: number, s: any) => n + (s.pax || 1), 0)
  return (
    <>
      <Ticket stub={t.status === 'completed' ? 'Trip complete' : t.status === 'en_route' ? 'Trip in progress' : 'Your next trip'} stubIcon={Car} title={`${t.location} pickup`} sub={`${t.vehicle || 'Vehicle'} ${t.plate || ''}`.trim()}
        sign={t.status === 'completed' ? '✓' : time(t.window_start)} signLabel={t.status === 'completed' ? undefined : left.length ? `${pax} passenger${pax === 1 ? '' : 's'} to collect` : 'all collected'}
        rows={[{ icon: MapPin, text: `Drop everyone at ${t.drop_location}` }, { icon: Clock, text: `Flights land ${time(t.window_start)} to ${time(t.window_end)}` }]}
        actions={t.status === 'confirmed' ? <Button variant="haldi" size="lg" icon={Navigation} onClick={async () => onChange(await post(`/l/v/${token}/trips/${t.id}/start`, {}))}>Start trip</Button> : undefined} />
      <Section title="Passengers" action={<span className="text-sm text-mute">{(t.stops || []).length - left.length} of {(t.stops || []).length} done</span>}>
        <ul className="space-y-2">{(t.stops || []).map((s: any) => (
          <li key={s.travel_id} className={cx('rounded-xl border p-3', s.status === 'dropped' ? 'border-ok/30 bg-ok-50/50' : s.status === 'no_show' ? 'border-bad/30 bg-bad-50/40' : 'border-line')}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{s.name}{s.pax > 1 && <span className="font-normal text-mute"> and {s.pax - 1} more</span>}</div><div className="text-sm text-mute">{s.number}, lands {time(s.arrive_at)}{s.live?.delay_min ? <span className="font-semibold text-bad">, about {s.live.delay_min} min late</span> : ''}</div></div>
              {s.phone && <a href={`tel:${s.phone}`} className="grid size-12 shrink-0 place-items-center rounded-xl bg-wash" aria-label={`Call ${s.name}`}><Phone className="size-5" /></a>}
            </div>
            {!['dropped', 'no_show'].includes(s.status) ? <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant={s.status === 'picked_up' ? 'success' : 'primary'} className="h-12" onClick={() => set(s, 'picked_up')} disabled={s.status === 'picked_up'}>{s.status === 'picked_up' ? 'In car' : 'Picked up'}</Button>
              <Button variant="primary" className="h-12" onClick={() => set(s, 'dropped')} disabled={s.status !== 'picked_up'}>Dropped</Button>
              <Button variant="ghost" className="h-12 text-bad" icon={UserX} onClick={() => window.confirm(`Mark ${s.name} as a no-show?`) && set(s, 'no_show')}>No-show</Button>
            </div> : <div className={cx('mt-2 flex items-center gap-1.5 text-sm font-semibold', s.status === 'dropped' ? 'text-ok' : 'text-bad')}>{s.status === 'dropped' ? <><Check className="size-4" />Dropped</> : <><UserX className="size-4" />No-show</>}</div>}
          </li>
        ))}</ul>
      </Section>
    </>
  )
}

type Up = { file: File; state: 'queued' | 'uploading' | 'done' | 'failed' | 'duplicate'; pct: number; msg?: string }
function Uploader({ data, token, onDone }: any) {
  const [items, setItems] = useState<Up[]>([])
  const [fn, setFn] = useState('')
  const running = useRef(false)
  const toast = useToast()
  const add = (files: FileList | null) => { if (files) setItems(s => [...s, ...[...files].map(f => ({ file: f, state: 'queued' as const, pct: 0 }))]) }
  const one = (u: Up) => new Promise<Partial<Up>>(resolve => {
    const fd = new FormData(); fd.append('files', u.file); if (fn) fd.append('function_id', fn)
    const x = new XMLHttpRequest()
    x.open('POST', `/api/l/v/${token}/media`)
    x.upload.onprogress = e => e.lengthComputable && setItems(s => s.map(i => i.file === u.file ? { ...i, pct: Math.round(e.loaded / e.total * 100) } : i))
    x.onload = () => { try { const r = JSON.parse(x.responseText); if (x.status >= 400) return resolve({ state: 'failed', msg: r.error }); resolve(r.accepted ? { state: 'done', pct: 100 } : r.duplicates ? { state: 'duplicate', pct: 100, msg: 'Already uploaded' } : { state: 'failed', msg: r.rejected?.[0] || 'Rejected' }) } catch { resolve({ state: 'failed', msg: 'Upload interrupted' }) } }
    x.onerror = () => resolve({ state: 'failed', msg: 'Connection dropped — tap retry' })
    x.send(fd)
  })
  const start = async () => {
    if (running.current) return
    running.current = true
    for (const u of items.filter(i => i.state === 'queued' || i.state === 'failed')) {
      setItems(s => s.map(i => i.file === u.file ? { ...i, state: 'uploading', pct: 0, msg: undefined } : i))
      const r = await one(u)
      setItems(s => s.map(i => i.file === u.file ? { ...i, ...r } : i))
    }
    running.current = false
    toast('Upload finished — the planner will review your files'); onDone()
  }
  const counts = { done: items.filter(i => i.state === 'done').length, failed: items.filter(i => i.state === 'failed').length }
  return (
    <>
      <Section title="Secure upload" action={<span className="text-xs text-mute">{data.uploads} uploaded so far</span>}>
        <Select label="Function" value={fn} onChange={e => setFn(e.target.value)} placeholder="Not specific" options={data.functions.map((f: any) => ({ value: f.id, label: f.name }))} />
        <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 text-center hover:bg-canvas"><Upload className="size-7 text-brand" /><span className="font-semibold">Choose photos & videos</span><span className="text-xs text-mute">Files go to the planner for approval. Nothing is public until approved.</span><input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={e => add(e.target.files)} /></label>
        {items.length > 0 && <>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{items.map((u, i) => (
            <div key={i} className="rounded-xl border border-line p-2.5">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{u.file.name}</span><span className={cx('shrink-0 text-xs font-semibold', u.state === 'done' ? 'text-ok' : u.state === 'failed' ? 'text-bad' : u.state === 'duplicate' ? 'text-mute' : 'text-info')}>{u.state === 'uploading' ? `${u.pct}%` : u.state}</span></div>
              {u.state === 'uploading' && <Progress className="mt-1.5" value={u.pct} tone="sky" />}{u.msg && <div className="mt-1 text-xs text-bad">{u.msg}</div>}
            </div>
          ))}</div>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" variant="primary" size="lg" icon={counts.failed ? RotateCcw : Upload} onClick={start}>{counts.failed ? `Retry ${counts.failed} failed` : `Upload ${items.filter(i => i.state === 'queued').length} file(s)`}</Button>
            <Button variant="ghost" onClick={() => setItems(items.filter(i => i.state !== 'done' && i.state !== 'duplicate'))}>Clear done</Button>
          </div>
        </>}
      </Section>
    </>
  )
}
