import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, MessageCircle, MapPin, Clock, Phone, CheckCircle2, Navigation, Timer, PartyPopper, Hammer, Flag, Upload, Car, RotateCcw, UserX, Check, AlertTriangle } from 'lucide-react'
import { post } from '../api'
import { Button, Callout, cx, Input, Modal, Progress, Select, useToast } from '../ui'
import { date, dateTime, hhmm, time } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, TabBar, Section, WhatsAppPanel } from './common'

type Tab = 'jobs' | 'trips' | 'upload' | 'chat'
const STEPS = [['checkin', 'Checked in', CheckCircle2], ['enroute', 'Leaving now', Navigation], ['arrived', 'Reached', Flag], ['setup', 'Setup started', Hammer], ['ready', 'Ready', PartyPopper], ['complete', 'Complete', Check]] as const

export default function VendorPage() {
  const { token } = useParams()
  const { data, error, reload, setData } = useLink<any>(`/v/${token}`)
  const [tab, setTab] = useState<Tab>('jobs')
  const [delay, setDelay] = useState<any>(null)
  const toast = useToast()
  useEffect(() => { if (data && !data.assignments.length && data.trips.length) setTab('trips') }, [!!data])
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const act = async (a: any, action: string, extra: any = {}) => {
    try { setData(await post(`/l/v/${token}/assignments/${a.id}/status`, { action, ...extra })); toast(action === 'confirm' ? 'Confirmed — thank you!' : action === 'delay' ? 'Delay reported — the team is replanning' : 'Status updated') }
    catch (e: any) { toast(e.message, 'error') }
  }
  const tabs: any[] = [{ value: 'jobs', label: 'Assignments', icon: ClipboardList, badge: data.assignments.filter((a: any) => a.status === 'pending').length }]
  if (data.trips.length) tabs.push({ value: 'trips', label: 'Trip sheet', icon: Car })
  if (data.can_upload) tabs.push({ value: 'upload', label: 'Upload', icon: Upload })
  tabs.push({ value: 'chat', label: 'WhatsApp', icon: MessageCircle })
  return (
    <div className="min-h-dvh bg-paper pb-24">
      <LinkHeader agency={data.agency} title={data.vendor.name} sub={<>{data.wedding.name} · {data.vendor.kind}{data.contact && <> · Coordinator <a className="font-semibold underline" href={`tel:${data.contact.phone}`}>{data.contact.name}</a></>}</>} />
      <main className="mx-auto -mt-4 max-w-2xl space-y-4 px-4">
        {tab === 'jobs' && (data.assignments.length ? data.assignments.map((a: any) => {
          const idx = STEPS.findIndex(s => s[0] === (a.live_status === 'en_route' ? 'enroute' : a.live_status === 'checked_in' ? 'checkin' : a.live_status === 'completed' ? 'complete' : a.live_status))
          const done = (a.deliverables || []).filter((d: any) => d.done).length
          return (
            <Section key={a.id}>
              <div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold tracking-wide text-saffron uppercase">{a.function_name || 'All functions'}</div><div className="text-lg font-semibold">{a.role}</div></div>
                <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', a.status === 'pending' ? 'bg-amber-50 text-amber' : a.live_status === 'delayed' ? 'bg-rose-50 text-rose' : 'bg-sage-50 text-sage')}>{a.status === 'pending' ? 'Please confirm' : a.live_status === 'delayed' ? `Running ${a.delay_min}m late` : a.live_status ? a.live_status.replace('_', ' ') : 'Confirmed'}</span></div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><Clock className="size-4 text-mute" />Report <b>{dateTime(a.report_at)}</b></div>
                <div className="flex items-center gap-2"><MapPin className="size-4 text-mute" />{a.report_location || a.venue}{a.address ? `, ${a.address}` : ''}{a.map_url && <a href={a.map_url} target="_blank" className="ml-1 font-semibold text-saffron">Map</a>}</div>
                {a.function_name && <div className="text-xs text-mute">Function runs {hhmm(a.start_time)} on {date(a.date)}{a.dress_code ? ` · dress code ${a.dress_code}` : ''}</div>}
              </div>
              {a.status === 'pending' ? (
                <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="ghost" className="text-rose" onClick={() => { if (window.confirm('Decline this assignment? The planner will be alerted immediately.')) act(a, 'decline') }}>Can't make it</Button><Button variant="success" size="lg" onClick={() => act(a, 'confirm')}>Confirm</Button></div>
              ) : a.status !== 'completed' && (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2">{STEPS.map(([k, l, I], i) => (
                    <button key={k} onClick={() => act(a, k)} disabled={i <= idx} className={cx('flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-semibold', i <= idx ? 'border-sage/30 bg-sage-50 text-sage' : i === idx + 1 ? 'border-saffron bg-saffron-50 text-saffron' : 'border-line text-ink-2')}><I className="size-5" />{l}</button>
                  ))}</div>
                  <Button className="mt-2 w-full" variant="ghost" icon={Timer} onClick={() => setDelay(a)}>Running late?</Button>
                </>
              )}
              {(a.deliverables || []).length > 0 && <div className="mt-4 border-t border-line pt-3">
                <div className="mb-2 flex items-center justify-between text-sm"><b>Deliverables</b><span className="text-xs text-mute">{done}/{a.deliverables.length}</span></div>
                <Progress value={done} max={a.deliverables.length} tone="sage" className="mb-2" />
                {a.deliverables.map((d: any, i: number) => <label key={i} className="flex items-center gap-3 py-1.5 text-sm"><input type="checkbox" className="size-5 accent-[#3f7a5a]" checked={!!d.done} onChange={async e => setData(await post(`/l/v/${token}/assignments/${a.id}/deliverables`, { index: i, done: e.target.checked }))} /><span className={d.done ? 'text-mute line-through' : ''}>{d.text}</span></label>)}
              </div>}
            </Section>
          )
        }) : <Section><p className="text-sm text-mute">No assignments for this wedding.</p></Section>)}
        {tab === 'trips' && data.trips.map((t: any) => <TripSheet key={t.id} t={t} token={token!} onChange={setData} />)}
        {tab === 'upload' && <Uploader data={data} token={token!} onDone={reload} />}
        {tab === 'chat' && <WhatsAppPanel who={data.vendor.contact || data.vendor.name} messages={data.messages} replyPath={`/v/${token}/reply`} onReplied={reload} />}
        {tab === 'chat' && <Callout tone="sky">Try replying “running 30 min late due to traffic” or “reached the venue”. SUTR updates your assignment and alerts the team automatically.</Callout>}
      </main>
      <TabBar value={tab} onChange={setTab} tabs={tabs} />
      <DelayModal a={delay} onClose={() => setDelay(null)} onSubmit={(m: number, note: string) => { act(delay, 'delay', { minutes: m, note }); setDelay(null) }} />
    </div>
  )
}

function DelayModal({ a, onClose, onSubmit }: any) {
  const [m, setM] = useState(15)
  const [note, setNote] = useState('')
  return (
    <Modal open={!!a} onClose={onClose} title="Report a delay" sub="The planner sees the impact on the timeline immediately" size="sm" footer={<Button variant="danger" className="w-full" onClick={() => onSubmit(m, note)}>Send delay ({m} min)</Button>}>
      <div className="mb-3 grid grid-cols-4 gap-2">{[10, 15, 30, 45, 60, 90, 120].map(v => <button key={v} onClick={() => setM(v)} className={cx('h-12 rounded-xl border text-sm font-semibold', m === v ? 'border-rose bg-rose-50 text-rose' : 'border-line')}>{v < 60 ? `${v}m` : `${v / 60}h`}</button>)}</div>
      <Input label="Reason (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="Traffic near the venue" />
    </Modal>
  )
}

function TripSheet({ t, token, onChange }: any) {
  const toast = useToast()
  const set = async (s: any, status: string) => { try { onChange(await post(`/l/v/${token}/trips/${t.id}/stop`, { travel_id: s.travel_id, status })); toast(status === 'picked_up' ? `${s.name} picked up` : status === 'dropped' ? `${s.name} dropped` : 'Marked no-show — planner alerted') } catch (e: any) { toast(e.message, 'error') } }
  return (
    <Section title={<span className="flex items-center gap-2"><Car className="size-4 text-saffron" />{t.location} pickup · {time(t.window_start)}</span>} action={<span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', t.status === 'completed' ? 'bg-sage-50 text-sage' : 'bg-sky-50 text-sky')}>{t.status.replace('_', ' ')}</span>}>
      <div className="mb-3 text-sm text-mute">{t.vehicle} {t.plate} · {t.pax} passengers · drop at <b className="text-ink">{t.drop_location}</b></div>
      {t.status === 'confirmed' && <Button className="mb-3 w-full" variant="dark" icon={Navigation} onClick={async () => onChange(await post(`/l/v/${token}/trips/${t.id}/start`, {}))}>Start trip</Button>}
      <div className="space-y-2">{(t.stops || []).map((s: any) => (
        <div key={s.travel_id} className={cx('rounded-xl border p-3', s.status === 'dropped' ? 'border-sage/30 bg-sage-50/50' : s.status === 'no_show' ? 'border-rose/30 bg-rose-50/40' : 'border-line')}>
          <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{s.name} <span className="font-normal text-mute">· {s.pax} pax</span></div><div className="text-xs text-mute">{s.number} · lands {time(s.arrive_at)}{s.live?.delay_min ? <span className="font-semibold text-rose"> · +{s.live.delay_min} min late</span> : ''}</div></div>{s.phone && <a href={`tel:${s.phone}`} className="grid size-10 place-items-center rounded-xl bg-sand" aria-label={`Call ${s.name}`}><Phone className="size-4" /></a>}</div>
          {!['dropped', 'no_show'].includes(s.status) ? <div className="mt-2 grid grid-cols-3 gap-2">
            <Button size="sm" variant={s.status === 'picked_up' ? 'success' : 'secondary'} onClick={() => set(s, 'picked_up')} disabled={s.status === 'picked_up'}>Picked up</Button>
            <Button size="sm" variant="primary" onClick={() => set(s, 'dropped')} disabled={s.status !== 'picked_up'}>Dropped</Button>
            <Button size="sm" variant="ghost" className="text-rose" icon={UserX} onClick={() => window.confirm(`Mark ${s.name} as a no-show?`) && set(s, 'no_show')}>No-show</Button>
          </div> : <div className="mt-1 text-xs font-semibold">{s.status === 'dropped' ? '✓ Dropped' : '✗ No-show'}</div>}
        </div>
      ))}</div>
    </Section>
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
        <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 text-center hover:bg-paper"><Upload className="size-7 text-saffron" /><span className="font-semibold">Choose photos & videos</span><span className="text-xs text-mute">Files go to the planner for approval. Nothing is public until approved.</span><input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={e => add(e.target.files)} /></label>
        {items.length > 0 && <>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{items.map((u, i) => (
            <div key={i} className="rounded-xl border border-line p-2.5">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{u.file.name}</span><span className={cx('shrink-0 text-xs font-semibold', u.state === 'done' ? 'text-sage' : u.state === 'failed' ? 'text-rose' : u.state === 'duplicate' ? 'text-mute' : 'text-sky')}>{u.state === 'uploading' ? `${u.pct}%` : u.state}</span></div>
              {u.state === 'uploading' && <Progress className="mt-1.5" value={u.pct} tone="sky" />}{u.msg && <div className="mt-1 text-xs text-rose">{u.msg}</div>}
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
