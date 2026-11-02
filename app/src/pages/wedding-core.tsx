import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Copy, Crown, Download, ExternalLink, Filter, Lock, MailCheck, Merge, Plus, Radio, RefreshCw, Search, Send, Sparkles, Upload, UserPlus, Users, Wand2, MessageCircle, CheckCircle2, Clock, Trash2, Accessibility, BedDouble,
} from 'lucide-react'
import { useApi, get, post, patch, del } from '../api'
import { useMe } from '../auth'
import { useWedding } from '../shell'
import {
  Badge, Button, Callout, Card, CardHeader, Check, cx, DataTable, Divided, Empty, ErrorBox, Grid, Input, Loading, Modal, Progress, Row, Segmented, Select, Stat, Status, Textarea, Toggle, useAction, useToast, Avatar, Confirm,
} from '../ui'
import { ago, date, dateTime, hhmm, plural, titleCase, fromLocalInput } from '../format'

const Wrap = ({ children }: { children: React.ReactNode }) => <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{children}</div>
const copy = (t: string, toast: any) => { navigator.clipboard?.writeText(location.origin + t); toast('Link copied') }

// =====================================================================
// Wedding workspace overview
// =====================================================================
const DOMAINS: Record<string, { label: string; to: string }> = {
  guests: { label: 'Guests', to: 'guests' }, rsvp: { label: 'RSVP', to: 'rsvp' }, travel: { label: 'Travel', to: 'travel' }, rooms: { label: 'Rooms', to: 'rooms' },
  vendors: { label: 'Vendors', to: 'vendors' }, tasks: { label: 'Tasks', to: 'tasks' }, budget: { label: 'Budget', to: 'budget' },
}
export function Overview() {
  const { w } = useWedding()
  const nav = useNavigate()
  const toast = useToast()
  const me = useMe()
  const h = w.health
  return (
    <Wrap>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Grid cols={4}>
            <Stat label="Guests" value={w.counts.guests} sub={`${w.counts.attending} attending`} onClick={() => nav('guests')} />
            <Stat label="Functions" value={w.functions.length} sub={w.functions[0] ? `starts ${date(w.functions[0].date)}` : '—'} onClick={() => nav('calendar')} />
            <Stat label="Vendors" value={w.counts.vendors} sub={h.domains.vendors.metric} onClick={() => nav('vendors')} />
            <Stat label="Open tasks" value={w.counts.open_tasks} sub={h.domains.tasks.metric} onClick={() => nav('tasks')} />
          </Grid>
          <Card>
            <CardHeader title="Priority queue" sub={h.queue.length ? `${h.queue.filter((q: any) => q.severity === 'critical').length} critical · ${h.queue.length} total` : 'Nothing needs attention'} icon={AlertTriangle}
              action={w.status === 'live' || (h.days_out <= 1 && h.days_out >= 0) ? <Button size="sm" variant="danger" icon={Radio} onClick={() => nav('live')}>Command Center</Button> : null} />
            {h.queue.length ? <Divided>
              {h.queue.map((q: any, i: number) => (
                <Row key={i} onClick={() => nav(q.module)}>
                  <span className={cx('size-2.5 shrink-0 rounded-full', q.severity === 'critical' ? 'bg-bad' : q.severity === 'warning' ? 'bg-haldi' : 'bg-info')} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{q.title}</div><div className="text-xs text-mute">{DOMAINS[q.domain]?.label || titleCase(q.domain)}{q.next ? ` · Next: ${q.next}` : ''}</div></div>
                </Row>
              ))}
            </Divided> : <Empty icon={CheckCircle2} title="All clear" sub="SUTR will surface new exceptions here as they happen." />}
          </Card>
          <Card>
            <CardHeader title="Operational health" sub="Calculated live across every module" />
            <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              {Object.entries(h.domains).map(([k, d]: any) => (
                <button key={k} onClick={() => nav(DOMAINS[k].to)} className="text-left">
                  <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-semibold">{DOMAINS[k].label}</span><span className="text-xs text-mute">{d.metric}</span></div>
                  <Progress value={d.score} tone={d.score >= 80 ? 'sage' : d.score >= 60 ? 'amber' : 'rose'} />
                </button>
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Functions" icon={Sparkles} action={<Link to="setup" className="text-xs font-semibold text-brand">Edit</Link>} />
            <Divided>
              {w.functions.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="w-11 shrink-0 text-center"><div className="text-[11px] font-semibold text-mute">{date(f.date, { month: 'short' })}</div><div className="text-lg font-semibold leading-none">{date(f.date, { day: 'numeric' })}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{f.name}</div><div className="truncate text-xs text-mute">{hhmm(f.start_time)} · {f.venue}{f.dress_code ? ` · ${f.dress_code}` : ''}</div></div>
                  {f.live_status !== 'upcoming' && <Status s={f.live_status} />}
                </div>
              ))}
            </Divided>
          </Card>
          <Card>
            <CardHeader title="Hosts" sub="Secure link — no login needed" icon={Crown} />
            <Divided>
              {w.hosts.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={h.name} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{h.name}</div><div className="truncate text-xs text-mute">{h.relation} · {h.phone}</div></div>
                  <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(h.link, toast)}>Link</Button>
                  <a href={h.link} target="_blank" className="grid size-8 place-items-center rounded-lg hover:bg-wash" aria-label="Open host portal"><ExternalLink className="size-4 text-mute" /></a>
                </div>
              ))}
            </Divided>
          </Card>
          <Card>
            <CardHeader title="Team" icon={Users} action={me.can.team && <Link to="setup" className="text-xs font-semibold text-brand">Manage</Link>} />
            <div className="flex flex-wrap gap-2 p-4">{w.team.map((t: any) => <div key={t.id} className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1"><Avatar name={t.name} size={26} /><span className="text-xs"><b>{t.name.split(' ')[0]}</b> · {(t.responsibilities || []).join(', ') || t.title}</span></div>)}</div>
          </Card>
        </div>
      </div>
    </Wrap>
  )
}

// =====================================================================
// Guest operations
// =====================================================================
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (c === '"') q = false; else field += c }
    else if (c === '"') q = true
    else if (c === ',' || c === '\t') { cur.push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; cur.push(field); field = ''; if (cur.some(x => x.trim())) rows.push(cur); cur = [] }
    else field += c
  }
  cur.push(field); if (cur.some(x => x.trim())) rows.push(cur)
  const [head, ...body] = rows
  return (body || []).map(r => Object.fromEntries((head || []).map((h, i) => [h.trim(), (r[i] || '').trim()])))
}

export function Guests() {
  const { wid } = useParams()
  const { w, reload: reloadW } = useWedding()
  const me = useMe()
  const toast = useToast()
  const [sp] = useSearchParams()
  const { data, error, reload } = useApi<any[]>(`/weddings/${wid}/guests`)
  const [q, setQ] = useState(sp.get('q') || '')
  const [filter, setFilter] = useState('all')
  const [side, setSide] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<null | 'add' | 'import' | 'households' | 'dupes' | 'copy' | 'bulk'>(null)
  const [edit, setEdit] = useState<any>(null)
  const list = useMemo(() => (data || []).filter(g => {
    if (q && !`${g.name} ${g.phone || ''} ${g.household || ''}`.toLowerCase().includes(q.toLowerCase())) return false
    if (side && g.side !== side) return false
    if (filter === 'missing') return g.missing.length > 0
    if (filter === 'vip') return g.vip
    if (filter === 'stay') return g.needs_stay
    if (filter === 'pending') return g.rsvps.some((r: any) => r.status === 'pending')
    if (filter === 'attending') return g.rsvps.some((r: any) => r.status === 'attending')
    return true
  }), [data, q, filter, side])
  const done = () => { reload(); reloadW(); setModal(null); setSel(new Set()) }
  if (error) return <Wrap><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const missing = data.filter(g => g.missing.length).length
  const fnName = (id: string) => w.functions.find((f: any) => f.id === id)?.name
  return (
    <Wrap>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-2xl font-medium">Guest operations</h2><p className="text-sm text-mute">{data.length} guests · {new Set(data.map(g => g.household_id).filter(Boolean)).size} households · {data.filter(g => g.needs_stay).length} need stay</p></div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Wand2} onClick={() => setModal('households')}>Group households</Button>
          <Button icon={Merge} onClick={() => setModal('dupes')}>Duplicates</Button>
          <Button icon={Copy} onClick={() => setModal('copy')}>From past wedding</Button>
          <Button icon={Upload} onClick={() => setModal('import')}>Import CSV</Button>
          <Button variant="primary" icon={UserPlus} onClick={() => setModal('add')}>Add guest</Button>
        </div>
      </div>
      {missing > 0 && <div className="mb-4"><Callout tone="amber" action={<button className="text-sm font-semibold underline" onClick={() => setFilter('missing')}>Review</button>}>{plural(missing, 'guest')} missing operational info (phone, function access or stay dates). They're in the attention queue.</Callout></div>}
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, household" aria-label="Search guests" className="h-10 w-full rounded-xl border border-line pr-3 pl-9 text-sm focus:border-brand focus:outline-none" /></div>
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'pending', label: 'RSVP pending' }, { value: 'attending', label: 'Attending' }, { value: 'vip', label: 'VIP' }, { value: 'stay', label: 'Needs stay' }, { value: 'missing', label: 'Missing info', count: missing }]} />
          <Select aria-label="Side" value={side} onChange={e => setSide(e.target.value)} options={[{ value: 'bride', label: 'Bride side' }, { value: 'groom', label: 'Groom side' }]} placeholder="Both sides" className="sm:w-36" />
        </div>
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-50/50 px-4 py-2 text-sm">
            <b>{sel.size} selected</b>
            <Button size="sm" onClick={() => setModal('bulk')}>Bulk edit</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        )}
        <DataTable rows={list} rowKey={g => g.id} selectable selected={sel} onSelect={setSel} onRow={g => setEdit(g)}
          empty={<Empty icon={Users} title={data.length ? 'No guests match' : 'No guests yet'} sub={data.length ? 'Try a different filter.' : 'Import a CSV, copy from a past wedding, or add guests one by one.'} />}
          cols={[
            { key: 'name', label: 'Guest', mobile: 'title', render: g => <span className="flex items-center gap-2 font-semibold">{g.name}{g.vip ? <Crown className="size-3.5 text-haldi" aria-label="VIP" /> : null}{g.accessibility ? <Accessibility className="size-3.5 text-info" aria-label={g.accessibility} /> : null}{g.tags?.includes('host-added') && <Badge tone="sky">host added</Badge>}{g.tags?.includes('walk-in') && <Badge>walk-in</Badge>}</span> },
            { key: 'household', label: 'Household', mobile: 'sub', render: g => <span className="text-ink-2">{g.household || '—'}{g.side ? <span className="text-mute"> · {g.side}</span> : ''}</span> },
            { key: 'phone', label: 'Phone', render: g => g.phone ? <span className="tabular">{g.phone}</span> : <span className="text-mute">{g.age_group === 'child' ? 'child' : 'missing'}</span> },
            { key: 'rsvp', label: 'RSVP', render: g => { const a = g.rsvps.filter((r: any) => r.status === 'attending').length, p = g.rsvps.filter((r: any) => r.status === 'pending').length; return p ? <Status s="pending" label={`${p} pending`} /> : a ? <Status s="attending" label={`${a}/${g.rsvps.length}`} /> : g.rsvps.length ? <Status s="declined" /> : <Badge tone="rose">no functions</Badge> } },
            { key: 'travel', label: 'Travel', render: g => g.travel_status ? <Status s={g.travel_status} /> : <span className="text-mute">—</span> },
            { key: 'room', label: 'Room', render: g => g.room ? <span className="text-xs">{g.room}</span> : g.needs_stay ? <Badge tone="amber">needs room</Badge> : <span className="text-mute">—</span> },
            { key: 'missing', label: '', mobile: 'hide', render: g => g.missing.length ? <Badge tone="amber">missing {g.missing.join(', ')}</Badge> : null },
          ]} />
      </Card>
      <GuestModal open={modal === 'add' || !!edit} guest={edit} functions={w.functions} onClose={() => { setModal(null); setEdit(null) }} onSaved={() => { done(); setEdit(null) }} canDelete={me.can.guestsDelete} />
      <ImportModal open={modal === 'import'} onClose={() => setModal(null)} onDone={done} />
      <HouseholdModal open={modal === 'households'} onClose={() => setModal(null)} onDone={done} />
      <DupesModal open={modal === 'dupes'} onClose={() => setModal(null)} onDone={done} />
      <CopyFromModal open={modal === 'copy'} onClose={() => setModal(null)} onDone={done} />
      <BulkModal open={modal === 'bulk'} ids={[...sel]} functions={w.functions} onClose={() => setModal(null)} onDone={done} />
    </Wrap>
  )
}

function GuestModal({ open, guest, functions, onClose, onSaved, canDelete }: any) {
  const { wid } = useParams()
  const { run, busy } = useAction()
  const toast = useToast()
  const [f, setF] = useState<any>({})
  const [dup, setDup] = useState<any>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => {
    if (!open) return
    setDup(null)
    setF(guest ? { ...guest, functions: guest.rsvps.map((r: any) => r.function_id), dietary: (guest.dietary || []).join(', ') } : { name: '', phone: '', email: '', side: 'bride', household: '', relation: '', age_group: 'adult', vip: false, needs_stay: false, accessibility: '', functions: functions.map((x: any) => x.id), dietary: '' })
  }, [open, guest])
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))
  const save = async (force = false) => {
    const body = { ...f, dietary: f.dietary ? String(f.dietary).split(',').map((s: string) => s.trim()).filter(Boolean) : [], force, vip: f.vip ? 1 : 0, needs_stay: f.needs_stay ? 1 : 0 }
    try {
      if (guest) await patch(`/weddings/${wid}/guests/${guest.id}`, { name: body.name, phone: body.phone, email: body.email, side: body.side, relation: body.relation, age_group: body.age_group, vip: body.vip, needs_stay: body.needs_stay, accessibility: body.accessibility || null, functions: body.functions, dietary: body.dietary, stay_from: body.stay_from, stay_to: body.stay_to, notes: body.notes })
      else await post(`/weddings/${wid}/guests`, body)
      toast(guest ? 'Guest updated' : 'Guest added'); onSaved()
    } catch (e: any) {
      if (e.status === 409) setDup(e); else toast(e.message, 'error')
    }
  }
  const link = async () => { const r = await get<{ url: string }>(`/weddings/${wid}/guests/${guest.id}/link`); copy(r.url, toast) }
  return (
    <Modal open={open} onClose={onClose} title={guest ? guest.name : 'Add guest'} sub={guest ? `Code ${guest.code} · ${guest.household || 'no household'}` : 'Duplicates are checked automatically'} size="lg"
      footer={<>
        {guest && canDelete && <Button variant="ghost" className="mr-auto text-bad" icon={Trash2} onClick={() => setConfirmDel(true)}>Delete</Button>}
        {guest && <Button icon={Copy} onClick={link}>Guest link</Button>}
        <Button onClick={onClose}>Cancel</Button>
        {dup ? <Button variant="danger" onClick={() => save(true)}>Save anyway</Button> : <Button variant="primary" loading={busy === 'save'} onClick={() => save()}>Save</Button>}
      </>}>
      {dup && <div className="mb-4"><Callout tone="amber" icon={AlertTriangle}><b>{dup.message}</b>{dup.detail?.duplicates?.map((d: any, i: number) => <div key={i}>{d.reason}: {d.existing.name} {d.existing.phone}</div>)}{dup.detail?.late && <div>Final headcounts will change.</div>}</Callout></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" value={f.name || ''} onChange={e => set('name', e.target.value)} required />
        <Input label="WhatsApp number" value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+91…" />
        <Input label="Email" type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
        {!guest && <Input label="Household" value={f.household || ''} onChange={e => set('household', e.target.value)} placeholder="Kapoor Family" />}
        <Select label="Side" value={f.side || ''} onChange={e => set('side', e.target.value)} options={[{ value: 'bride', label: 'Bride' }, { value: 'groom', label: 'Groom' }]} />
        <Input label="Relation" value={f.relation || ''} onChange={e => set('relation', e.target.value)} />
        <Select label="Age group" value={f.age_group || 'adult'} onChange={e => set('age_group', e.target.value)} options={[{ value: 'adult', label: 'Adult' }, { value: 'child', label: 'Child' }]} />
        <Input label="Dietary needs" value={f.dietary || ''} onChange={e => set('dietary', e.target.value)} placeholder="Jain, nut allergy" />
        <Input label="Accessibility" value={f.accessibility || ''} onChange={e => set('accessibility', e.target.value)} placeholder="Wheelchair access" />
        <div className="flex flex-col justify-end gap-1"><Toggle label="VIP" checked={!!f.vip} onChange={v => set('vip', v)} /><Toggle label="Needs accommodation" checked={!!f.needs_stay} onChange={v => set('needs_stay', v)} /></div>
        {f.needs_stay ? <><Input label="Stay from" type="date" value={f.stay_from || ''} onChange={e => set('stay_from', e.target.value)} /><Input label="Stay to" type="date" value={f.stay_to || ''} onChange={e => set('stay_to', e.target.value)} /></> : null}
      </div>
      <div className="mt-4"><div className="mb-1.5 text-[13px] font-semibold text-ink-2">Invited to</div><div className="flex flex-wrap gap-x-5 gap-y-2">{functions.map((fn: any) => <Check key={fn.id} label={fn.name} checked={(f.functions || []).includes(fn.id)} onChange={c => set('functions', c ? [...(f.functions || []), fn.id] : f.functions.filter((x: string) => x !== fn.id))} />)}</div></div>
      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} danger title={`Delete ${guest?.name}?`} confirmLabel="Delete guest" body="Their RSVP, travel and room assignment will be removed and their personal link revoked." onConfirm={() => run('del', () => del(`/weddings/${wid}/guests/${guest.id}`), 'Guest deleted').then(() => { setConfirmDel(false); onSaved() })} />
    </Modal>
  )
}

function ImportModal({ open, onClose, onDone }: any) {
  const { wid } = useParams()
  const { run, busy } = useAction()
  const [raw, setRaw] = useState<Record<string, string>[] | null>(null)
  const [preview, setPreview] = useState<any>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [res, setRes] = useState<Record<string, string>>({})
  useEffect(() => { if (open) { setRaw(null); setPreview(null); setRes({}) } }, [open])
  const load = async (rows: Record<string, string>[], map?: any) => {
    setRaw(rows)
    const p = await run('prev', () => post(`/weddings/${wid}/guests/import/preview`, { rows, mapping: map }))
    if (p) { setPreview(p); setMapping(p.mapping) }
  }
  const onFile = async (f?: File) => { if (!f) return; if (/\.xlsx?$/i.test(f.name)) { alert('Save the sheet as CSV from Excel/Sheets (File → Download → CSV), then upload it here.'); return } load(parseCsv(await f.text())) }
  const sample = 'Name,Mobile,Side,Family,VIP,Stay,Functions,Dietary\nAnita Desai,+919812300011,Bride,Desai Family,yes,yes,"Sangeet, Wedding Ceremony",Jain\nRavi Desai,+919812300012,Bride,Desai Family,,yes,"Sangeet, Wedding Ceremony",\nKiran Rao,98123,Groom,Rao Family,,,Wedding Ceremony,\nPooja Kapoor,+919811100022,Bride,Kapoor Family,,yes,Sangeet,Vegan'
  const commit = async () => {
    const rows = preview.rows.map((r: any) => ({ ...r, _dup_id: preview.duplicates.find((d: any) => d.row === r._row)?.existing.id }))
    const r = await run('commit', () => post(`/weddings/${wid}/guests/import/commit`, { rows, resolutions: res }), (x: any) => `Imported ${x.created}, merged ${x.merged}, skipped ${x.skipped}`)
    if (r) onDone()
  }
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Import guests" sub="Upload → map columns → validate → resolve duplicates → create records"
      footer={preview ? <><Button onClick={() => { setPreview(null); setRaw(null) }}>Start over</Button><Button variant="primary" loading={busy === 'commit'} disabled={!preview.valid} onClick={commit}>Import {preview.valid} valid row(s)</Button></> : undefined}>
      {!preview ? (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-10 text-center hover:bg-canvas">
            <Upload className="size-6 text-brand" /><span className="font-semibold">Upload a CSV</span><span className="text-sm text-mute">Export from Excel or Google Sheets as .csv</span>
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
          <div className="text-center text-sm text-mute">or</div>
          <Button className="w-full" icon={Sparkles} loading={busy === 'prev'} onClick={() => load(parseCsv(sample))}>Try a sample file (includes an invalid row & a duplicate)</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div><div className="mb-2 text-sm font-semibold">Column mapping</div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">{preview.fields.map((fl: string) => <Select key={fl} label={titleCase(fl)} value={mapping[fl] || ''} onChange={e => { const m = { ...mapping, [fl]: e.target.value }; setMapping(m); load(raw!, m) }} placeholder="— skip —" options={preview.headers} />)}</div>
          </div>
          <div className="flex flex-wrap gap-2"><Badge tone="sage">{preview.valid} valid</Badge>{preview.invalid > 0 && <Badge tone="rose">{preview.invalid} with errors (skipped)</Badge>}{preview.duplicates.length > 0 && <Badge tone="amber">{preview.duplicates.length} possible duplicate(s)</Badge>}</div>
          {preview.duplicates.length > 0 && (
            <Card><CardHeader title="Resolve duplicates" />
              <Divided>{preview.duplicates.map((d: any) => (
                <div key={d.row} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex-1 text-sm"><b>Row {d.row}: {d.name}</b> ↔ existing <b>{d.existing.name}</b> {d.existing.phone}<div className="text-xs text-mute">{d.reason}</div></div>
                  <Segmented value={res[d.row] || 'keep'} onChange={v => setRes({ ...res, [d.row]: v })} options={[{ value: 'merge', label: 'Merge' }, { value: 'keep', label: 'Keep both' }, { value: 'ignore', label: 'Ignore row' }]} />
                </div>
              ))}</Divided>
            </Card>
          )}
          <div className="scroll-x rounded-xl border border-line">
            <table className="w-full text-xs"><thead><tr className="bg-canvas text-left text-mute"><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Side</th><th className="px-3 py-2">Household</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-line">{preview.rows.map((r: any) => <tr key={r._row} className={r._errors.length ? 'bg-bad-50/50' : ''}><td className="px-3 py-1.5">{r._row}</td><td className="px-3 py-1.5 font-semibold">{r.name || '—'}</td><td className="px-3 py-1.5">{r.phone}</td><td className="px-3 py-1.5">{r.side}</td><td className="px-3 py-1.5">{r.household}</td><td className="px-3 py-1.5">{r._errors.length ? <span className="text-bad">{r._errors.join('; ')}</span> : <span className="text-ok">OK</span>}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

function HouseholdModal({ open, onClose, onDone }: any) {
  const { wid } = useParams()
  const { data } = useApi<any[]>(open ? `/weddings/${wid}/households/suggest` : null)
  const { run, busy } = useAction()
  const [pick, setPick] = useState<Set<number>>(new Set())
  useEffect(() => { if (data) setPick(new Set(data.map((_, i) => i))) }, [data])
  return (
    <Modal open={open} onClose={onClose} title="Suggested households" sub="Grouped by shared phone numbers and surname + side" size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!pick.size} loading={busy === 'a'} onClick={() => run('a', () => post(`/weddings/${wid}/households/apply`, { groups: data!.filter((_, i) => pick.has(i)) }), 'Households created').then(onDone)}>Create {pick.size} household(s)</Button></>}>
      {!data ? <Loading /> : !data.length ? <Empty title="No suggestions" sub="Every guest already belongs to a household, or nobody shares a phone or surname." /> : (
        <Divided>{data.map((g, i) => <label key={i} className="flex cursor-pointer items-start gap-3 py-3"><input type="checkbox" className="mt-1 accent-[#0E6B66]" checked={pick.has(i)} onChange={() => { const s = new Set(pick); s.has(i) ? s.delete(i) : s.add(i); setPick(s) }} /><span><span className="block font-semibold">{g.name} <span className="font-normal text-mute">· {g.side}</span></span><span className="text-sm text-ink-2">{g.names.join(', ')}</span></span></label>)}</Divided>
      )}
    </Modal>
  )
}

function DupesModal({ open, onClose, onDone }: any) {
  const { wid } = useParams()
  const { data, reload } = useApi<any[]>(open ? `/weddings/${wid}/guests/duplicates` : null)
  const { run } = useAction()
  return (
    <Modal open={open} onClose={onClose} title="Possible duplicates" sub="Including the same person listed on both bride and groom sides" size="lg">
      {!data ? <Loading /> : !data.length ? <Empty icon={CheckCircle2} title="No duplicates found" /> : (
        <Divided>{data.map((d, i) => (
          <div key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm"><b>{d.a.name}</b> <span className="text-mute">{d.a.phone} · {d.a.side}</span><br /><b>{d.b.name}</b> <span className="text-mute">{d.b.phone} · {d.b.side}</span><div className="text-xs text-warn">{d.reason}</div></div>
            <div className="flex gap-2"><Button size="sm" onClick={() => run('m', () => post(`/weddings/${wid}/guests/merge`, { keep_id: d.a.id, merge_id: d.b.id }), 'Merged').then(() => { reload(); onDone() })}>Keep first</Button><Button size="sm" onClick={() => run('m', () => post(`/weddings/${wid}/guests/merge`, { keep_id: d.b.id, merge_id: d.a.id }), 'Merged').then(() => { reload(); onDone() })}>Keep second</Button></div>
          </div>
        ))}</Divided>
      )}
    </Modal>
  )
}

function CopyFromModal({ open, onClose, onDone }: any) {
  const { wid } = useParams()
  const { data } = useApi<any[]>(open ? '/weddings' : null)
  const { run, busy } = useAction()
  const [src, setSrc] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Copy guests from a past wedding" size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!src} loading={busy === 'c'} onClick={() => run('c', () => post(`/weddings/${wid}/guests/copy-from`, { source_wedding_id: src }), (r: any) => `Copied ${r.created}, skipped ${r.skipped} duplicate(s)`).then(onDone)}>Copy guests</Button></>}>
      <Select label="Source wedding" value={src} onChange={e => setSrc(e.target.value)} placeholder="Choose…" options={(data || []).filter(w => w.id !== wid).map(w => ({ value: w.id, label: `${w.name} (${w.guest_count})` }))} />
      <p className="mt-2 text-xs text-mute">Guests already on this wedding are skipped. RSVPs start fresh.</p>
    </Modal>
  )
}

function BulkModal({ open, ids, functions, onClose, onDone }: any) {
  const { wid } = useParams()
  const { run, busy } = useAction()
  const [p, setP] = useState<any>({})
  useEffect(() => { if (open) setP({}) }, [open])
  return (
    <Modal open={open} onClose={onClose} title={`Edit ${ids.length} guest(s)`} size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!Object.keys(p).length} loading={busy === 'b'} onClick={() => run('b', () => post(`/weddings/${wid}/guests/bulk`, { ids, patch: p }), 'Guests updated').then(onDone)}>Apply</Button></>}>
      <div className="space-y-4">
        <div><div className="mb-1.5 text-[13px] font-semibold text-ink-2">Set function access</div><div className="flex flex-wrap gap-x-5 gap-y-2">{functions.map((f: any) => <Check key={f.id} label={f.name} checked={(p.functions || []).includes(f.id)} onChange={c => setP({ ...p, functions: c ? [...(p.functions || []), f.id] : (p.functions || []).filter((x: string) => x !== f.id) })} />)}</div></div>
        <Input label="Add tag" value={p.add_tag || ''} onChange={e => setP({ ...p, add_tag: e.target.value || undefined })} placeholder="College friends" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="VIP" value={p.vip ?? ''} onChange={e => setP({ ...p, vip: e.target.value === '' ? undefined : +e.target.value })} placeholder="No change" options={[{ value: '1', label: 'Mark VIP' }, { value: '0', label: 'Not VIP' }]} />
          <Select label="Needs stay" value={p.needs_stay ?? ''} onChange={e => setP({ ...p, needs_stay: e.target.value === '' ? undefined : +e.target.value })} placeholder="No change" options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]} />
        </div>
      </div>
    </Modal>
  )
}

// =====================================================================
// RSVP operations
// =====================================================================
const CYCLE: Record<string, string> = { pending: 'attending', attending: 'declined', declined: 'pending' }
export function Rsvp() {
  const { wid } = useParams()
  const { reload: reloadW } = useWedding()
  const { data, error, reload } = useApi<any>(`/weddings/${wid}/rsvp`)
  const { run, busy } = useAction()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'pending'>('all')
  const [walk, setWalk] = useState(false)
  const [force, setForce] = useState<any>(null)
  if (error) return <Wrap><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const set = async (guest_id: string, function_id: string, status: string, f = false) => {
    try { await post(`/weddings/${wid}/rsvp/manual`, { guest_id, function_id, status, force: f }); reload() }
    catch (e: any) { if (e.status === 409) setForce({ guest_id, function_id, status, message: e.message }); else toast(e.message, 'error') }
  }
  const guests = data.guests.filter((g: any) => (!q || g.name.toLowerCase().includes(q.toLowerCase())) && (only === 'all' || Object.values(g.rsvps).some((r: any) => r.status === 'pending')))
  const totalPending = data.guests.filter((g: any) => Object.values(g.rsvps).some((r: any) => r.status === 'pending')).length
  return (
    <Wrap>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-2xl font-medium">RSVP operations</h2><p className="text-sm text-mute">Function-wise headcounts feed travel, rooms, catering and budget.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button icon={UserPlus} onClick={() => setWalk(true)}>Walk-in</Button>
          <Button icon={data.frozen ? Lock : Clock} onClick={() => run('fr', () => post(`/weddings/${wid}/rsvp/freeze`, { frozen: !data.frozen }), data.frozen ? 'RSVP reopened' : 'RSVP frozen — headcounts locked').then(reload)}>{data.frozen ? 'Unfreeze' : 'Freeze RSVP'}</Button>
          <Button variant="primary" icon={Send} loading={busy === 'l'} onClick={() => run('l', () => post(`/weddings/${wid}/rsvp/launch`), (r: any) => `Sent ${r.sent} request(s)${r.failed ? `, ${r.failed} failed` : ''}`).then(() => { reload(); reloadW() })}>Send RSVP requests</Button>
        </div>
      </div>
      {data.frozen && <div className="mb-4"><Callout tone="sky" icon={Lock}>RSVPs are frozen. Guests can't change their answers; planner changes are logged as post-freeze edits.</Callout></div>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {data.functions.map((f: any) => (
          <Card key={f.id} className="p-4">
            <div className="truncate text-sm font-semibold">{f.name}</div><div className="text-xs text-mute">{date(f.date)} · {hhmm(f.start_time)}</div>
            <div className="mt-3 text-3xl font-semibold tabular">{f.headcount}<span className="ml-1 text-sm font-medium text-mute">heads</span></div>
            <Progress className="mt-2" value={f.attending + f.declined} max={f.invited} tone="sage" />
            <div className="mt-2 flex justify-between text-[11px] text-mute"><span className="text-ok">{f.attending} yes</span><span className="text-warn">{f.pending} pending</span><span className="text-bad">{f.declined} no</span></div>
          </Card>
        ))}
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        {data.conflicts.length > 0 && (
          <Card><CardHeader title="Household conflicts" sub="Different members answered differently" icon={AlertTriangle} />
            <Divided>{data.conflicts.map((c: any, i: number) => <div key={i} className="px-5 py-3 text-sm"><b>{c.household}</b> · {c.function}<div className="mt-1 flex flex-wrap gap-2">{c.members.map((m: any) => <span key={m.id} className="inline-flex items-center gap-1">{m.name} <Status s={m.status} /></span>)}</div></div>)}</Divided>
          </Card>
        )}
        <Card><CardHeader title="Dietary summary" sub="Attending guests" />
          <div className="flex flex-wrap gap-2 p-4">{Object.entries(data.dietary).length ? Object.entries(data.dietary).map(([k, v]: any) => <Badge key={k} tone="sage">{k} · {v}</Badge>) : <span className="text-sm text-mute">No dietary needs recorded yet.</span>}</div>
        </Card>
      </div>
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find guest" aria-label="Find guest" className="h-10 w-full rounded-xl border border-line pr-3 pl-9 text-sm focus:border-brand focus:outline-none" /></div>
          <Segmented value={only} onChange={setOnly} options={[{ value: 'all', label: 'Everyone' }, { value: 'pending', label: 'Pending', count: totalPending }]} />
        </div>
        <p className="px-4 pt-2 text-xs text-mute">Tap a cell to record a manual response (cycles pending → attending → declined).</p>
        <div className="scroll-x">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-mute"><th className="px-4 py-2">Guest</th>{data.functions.map((f: any) => <th key={f.id} className="px-2 py-2 text-center">{f.name}</th>)}<th className="px-4 py-2">Reminders</th></tr></thead>
            <tbody className="divide-y divide-line">{guests.slice(0, 300).map((g: any) => (
              <tr key={g.id}>
                <td className="px-4 py-2"><div className="font-semibold">{g.name}{g.vip ? ' 👑' : ''}</div><div className="text-xs text-mute">{g.household}</div></td>
                {data.functions.map((f: any) => {
                  const r = g.rsvps[f.id]
                  return <td key={f.id} className="px-2 py-2 text-center">{r ? <button onClick={() => set(g.id, f.id, CYCLE[r.status] || 'attending')} aria-label={`${g.name} ${f.name}: ${r.status}`}><Status s={r.status} label={r.status === 'attending' && r.headcount > 1 ? `+${r.headcount - 1}` : r.status === 'attending' ? 'yes' : r.status === 'declined' ? 'no' : '…'} /></button> : <span className="text-line">—</span>}</td>
                })}
                <td className="px-4 py-2 text-xs text-mute">{g.requested ? `${g.reminders || 0} sent` : g.phone ? 'not invited yet' : 'no phone'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <WalkInModal open={walk} onClose={() => setWalk(false)} functions={data.functions} onDone={() => { setWalk(false); reload() }} />
      <Confirm open={!!force} onClose={() => setForce(null)} title="RSVP is frozen" body={force?.message} confirmLabel="Change anyway" onConfirm={() => { set(force.guest_id, force.function_id, force.status, true); setForce(null) }} />
    </Wrap>
  )
}
function WalkInModal({ open, onClose, functions, onDone }: any) {
  const { wid } = useParams()
  const { run, busy } = useAction()
  const [f, setF] = useState({ name: '', phone: '', function_id: '', headcount: 1 })
  return (
    <Modal open={open} onClose={onClose} title="Last-minute walk-in" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.name || !f.function_id} loading={busy === 'w'} onClick={() => run('w', () => post(`/weddings/${wid}/rsvp/walk-in`, { ...f, force: true }), 'Walk-in added & checked in').then(onDone)}>Add & check in</Button></>}>
      <div className="space-y-3"><Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /><Input label="Phone (optional)" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /><Select label="Function" value={f.function_id} onChange={e => setF({ ...f, function_id: e.target.value })} placeholder="Choose…" options={functions.map((x: any) => ({ value: x.id, label: x.name }))} /><Input label="Headcount" type="number" min={1} value={f.headcount} onChange={e => setF({ ...f, headcount: +e.target.value })} /></div>
    </Modal>
  )
}

// =====================================================================
// Communication center
// =====================================================================
export function Comms() {
  const { wid } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') || 'compose') as string
  const setTab = (t: string) => setSp({ tab: t })
  const { data: inbox, reload: ri } = useApi<any[]>(`/weddings/${wid}/messages?tab=inbox`)
  const { data: fails, reload: rf } = useApi<any[]>(`/weddings/${wid}/messages?tab=failures`)
  const open = (inbox || []).filter(m => !m.handled).length
  return (
    <Wrap>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-2xl font-medium">Communication center</h2><p className="text-sm text-mute">WhatsApp-first, personalized, with replies routed into the right workflow automatically.</p></div>
      </div>
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'compose', label: 'Compose' }, { value: 'campaigns', label: 'Sent & scheduled' }, { value: 'inbox', label: 'Inbox', count: open }, { value: 'failures', label: 'Failure queue', count: fails?.length }, { value: 'all', label: 'All messages' }, { value: 'templates', label: 'Templates' }]} />
      {tab === 'compose' && <Compose onSent={() => setTab('campaigns')} />}
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'inbox' && <InboxView items={inbox} reload={ri} />}
      {tab === 'failures' && <Failures items={fails} reload={rf} />}
      {tab === 'all' && <AllMessages />}
      {tab === 'templates' && <Templates />}
    </Wrap>
  )
}

function Compose({ onSent }: { onSent: () => void }) {
  const { wid } = useParams()
  const { w } = useWedding()
  const me = useMe()
  const { data: templates } = useApi<any[]>('/templates')
  const { run, busy } = useAction()
  const [kind, setKind] = useState<'broadcast' | 'campaign'>('broadcast')
  const [type, setType] = useState('guests')
  const [flt, setFlt] = useState<any>({})
  const [body, setBody] = useState('')
  const [tpl, setTpl] = useState('')
  const [when, setWhen] = useState('')
  const [steps, setSteps] = useState<{ offset_hours: number; body: string }[]>([])
  const [pv, setPv] = useState<any>(null)
  const audience = { type, filter: flt }
  const vars = ['first_name', 'name', 'wedding', 'couple', 'link', 'hotel', 'room', 'pickup', 'venue', 'date']
  const preview = () => run('p', () => post(`/weddings/${wid}/comms/preview`, { audience, body: tpl ? undefined : body, template_id: tpl || undefined })).then(setPv)
  useEffect(() => { setPv(null) }, [type, JSON.stringify(flt), body, tpl])
  const send = () => run('s', () => post(`/weddings/${wid}/comms/send`, { kind, audience, body: tpl ? undefined : body, template_id: tpl || undefined, scheduled_at: fromLocalInput(when), steps: kind === 'campaign' ? steps : [] }), (r: any) => `${when ? 'Scheduled' : 'Sent'} to ${r.recipients} · ${r.failed} failed${r.duplicates_skipped ? ` · ${r.duplicates_skipped} duplicates skipped` : ''}`).then(r => r && onSent())
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card className="space-y-5 p-5">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'broadcast', label: 'Broadcast' }, { value: 'campaign', label: 'Campaign sequence' }]} />
        {!me.can.broadcast && kind === 'broadcast' && <Callout tone="rose" icon={Lock}>Your role can't send broadcasts. Ask a planner to enable it.</Callout>}
        <div>
          <div className="mb-2 text-sm font-semibold">1 · Audience</div>
          <Segmented value={type} onChange={t => { setType(t); setFlt({}) }} options={[{ value: 'guests', label: 'Guests' }, { value: 'hosts', label: 'Hosts' }, { value: 'vendors', label: 'Vendors' }]} />
          {type === 'guests' && <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Select label="Side" value={flt.side || ''} onChange={e => setFlt({ ...flt, side: e.target.value || undefined })} placeholder="Both" options={['bride', 'groom']} />
            <Select label="Function" value={flt.function_id || ''} onChange={e => setFlt({ ...flt, function_id: e.target.value || undefined })} placeholder="Any" options={w.functions.map((f: any) => ({ value: f.id, label: f.name }))} />
            <Select label="RSVP" value={flt.rsvp_status || ''} onChange={e => setFlt({ ...flt, rsvp_status: e.target.value || undefined })} placeholder="Any" options={['attending', 'pending', 'declined']} />
            <div className="flex flex-wrap gap-x-4 gap-y-2 sm:col-span-3">
              {[['vip', 'VIP only'], ['needs_stay', 'Needs stay'], ['travel_pending', 'Travel pending'], ['has_pickup', 'Has pickup'], ['has_room', 'Has room']].map(([k, l]) => <Check key={k} label={l} checked={!!flt[k]} onChange={c => setFlt({ ...flt, [k]: c || undefined })} />)}
            </div>
          </div>}
          {type === 'vendors' && <Select className="mt-3" label="Function" value={flt.function_id || ''} onChange={e => setFlt({ ...flt, function_id: e.target.value || undefined })} placeholder="All vendors" options={w.functions.map((f: any) => ({ value: f.id, label: f.name }))} />}
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">2 · Message</div>
          <Select value={tpl} onChange={e => setTpl(e.target.value)} placeholder="Write a custom message" options={(templates || []).map(t => ({ value: t.id, label: `${t.name} · ${t.purpose}` }))} aria-label="Template" />
          {tpl ? <div className="mt-2 rounded-xl bg-canvas p-3 text-sm text-ink-2">{templates?.find(t => t.id === tpl)?.body}</div> : <>
            <Textarea className="mt-2" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Hi {{first_name}}, …" aria-label="Message body" />
            <div className="mt-2 flex flex-wrap gap-1.5">{vars.map(v => <button key={v} onClick={() => setBody(b => `${b}{{${v}}}`)} className="rounded-md bg-wash px-2 py-0.5 text-xs font-semibold text-ink-2 hover:bg-line">{`{{${v}}}`}</button>)}</div>
          </>}
        </div>
        {kind === 'campaign' && <div>
          <div className="mb-2 text-sm font-semibold">3 · Follow-ups</div>
          {steps.map((s, i) => <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]"><Input aria-label="Hours after" type="number" value={s.offset_hours} onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, offset_hours: +e.target.value } : x))} /><Input aria-label="Follow-up text" value={s.body} onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} placeholder="Reminder text" /><Button variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setSteps(steps.filter((_, j) => j !== i))} /></div>)}
          <Button size="sm" icon={Plus} onClick={() => setSteps([...steps, { offset_hours: 24, body: 'Reminder: {{first_name}}, ' }])}>Add follow-up (hours after previous)</Button>
        </div>}
        <div><div className="mb-2 text-sm font-semibold">{kind === 'campaign' ? '4' : '3'} · When</div><Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} hint="Leave empty to send now" label="Schedule" /></div>
      </Card>
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><div className="font-semibold">Preview</div><Button size="sm" loading={busy === 'p'} onClick={preview} disabled={!body && !tpl}>Resolve variables</Button></div>
          {pv ? <div className="space-y-3">
            <div className="text-sm"><b>{pv.recipients}</b> recipient(s)</div>
            {pv.missing.length > 0 && <Callout tone="amber">Some recipients have no value for <b>{pv.missing.map((m: string) => `{{${m}}}`).join(', ')}</b> — they'll see a placeholder.</Callout>}
            {pv.quiet_hours && !when && <Callout tone="sky" icon={Clock}>It's within quiet hours. Consider scheduling for the morning.</Callout>}
            {pv.samples.map((s: any, i: number) => <div key={i} className="rounded-2xl rounded-tl-sm bg-[#e7f6dd] p-3 text-sm whitespace-pre-wrap shadow-card"><div className="mb-1 text-[11px] font-semibold text-ok">To {s.to}</div>{s.text}</div>)}
          </div> : <p className="text-sm text-mute">Resolve variables to see exactly what recipients get.</p>}
        </Card>
        <Button variant="primary" size="lg" className="w-full" icon={Send} loading={busy === 's'} disabled={(!body && !tpl) || (kind === 'broadcast' && !me.can.broadcast)} onClick={send}>{when ? 'Schedule' : 'Send now'}</Button>
      </div>
    </div>
  )
}

function Campaigns() {
  const { wid } = useParams()
  const { data, reload } = useApi<any[]>(`/weddings/${wid}/campaigns`)
  const { run } = useAction()
  if (!data) return <Loading />
  return (
    <Card>
      <DataTable rows={data} rowKey={c => c.id} empty={<Empty icon={Send} title="Nothing sent yet" />}
        cols={[
          { key: 'n', label: 'Message', mobile: 'title', render: c => <span className="line-clamp-1">{c.name}</span> },
          { key: 'k', label: 'Type', render: c => <Badge>{c.kind}</Badge> },
          { key: 'w', label: 'When', mobile: 'sub', render: c => c.scheduled_at ? `Scheduled ${dateTime(c.scheduled_at)}` : ago(c.created_at) },
          { key: 's', label: 'Delivery', render: c => <span className="flex items-center gap-2 text-xs"><span className="text-ok">{c.delivered}/{c.total} delivered</span><span className="text-info">{c.read} read</span>{c.failed > 0 && <span className="text-bad">{c.failed} failed</span>}{c.queued > 0 && <span className="text-warn">{c.queued} queued</span>}</span> },
          { key: 'st', label: 'Status', render: c => <span className="flex items-center gap-2"><Status s={c.status} />{c.queued > 0 && c.status !== 'cancelled' && <button className="text-xs font-semibold text-bad underline" onClick={() => run('x', () => post(`/weddings/${wid}/campaigns/${c.id}/cancel`), 'Scheduled sends cancelled').then(reload)}>Cancel</button>}</span> },
        ]} />
    </Card>
  )
}

const INTENT_LABEL: Record<string, string> = { rsvp_yes: 'RSVP: yes', rsvp_no: 'RSVP: no', travel_ticket: 'Travel ticket', vendor_delay: 'Vendor delay', vendor_confirm: 'Vendor confirmed', vendor_arrived: 'Vendor arrived', vendor_enroute: 'En route', vendor_cancel: 'Vendor cancelled', host_approve: 'Host approved', host_changes: 'Host: changes', opt_out: 'Opted out', unclear: 'Needs a human' }
function InboxView({ items, reload }: any) {
  const [thread, setThread] = useState<any>(null)
  if (!items) return <Loading />
  return (
    <Card>
      {!items.length ? <Empty icon={MessageCircle} title="No replies yet" sub="Guest, host and vendor replies land here. Clear intents (RSVP, delays, tickets) update their workflows automatically." /> : (
        <Divided>{items.map((m: any) => (
          <Row key={m.id} onClick={() => setThread(m)} className={!m.handled ? 'bg-brand-50/30' : ''}>
            <Avatar name={m.party_name} />
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate font-semibold">{m.party_name}</span><Badge>{m.party_kind}</Badge></div><div className="truncate text-sm text-ink-2">{m.body}</div></div>
            <div className="hidden flex-col items-end gap-1 sm:flex"><Badge tone={m.intent === 'unclear' ? 'amber' : 'sage'}>{INTENT_LABEL[m.intent] || m.intent}</Badge><span className="text-[11px] text-mute">{ago(m.created_at)}</span></div>
          </Row>
        ))}</Divided>
      )}
      <ThreadModal msg={thread} onClose={() => { setThread(null); reload() }} />
    </Card>
  )
}
export function ThreadModal({ msg, onClose }: { msg: any; onClose: () => void }) {
  const { wid } = useParams()
  const { data, reload } = useApi<any[]>(msg ? `/weddings/${wid}/messages/thread/${msg.party_kind}/${msg.party_id}` : null)
  const [text, setText] = useState('')
  const { run, busy } = useAction()
  const send = async () => { await run('r', () => post(`/weddings/${wid}/messages/reply`, { party_kind: msg.party_kind, party_id: msg.party_id, body: text, reply_to: msg.id }), 'Reply sent'); setText(''); reload() }
  return (
    <Modal open={!!msg} onClose={onClose} title={msg?.party_name} sub={`${msg?.party_kind} · WhatsApp`} size="md"
      footer={<div className="flex w-full gap-2"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && text && send()} placeholder="Type a reply…" aria-label="Reply" className="h-10 flex-1 rounded-xl border border-line px-3 text-sm focus:border-brand focus:outline-none" /><Button variant="primary" icon={Send} disabled={!text} loading={busy === 'r'} onClick={send}>Send</Button>{msg && !msg.handled && <Button onClick={() => run('h', () => post(`/weddings/${wid}/messages/${msg.id}/resolve`), 'Marked handled').then(onClose)}>Done</Button>}</div>}>
      <div className="space-y-2 rounded-2xl bg-[#efeae2] p-3">
        {(data || []).map(m => (
          <div key={m.id} className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-card', m.direction === 'out' ? 'ml-auto rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-white')}>
            {m.body}<div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-mute">{ago(m.created_at)}{m.direction === 'out' && <span className={m.status === 'read' ? 'text-info' : m.status === 'failed' ? 'text-bad' : ''}>{m.status === 'failed' ? '⚠ failed' : m.status === 'read' ? '✓✓' : '✓'}</span>}{m.intent && m.direction === 'in' && <Badge tone={m.intent === 'unclear' ? 'amber' : 'sage'}>{INTENT_LABEL[m.intent]}</Badge>}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function Failures({ items, reload }: any) {
  const { wid } = useParams()
  const { run } = useAction()
  const [fix, setFix] = useState<any>(null)
  const [phone, setPhone] = useState('')
  if (!items) return <Loading />
  const reason: Record<string, string> = { invalid_number: 'Invalid number', opt_out: 'Opted out', api_outage: 'WhatsApp outage (auto-retry)', invalid_email: 'Invalid email' }
  return (
    <Card>
      {!items.length ? <Empty icon={CheckCircle2} title="No failed messages" /> : (
        <DataTable rows={items} rowKey={m => m.id} cols={[
          { key: 'p', label: 'Recipient', mobile: 'title', render: m => <span>{m.party_name} <span className="text-xs text-mute">· {m.party_kind}</span></span> },
          { key: 'n', label: 'Number', render: m => <span className="tabular">{m.phone || '—'}</span> },
          { key: 'r', label: 'Reason', render: m => <Badge tone={m.fail_reason === 'api_outage' ? 'amber' : 'rose'}>{reason[m.fail_reason] || m.fail_reason}</Badge> },
          { key: 'b', label: 'Message', mobile: 'sub', render: m => <span className="line-clamp-1 text-xs text-ink-2">{m.body}</span> },
          { key: 'a', label: '', render: m => <span className="flex gap-1.5">
            {m.fail_reason !== 'opt_out' && <Button size="sm" onClick={() => { setFix(m); setPhone(m.phone || '') }}>Fix & retry</Button>}
            <Button size="sm" variant="ghost" onClick={() => run('h', () => post(`/weddings/${wid}/messages/${m.id}/resolve`, { manual: true }), 'Marked as contacted manually').then(reload)}>Contacted manually</Button>
          </span> },
        ]} />
      )}
      <Modal open={!!fix} onClose={() => setFix(null)} title="Correct number & retry" size="sm" footer={<><Button onClick={() => setFix(null)}>Cancel</Button><Button variant="primary" onClick={() => run('f', () => post(`/weddings/${wid}/messages/${fix.id}/retry`, { phone }), (r: any) => r.status === 'failed' ? `Still failing: ${r.fail_reason}` : 'Delivered').then(() => { setFix(null); reload() })}>Retry</Button></>}>
        <Input label={`New number for ${fix?.party_name}`} value={phone} onChange={e => setPhone(e.target.value)} hint="Also updates their record" />
      </Modal>
    </Card>
  )
}
function AllMessages() {
  const { wid } = useParams()
  const { data } = useApi<any[]>(`/weddings/${wid}/messages`)
  const [thread, setThread] = useState<any>(null)
  if (!data) return <Loading />
  return (
    <Card>
      <DataTable rows={data} rowKey={m => m.id} onRow={setThread} cols={[
        { key: 'd', label: '', render: m => <span className={cx('text-xs font-bold', m.direction === 'in' ? 'text-info' : 'text-mute')}>{m.direction === 'in' ? 'IN' : 'OUT'}</span>, mobile: 'hide' },
        { key: 'p', label: 'With', mobile: 'title', render: m => <span>{m.party_name} <span className="text-xs text-mute">· {m.party_kind}</span></span> },
        { key: 'b', label: 'Message', mobile: 'sub', render: m => <span className="line-clamp-1 text-ink-2">{m.body}</span> },
        { key: 's', label: 'Status', render: m => <Status s={m.status} /> },
        { key: 't', label: 'When', render: m => <span className="text-xs text-mute">{ago(m.created_at)}</span> },
      ]} />
      <ThreadModal msg={thread} onClose={() => setThread(null)} />
    </Card>
  )
}
function Templates() {
  const { data, reload } = useApi<any[]>('/templates')
  const { run } = useAction()
  const [e, setE] = useState<any>(null)
  if (!data) return <Loading />
  return (
    <Card>
      <CardHeader title="Message templates" sub="Shared across your agency" action={<Button size="sm" icon={Plus} onClick={() => setE({ name: '', purpose: 'general', body: '' })}>New</Button>} />
      <Divided>{data.map(t => <Row key={t.id} onClick={() => setE(t)}><div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-semibold">{t.name}<Badge>{t.purpose}</Badge></div><div className="truncate text-sm text-mute">{t.body}</div></div></Row>)}</Divided>
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Edit template' : 'New template'} footer={<>{e?.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/templates/${e.id}`), 'Deleted').then(() => { setE(null); reload() })}>Delete</Button>}<Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" onClick={() => run('s', () => e.id ? patch(`/templates/${e.id}`, e) : post('/templates', e), 'Template saved').then(() => { setE(null); reload() })}>Save</Button></>}>
        {e && <div className="space-y-3"><Input label="Name" value={e.name} onChange={x => setE({ ...e, name: x.target.value })} /><Input label="Purpose" value={e.purpose} onChange={x => setE({ ...e, purpose: x.target.value })} /><Textarea label="Body" rows={5} value={e.body} onChange={x => setE({ ...e, body: x.target.value })} hint="Use {{first_name}}, {{link}}…" /></div>}
      </Modal>
    </Card>
  )
}
