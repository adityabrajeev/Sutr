import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, BedDouble, Bus, Car, CheckCircle2, Clock, Copy, Crown, FileUp, GitMerge, Hotel, Plane, Plus, Receipt, Send, Sparkles, Stamp, Timer, Upload, Wand2, Accessibility, ArrowRightLeft, LogIn, LogOut, Phone, Trash2, Wallet, Store,
} from 'lucide-react'
import { useApi, post, patch, del, api } from '../api'
import { useMe } from '../auth'
import { useWedding } from '../shell'
import { Badge, Button, Callout, Card, CardHeader, Check, cx, DataTable, Divided, Empty, ErrorBox, Grid, Input, Loading, Modal, Progress, Row, Segmented, Select, Stat, Status, Textarea, useAction, useToast, Confirm } from '../ui'
import { ago, date, dateTime, inr, inrFull, plural, time, toLocalInput, fromLocalInput } from '../format'

const Wrap = ({ children }: { children: React.ReactNode }) => <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{children}</div>
const Head = ({ title, sub, actions }: any) => <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-2xl font-medium">{title}</h2>{sub && <p className="text-sm text-mute">{sub}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>

// =====================================================================
// Travel operations
// =====================================================================
export function Travel() {
  const { wid } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'arrivals'
  const { data, error, reload } = useApi<any>(`/weddings/${wid}/travel`)
  const { run, busy } = useAction()
  const [ticket, setTicket] = useState(false)
  const [delay, setDelay] = useState<any>(null)
  const [review, setReview] = useState<any>(null)
  if (error) return <Wrap><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const s = data.summary
  return (
    <Wrap>
      <Head title="Travel operations" sub="Ticket intake → OCR → pickup clustering → driver trip sheets → drop at hotel"
        actions={<>
          <Button icon={FileUp} onClick={() => setTicket(true)}>Upload ticket</Button>
          <Button icon={Send} disabled={!data.needing_request.length} loading={busy === 'rq'} onClick={() => run('rq', () => post(`/weddings/${wid}/travel/request`), (r: any) => `Requested travel from ${r.requested} household(s)`).then(reload)}>Request travel ({data.needing_request.length})</Button>
          <Button variant="primary" icon={Wand2} loading={busy === 'cl'} onClick={() => run('cl', () => post(`/weddings/${wid}/travel/cluster`), (r: any) => `${r.length} pickup trip(s) suggested`).then(() => { reload(); setSp({ tab: 'pickups' }) })}>Cluster pickups</Button>
        </>} />
      <Grid cols={6} className="mb-5">
        <Stat label="Travel records" value={s.total} /><Stat label="Confirmed" value={s.confirmed} tone="sage" /><Stat label="Needs review" value={s.review} tone={s.review ? 'amber' : undefined} onClick={() => setSp({ tab: 'review' })} />
        <Stat label="Awaiting details" value={s.pending} /><Stat label="Need pickup" value={s.pickup} /><Stat label="Delayed" value={s.delayed} tone={s.delayed ? 'rose' : undefined} />
      </Grid>
      <Segmented className="mb-4" value={tab} onChange={t => setSp({ tab: t })} options={[{ value: 'arrivals', label: 'Arrivals' }, { value: 'review', label: 'OCR review', count: s.review }, { value: 'pickups', label: 'Pickups', count: data.trips.filter((t: any) => ['suggested', 'needs_replan'].includes(t.status)).length }, { value: 'vehicles', label: 'Vehicles' }]} />
      {tab === 'arrivals' && (
        <Card>
          <DataTable rows={data.travel} rowKey={t => t.id} empty={<Empty icon={Plane} title="No travel yet" sub="Request travel details from attending guests." />}
            cols={[
              { key: 'g', label: 'Guest', mobile: 'title', render: t => <span className="font-semibold">{t.guest_name}{t.vip ? ' 👑' : ''} <span className="font-normal text-mute">· {t.pax} pax</span></span> },
              { key: 'f', label: 'Flight / train', mobile: 'sub', render: t => t.number ? `${t.carrier || ''} ${t.number} · ${t.from_loc || '?'} → ${t.to_loc || '?'}` : t.status === 'self' ? 'Own arrangements' : '—' },
              { key: 'a', label: 'Arrives', render: t => t.arrive_at ? <span className={t.delay_min ? 'text-bad' : ''}>{dateTime(t.arrive_at)}{t.delay_min ? ` (+${t.delay_min}m)` : ''}</span> : '—' },
              { key: 's', label: 'Status', render: t => <span className="flex gap-1"><Status s={t.status} />{t.live_status && t.live_status !== 'on_time' && <Status s={t.live_status} />}</span> },
              { key: 'p', label: 'Pickup', render: t => t.pickup_required ? (t.trip_id ? <Badge tone="sky">in trip</Badge> : <Badge tone="amber">unassigned</Badge>) : <span className="text-mute">no</span> },
              { key: 'x', label: '', mobile: 'hide', render: t => t.status === 'confirmed' && <Button size="sm" variant="ghost" icon={Timer} onClick={() => setDelay(t)}>Delay</Button> },
            ]} />
        </Card>
      )}
      {tab === 'review' && (
        <Card>
          <CardHeader title="Low-confidence extractions" sub="Check the fields SUTR pulled from the ticket, then confirm" />
          {data.travel.filter((t: any) => t.status === 'review').length ? <Divided>{data.travel.filter((t: any) => t.status === 'review').map((t: any) => (
            <Row key={t.id} onClick={() => setReview(t)}>
              <div className="min-w-0 flex-1"><div className="font-semibold">{t.guest_name}</div><div className="text-xs text-mute">{t.number || 'no flight no.'} · {t.to_loc || 'no destination'} · {t.arrive_at ? dateTime(t.arrive_at) : 'no time'}</div></div>
              <Badge tone="amber">{Math.round((t.confidence || 0) * 100)}% confident</Badge>
            </Row>
          ))}</Divided> : <Empty icon={CheckCircle2} title="Review queue is clear" />}
        </Card>
      )}
      {tab === 'pickups' && <Pickups data={data} reload={reload} />}
      {tab === 'vehicles' && <Vehicles data={data} reload={reload} />}
      <TicketModal open={ticket} onClose={() => setTicket(false)} onDone={() => { setTicket(false); reload() }} />
      <ReviewModal t={review} onClose={() => setReview(null)} onDone={() => { setReview(null); reload() }} />
      <DelayModal t={delay} onClose={() => setDelay(null)} onDone={() => { setDelay(null); reload() }} />
    </Wrap>
  )
}

function TicketModal({ open, onClose, onDone }: any) {
  const { wid } = useParams()
  const { data: guests } = useApi<any[]>(open ? `/weddings/${wid}/guests` : null)
  const [g, setG] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [res, setRes] = useState<any>(null)
  const { run, busy } = useAction()
  useEffect(() => { if (open) { setRes(null); setFile(null); setText('') } }, [open])
  const go = async () => {
    const fd = new FormData(); fd.append('guest_id', g); if (file) fd.append('file', file); if (text) fd.append('text', text)
    const r = await run('u', () => api('POST', `/weddings/${wid}/travel/ticket`, fd))
    if (r) setRes(r)
  }
  return (
    <Modal open={open} onClose={onClose} title="Upload a ticket" sub="SUTR extracts flight, route, date and time. Low-confidence results go to review." size="md"
      footer={res ? <Button variant="primary" onClick={onDone}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!g || (!file && !text)} loading={busy === 'u'} onClick={go}>Extract</Button></>}>
      {res ? <div className="space-y-3">
        <Callout tone={res.travel.status === 'confirmed' ? 'sage' : 'amber'} icon={res.travel.status === 'confirmed' ? CheckCircle2 : AlertTriangle}>{res.travel.status === 'confirmed' ? 'High confidence — saved and added to the pickup pool.' : 'Low confidence — sent to the review queue.'} ({Math.round(res.extraction.confidence * 100)}%)</Callout>
        <dl className="grid grid-cols-2 gap-2 text-sm">{[['Carrier', res.extraction.carrier], ['Number', res.extraction.number], ['From', res.extraction.from_loc], ['To', res.extraction.to_loc], ['Date', res.extraction.date], ['Arrives', res.extraction.time]].map(([k, v]) => <div key={k}><dt className="text-xs text-mute">{k}</dt><dd className="font-semibold">{v || <span className="text-bad">not found</span>}</dd></div>)}</dl>
      </div> : <div className="space-y-3">
        <Select label="Guest (household lead)" value={g} onChange={e => setG(e.target.value)} placeholder="Choose…" options={(guests || []).filter(x => x.is_primary).map(x => ({ value: x.id, label: `${x.name}${x.household ? ` · ${x.household}` : ''}` }))} />
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-4 hover:bg-canvas"><Upload className="size-5 text-brand" /><span className="text-sm">{file ? file.name : 'Choose PDF, image or text ticket'}</span><input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        <Textarea label="…or paste the ticket / forwarded WhatsApp text" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="IndiGo 6E 2134 DEL→UDR 21 Nov 09:40, 2 adults" />
      </div>}
    </Modal>
  )
}
function ReviewModal({ t, onClose, onDone }: any) {
  const { wid } = useParams()
  const [f, setF] = useState<any>({})
  const { run, busy } = useAction()
  useEffect(() => { if (t) setF({ carrier: t.carrier || '', number: t.number || '', from_loc: t.from_loc || '', to_loc: t.to_loc || '', arrive_at: t.arrive_at ? t.arrive_at.slice(0, 16) : '', pax: t.pax || 1, pickup_required: !!t.pickup_required }) }, [t])
  return (
    <Modal open={!!t} onClose={onClose} title={`Review: ${t?.guest_name}`} sub={t?.extracted?.raw ? `Source: “${t.extracted.raw.slice(0, 90)}”` : undefined}
      footer={<><Button onClick={onClose}>Later</Button><Button variant="primary" loading={busy === 's'} disabled={!f.number || !f.arrive_at || !f.to_loc} onClick={() => run('s', () => patch(`/weddings/${wid}/travel/${t.id}`, { ...f, status: 'confirmed', pickup_required: f.pickup_required ? 1 : 0 }), 'Travel confirmed').then(onDone)}>Confirm</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Carrier" value={f.carrier} onChange={e => setF({ ...f, carrier: e.target.value })} /><Input label="Flight/train no." value={f.number} onChange={e => setF({ ...f, number: e.target.value })} />
        <Input label="From" value={f.from_loc} onChange={e => setF({ ...f, from_loc: e.target.value.toUpperCase() })} /><Input label="To (pickup point)" value={f.to_loc} onChange={e => setF({ ...f, to_loc: e.target.value.toUpperCase() })} />
        <Input label="Arrives" type="datetime-local" value={f.arrive_at} onChange={e => setF({ ...f, arrive_at: e.target.value })} /><Input label="Passengers" type="number" min={1} value={f.pax} onChange={e => setF({ ...f, pax: +e.target.value })} />
        <Check className="col-span-2" label="Needs pickup" checked={f.pickup_required} onChange={v => setF({ ...f, pickup_required: v })} />
      </div>
    </Modal>
  )
}
function DelayModal({ t, onClose, onDone }: any) {
  const { wid } = useParams()
  const [m, setM] = useState(30)
  const [res, setRes] = useState<any>(null)
  const { run, busy } = useAction()
  useEffect(() => setRes(null), [t])
  return (
    <Modal open={!!t} onClose={onClose} title={`Delay: ${t?.number}`} sub={t?.guest_name} size="sm"
      footer={res ? <Button variant="primary" onClick={onDone}>Done</Button> : <><Button variant="danger" onClick={() => run('c', () => post(`/weddings/${wid}/travel/${t.id}/delay`, { cancelled: true })).then(r => r && setRes(r))}>Flight cancelled</Button><Button variant="primary" loading={busy === 'd'} onClick={() => run('d', () => post(`/weddings/${wid}/travel/${t.id}/delay`, { minutes: m })).then(r => r && setRes(r))}>Record delay</Button></>}>
      {res ? <Callout tone={/re-plan|outside|removed/.test(res.impact) ? 'rose' : 'sage'}>{res.impact}</Callout> : <Input label="Minutes late" type="number" min={0} value={m} onChange={e => setM(+e.target.value)} />}
    </Modal>
  )
}

function Pickups({ data, reload }: any) {
  const { wid } = useParams()
  const { run, busy } = useAction()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [move, setMove] = useState<any>(null)
  const toast = useToast()
  const confirm = async (trip: any, vehicle_id: string, driver_vendor_id: string, override = false) => {
    try { await patch(`/weddings/${wid}/trips/${trip.id}`, { status: 'confirmed', vehicle_id, driver_vendor_id, override }); toast('Trip confirmed — driver & guests notified on WhatsApp'); reload() }
    catch (e: any) { if (e.status === 409 && window.confirm(`${e.message}\n\nConfirm anyway?`)) confirm(trip, vehicle_id, driver_vendor_id, true); else if (e.status !== 409) toast(e.message, 'error') }
  }
  if (!data.trips.length) return <Card><Empty icon={Bus} title="No pickups planned" sub="Cluster confirmed arrivals into trips by pickup point and time window." /></Card>
  return (
    <div className="space-y-3">
      {sel.size > 1 && <div className="flex items-center gap-2"><Button icon={GitMerge} loading={busy === 'm'} onClick={() => run('m', () => post(`/weddings/${wid}/trips/merge`, { ids: [...sel] }), 'Trips merged').then(() => { setSel(new Set()); reload() })}>Merge {sel.size} trips</Button><Button variant="ghost" onClick={() => setSel(new Set())}>Clear</Button></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.trips.map((t: any) => <TripCard key={t.id} t={t} data={data} selected={sel.has(t.id)} onSelect={() => { const s = new Set(sel); s.has(t.id) ? s.delete(t.id) : s.add(t.id); setSel(s) }} onConfirm={confirm} onMove={(stop: any) => setMove({ trip: t, stop })} />)}
      </div>
      <Modal open={!!move} onClose={() => setMove(null)} title={`Move ${move?.stop.name}`} size="sm">
        <Divided>
          {data.trips.filter((x: any) => x.id !== move?.trip.id).map((x: any) => <Row key={x.id} onClick={() => run('mv', () => post(`/weddings/${wid}/trips/${move.trip.id}/move`, { travel_id: move.stop.travel_id, to_trip_id: x.id }), 'Moved').then(() => { setMove(null); reload() })}><div className="flex-1 text-sm"><b>{x.location}</b> · {time(x.window_start)}–{time(x.window_end)} · {x.pax} pax</div></Row>)}
          <Row onClick={() => run('mv', () => post(`/weddings/${wid}/trips/${move.trip.id}/move`, { travel_id: move.stop.travel_id }), 'Removed from trip').then(() => { setMove(null); reload() })}><div className="flex-1 text-sm text-bad">Remove from trip (unassigned)</div></Row>
        </Divided>
      </Modal>
    </div>
  )
}
function TripCard({ t, data, selected, onSelect, onConfirm, onMove }: any) {
  const [veh, setVeh] = useState(t.vehicle_id || '')
  const [drv, setDrv] = useState(t.driver_vendor_id || '')
  useEffect(() => { const v = data.vehicles.find((x: any) => x.id === veh); if (v?.driver_vendor_id && !drv) setDrv(v.driver_vendor_id) }, [veh])
  const editable = ['suggested', 'needs_replan', 'confirmed'].includes(t.status)
  return (
    <Card className={cx('flex flex-col', t.status === 'needs_replan' && 'border-bad/40', selected && 'ring-2 ring-brand/40')}>
      <div className="flex items-start justify-between gap-2 border-b border-line p-4">
        <div className="flex items-start gap-2">
          {editable && <input type="checkbox" aria-label="Select trip" className="mt-1 accent-[#0E6B66]" checked={selected} onChange={onSelect} />}
          <div><div className="flex items-center gap-2 font-semibold"><Plane className="size-4 text-brand" />{t.location} pickup</div><div className="text-xs text-mute">{date(t.window_start)} · {time(t.window_start)}–{time(t.window_end)} · {t.pax} pax</div></div>
        </div>
        <Status s={t.status} />
      </div>
      <Divided className="flex-1">{(t.stops || []).map((s: any) => (
        <div key={s.travel_id} className="flex items-center gap-2 px-4 py-2 text-sm">
          <div className="min-w-0 flex-1"><span className="font-medium">{s.name}</span> <span className="text-xs text-mute">· {s.pax} · {s.number} {time(s.arrive_at)}</span></div>
          {s.status && s.status !== 'waiting' ? <Status s={s.status} /> : editable && <button className="text-xs font-semibold text-brand" onClick={() => onMove(s)}>Move</button>}
        </div>
      ))}</Divided>
      <div className="space-y-2 border-t border-line p-4">
        {t.status === 'suggested' && <div className="text-xs text-mute">Suggested vehicle: <b className="text-ink">{t.suggested_kind}</b></div>}
        {t.vehicle_label && <div className="flex items-center gap-2 text-sm"><Car className="size-4 text-mute" />{t.vehicle_label} {t.plate} · {t.driver_name} {t.driver_phone && <a href={`tel:${t.driver_phone}`} className="text-brand"><Phone className="inline size-3.5" /></a>}</div>}
        {editable && <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Vehicle" value={veh} onChange={e => setVeh(e.target.value)} placeholder="Vehicle" options={data.vehicles.map((v: any) => ({ value: v.id, label: `${v.label} (${v.capacity})` }))} />
          <Select aria-label="Driver" value={drv} onChange={e => setDrv(e.target.value)} placeholder="Driver" options={data.drivers.map((d: any) => ({ value: d.id, label: d.name }))} />
        </div>}
        {editable && <Button className="w-full" variant={t.status === 'confirmed' ? 'secondary' : 'primary'} disabled={!veh || !drv} onClick={() => onConfirm(t, veh, drv)}>{t.status === 'confirmed' ? 'Update & re-notify' : 'Confirm vehicle + driver'}</Button>}
      </div>
    </Card>
  )
}
function Vehicles({ data, reload }: any) {
  const { wid } = useParams()
  const { run } = useAction()
  const [f, setF] = useState<any>(null)
  return (
    <Card>
      <CardHeader title="Fleet for this wedding" action={<Button size="sm" icon={Plus} onClick={() => setF({ label: '', kind: 'SUV', capacity: 6, plate: '', driver_vendor_id: '' })}>Add vehicle</Button>} />
      <DataTable rows={data.vehicles} rowKey={v => v.id} onRow={setF} empty={<Empty icon={Car} title="No vehicles" />} cols={[
        { key: 'l', label: 'Vehicle', mobile: 'title', render: v => v.label }, { key: 'k', label: 'Type', render: v => v.kind }, { key: 'c', label: 'Seats', render: v => v.capacity }, { key: 'p', label: 'Plate', render: v => v.plate }, { key: 'd', label: 'Default driver', render: v => v.driver_name || '—' },
      ]} />
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit vehicle' : 'Add vehicle'} size="sm" footer={<>{f?.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/weddings/${wid}/vehicles/${f.id}`), 'Removed').then(() => { setF(null); reload() })}>Remove</Button>}<Button onClick={() => setF(null)}>Cancel</Button><Button variant="primary" onClick={() => run('s', () => f.id ? patch(`/weddings/${wid}/vehicles/${f.id}`, f) : post(`/weddings/${wid}/vehicles`, f), 'Saved').then(() => { setF(null); reload() })}>Save</Button></>}>
        {f && <div className="grid grid-cols-2 gap-3"><Input className="col-span-2" label="Label" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} /><Select label="Type" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} options={['Sedan', 'SUV', 'Tempo Traveller', 'Coach']} /><Input label="Seats" type="number" value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /><Input label="Plate" value={f.plate || ''} onChange={e => setF({ ...f, plate: e.target.value })} /><Select label="Driver" value={f.driver_vendor_id || ''} onChange={e => setF({ ...f, driver_vendor_id: e.target.value })} placeholder="None" options={data.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></div>}
      </Modal>
    </Card>
  )
}

// =====================================================================
// Accommodation operations
// =====================================================================
export function Rooms() {
  const { wid } = useParams()
  const { data, error, reload } = useApi<any>(`/weddings/${wid}/rooms`)
  const { run, busy } = useAction()
  const toast = useToast()
  const [tab, setTab] = useState<'board' | 'checkin'>('board')
  const [hotelForm, setHotelForm] = useState<any>(null)
  const [importFor, setImportFor] = useState<any>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [change, setChange] = useState<any>(null)
  const [hotelFilter, setHotelFilter] = useState('')
  if (error) return <Wrap><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const assign = async (guest_id: string, room_id: string | null, override = false) => {
    try { await post(`/weddings/${wid}/rooms/assign`, { guest_id, room_id, override }); reload() }
    catch (e: any) { if (e.status === 409 && /full/.test(e.message) && window.confirm(`${e.message}. Overbook anyway?`)) assign(guest_id, room_id, true); else toast(e.message, 'error') }
    setDrag(null)
  }
  const ap = data.approval
  const pendingApproval = ap?.status === 'pending'
  const c = data.counts
  const crit = data.conflicts.filter((x: any) => x.severity === 'critical').length
  return (
    <Wrap>
      <Head title="Accommodation" sub="Inventory → suggested allocation → host approval → finalize → check-in"
        actions={<>
          <Button icon={Hotel} onClick={() => setHotelForm({ name: '', address: '', check_in: '', check_out: '' })}>Add hotel</Button>
          <Button icon={Wand2} loading={busy === 'sg'} disabled={!data.rooms.length} onClick={() => run('sg', () => post(`/weddings/${wid}/rooms/suggest`), (r: any) => `Placed ${r.placed} guest(s)${r.unplaced.length ? `, ${r.unplaced.length} couldn't fit` : ''}`).then(reload)}>Suggest allocation</Button>
          {data.host_approval && !pendingApproval && <Button variant="primary" icon={Stamp} loading={busy === 'ap'} onClick={() => run('ap', () => post(`/weddings/${wid}/rooms/submit-approval`, { override: crit > 0 && window.confirm(`${crit} critical conflict(s). Send anyway?`) }), 'Sent to host for approval').then(reload)}>Send to host</Button>}
          {(!data.host_approval || ap?.status === 'approved') && <Button variant="primary" icon={CheckCircle2} loading={busy === 'fin'} onClick={() => run('fin', () => post(`/weddings/${wid}/rooms/finalize`), (r: any) => `Finalized ${r.finalized} — ${r.notified} guest(s) notified`).then(reload)}>Finalize & notify</Button>}
        </>} />
      {ap && <div className="mb-4">
        {ap.status === 'pending' && <Callout tone="sky" icon={Clock}>Rooming list sent to host {ago(ap.created_at)} — waiting for approval.</Callout>}
        {ap.status === 'changes_requested' && <Callout tone="amber" icon={AlertTriangle}><b>Host requested changes:</b> “{ap.comment}”. Adjust the board and send again.</Callout>}
        {ap.status === 'approved' && c.final < c.assigned && <Callout tone="sage" icon={CheckCircle2}>Host approved {ago(ap.decided_at)}. Finalize to notify guests of their rooms.</Callout>}
      </div>}
      <Grid cols={5} className="mb-5">
        <Stat label="Rooms" value={c.total} sub={`${c.capacity} beds`} /><Stat label="Assigned" value={c.assigned} /><Stat label="Unassigned" value={data.unassigned.length} tone={data.unassigned.length ? 'amber' : undefined} /><Stat label="Finalized" value={c.final} tone="sage" /><Stat label="Checked in" value={c.checked_in} />
      </Grid>
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'board', label: 'Allocation board' }, { value: 'checkin', label: 'Check-in desk' }]} />
      {tab === 'board' ? (
        <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <Card onDragOver={e => e.preventDefault()} onDrop={() => drag && assign(drag, null)}>
              <CardHeader title="Unassigned" sub={drag ? 'Drop here to unassign' : 'Drag onto a room, or tap then tap a room'} />
              <div className="flex max-h-[420px] flex-wrap gap-1.5 overflow-y-auto p-3">
                {data.unassigned.length ? data.unassigned.map((g: any) => <GuestChip key={g.id} g={g} active={drag === g.id} onPick={() => setDrag(drag === g.id ? null : g.id)} />) : <span className="text-sm text-mute">Everyone has a room.</span>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Conflicts" sub={data.conflicts.length ? `${crit} critical` : 'None'} icon={AlertTriangle} />
              <Divided className="max-h-80 overflow-y-auto">{data.conflicts.slice(0, 40).map((x: any, i: number) => <div key={i} className="flex gap-2 px-4 py-2 text-xs"><span className={cx('mt-1 size-1.5 shrink-0 rounded-full', x.severity === 'critical' ? 'bg-bad' : 'bg-haldi')} />{x.message}</div>)}</Divided>
            </Card>
          </div>
          <div className="space-y-4">
            {data.hotels.length > 1 && <Segmented value={hotelFilter} onChange={setHotelFilter} options={[{ value: '', label: 'All hotels' }, ...data.hotels.map((h: any) => ({ value: h.id, label: h.name }))]} />}
            {!data.hotels.length && <Card><Empty icon={Hotel} title="No hotels yet" sub="Add a hotel, then import its room inventory." /></Card>}
            {data.hotels.filter((h: any) => !hotelFilter || h.id === hotelFilter).map((h: any) => {
              const rooms = data.rooms.filter((r: any) => r.hotel_id === h.id)
              return (
                <Card key={h.id}>
                  <CardHeader title={h.name} sub={`${rooms.length} rooms · ${date(h.check_in)} → ${date(h.check_out)}`} icon={Hotel} action={<Button size="sm" icon={Upload} onClick={() => setImportFor(h)}>Add rooms</Button>} />
                  <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {rooms.map((r: any) => {
                      const over = r.guests.length > r.capacity
                      return (
                        <div key={r.id} onDragOver={e => e.preventDefault()} onDrop={() => drag && assign(drag, r.id)} onClick={() => drag && assign(drag, r.id)}
                          className={cx('min-h-24 rounded-xl border p-2.5 transition-colors', drag ? 'cursor-copy border-dashed border-brand/60 bg-brand-50/30' : 'border-line', over && 'border-bad bg-bad-50/40', r.status !== 'available' && 'opacity-50')}>
                          <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold">{r.number}</span><span className="flex items-center gap-1 text-mute">{r.accessible ? <Accessibility className="size-3 text-info" /> : null}{r.category} · {r.guests.length}/{r.capacity}</span></div>
                          <div className="flex flex-wrap gap-1">{r.guests.map((g: any) => <GuestChip key={g.guest_id} g={{ ...g, id: g.guest_id }} small active={drag === g.guest_id} onPick={e => { e?.stopPropagation(); setDrag(drag === g.guest_id ? null : g.guest_id) }} status={g.status} />)}</div>
                          {r.status !== 'available' && <div className="mt-1 text-[11px] text-bad">{r.status.replace('_', ' ')}</div>}
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      ) : (
        <Card>
          <DataTable rows={data.rooms.flatMap((r: any) => r.guests.filter((g: any) => ['final', 'checked_in', 'checked_out', 'approved'].includes(g.status)).map((g: any) => ({ ...g, room: r, hotel: data.hotels.find((h: any) => h.id === r.hotel_id)?.name })))}
            rowKey={g => g.guest_id} empty={<Empty icon={BedDouble} title="Nothing to check in yet" sub="Finalize the rooming list first." />}
            cols={[
              { key: 'g', label: 'Guest', mobile: 'title', render: g => <span className="font-semibold">{g.name}{g.vip ? ' 👑' : ''}</span> },
              { key: 'r', label: 'Room', mobile: 'sub', render: g => `${g.hotel} · ${g.room.number} (${g.room.category})` },
              { key: 's', label: 'Status', render: g => <Status s={g.status} /> },
              { key: 'a', label: '', render: g => <span className="flex gap-1.5">
                {g.status !== 'checked_in' && g.status !== 'checked_out' && <Button size="sm" variant="success" icon={LogIn} onClick={() => run('ci', () => post(`/weddings/${wid}/rooms/checkin`, { guest_id: g.guest_id }), 'Checked in').then(reload)}>Check in</Button>}
                {g.status === 'checked_in' && <Button size="sm" icon={LogOut} onClick={() => run('co', () => post(`/weddings/${wid}/rooms/checkin`, { guest_id: g.guest_id, out: true }), 'Checked out').then(reload)}>Check out</Button>}
                <Button size="sm" variant="ghost" icon={ArrowRightLeft} onClick={() => setChange(g)}>Change</Button>
              </span> },
            ]} />
        </Card>
      )}
      <Modal open={!!hotelForm} onClose={() => setHotelForm(null)} title="Add hotel" size="sm" footer={<><Button onClick={() => setHotelForm(null)}>Cancel</Button><Button variant="primary" disabled={!hotelForm?.name} onClick={() => run('h', () => post(`/weddings/${wid}/hotels`, hotelForm), 'Hotel added').then(() => { setHotelForm(null); reload() })}>Add</Button></>}>
        {hotelForm && <div className="space-y-3"><Input label="Hotel name" value={hotelForm.name} onChange={e => setHotelForm({ ...hotelForm, name: e.target.value })} /><Input label="Address" value={hotelForm.address} onChange={e => setHotelForm({ ...hotelForm, address: e.target.value })} /><div className="grid grid-cols-2 gap-3"><Input label="Block check-in" type="date" value={hotelForm.check_in} onChange={e => setHotelForm({ ...hotelForm, check_in: e.target.value })} /><Input label="Block check-out" type="date" value={hotelForm.check_out} onChange={e => setHotelForm({ ...hotelForm, check_out: e.target.value })} /></div></div>}
      </Modal>
      <RoomImport hotel={importFor} onClose={() => setImportFor(null)} onDone={() => { setImportFor(null); reload() }} />
      <RoomChange g={change} onClose={() => setChange(null)} onDone={() => { setChange(null); reload() }} />
    </Wrap>
  )
}
function GuestChip({ g, onPick, active, small, status }: { g: any; onPick: (e?: any) => void; active?: boolean; small?: boolean; status?: string }) {
  return (
    <button draggable onDragStart={() => onPick()} onClick={onPick} title={[g.household, g.accessibility, status].filter(Boolean).join(' · ')}
      className={cx('inline-flex items-center gap-1 rounded-full border px-2 font-medium', small ? 'h-6 text-[11px]' : 'h-7 text-xs', active ? 'border-brand bg-brand text-white' : status === 'final' || status === 'checked_in' ? 'border-ok/30 bg-ok-50 text-ok' : status === 'pending_approval' ? 'border-info/30 bg-info-50 text-info' : 'border-line bg-card')}>
      {g.vip ? <Crown className="size-3 text-haldi" /> : null}{g.accessibility ? <Accessibility className="size-3" /> : null}{g.name.split(' ')[0]} {g.name.split(' ').slice(-1)[0][0]}.{g.age_group === 'child' && <span className="opacity-60">·kid</span>}
    </button>
  )
}
function RoomImport({ hotel, onClose, onDone }: any) {
  const { wid } = useParams()
  const [text, setText] = useState('')
  const [err, setErr] = useState<any>(null)
  const { run, busy } = useAction()
  useEffect(() => { setText(''); setErr(null) }, [hotel])
  const rows = text.split(/\n/).map(l => l.split(/[,\t]/).map(s => s.trim())).filter(r => r[0]).map(([number, category, capacity, accessible, floor]) => ({ number, category, capacity: +capacity || 2, accessible, floor: +floor || undefined }))
  const go = async (skip = false) => {
    try { setErr(null); const r = await post(`/weddings/${wid}/hotels/${hotel.id}/rooms`, { rows, skip_invalid: skip }); onDone(); return r } catch (e) { setErr(e) }
  }
  return (
    <Modal open={!!hotel} onClose={onClose} title={`Room inventory · ${hotel?.name}`} sub="One room per line: number, category, capacity, accessible (y/n), floor" size="md"
      footer={<><Button onClick={onClose}>Cancel</Button>{err?.detail?.errors && <Button onClick={() => run('s', () => go(true))}>Skip invalid rows</Button>}<Button variant="primary" disabled={!rows.length} loading={busy === 'i'} onClick={() => run('i', () => go())}>Import {rows.length} room(s)</Button></>}>
      <ErrorBox error={err} />
      <Textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={'401, Suite, 3, y, 4\n402, Deluxe, 2, n, 4'} aria-label="Rooms" className="mt-2 font-mono" />
    </Modal>
  )
}
function RoomChange({ g, onClose, onDone }: any) {
  const { wid } = useParams()
  const [reason, setReason] = useState('')
  const [issue, setIssue] = useState(true)
  const [all, setAll] = useState(true)
  const [res, setRes] = useState<any>(null)
  const { run, busy } = useAction()
  useEffect(() => { setRes(null); setReason('') }, [g])
  return (
    <Modal open={!!g} onClose={onClose} title={`Room change · ${g?.name}`} sub={g ? `Currently ${g.room.number}` : ''} size="sm"
      footer={res ? <Button variant="primary" onClick={onDone}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy === 'c'} onClick={() => run('c', () => post(`/weddings/${wid}/rooms/change`, { guest_id: g.guest_id, reason, room_issue: issue, move_roommates: all })).then(r => r && setRes(r))}>Find alternative</Button></>}>
      {res ? <Callout tone={res.found ? 'sage' : 'rose'}>{res.found ? `Moved to ${res.room} at ${res.hotel}. Guest notified.` : res.message}</Callout> : <div className="space-y-3"><Textarea label="Reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="AC not working" /><Check label="Room has an issue (take it out of service)" checked={issue} onChange={setIssue} /><Check label="Move roommates too" checked={all} onChange={setAll} /></div>}
    </Modal>
  )
}

// =====================================================================
// Vendor operations (per wedding)
// =====================================================================
export function WeddingVendors() {
  const { wid } = useParams()
  const { w } = useWedding()
  const { data, error, reload } = useApi<any[]>(`/weddings/${wid}/vendors`)
  const { data: directory, reload: rd } = useApi<any[]>('/vendors')
  const { run } = useAction()
  const toast = useToast()
  const [assign, setAssign] = useState(false)
  const [impact, setImpact] = useState<any>(null)
  const [backup, setBackup] = useState<any>(null)
  const [fn, setFn] = useState('')
  if (error) return <Wrap><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const list = data.filter(v => !fn || v.function_id === fn || (!v.function_id && fn === 'none'))
  const act = (va: any, action: string, minutes?: number) => run('a', () => post(`/weddings/${wid}/vendor-assignments/${va.id}/status`, { action, minutes }), `Marked ${action}`).then(reload)
  const pending = data.filter(v => v.status === 'pending').length
  return (
    <Wrap>
      <Head title="Vendor operations" sub={`${data.length} assignment(s) · ${pending} unconfirmed · vendors work over WhatsApp + a one-purpose link`} actions={<Button variant="primary" icon={Plus} onClick={() => setAssign(true)}>Assign vendor</Button>} />
      <Segmented className="mb-4" value={fn} onChange={setFn} options={[{ value: '', label: 'All' }, ...w.functions.map((f: any) => ({ value: f.id, label: f.name, count: data.filter(v => v.function_id === f.id).length })), { value: 'none', label: 'All functions' }]} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {!list.length && <Card className="md:col-span-2 xl:col-span-3"><Empty icon={Store} title="No vendors assigned" /></Card>}
        {list.map(v => {
          const done = (v.deliverables || []).filter((d: any) => d.done).length
          return (
            <Card key={v.id} className={cx('flex flex-col', v.status === 'cancelled' && 'opacity-60', v.live_status === 'delayed' && 'border-bad/40')}>
              <div className="flex items-start justify-between gap-2 p-4">
                <div className="min-w-0"><div className="truncate font-semibold">{v.name}</div><div className="truncate text-xs text-mute">{v.kind} · {v.role}</div></div>
                <div className="flex flex-col items-end gap-1"><Status s={v.status} />{v.live_status && <Status s={v.live_status} label={v.live_status === 'delayed' ? `+${v.delay_min}m late` : undefined} />}</div>
              </div>
              <div className="space-y-1.5 border-t border-line px-4 py-3 text-xs">
                <div className="flex justify-between"><span className="text-mute">Function</span><b>{v.function_name || 'All functions'}</b></div>
                <div className="flex justify-between"><span className="text-mute">Reports</span><b>{dateTime(v.report_at)}</b></div>
                <div className="flex justify-between"><span className="text-mute">Location</span><b className="truncate pl-4">{v.report_location || '—'}</b></div>
                {v.quote ? <div className="flex justify-between"><span className="text-mute">Quote</span><b>{inr(v.quote)}</b></div> : null}
                {v.on_time_pct !== null && <div className="flex justify-between"><span className="text-mute">On-time history</span><b className={v.on_time_pct < 80 ? 'text-warn' : 'text-ok'}>{v.on_time_pct}%</b></div>}
                {(v.deliverables || []).length > 0 && <div><div className="mb-1 flex justify-between"><span className="text-mute">Deliverables</span><b>{done}/{v.deliverables.length}</b></div><Progress value={done} max={v.deliverables.length} tone="sage" /></div>}
                {v.backup_name && <div className="text-bad">Replaced by {v.backup_name}</div>}
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line p-3">
                {v.status === 'pending' && <><Button size="sm" icon={Send} onClick={() => run('r', () => post(`/weddings/${wid}/vendor-assignments/${v.id}/remind`), 'Reminder sent').then(reload)}>Remind</Button><Button size="sm" variant="ghost" onClick={() => act(v, 'confirm')}>Mark confirmed</Button></>}
                {v.status === 'confirmed' && !v.live_status && <Button size="sm" variant="ghost" onClick={() => act(v, 'arrived')}>Arrived</Button>}
                {v.live_status === 'delayed' && <Button size="sm" icon={AlertTriangle} onClick={() => fetchImpact(wid!, v, setImpact)}>Impact</Button>}
                {v.status !== 'cancelled' && v.status !== 'completed' && <Button size="sm" variant="ghost" className="text-bad" onClick={() => setBackup(v)}>Backup / replace</Button>}
                {v.phone && <a href={`tel:${v.phone}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink-2 hover:bg-wash"><Phone className="size-3.5" />Call</a>}
              </div>
            </Card>
          )
        })}
      </div>
      <AssignModal open={assign} onClose={() => setAssign(false)} directory={directory || []} functions={w.functions} onDone={() => { setAssign(false); reload(); rd() }} />
      <Modal open={!!impact} onClose={() => setImpact(null)} title="Delay impact" size="md">{impact && <div className="space-y-3 text-sm"><Callout tone="rose" icon={Timer}>{impact.summary}</Callout>{impact.downstream.length > 0 && <div><b>Downstream vendors</b><ul className="mt-1 list-disc pl-5">{impact.downstream.map((d: any) => <li key={d.id}>{d.name} · reports {time(d.report_at)}</li>)}</ul></div>}{impact.tasks.length > 0 && <div><b>Dependent tasks</b><ul className="mt-1 list-disc pl-5">{impact.tasks.map((t: any) => <li key={t.id}>{t.title}</li>)}</ul></div>}<p className="text-mute">Re-plan in the Command Center, or assign a backup vendor.</p></div>}</Modal>
      <Modal open={!!backup} onClose={() => setBackup(null)} title={`Replace ${backup?.name}`} sub="The original assignment is cancelled and the backup gets the same brief" size="sm">
        <Divided>{(directory || []).filter(d => d.kind === backup?.kind && d.id !== backup?.vendor_id).map(d => <Row key={d.id} onClick={() => run('b', () => post(`/weddings/${wid}/vendor-assignments/${backup.id}/backup`, { vendor_id: d.id }), `${d.name} assigned — confirmation sent`).then(() => { setBackup(null); reload() })}><div className="flex-1"><div className="font-semibold">{d.name}</div><div className="text-xs text-mute">{d.city} · ⭐ {d.rating} · {d.on_time_pct ?? '—'}% on time</div></div></Row>)}</Divided>
        {!(directory || []).some(d => d.kind === backup?.kind && d.id !== backup?.vendor_id) && <Empty title={`No other ${backup?.kind}s in your directory`} />}
      </Modal>
    </Wrap>
  )
}
async function fetchImpact(wid: string, v: any, set: (x: any) => void) { set(await api('GET', `/weddings/${wid}/vendor-assignments/${v.id}/impact`)) }

function AssignModal({ open, onClose, directory, functions, onDone }: any) {
  const { wid } = useParams()
  const toast = useToast()
  const [f, setF] = useState<any>({})
  const [warn, setWarn] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ vendor_id: '', function_id: '', role: '', report_at: '', report_location: '', deliverables: '', quote: '', send: true }); setWarn(null) } }, [open])
  const save = async (force = false) => {
    setBusy(true)
    try { await post(`/weddings/${wid}/vendors/assign`, { ...f, report_at: fromLocalInput(f.report_at), quote: +f.quote || null, deliverables: f.deliverables.split('\n').map((s: string) => s.trim()).filter(Boolean), force }); toast(f.send ? 'Assigned — WhatsApp confirmation sent' : 'Assigned'); onDone() }
    catch (e: any) { if (e.status === 409) setWarn(e.message); else toast(e.message, 'error') } finally { setBusy(false) }
  }
  const fnObj = functions.find((x: any) => x.id === f.function_id)
  return (
    <Modal open={open} onClose={onClose} title="Assign vendor" size="lg" footer={<><Button onClick={onClose}>Cancel</Button>{warn ? <Button variant="danger" loading={busy} onClick={() => save(true)}>Assign anyway</Button> : <Button variant="primary" loading={busy} disabled={!f.vendor_id} onClick={() => save()}>Assign</Button>}</>}>
      {warn && <div className="mb-3"><Callout tone="amber" icon={AlertTriangle}>{warn}</Callout></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Vendor" value={f.vendor_id} onChange={e => setF({ ...f, vendor_id: e.target.value })} placeholder="Choose from directory…" options={directory.map((d: any) => ({ value: d.id, label: `${d.name} · ${d.kind}` }))} />
        <Select label="Function" value={f.function_id} onChange={e => { const fx = functions.find((x: any) => x.id === e.target.value); setF({ ...f, function_id: e.target.value, report_location: f.report_location || fx?.venue || '', report_at: f.report_at || (fx ? `${fx.date}T${fx.start_time ? String(+fx.start_time.slice(0, 2) - 3).padStart(2, '0') + fx.start_time.slice(2) : '09:00'}` : '') }) }} placeholder="All functions" options={functions.map((x: any) => ({ value: x.id, label: x.name }))} />
        <Input label="Role / brief" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} placeholder="Stage decor" />
        <Input label="Quote (₹)" type="number" value={f.quote} onChange={e => setF({ ...f, quote: e.target.value })} hint="Creates a budget line" />
        <Input label="Reporting time" type="datetime-local" value={f.report_at} onChange={e => setF({ ...f, report_at: e.target.value })} />
        <Input label="Reporting location" value={f.report_location} onChange={e => setF({ ...f, report_location: e.target.value })} placeholder={fnObj?.venue} />
        <Textarea className="sm:col-span-2" label="Deliverables (one per line)" rows={3} value={f.deliverables} onChange={e => setF({ ...f, deliverables: e.target.value })} />
        <Check className="sm:col-span-2" label="Send WhatsApp confirmation request now" checked={f.send} onChange={v => setF({ ...f, send: v })} />
      </div>
    </Modal>
  )
}

// =====================================================================
// Budget & finance
// =====================================================================
export function Budget() {
  const { wid } = useParams()
  const { data, error, reload } = useApi<any>(`/weddings/${wid}/budget`)
  const { data: vendors } = useApi<any[]>('/vendors')
  const { run } = useAction()
  const [exp, setExp] = useState<any>(null)
  const [line, setLine] = useState<any>(null)
  const [tab, setTab] = useState<'lines' | 'expenses'>('lines')
  if (error) return <Wrap><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const over = data.lines.filter((l: any) => l.over)
  return (
    <Wrap>
      <Head title="Budget & finance" sub="Planned vs actual tracking. SUTR records payment status — it never processes payments."
        actions={<><Button icon={Plus} onClick={() => setLine({ category: '', label: '', planned: '' })}>Budget line</Button><Button variant="primary" icon={Receipt} onClick={() => setExp({ line_id: '', label: '', amount: '', currency: data.currency, date: '', vendor_id: '', payment_status: 'unpaid' })}>Record expense</Button></>} />
      <Grid cols={5} className="mb-5">
        <Stat label="Client budget" value={inr(data.total_budget)} /><Stat label="Planned" value={inr(data.planned)} sub={data.total_budget ? `${Math.round(data.planned / data.total_budget * 100)}% of budget` : undefined} />
        <Stat label="Actual" value={inr(data.actual)} tone={data.actual > data.planned ? 'rose' : undefined} sub={`${Math.round(data.actual / Math.max(1, data.planned) * 100)}% of plan`} />
        <Stat label="Forecast" value={inr(data.forecast)} tone={data.forecast > (data.total_budget || data.planned) ? 'rose' : 'sage'} sub="max(actual, plan) per line" /><Stat label="Paid" value={inr(data.paid)} sub={`${inr(data.actual - data.paid)} outstanding`} />
      </Grid>
      {over.length > 0 && <div className="mb-4"><Callout tone="amber" icon={AlertTriangle}>{over.map((l: any) => l.category).join(', ')} {over.length === 1 ? 'is' : 'are'} over the {data.threshold}% variance threshold.</Callout></div>}
      <Card className="mb-5">
        <CardHeader title="By category" icon={Wallet} />
        <div className="grid gap-x-8 gap-y-4 p-5 md:grid-cols-2">
          {Object.entries(data.categories).map(([k, c]: any) => (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold">{k}</span><span className="tabular text-xs"><span className={c.actual > c.planned ? 'font-semibold text-bad' : ''}>{inr(c.actual)}</span> <span className="text-mute">/ {inr(c.planned)}</span></span></div>
              <div className="relative h-2 overflow-hidden rounded-full bg-wash"><div className={cx('h-full rounded-full', c.actual > c.planned ? 'bg-bad' : 'bg-ok')} style={{ width: `${Math.min(100, c.actual / Math.max(1, c.planned) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </Card>
      <Segmented className="mb-3" value={tab} onChange={setTab} options={[{ value: 'lines', label: 'Budget lines' }, { value: 'expenses', label: 'Expenses', count: data.expenses.filter((e: any) => e.flagged).length }]} />
      {tab === 'lines' ? (
        <Card>
          <DataTable rows={data.lines} rowKey={l => l.id} onRow={setLine} cols={[
            { key: 'c', label: 'Category', mobile: 'title', render: l => <span className="font-semibold">{l.category}</span> },
            { key: 'l', label: 'Line', mobile: 'sub', render: l => l.label || l.vendor_name || '—' },
            { key: 'p', label: 'Planned', render: l => <span className="tabular">{inrFull(l.planned)}</span> },
            { key: 'a', label: 'Actual', render: l => <span className={cx('tabular', l.over && 'font-semibold text-bad')}>{inrFull(l.actual)}</span> },
            { key: 'v', label: 'Variance', render: l => l.variance_pct === null ? '—' : <Badge tone={l.over ? 'rose' : l.variance_pct > 0 ? 'amber' : 'sage'}>{l.variance_pct > 0 ? '+' : ''}{l.variance_pct}%</Badge> },
            { key: 'h', label: '', mobile: 'hide', render: l => l.over && data.host_visible && <Button size="sm" variant="ghost" icon={Stamp} onClick={e => { e.stopPropagation(); run('hd', () => post(`/weddings/${wid}/budget/lines/${l.id}/host-decision`, {}), 'Decision request sent to host').then(reload) }}>Ask host</Button> },
          ]} />
        </Card>
      ) : (
        <Card>
          <DataTable rows={data.expenses} rowKey={e => e.id} onRow={setExp} empty={<Empty icon={Receipt} title="No expenses yet" />} cols={[
            { key: 'l', label: 'Expense', mobile: 'title', render: e => <span className="font-semibold">{e.label || '—'}{e.flagged && <AlertTriangle className="ml-1 inline size-3.5 text-warn" aria-label={e.flagged} />}</span> },
            { key: 'c', label: 'Category', mobile: 'sub', render: e => `${e.category || 'Unlinked'}${e.vendor_name ? ` · ${e.vendor_name}` : ''}` },
            { key: 'd', label: 'Date', render: e => date(e.date) },
            { key: 'a', label: 'Amount', render: e => <span className="tabular">{e.currency !== data.currency ? `${e.currency} ${e.amount.toLocaleString()} → ` : ''}{inrFull(e.amount_base)}</span> },
            { key: 's', label: 'Payment', render: e => <button onClick={ev => { ev.stopPropagation(); run('p', () => patch(`/weddings/${wid}/budget/expenses/${e.id}`, { payment_status: e.payment_status === 'paid' ? 'unpaid' : 'paid' })).then(reload) }}><Status s={e.payment_status === 'paid' ? 'done' : 'pending'} label={e.payment_status} /></button> },
            { key: 'f', label: '', mobile: 'meta', render: e => e.flagged ? <span className="text-xs text-warn">{e.flagged}</span> : null },
          ]} />
        </Card>
      )}
      <ExpenseModal e={exp} lines={data.lines} vendors={vendors || []} fx={data.fx} onClose={() => setExp(null)} onDone={() => { setExp(null); reload() }} />
      <LineModal l={line} vendors={vendors || []} onClose={() => setLine(null)} onDone={() => { setLine(null); reload() }} />
    </Wrap>
  )
}
function ExpenseModal({ e, lines, vendors, fx, onClose, onDone }: any) {
  const { wid } = useParams()
  const [f, setF] = useState<any>({})
  const [file, setFile] = useState<File | null>(null)
  const { run, busy } = useAction()
  useEffect(() => { if (e) { setF(e); setFile(null) } }, [e])
  const save = () => {
    if (f.id) return run('s', () => patch(`/weddings/${wid}/budget/expenses/${f.id}`, { label: f.label, line_id: f.line_id, payment_status: f.payment_status, flagged: f.flagged === '' ? null : f.flagged }), 'Saved').then(onDone)
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, String(v))); if (file) fd.append('file', file)
    return run('s', () => api('POST', `/weddings/${wid}/budget/expenses`, fd), (r: any) => r.flagged ? `Recorded — flagged: ${r.flagged}` : 'Expense recorded').then(onDone)
  }
  return (
    <Modal open={!!e} onClose={onClose} title={f.id ? 'Expense' : 'Record expense'} size="md" footer={<>{f.id && <Button variant="ghost" className="mr-auto text-bad" icon={Trash2} onClick={() => run('d', () => del(`/weddings/${wid}/budget/expenses/${f.id}`), 'Deleted').then(onDone)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy === 's'} onClick={save}>Save</Button></>}>
      {f.flagged && <div className="mb-3"><Callout tone="amber" action={<button className="text-sm font-semibold underline" onClick={() => setF({ ...f, flagged: '' })}>Not a duplicate</button>}>{f.flagged}</Callout></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Description" value={f.label || ''} onChange={x => setF({ ...f, label: x.target.value })} />
        <Select label="Budget line" value={f.line_id || ''} onChange={x => setF({ ...f, line_id: x.target.value })} placeholder="Unlinked" options={lines.map((l: any) => ({ value: l.id, label: `${l.category} · ${l.label || ''}` }))} />
        <Select label="Vendor" value={f.vendor_id || ''} onChange={x => setF({ ...f, vendor_id: x.target.value })} placeholder="None" options={vendors.map((v: any) => ({ value: v.id, label: v.name }))} disabled={!!f.id} />
        <Input label="Amount" type="number" value={f.amount ?? ''} onChange={x => setF({ ...f, amount: x.target.value })} disabled={!!f.id} />
        <Select label="Currency" value={f.currency || 'INR'} onChange={x => setF({ ...f, currency: x.target.value })} options={Object.keys(fx)} disabled={!!f.id} hint={f.currency && f.currency !== 'INR' ? `1 ${f.currency} = ₹${fx[f.currency]}` : undefined} />
        <Input label="Date" type="date" value={f.date || ''} onChange={x => setF({ ...f, date: x.target.value })} disabled={!!f.id} />
        <Select label="Payment status" value={f.payment_status || 'unpaid'} onChange={x => setF({ ...f, payment_status: x.target.value })} options={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partially paid' }, { value: 'paid', label: 'Paid' }]} />
        {!f.id && <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line p-3 text-sm sm:col-span-2"><Upload className="size-4 text-brand" />{file ? file.name : 'Attach invoice / receipt'}<input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg" onChange={x => setFile(x.target.files?.[0] || null)} /></label>}
      </div>
    </Modal>
  )
}
function LineModal({ l, vendors, onClose, onDone }: any) {
  const { wid } = useParams()
  const [f, setF] = useState<any>({})
  const { run, busy } = useAction()
  useEffect(() => { if (l) setF(l) }, [l])
  return (
    <Modal open={!!l} onClose={onClose} title={f.id ? 'Budget line' : 'New budget line'} size="sm" footer={<>{f.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/weddings/${wid}/budget/lines/${f.id}`), 'Deleted').then(onDone)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy === 's'} disabled={!f.category} onClick={() => run('s', () => f.id ? patch(`/weddings/${wid}/budget/lines/${f.id}`, { category: f.category, label: f.label, planned: +f.planned, vendor_id: f.vendor_id || null }) : post(`/weddings/${wid}/budget/lines`, { ...f, planned: +f.planned }), 'Saved').then(onDone)}>Save</Button></>}>
      <div className="space-y-3"><Input label="Category" value={f.category || ''} onChange={x => setF({ ...f, category: x.target.value })} placeholder="Decor" /><Input label="Label" value={f.label || ''} onChange={x => setF({ ...f, label: x.target.value })} /><Input label="Planned (₹)" type="number" value={f.planned ?? ''} onChange={x => setF({ ...f, planned: x.target.value })} /><Select label="Linked vendor quote" value={f.vendor_id || ''} onChange={x => setF({ ...f, vendor_id: x.target.value })} placeholder="None" options={vendors.map((v: any) => ({ value: v.id, label: v.name }))} /></div>
    </Modal>
  )
}
