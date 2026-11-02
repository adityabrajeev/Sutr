import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Ban, Calendar as CalIcon, Camera, Check as CheckIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, Crown, Eye, FileText, FolderOpen, History, Image, LayoutList, Columns3, Megaphone, Plus, Radio, RotateCcw, Search, Send, Share2, ShieldAlert, Siren, Stamp, Trash2, Truck, Upload, Users, UserCheck, Archive, ListChecks, Play, SkipForward, Phone, Plane, X,
} from 'lucide-react'
import { useApi, post, patch, del, api, fileUrl, get } from '../api'
import { useMe } from '../auth'
import { useWedding, Page } from '../shell'
import { Avatar, Badge, Button, Callout, Card, CardHeader, Check, Confirm, cx, DataTable, Divided, Empty, ErrorBox, Grid, Input, Loading, Modal, PageHeader, Progress, Row, Segmented, Select, Stat, Status, Textarea, Toggle, useAction, useToast } from '../ui'
import { ago, date, dateTime, hhmm, plural, time, titleCase, toLocalInput, fromLocalInput, daysTo } from '../format'

const Wrap = ({ children, scoped }: { children: React.ReactNode; scoped?: boolean }) => scoped ? <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{children}</div> : <Page wide>{children}</Page>

// =====================================================================
// Tasks & SOP engine
// =====================================================================
const COLS = ['todo', 'in_progress', 'blocked', 'review', 'done'] as const
export function Tasks({ scoped }: { scoped?: boolean }) {
  const { wid } = useParams()
  const me = useMe()
  const [sp, setSp] = useSearchParams()
  const filter = sp.get('filter') || 'open'
  const [view, setView] = useState<'list' | 'board'>('list')
  const [tab, setTab] = useState<'tasks' | 'sops'>('tasks')
  const { data, error, reload } = useApi<any[]>(`/tasks?filter=${filter === 'all' ? '' : filter}${wid ? `&wedding_id=${wid}` : ''}`)
  const { data: team } = useApi<any>('/team')
  const { data: sops } = useApi<any[]>('/sops')
  const [open, setOpen] = useState<any>(null)
  const [create, setCreate] = useState(false)
  const [applySop, setApplySop] = useState(false)
  const members = (team?.members || []).filter((m: any) => m.status === 'active')
  if (error) return <Wrap scoped={scoped}><ErrorBox error={error} retry={reload} /></Wrap>
  return (
    <Wrap scoped={scoped}>
      {scoped ? <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-medium">Tasks & SOPs</h2><p className="text-sm text-mute">Owners, dependencies, proof and escalation.</p></div><div className="flex gap-2"><Button icon={ListChecks} onClick={() => setApplySop(true)}>Apply SOP</Button><Button variant="primary" icon={Plus} onClick={() => setCreate(true)}>New task</Button></div></div>
        : <PageHeader title="Tasks" sub={me.admin ? 'Across all weddings' : 'Assigned to you'} actions={<Button variant="primary" icon={Plus} onClick={() => setCreate(true)}>New task</Button>} />}
      {!scoped && me.admin && <Segmented className="mb-3" value={tab} onChange={setTab} options={[{ value: 'tasks', label: 'Tasks' }, { value: 'sops', label: 'SOP library' }]} />}
      {tab === 'sops' ? <SopLibrary sops={sops || []} /> : <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented value={filter} onChange={f => setSp({ filter: f })} options={[{ value: 'open', label: 'Open' }, { value: 'mine', label: 'Mine' }, { value: 'overdue', label: 'Overdue' }, { value: 'blocked', label: 'Blocked' }, { value: 'review', label: 'Needs review' }, { value: 'all', label: 'All' }]} />
          <Segmented value={view} onChange={setView} options={[{ value: 'list', label: <LayoutList className="size-4" aria-label="List" /> }, { value: 'board', label: <Columns3 className="size-4" aria-label="Board" /> }]} />
        </div>
        {!data ? <Loading /> : view === 'list' ? (
          <Card>
            <DataTable rows={data} rowKey={t => t.id} onRow={setOpen} empty={<Empty icon={CheckCircle2} title="No tasks here" />} cols={[
              { key: 't', label: 'Task', mobile: 'title', render: t => <span className="flex items-center gap-2"><span className={cx('size-2 shrink-0 rounded-full', t.priority === 'high' ? 'bg-rose' : t.priority === 'medium' ? 'bg-marigold' : 'bg-line')} /><span className={cx('font-semibold', t.status === 'done' && 'text-mute line-through')}>{t.title}</span>{t.escalated ? <Badge tone="rose">escalated</Badge> : null}{(t.depends_on || []).length > 0 && <Badge>depends on {t.depends_on.length}</Badge>}</span> },
              ...(!scoped ? [{ key: 'w', label: 'Wedding', mobile: 'sub' as const, render: (t: any) => t.wedding || 'Agency' }] : []),
              { key: 'o', label: 'Owner', render: t => t.owner_name || <span className="text-amber">unassigned</span> },
              { key: 'd', label: 'Due', render: t => t.due_at ? <span className={cx(t.status !== 'done' && t.due_at < new Date().toISOString() && 'font-semibold text-rose')}>{dateTime(t.due_at)}</span> : '—' },
              { key: 'c', label: 'Checklist', mobile: 'hide', render: t => (t.checklist || []).length ? <span className="text-xs">{t.checklist.filter((c: any) => c.done).length}/{t.checklist.length}</span> : null },
              { key: 's', label: 'Status', render: t => <Status s={t.status} /> },
            ]} />
          </Card>
        ) : (
          <div className="scroll-x -mx-4 flex gap-3 px-4 pb-2">
            {COLS.map(c => (
              <div key={c} className="w-72 shrink-0 rounded-2xl bg-sand/60 p-2">
                <div className="mb-2 flex items-center justify-between px-2 pt-1"><Status s={c} /><span className="text-xs text-mute">{data.filter(t => t.status === c).length}</span></div>
                <div className="space-y-2">{data.filter(t => t.status === c).map(t => (
                  <button key={t.id} onClick={() => setOpen(t)} className="w-full rounded-xl border border-line bg-card p-3 text-left shadow-card hover:border-saffron/40">
                    <div className="text-sm font-semibold">{t.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-mute"><span>{t.owner_name || 'unassigned'}</span><span className={cx(t.due_at < new Date().toISOString() && t.status !== 'done' && 'text-rose')}>{t.due_at ? date(t.due_at) : ''}</span></div>
                    {t.blocked_reason && t.status === 'blocked' && <div className="mt-1.5 text-xs text-rose">⛔ {t.blocked_reason}</div>}
                  </button>
                ))}</div>
              </div>
            ))}
          </div>
        )}
      </>}
      <TaskDrawer task={open} members={members} onClose={() => setOpen(null)} onChanged={() => { reload(); }} />
      <CreateTask open={create} onClose={() => setCreate(false)} members={members} wid={wid} onDone={() => { setCreate(false); reload() }} />
      <Modal open={applySop} onClose={() => setApplySop(false)} title="Apply an SOP" sub="Creates the SOP's tasks with due dates relative to the wedding date" size="sm">
        <Divided>{(sops || []).map(s => <Row key={s.id} onClick={() => post(`/weddings/${wid}/sops/${s.id}/apply`, {}).then(() => { setApplySop(false); reload() })}><div className="flex-1"><div className="font-semibold">{s.name}</div><div className="text-xs text-mute">{s.steps?.length} tasks · {s.description}</div></div></Row>)}</Divided>
      </Modal>
    </Wrap>
  )
}

function TaskDrawer({ task, members, onClose, onChanged }: any) {
  const me = useMe()
  const toast = useToast()
  const [t, setT] = useState<any>(null)
  const [reason, setReason] = useState('')
  const [proof, setProof] = useState('')
  const [mode, setMode] = useState<null | 'block' | 'proof' | 'rework'>(null)
  const { busy, raw } = useAction()
  useEffect(() => { setT(task); setMode(null); setReason(''); setProof('') }, [task])
  if (!t) return null
  const act = async (action: string, extra: any = {}) => {
    try { const r = await raw(action, () => post(`/tasks/${t.id}/action`, { action, ...extra })); setT({ ...t, ...r }); setMode(null); onChanged(); toast(`Task ${action === 'complete' && r.status === 'review' ? 'sent for review' : action}`) }
    catch (e: any) {
      if (e.status === 409 && e.detail?.dependency && window.confirm(`${e.message}\n\nStart anyway?`)) act(action, { ...extra, override: true })
      else if (e.status === 409 && /checklist/.test(e.message) && window.confirm(`${e.message}. Complete anyway?`)) act(action, { ...extra, override: true })
      else if (e.status === 422 && /proof/.test(e.message)) setMode('proof')
    }
  }
  const save = async (p: any) => { try { const r = await patch(`/tasks/${t.id}`, { ...p, if_updated_at: t.updated_at }); setT({ ...t, ...r }); onChanged() } catch (e: any) { toast(e.message, 'error') } }
  const overdue = t.status !== 'done' && t.due_at && t.due_at < new Date().toISOString()
  return (
    <Modal open={!!task} onClose={onClose} title={t.title} sub={`${t.wedding || 'Agency'}${t.category ? ` · ${t.category}` : ''}${t.source?.startsWith('automation') ? ' · created by automation' : ''}`} size="lg"
      footer={<div className="flex w-full flex-wrap gap-2">
        {t.status === 'todo' && <Button variant="primary" icon={Play} loading={busy === 'start'} onClick={() => act('start')}>Start</Button>}
        {['todo', 'in_progress'].includes(t.status) && <Button icon={Ban} onClick={() => setMode('block')}>Blocked</Button>}
        {t.status === 'blocked' && <Button onClick={() => act('unblock')}>Unblock</Button>}
        {['todo', 'in_progress'].includes(t.status) && <Button variant="success" icon={CheckIcon} loading={busy === 'complete'} onClick={() => t.requires_proof && !t.proof ? setMode('proof') : act('complete')}>Complete</Button>}
        {t.status === 'review' && me.admin && <><Button variant="success" onClick={() => act('approve')}>Approve</Button><Button onClick={() => setMode('rework')}>Return for rework</Button></>}
        {t.status === 'done' && <Button icon={RotateCcw} onClick={() => act('reopen')}>Reopen</Button>}
        <Button variant="ghost" className="ml-auto text-rose" icon={Trash2} onClick={() => window.confirm('Delete this task?') && del(`/tasks/${t.id}`).then(() => { onChanged(); onClose() })}>Delete</Button>
      </div>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Status s={t.status} /><Badge tone={t.priority === 'high' ? 'rose' : t.priority === 'medium' ? 'amber' : 'neutral'}>{t.priority} priority</Badge>{t.requires_proof ? <Badge tone="sky">proof required</Badge> : null}{overdue && <Badge tone="rose">overdue</Badge>}</div>
        {t.status === 'blocked' && <Callout tone="rose" icon={Ban}><b>Blocked:</b> {t.blocked_reason}</Callout>}
        {t.review_note && <Callout tone="amber">Planner note: {t.review_note}</Callout>}
        {mode === 'block' && <div className="flex gap-2"><Input className="flex-1" value={reason} onChange={e => setReason(e.target.value)} placeholder="What's blocking this?" aria-label="Blocker" /><Button variant="danger" disabled={!reason} onClick={() => act('block', { reason })}>Mark blocked</Button></div>}
        {mode === 'proof' && <div className="space-y-2"><Textarea label="Proof of completion" value={proof} onChange={e => setProof(e.target.value)} placeholder="Photo link, note, or document name" /><Button variant="success" disabled={!proof} onClick={() => act('complete', { proof })}>Submit for review</Button></div>}
        {mode === 'rework' && <div className="flex gap-2"><Input className="flex-1" value={reason} onChange={e => setReason(e.target.value)} placeholder="What needs to change?" aria-label="Rework note" /><Button onClick={() => act('rework', { note: reason })}>Send back</Button></div>}
        {t.proof && <div className="rounded-xl bg-paper p-3 text-sm"><div className="text-xs font-semibold text-mute">Proof</div>{t.proof}</div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Owner" value={t.owner_id || ''} onChange={e => save({ owner_id: e.target.value || null })} placeholder="Unassigned" options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
          <Input label="Due" type="datetime-local" value={toLocalInput(t.due_at)} onChange={e => save({ due_at: fromLocalInput(e.target.value) })} hint={overdue ? 'extend to de-escalate' : undefined} />
          <Select label="Priority" value={t.priority} onChange={e => save({ priority: e.target.value })} options={['high', 'medium', 'low']} />
        </div>
        {t.description && <p className="text-sm text-ink-2">{t.description}</p>}
        {(t.checklist || []).length > 0 && <div><div className="mb-1 text-sm font-semibold">Checklist</div>{t.checklist.map((c: any, i: number) => <Check key={i} className="flex py-1" label={<span className={c.done ? 'text-mute line-through' : ''}>{c.text}</span>} checked={c.done} onChange={v => save({ checklist: t.checklist.map((x: any, j: number) => j === i ? { ...x, done: v } : x) })} />)}</div>}
      </div>
    </Modal>
  )
}

function CreateTask({ open, onClose, members, wid, onDone }: any) {
  const me = useMe()
  const { run, busy } = useAction()
  const [f, setF] = useState<any>({})
  const { data: existing } = useApi<any[]>(open && (f.wedding_id || wid) ? `/tasks?filter=open&wedding_id=${f.wedding_id || wid}` : null)
  useEffect(() => { if (open) setF({ title: '', wedding_id: wid || '', owner_id: me.user.id, due_at: '', priority: 'medium', checklist: '', requires_proof: false, depends_on: '' }) }, [open])
  return (
    <Modal open={open} onClose={onClose} title="New task" size="md" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy === 'c'} disabled={!f.title} onClick={() => run('c', () => post('/tasks', { ...f, wedding_id: f.wedding_id || null, due_at: fromLocalInput(f.due_at), checklist: f.checklist.split('\n').filter(Boolean), requires_proof: f.requires_proof ? 1 : 0, depends_on: f.depends_on ? [f.depends_on] : [] }), 'Task created — owner notified').then(onDone)}>Create</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Title" value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} />
        {!wid && <Select label="Wedding" value={f.wedding_id} onChange={e => setF({ ...f, wedding_id: e.target.value })} placeholder="Agency task" options={me.weddings.map(w => ({ value: w.id, label: w.name }))} />}
        <Select label="Owner" value={f.owner_id || ''} onChange={e => setF({ ...f, owner_id: e.target.value })} placeholder="Unassigned" options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
        <Input label="Due" type="datetime-local" value={f.due_at || ''} onChange={e => setF({ ...f, due_at: e.target.value })} />
        <Select label="Priority" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} options={['high', 'medium', 'low']} />
        {(existing || []).length > 0 && <Select className="sm:col-span-2" label="Depends on" value={f.depends_on} onChange={e => setF({ ...f, depends_on: e.target.value })} placeholder="No dependency" options={existing!.map(t => ({ value: t.id, label: t.title }))} />}
        <Textarea className="sm:col-span-2" label="Checklist (one per line)" rows={3} value={f.checklist || ''} onChange={e => setF({ ...f, checklist: e.target.value })} />
        <Check className="sm:col-span-2" label="Requires proof + planner approval" checked={f.requires_proof} onChange={v => setF({ ...f, requires_proof: v })} />
      </div>
    </Modal>
  )
}

function SopLibrary({ sops }: { sops: any[] }) {
  const [e, setE] = useState<any>(null)
  const { run } = useAction()
  const [list, setList] = useState(sops)
  useEffect(() => setList(sops), [sops])
  const reload = async () => setList(await get('/sops'))
  return (
    <Card>
      <CardHeader title="Standard operating procedures" sub="Reusable task plans applied to weddings" action={<Button size="sm" icon={Plus} onClick={() => setE({ name: '', description: '', steps: [] })}>New SOP</Button>} />
      <Divided>{list.map(s => <Row key={s.id} onClick={() => setE(s)}><div className="flex-1"><div className="font-semibold">{s.name}</div><div className="text-xs text-mute">{s.steps?.length} steps · {s.description}</div></div></Row>)}</Divided>
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Edit SOP' : 'New SOP'} size="lg" footer={<>{e?.id && <Button variant="ghost" className="mr-auto text-rose" onClick={() => run('d', () => del(`/sops/${e.id}`), 'Deleted').then(() => { setE(null); reload() })}>Delete</Button>}<Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" onClick={() => run('s', () => e.id ? patch(`/sops/${e.id}`, e) : post('/sops', e), 'SOP saved').then(() => { setE(null); reload() })}>Save</Button></>}>
        {e && <div className="space-y-3">
          <Input label="Name" value={e.name} onChange={x => setE({ ...e, name: x.target.value })} /><Input label="Description" value={e.description || ''} onChange={x => setE({ ...e, description: x.target.value })} />
          <div className="text-sm font-semibold">Steps</div>
          {e.steps.map((s: any, i: number) => <div key={i} className="grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_110px_110px_auto]"><Input aria-label="Step" value={s.title} onChange={x => setE({ ...e, steps: e.steps.map((y: any, j: number) => j === i ? { ...y, title: x.target.value } : y) })} /><Input aria-label="Days before" type="number" value={s.days_before ?? 0} onChange={x => setE({ ...e, steps: e.steps.map((y: any, j: number) => j === i ? { ...y, days_before: +x.target.value } : y) })} hint="days before" /><Select aria-label="Priority" value={s.priority || 'medium'} onChange={x => setE({ ...e, steps: e.steps.map((y: any, j: number) => j === i ? { ...y, priority: x.target.value } : y) })} options={['high', 'medium', 'low']} /><Button variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setE({ ...e, steps: e.steps.filter((_: any, j: number) => j !== i) })} /></div>)}
          <Button size="sm" icon={Plus} onClick={() => setE({ ...e, steps: [...e.steps, { title: '', days_before: 7, priority: 'medium' }] })}>Add step</Button>
        </div>}
      </Modal>
    </Card>
  )
}

// =====================================================================
// Master calendar
// =====================================================================
const TYPE_COLOR: Record<string, string> = { function: 'bg-saffron text-white', task: 'bg-sky-50 text-sky', vendor: 'bg-amber-50 text-amber', travel: 'bg-sage-50 text-sage', room: 'bg-sand text-ink-2', event: 'bg-ink text-paper' }
export function Calendar({ scoped }: { scoped?: boolean }) {
  const { wid } = useParams()
  const me = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [view, setView] = useState<'month' | 'agenda'>(() => window.innerWidth < 768 ? 'agenda' : 'month')
  const [types, setTypes] = useState<string[]>(['function', 'task', 'vendor', 'travel', 'room', 'event'])
  const [weddingF, setWeddingF] = useState('')
  const [owner, setOwner] = useState('')
  const [edit, setEdit] = useState<any>(null)
  const [moveAsk, setMoveAsk] = useState<any>(null)
  const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - 7).toISOString()
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 8).toISOString()
  const wq = wid || weddingF
  const { data, reload } = useApi<any[]>(`/calendar?from=${from}&to=${to}${wq ? `&wedding_id=${wq}` : ''}${owner ? `&owner_id=${owner}` : ''}`)
  const { data: team } = useApi<any>('/team')
  const items = (data || []).filter(i => types.includes(i.type))
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [cursor])
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const byDay = useMemo(() => { const m = new Map<string, any[]>(); for (const i of items) { const k = key(new Date(i.start)); m.set(k, [...(m.get(k) || []), i]) } return m }, [items])
  const open = (i: any) => {
    if (i.editable) return setEdit(i)
    const mod = { function: '', task: 'tasks', vendor: 'vendors', travel: 'travel?tab=pickups', room: 'rooms' }[i.type as string]
    nav(`/w/${i.wedding_id}/${mod}`)
  }
  const drop = (d: Date) => {
    const id = (window as any).__drag; (window as any).__drag = null
    const it = items.find(x => x.id === id); if (!it) return
    const s = new Date(it.start); const ns = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.getHours(), s.getMinutes())
    if (key(ns) === key(s)) return
    setMoveAsk({ it, ns })
  }
  const doMove = async (override = false) => {
    const { it, ns } = moveAsk
    const dur = new Date(it.end).getTime() - new Date(it.start).getTime()
    try { await patch(`/events/${it.id}`, { start_at: ns.toISOString(), end_at: new Date(ns.getTime() + dur).toISOString(), override }); toast('Rescheduled — owner notified'); setMoveAsk(null); reload() }
    catch (e: any) { if (e.status === 409) setMoveAsk({ ...moveAsk, conflicts: e.detail?.conflicts }); else toast(e.message, 'error') }
  }
  const today = key(new Date())
  return (
    <Wrap scoped={scoped}>
      {scoped ? <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-medium">Wedding calendar</h2><Button variant="primary" icon={Plus} onClick={() => setEdit({ title: '', kind: 'meeting', wedding_id: wid, start_at: '', end_at: '', owner_id: '' })}>Add event</Button></div>
        : <PageHeader title="Master calendar" sub="Functions, tasks, vendor reporting, pickups and check-ins across your weddings" actions={<Button variant="primary" icon={Plus} onClick={() => setEdit({ title: '', kind: 'meeting', wedding_id: '', start_at: '', end_at: '', owner_id: '' })}>Add event</Button>} />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1"><Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} /><div className="min-w-36 text-center font-semibold">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div><Button size="sm" variant="ghost" icon={ChevronRight} aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} /><Button size="sm" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d) }}>Today</Button></div>
        <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]} />
        {!scoped && <Select aria-label="Wedding" className="w-44" value={weddingF} onChange={e => setWeddingF(e.target.value)} placeholder="All weddings" options={me.weddings.map(w => ({ value: w.id, label: w.name }))} />}
        <Select aria-label="Team member" className="w-40" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Everyone" options={(team?.members || []).map((m: any) => ({ value: m.id, label: m.name }))} />
        <div className="flex flex-wrap gap-1.5">{Object.keys(TYPE_COLOR).map(t => <button key={t} onClick={() => setTypes(types.includes(t) ? types.filter(x => x !== t) : [...types, t])} className={cx('rounded-full px-2.5 py-1 text-xs font-semibold capitalize', types.includes(t) ? TYPE_COLOR[t] : 'bg-sand text-mute line-through')}>{t}</button>)}</div>
      </div>
      {!data ? <Loading /> : view === 'month' ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs font-semibold text-mute">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map(d => {
              const k = key(d), list = byDay.get(k) || [], other = d.getMonth() !== cursor.getMonth()
              return (
                <div key={k} onDragOver={e => e.preventDefault()} onDrop={() => drop(d)} className={cx('min-h-28 border-r border-b border-line p-1.5', other && 'bg-paper/60')}>
                  <div className={cx('mb-1 grid size-6 place-items-center rounded-full text-xs font-semibold', k === today ? 'bg-saffron text-white' : other ? 'text-mute/60' : 'text-ink-2')}>{d.getDate()}</div>
                  <div className="space-y-0.5">{list.slice(0, 4).map(i => (
                    <button key={i.type + i.id} draggable={i.editable} onDragStart={() => { (window as any).__drag = i.id }} onClick={() => open(i)} title={`${i.title}${i.wedding ? ` · ${i.wedding}` : ''}`}
                      className={cx('block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold', TYPE_COLOR[i.type], i.editable && 'cursor-grab')}>{i.type !== 'function' && time(i.start) !== '12:00 am' ? `${time(i.start).replace(':00', '')} ` : ''}{i.title}</button>
                  ))}{list.length > 4 && <button className="px-1.5 text-[11px] font-semibold text-mute" onClick={() => setView('agenda')}>+{list.length - 4} more</button>}</div>
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <Card>
          {!items.length ? <Empty icon={CalIcon} title="Nothing scheduled" /> : <Divided>
            {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([k]) => k >= key(new Date(cursor.getFullYear(), cursor.getMonth(), 1))).map(([k, list]) => (
              <div key={k} className="flex gap-4 px-4 py-3 sm:px-5">
                <div className="w-14 shrink-0 text-center"><div className="text-[11px] font-semibold uppercase text-mute">{date(k, { weekday: 'short' })}</div><div className={cx('text-xl font-semibold', k === today && 'text-saffron')}>{date(k, { day: 'numeric' })}</div><div className="text-[11px] text-mute">{date(k, { month: 'short' })}</div></div>
                <div className="flex-1 space-y-1.5">{list.map(i => (
                  <button key={i.type + i.id} onClick={() => open(i)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-paper">
                    <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', TYPE_COLOR[i.type])}>{i.type}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{i.title}</span><span className="block truncate text-xs text-mute">{time(i.start)}{i.wedding && !scoped ? ` · ${i.wedding}` : ''}{i.owner ? ` · ${i.owner}` : ''}{i.location ? ` · ${i.location}` : ''}</span></span>
                    {i.status && <Status s={i.status} />}
                  </button>
                ))}</div>
              </div>
            ))}
          </Divided>}
        </Card>
      )}
      <EventModal e={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} members={team?.members || []} />
      <Modal open={!!moveAsk} onClose={() => setMoveAsk(null)} title="Reschedule event?" size="sm" footer={<><Button onClick={() => setMoveAsk(null)}>Keep original</Button>{moveAsk?.conflicts ? <Button variant="danger" onClick={() => doMove(true)}>Save with warning</Button> : <Button variant="primary" onClick={() => doMove()}>Move</Button>}</>}>
        <p className="text-sm">Move <b>{moveAsk?.it.title}</b> to <b>{moveAsk && dateTime(moveAsk.ns.toISOString())}</b>?</p>
        {moveAsk?.conflicts && <div className="mt-3"><Callout tone="amber" icon={AlertTriangle}><ul className="list-disc pl-4">{moveAsk.conflicts.map((c: string) => <li key={c}>{c}</li>)}</ul></Callout></div>}
      </Modal>
    </Wrap>
  )
}
function EventModal({ e, onClose, onDone, members }: any) {
  const me = useMe()
  const [f, setF] = useState<any>({})
  const [conf, setConf] = useState<string[] | null>(null)
  const toast = useToast()
  useEffect(() => { if (e) { setF({ ...e, start_at: toLocalInput(e.start || e.start_at), end_at: toLocalInput(e.end || e.end_at) }); setConf(null) } }, [e])
  const save = async (override = false) => {
    const body = { title: f.title, kind: f.kind, wedding_id: f.wedding_id || null, owner_id: f.owner_id || null, location: f.location, start_at: fromLocalInput(f.start_at), end_at: fromLocalInput(f.end_at), override }
    try { f.id ? await patch(`/events/${f.id}`, body) : await post('/events', body); toast('Saved'); onDone() }
    catch (x: any) { if (x.status === 409) setConf(x.detail?.conflicts || [x.message]); else toast(x.message, 'error') }
  }
  return (
    <Modal open={!!e} onClose={onClose} title={f.id ? 'Edit event' : 'New event'} size="md" footer={<>{f.id && <Button variant="ghost" className="mr-auto text-rose" onClick={() => del(`/events/${f.id}`).then(onDone)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button>{conf ? <Button variant="danger" onClick={() => save(true)}>Save with warning</Button> : <Button variant="primary" disabled={!f.title || !f.start_at} onClick={() => save()}>Save</Button>}</>}>
      {conf && <div className="mb-3"><Callout tone="amber" icon={AlertTriangle}><b>Conflict detected</b><ul className="mt-1 list-disc pl-4">{conf.map(c => <li key={c}>{c}</li>)}</ul></Callout></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Title" value={f.title || ''} onChange={x => setF({ ...f, title: x.target.value })} />
        <Select label="Type" value={f.kind || 'meeting'} onChange={x => setF({ ...f, kind: x.target.value })} options={['meeting', 'call', 'site visit', 'tasting', 'rehearsal', 'deadline', 'other']} />
        <Select label="Wedding" value={f.wedding_id || ''} onChange={x => setF({ ...f, wedding_id: x.target.value })} placeholder="Agency" options={me.weddings.map(w => ({ value: w.id, label: w.name }))} />
        <Input label="Starts" type="datetime-local" value={f.start_at || ''} onChange={x => setF({ ...f, start_at: x.target.value })} />
        <Input label="Ends" type="datetime-local" value={f.end_at || ''} onChange={x => setF({ ...f, end_at: x.target.value })} />
        <Select label="Owner" value={f.owner_id || ''} onChange={x => setF({ ...f, owner_id: x.target.value })} placeholder="None" options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
        <Input label="Location" value={f.location || ''} onChange={x => setF({ ...f, location: x.target.value })} />
      </div>
    </Modal>
  )
}

// =====================================================================
// Wedding Day Command Center
// =====================================================================
export function Live() {
  const { wid } = useParams()
  const { reload: reloadW } = useWedding()
  const { data, error, reload } = useApi<any>(`/weddings/${wid}/live`, { poll: 10000 })
  const { run, busy, raw } = useAction()
  const toast = useToast()
  const [inc, setInc] = useState<any>(null)
  const [newInc, setNewInc] = useState(false)
  const [bc, setBc] = useState(false)
  const [q, setQ] = useState('')
  const [panel, setPanel] = useState<'incidents' | 'vendors' | 'guests' | 'pickups' | 'tasks'>('incidents')
  if (error) return <div className="p-6"><ErrorBox error={error} retry={reload} /></div>
  if (!data) return <Loading label="Loading live board…" />
  const s = data.stats, cur = data.current
  const advance = async (override = false) => {
    try { const r = await raw('adv', () => post(`/weddings/${wid}/live/advance`, { override })); toast(r.wrapped ? 'Wedding day wrapped 🎉' : 'Advanced to next function'); reload(); reloadW() }
    catch (e: any) { if (e.status === 409 && window.confirm(`${e.message}. Advance anyway?`)) advance(true) }
  }
  const vAct = (v: any, action: string, minutes?: number) => run('v' + v.id, () => post(`/weddings/${wid}/vendor-assignments/${v.id}/status`, { action, minutes }, { queueLabel: `${v.name}: ${action}` }), `${v.name}: ${action}`).then(reload)
  const checkIn = (g: any) => run('g' + g.id, () => post(`/weddings/${wid}/guests/${g.id}/checkin`, { undo: !!g.checked_in }, { queueLabel: `Check-in ${g.name}` })).then(reload)
  const attendees = data.attendees.filter((a: any) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
  const open = data.incidents.filter((i: any) => i.status !== 'resolved')
  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5">
      <div className={cx('mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between', cur ? 'bg-ink text-paper' : 'border border-line bg-card')}>
        <div className="flex items-center gap-3">
          {cur ? <span className="relative flex size-3"><span className="live-dot absolute inline-flex size-full rounded-full bg-[#ff6b6b]" /><span className="relative inline-flex size-3 rounded-full bg-[#ff6b6b]" /></span> : <Radio className="size-5 text-mute" />}
          <div><div className={cx('text-xs font-semibold uppercase tracking-[0.14em]', cur ? 'text-marigold' : 'text-mute')}>{cur ? 'Live now' : data.wedding.status === 'completed' ? 'Wrapped' : 'Wedding Day Mode'}</div><div className="text-xl font-semibold">{cur ? `${cur.name} · ${cur.venue}` : 'No function running'}</div>{cur && <div className="text-xs text-paper/60">{hhmm(cur.start_time)}–{hhmm(cur.end_time)} · dress code: {cur.dress_code || '—'}</div>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={cur ? 'secondary' : 'secondary'} icon={Megaphone} onClick={() => setBc(true)}>Broadcast update</Button>
          <Button variant="danger" icon={Siren} onClick={() => setNewInc(true)}>Log incident</Button>
          {cur ? <Button variant="primary" icon={SkipForward} loading={busy === 'adv'} onClick={() => advance()}>Next function</Button> : data.wedding.status !== 'completed' && <Button variant="primary" icon={Play} onClick={() => run('st', () => post(`/weddings/${wid}/live/start`), 'Wedding Day Mode on').then(() => { reload(); reloadW() })}>Start Wedding Day Mode</Button>}
        </div>
      </div>
      <Grid cols={5} className="mb-4">
        <Stat label="Guests arrived" value={`${s.arrived}/${s.expected}`} sub={<Progress value={s.arrived} max={s.expected} tone="sage" className="mt-1" />} onClick={() => setPanel('guests')} />
        <Stat label="Vendors ready" value={`${s.vendors_ready}/${s.vendors_total}`} tone={s.vendors_delayed ? 'rose' : undefined} sub={s.vendors_delayed ? `${s.vendors_delayed} delayed` : 'on schedule'} onClick={() => setPanel('vendors')} />
        <Stat label="Open incidents" value={s.incidents_open} tone={s.critical ? 'rose' : s.incidents_open ? 'amber' : 'sage'} sub={s.critical ? `${s.critical} critical` : undefined} onClick={() => setPanel('incidents')} />
        <Stat label="Active pickups" value={s.pickups_active} onClick={() => setPanel('pickups')} />
        <Stat label="Rooms checked in" value={`${data.rooms?.checked_in || 0}/${data.rooms?.total || 0}`} />
      </Grid>
      <Segmented className="mb-3 lg:hidden" value={panel} onChange={setPanel} options={[{ value: 'incidents', label: 'Incidents', count: open.length }, { value: 'vendors', label: 'Vendors' }, { value: 'guests', label: 'Check-in' }, { value: 'pickups', label: 'Pickups' }, { value: 'tasks', label: 'Tasks' }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cx('space-y-4', panel !== 'incidents' && panel !== 'tasks' && 'hidden lg:block')}>
          <Card className={cx(panel !== 'incidents' && 'hidden lg:block')}>
            <CardHeader title="Incidents" sub={`${open.length} open`} icon={ShieldAlert} action={<Button size="sm" variant="danger" icon={Plus} onClick={() => setNewInc(true)}>New</Button>} />
            {data.incidents.length ? <Divided className="max-h-[480px] overflow-y-auto">{data.incidents.map((i: any) => (
              <Row key={i.id} onClick={() => setInc(i)} className={i.status === 'resolved' ? 'opacity-50' : ''}>
                <span className={cx('size-2.5 shrink-0 rounded-full', { critical: 'bg-rose', high: 'bg-rose/70', medium: 'bg-marigold', low: 'bg-line' }[i.severity as string])} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{i.title}</div><div className="truncate text-xs text-mute">{i.function_name || '—'} · {i.owner_name || 'unassigned'} · {ago(i.created_at)}</div></div>
                <Status s={i.status === 'resolved' ? 'resolved' : i.severity} />
              </Row>
            ))}</Divided> : <Empty icon={CheckCircle2} title="No incidents" />}
          </Card>
          <Card className={cx(panel !== 'tasks' && 'hidden lg:block')}>
            <CardHeader title="Due today" icon={ListChecks} />
            <Divided className="max-h-80 overflow-y-auto">{data.tasks.length ? data.tasks.map((t: any) => <div key={t.id} className="flex items-center gap-3 px-4 py-2.5"><button aria-label="Complete task" onClick={() => run('t', () => post(`/tasks/${t.id}/action`, { action: 'complete', override: true }, { queueLabel: t.title }), 'Done').then(reload)} className="grid size-5 shrink-0 place-items-center rounded-md border border-line hover:border-sage" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{t.title}</div><div className="text-xs text-mute">{t.owner_name || '—'} · {time(t.due_at)}</div></div><Status s={t.status} /></div>) : <div className="p-4 text-sm text-mute">All done.</div>}</Divided>
          </Card>
        </div>
        <Card className={cx(panel !== 'vendors' && 'hidden lg:block')}>
          <CardHeader title="Vendors" sub={cur ? `For ${cur.name}` : 'All'} icon={Truck} />
          <Divided className="max-h-[720px] overflow-y-auto">{data.vendors.map((v: any) => (
            <div key={v.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{v.name}</div><div className="text-xs text-mute">{v.kind} · reports {time(v.report_at)}</div></div><Status s={v.live_status || v.status} label={v.live_status === 'delayed' ? `+${v.delay_min}m` : undefined} /></div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['arrived', 'setup', 'ready'].filter(a => a !== v.live_status).map(a => <Button key={a} size="sm" variant="ghost" onClick={() => vAct(v, a)}>{titleCase(a)}</Button>)}
                <Button size="sm" variant="ghost" className="text-rose" onClick={() => { const m = prompt(`${v.name} is late by how many minutes?`, '20'); if (m) vAct(v, 'delay', +m) }}>Delay</Button>
                {v.phone && <a href={`tel:${v.phone}`} className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-ink-2 hover:bg-sand"><Phone className="size-3.5" /></a>}
              </div>
            </div>
          ))}</Divided>
        </Card>
        <div className={cx('space-y-4', panel !== 'guests' && panel !== 'pickups' && 'hidden lg:block')}>
          <Card className={cx(panel !== 'guests' && 'hidden lg:block')}>
            <CardHeader title="Guest check-in" sub={cur ? `${s.arrived} of ${s.expected} heads` : 'Start a function first'} icon={UserCheck} />
            <div className="p-3"><div className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find guest" aria-label="Find guest" className="h-11 w-full rounded-xl border border-line pr-3 pl-9 text-base focus:border-saffron focus:outline-none" /></div></div>
            <Divided className="max-h-80 overflow-y-auto">{attendees.slice(0, 80).map((g: any) => (
              <button key={g.id} onClick={() => checkIn(g)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper">
                <span className={cx('grid size-6 shrink-0 place-items-center rounded-full border', g.checked_in ? 'border-sage bg-sage text-white' : 'border-line')}>{g.checked_in ? <CheckIcon className="size-3.5" /> : null}</span>
                <span className="flex-1 text-sm font-medium">{g.name}{g.vip ? ' 👑' : ''}</span><span className="text-xs text-mute">{g.headcount > 1 ? `party of ${g.headcount}` : ''}</span>
              </button>
            ))}</Divided>
          </Card>
          <Card className={cx(panel !== 'pickups' && 'hidden lg:block')}>
            <CardHeader title="Pickups today" icon={Plane} />
            {data.trips.length ? <Divided>{data.trips.map((t: any) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between"><div className="text-sm font-semibold">{t.location} · {time(t.window_start)}</div><Status s={t.status} /></div>
                <div className="text-xs text-mute">{t.vehicle} · {t.driver} {t.driver_phone}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">{(t.stops || []).map((st: any) => <Badge key={st.travel_id} tone={st.status === 'dropped' ? 'sage' : st.status === 'picked_up' ? 'sky' : st.status === 'no_show' ? 'rose' : 'neutral'}>{st.name.split(' ')[0]} · {st.status}</Badge>)}</div>
              </div>
            ))}</Divided> : <div className="p-4 text-sm text-mute">No pickups scheduled today.</div>}
          </Card>
        </div>
      </div>
      <Card className="mt-4">
        <CardHeader title="Timeline" sub="Functions for the day" icon={Clock} />
        <div className="scroll-x flex gap-2 p-4">{data.functions.map((f: any) => <div key={f.id} className={cx('min-w-44 rounded-xl border p-3', f.live_status === 'live' ? 'border-rose bg-rose-50' : f.live_status === 'done' ? 'border-line opacity-60' : 'border-line')}><div className="text-xs text-mute">{date(f.date)} · {hhmm(f.start_time)}</div><div className="font-semibold">{f.name}</div><Status s={f.live_status} /></div>)}</div>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Activity" sub="Everything that happened, newest first" icon={History} />
        <Divided className="max-h-72 overflow-y-auto">{data.activity.map((a: any) => <div key={a.id} className="flex gap-3 px-4 py-2 text-xs"><span className="w-16 shrink-0 text-mute">{time(a.created_at)}</span><span><b>{a.actor_name}</b> · {a.action.replace(/[._]/g, ' ')}</span></div>)}</Divided>
      </Card>
      <IncidentModal open={newInc} onClose={() => setNewInc(false)} team={data.team} functions={data.functions} current={cur} onDone={() => { setNewInc(false); reload() }} />
      <IncidentDetail i={inc} team={data.team} onClose={() => setInc(null)} onDone={() => { setInc(null); reload() }} />
      <BroadcastModal open={bc} onClose={() => setBc(false)} functions={data.functions} current={cur} />
    </div>
  )
}
function IncidentModal({ open, onClose, team, functions, current, onDone }: any) {
  const { wid } = useParams()
  const [f, setF] = useState<any>({})
  const { run, busy } = useAction()
  useEffect(() => { if (open) setF({ title: '', description: '', severity: 'medium', function_id: current?.id || '', owner_id: '' }) }, [open])
  return (
    <Modal open={open} onClose={onClose} title="Log incident" size="md" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!f.title} loading={busy === 'i'} onClick={() => run('i', () => post(`/weddings/${wid}/incidents`, f, { queueLabel: `Incident: ${f.title}` }), f.severity === 'critical' ? 'Critical incident — planner alerted' : 'Incident logged').then(onDone)}>Log incident</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="What happened?" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <Textarea className="sm:col-span-2" label="Details" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        <div className="sm:col-span-2"><div className="mb-1.5 text-[13px] font-semibold text-ink-2">Severity</div><Segmented value={f.severity} onChange={v => setF({ ...f, severity: v })} options={['low', 'medium', 'high', 'critical'].map(s => ({ value: s, label: titleCase(s) }))} /></div>
        <Select label="Function" value={f.function_id} onChange={e => setF({ ...f, function_id: e.target.value })} options={functions.map((x: any) => ({ value: x.id, label: x.name }))} placeholder="—" />
        <Select label="Owner" value={f.owner_id} onChange={e => setF({ ...f, owner_id: e.target.value })} options={team.map((t: any) => ({ value: t.id, label: t.name }))} placeholder="Unassigned" />
      </div>
    </Modal>
  )
}
function IncidentDetail({ i, team, onClose, onDone }: any) {
  const { wid } = useParams()
  const [note, setNote] = useState('')
  const [res, setRes] = useState('')
  const { run } = useAction()
  useEffect(() => { setNote(''); setRes('') }, [i])
  if (!i) return null
  const upd = (p: any, msg?: string) => run('u', () => patch(`/weddings/${wid}/incidents/${i.id}`, p, { queueLabel: i.title }), msg).then(r => r && onDone())
  return (
    <Modal open={!!i} onClose={onClose} title={i.title} sub={`${i.function_name || ''} · opened ${ago(i.created_at)}`} size="md"
      footer={i.status !== 'resolved' ? <div className="flex w-full flex-wrap gap-2"><Input className="flex-1" aria-label="Resolution" placeholder="How was it resolved?" value={res} onChange={e => setRes(e.target.value)} /><Button variant="success" disabled={!res} onClick={() => upd({ status: 'resolved', resolution: res }, 'Incident closed')}>Resolve</Button></div> : undefined}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Status s={i.severity} /><Status s={i.status} /></div>
        {i.description && <p className="text-sm">{i.description}</p>}
        {i.resolution && <Callout tone="sage" icon={CheckCircle2}>{i.resolution}</Callout>}
        {i.status !== 'resolved' && <div className="grid gap-3 sm:grid-cols-2"><Select label="Owner" value={i.owner_id || ''} onChange={e => upd({ owner_id: e.target.value }, 'Reassigned')} options={team.map((t: any) => ({ value: t.id, label: t.name }))} placeholder="Unassigned" /><Select label="Severity" value={i.severity} onChange={e => upd({ severity: e.target.value })} options={['low', 'medium', 'high', 'critical']} /></div>}
        <div><div className="mb-2 text-sm font-semibold">Log</div><div className="space-y-2 border-l-2 border-line pl-3">{(i.log || []).map((l: any, k: number) => <div key={k} className="text-sm"><span className="text-xs text-mute">{time(l.at)}{l.by ? ` · ${l.by}` : ''}</span><div>{l.text}</div></div>)}</div></div>
        {i.status !== 'resolved' && <div className="flex gap-2"><Input className="flex-1" aria-label="Add note" placeholder="Add an update" value={note} onChange={e => setNote(e.target.value)} /><Button disabled={!note} onClick={() => upd({ note, status: i.status === 'open' ? 'in_progress' : undefined }, 'Note added')}>Add</Button></div>}
      </div>
    </Modal>
  )
}
function BroadcastModal({ open, onClose, functions, current }: any) {
  const { wid } = useParams()
  const [f, setF] = useState<any>({})
  const [confirm, setConfirm] = useState(false)
  const { run, busy } = useAction()
  useEffect(() => { if (open) { setF({ to: 'guests', function_id: current?.id || '', body: '' }); setConfirm(false) } }, [open])
  const audience = f.to === 'guests' ? { type: 'guests', filter: { function_id: f.function_id || undefined, rsvp_status: 'attending' } } : { type: f.to }
  return (
    <Modal open={open} onClose={onClose} title="Targeted live update" sub="Sent instantly on WhatsApp" size="md" footer={<><Button onClick={onClose}>Cancel</Button>{confirm ? <Button variant="danger" loading={busy === 'b'} onClick={() => run('b', () => post(`/weddings/${wid}/comms/send`, { kind: 'broadcast', name: 'Live update', audience, body: f.body }), (r: any) => `Sent to ${r.recipients}`).then(onClose)}>Yes, send to everyone</Button> : <Button variant="primary" icon={Send} disabled={!f.body} onClick={() => setConfirm(true)}>Review & send</Button>}</>}>
      <div className="space-y-3">
        <Segmented value={f.to} onChange={v => setF({ ...f, to: v })} options={[{ value: 'guests', label: 'Guests' }, { value: 'hosts', label: 'Hosts only' }, { value: 'vendors', label: 'Vendors' }]} />
        {f.to === 'guests' && <Select label="Attending function" value={f.function_id} onChange={e => setF({ ...f, function_id: e.target.value })} placeholder="All attending guests" options={functions.map((x: any) => ({ value: x.id, label: x.name }))} />}
        <Textarea label="Message" rows={4} value={f.body} onChange={e => { setF({ ...f, body: e.target.value }); setConfirm(false) }} placeholder="Boats to Jag Mandir now leave at 4:15 PM from the jetty ⛵" />
        {confirm && <Callout tone="amber" icon={AlertTriangle}>This goes to every matching recipient right away and can't be unsent. Check the wording, especially for sensitive updates.</Callout>}
      </div>
    </Modal>
  )
}

// =====================================================================
// Media center
// =====================================================================
export function Media() {
  const { wid } = useParams()
  const { w } = useWedding()
  const { data, error, reload } = useApi<any>(`/weddings/${wid}/media`)
  const { run, busy } = useAction()
  const toast = useToast()
  const [tab, setTab] = useState('pending')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<any>(null)
  if (error) return <Wrap scoped><ErrorBox error={error} retry={reload} /></Wrap>
  if (!data) return <Loading />
  const items = data.items.filter((m: any) => tab === 'all' || m.status === tab)
  const ids = [...sel]
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const fd = new FormData(); [...files].forEach(f => fd.append('files', f))
    await run('up', () => api('POST', `/weddings/${wid}/media/upload`, fd), (r: any) => `${r.accepted} uploaded${r.duplicates ? `, ${r.duplicates} duplicate(s) skipped` : ''}${r.rejected.length ? `, ${r.rejected.length} rejected` : ''}`); reload()
  }
  const c = data.counts
  return (
    <Wrap scoped>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-2xl font-medium">Media center</h2><p className="text-sm text-mute">Photographer upload → {data.host_approval ? 'host' : 'planner'} approval → publish to guests</p></div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-saffron px-4 text-sm font-semibold text-white hover:bg-[#9c4623]"><Upload className="size-4" />Upload<input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={e => upload(e.target.files)} /></label>
      </div>
      {data.photographers.length > 0 && <Card className="mb-4"><CardHeader title="Photographer upload links" sub="No login. Uploads resume if the connection drops." icon={Camera} />
        <Divided>{data.photographers.map((p: any) => <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><div className="font-semibold">{p.name}</div><div className="text-xs text-mute">{p.kind}</div></div><Button size="sm" icon={Copy} onClick={() => { navigator.clipboard?.writeText(location.origin + p.upload_link); toast('Link copied') }}>Copy link</Button><Button size="sm" icon={Send} onClick={() => run('s', () => post(`/weddings/${wid}/media/upload-link`, { vendor_id: p.id }), 'Sent on WhatsApp')}>Send</Button></div>)}</Divided>
      </Card>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={t => { setTab(t); setSel(new Set()) }} options={[{ value: 'pending', label: 'New', count: c.pending }, { value: 'in_review', label: 'In review', count: c.in_review }, { value: 'approved', label: 'Approved', count: c.approved }, { value: 'rejected', label: 'Rejected', count: c.rejected }, { value: 'published', label: 'Published', count: c.published }, { value: 'all', label: 'All' }]} />
        {sel.size > 0 && <div className="flex flex-wrap gap-2">
          {['pending', 'rejected'].includes(tab) && <><Button size="sm" variant="primary" icon={Stamp} onClick={() => run('a', () => post(`/weddings/${wid}/media/submit-approval`, { ids, owner: 'host' }), 'Sent to host for approval').then(() => { setSel(new Set()); reload() })}>Send to host</Button><Button size="sm" onClick={() => run('d', () => post(`/weddings/${wid}/media/decide`, { decisions: Object.fromEntries(ids.map(i => [i, 'approved'])) }), 'Approved').then(() => { setSel(new Set()); reload() })}>Approve myself</Button></>}
          {tab === 'approved' && <><Button size="sm" variant="primary" icon={Eye} loading={busy === 'p'} onClick={() => run('p', () => post(`/weddings/${wid}/media/publish`, { ids, album: 'public' }), (r: any) => `Published — ${r.notified} guest(s) notified`).then(() => { setSel(new Set()); reload() })}>Publish to guests</Button><Button size="sm" onClick={() => run('p', () => post(`/weddings/${wid}/media/publish`, { ids, album: 'private', notify: false }), 'Published to private album (host only)').then(() => { setSel(new Set()); reload() })}>Private album</Button></>}
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear {sel.size}</Button>
        </div>}
      </div>
      {!items.length ? <Card><Empty icon={Image} title="No media here" /></Card> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((m: any) => (
            <div key={m.id} className={cx('group relative overflow-hidden rounded-xl border bg-sand', sel.has(m.id) ? 'border-saffron ring-2 ring-saffron/40' : 'border-line')}>
              <button className="block aspect-[4/3] w-full" onClick={() => setView(m)} aria-label={`View ${m.original_name}`}>{/video/.test(m.mime) ? <video src={fileUrl(m.file)} className="size-full object-cover" /> : <img src={fileUrl(m.file)} alt={m.original_name} loading="lazy" className="size-full object-cover" />}</button>
              <label className="absolute top-2 left-2"><input type="checkbox" aria-label="Select" className="size-4 accent-[#b4532a]" checked={sel.has(m.id)} onChange={() => { const s = new Set(sel); s.has(m.id) ? s.delete(m.id) : s.add(m.id); setSel(s) }} /></label>
              <div className="flex items-center justify-between gap-1 p-2 text-[11px]"><span className="truncate text-mute">{m.function_name || m.uploader || ''}</span><Status s={m.status} label={m.status === 'published' && m.album === 'private' ? 'private' : undefined} /></div>
              {m.comment && <div className="px-2 pb-2 text-[11px] text-rose">“{m.comment}”</div>}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.original_name} sub={`${view?.uploader || 'Planner'} · ${ago(view?.created_at)}`} size="xl">{view && (/video/.test(view.mime) ? <video controls src={fileUrl(view.file)} className="w-full rounded-xl" /> : <img src={fileUrl(view.file)} alt="" className="w-full rounded-xl" />)}</Modal>
    </Wrap>
  )
}

// =====================================================================
// Approvals & host requests
// =====================================================================
export function Approvals() {
  const { wid } = useParams()
  const { w } = useWedding()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'approvals'
  const { data, reload } = useApi<any[]>(`/weddings/${wid}/approvals`)
  const { data: reqs, reload: rr } = useApi<any[]>(`/weddings/${wid}/requests`)
  const { run } = useAction()
  const toast = useToast()
  const [ask, setAsk] = useState(false)
  const [open, setOpen] = useState<any>(null)
  const [resp, setResp] = useState('')
  const host = w.hosts[0]
  return (
    <Wrap scoped>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-2xl font-medium">Approvals & host requests</h2><p className="text-sm text-mute">Host decisions stay low-effort: one secure link, approve or comment.</p></div>
        <div className="flex gap-2">{host && <Button icon={Copy} onClick={() => { navigator.clipboard?.writeText(location.origin + host.link); toast('Host link copied') }}>Host link</Button>}<Button variant="primary" icon={Plus} onClick={() => setAsk(true)}>Ask the host</Button></div>
      </div>
      <Segmented className="mb-4" value={tab} onChange={t => setSp({ tab: t })} options={[{ value: 'approvals', label: 'Approvals', count: (data || []).filter(a => a.status === 'pending').length }, { value: 'requests', label: 'Wishlist & concierge', count: (reqs || []).filter(r => r.status === 'open').length }]} />
      {tab === 'approvals' ? (
        <Card>{!data ? <Loading /> : !data.length ? <Empty icon={Stamp} title="No approvals yet" /> : <Divided>{data.map(a => (
          <Row key={a.id} onClick={() => setOpen(a)}>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate font-semibold">{a.title}</span><Badge>{a.kind.replace('_', ' ')}</Badge></div><div className="truncate text-xs text-mute">{a.approver === 'host' ? 'Host decision' : 'Planner decision'} · {ago(a.created_at)}{a.comment ? ` · “${a.comment}”` : ''}</div></div>
            <Status s={a.status} />
          </Row>
        ))}</Divided>}</Card>
      ) : (
        <Card>{!reqs ? <Loading /> : !reqs.length ? <Empty title="No requests from the host" /> : <Divided>{reqs.map(r => (
          <div key={r.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2 font-semibold">{r.title}<Badge>{r.kind}</Badge>{r.rating ? <span className="text-xs">{'⭐'.repeat(r.rating)}</span> : null}</div><p className="mt-0.5 text-sm text-ink-2">{r.body}</p>{r.response && <p className="mt-1 text-sm text-sage">↳ {r.response}</p>}</div><Status s={r.status} /></div>
            {r.status === 'open' && <div className="mt-2 flex gap-2"><Input className="flex-1" aria-label="Response" placeholder="Reply to host…" value={open?.id === r.id ? resp : ''} onFocus={() => { setOpen(r); setResp('') }} onChange={e => setResp(e.target.value)} /><Button onClick={() => run('r', () => patch(`/weddings/${wid}/requests/${r.id}`, { response: resp, status: 'done' }), 'Host notified').then(() => { setOpen(null); rr() })}>Reply & close</Button></div>}
          </div>
        ))}</Divided>}</Card>
      )}
      <Modal open={!!open && tab === 'approvals'} onClose={() => setOpen(null)} title={open?.title} sub={open?.description} size="lg"
        footer={open?.status === 'pending' && open?.approver === 'planner' ? <><Button onClick={() => run('d', () => post(`/weddings/${wid}/approvals/${open.id}/decide`, { status: 'rejected' }), 'Rejected').then(() => { setOpen(null); reload() })}>Reject</Button><Button variant="success" onClick={() => run('d', () => post(`/weddings/${wid}/approvals/${open.id}/decide`, { status: 'approved' }), 'Approved').then(() => { setOpen(null); reload() })}>Approve</Button></> : undefined}>
        {open && <div className="space-y-3 text-sm">
          <div className="flex gap-2"><Status s={open.status} />{open.decided_at && <span className="text-mute">decided {ago(open.decided_at)}</span>}</div>
          {open.status === 'pending' && open.approver === 'host' && <Callout tone="sky">Waiting on the host. They'll see this in their portal and on WhatsApp.</Callout>}
          {open.comment && <Callout tone="amber">“{open.comment}”</Callout>}
          {open.kind === 'rooming' && open.data?.rooms && <div className="max-h-80 overflow-y-auto rounded-xl border border-line"><table className="w-full text-xs"><tbody className="divide-y divide-line">{open.data.rooms.map((r: any, i: number) => <tr key={i}><td className="px-3 py-1.5 font-semibold">{r.hotel} {r.number}</td><td className="px-3 py-1.5">{r.guest}</td><td className="px-3 py-1.5 text-mute">{r.household}</td></tr>)}</tbody></table></div>}
          {open.data?.options && <div>Options: {open.data.options.join(' / ')}</div>}
        </div>}
      </Modal>
      <AskHost open={ask} onClose={() => setAsk(false)} onDone={() => { setAsk(false); reload() }} />
    </Wrap>
  )
}
function AskHost({ open, onClose, onDone }: any) {
  const { wid } = useParams()
  const [f, setF] = useState({ title: '', description: '', options: '' })
  const { run, busy } = useAction()
  return (
    <Modal open={open} onClose={onClose} title="Ask the host to decide" size="md" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.title} loading={busy === 'a'} onClick={() => run('a', () => post(`/weddings/${wid}/approvals`, { kind: 'decision', title: f.title, description: f.description, data: { options: f.options.split(',').map(s => s.trim()).filter(Boolean) } }), 'Sent to host').then(onDone)}>Send</Button></>}>
      <div className="space-y-3"><Input label="Question" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Mandap flowers: marigold or white orchids?" /><Textarea label="Context" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /><Input label="Options (comma separated, optional)" value={f.options} onChange={e => setF({ ...f, options: e.target.value })} /></div>
    </Modal>
  )
}

// =====================================================================
// Document center
// =====================================================================
export function Documents({ scoped }: { scoped?: boolean }) {
  const { wid } = useParams()
  const me = useMe()
  const [sp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [cat, setCat] = useState('')
  const [up, setUp] = useState(false)
  const [ver, setVer] = useState<any>(null)
  const [share, setShare] = useState<any>(null)
  const { data, reload } = useApi<any[]>(`/documents?${new URLSearchParams({ ...(wid ? { wedding_id: wid } : {}), ...(q ? { q } : {}), ...(cat ? { category: cat } : {}) })}`)
  const { run } = useAction()
  const cats = ['Contract', 'Invoice', 'Travel ticket', 'Run of show', 'Catering', 'Rate card', 'Floor plan', 'General']
  return (
    <Wrap scoped={scoped}>
      {scoped ? <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-medium">Documents</h2>{me.can.documents && <Button variant="primary" icon={Upload} onClick={() => setUp(true)}>Upload</Button>}</div>
        : <PageHeader title="Document center" sub="Contracts, invoices, tickets and plans — searchable, versioned and permissioned" actions={me.can.documents && <Button variant="primary" icon={Upload} onClick={() => setUp(true)}>Upload</Button>} />}
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search names, tags and document text" aria-label="Search documents" className="h-10 w-full rounded-xl border border-line pr-3 pl-9 text-sm focus:border-saffron focus:outline-none" /></div>
          <Select aria-label="Category" className="sm:w-48" value={cat} onChange={e => setCat(e.target.value)} placeholder="All categories" options={cats} />
        </div>
        {!data ? <Loading /> : <DataTable rows={data} rowKey={d => d.id} empty={<Empty icon={FolderOpen} title="No documents" />} cols={[
          { key: 'n', label: 'Name', mobile: 'title', render: d => <a href={fileUrl(d.file)} target="_blank" className="flex items-center gap-2 font-semibold hover:text-saffron"><FileText className="size-4 shrink-0 text-mute" />{d.name}</a> },
          { key: 'c', label: 'Category', render: d => <Badge>{d.category}</Badge> },
          ...(!scoped ? [{ key: 'w', label: 'Wedding', mobile: 'sub' as const, render: (d: any) => d.wedding || 'Agency' }] : []),
          { key: 'v', label: 'Version', render: d => <button className="text-xs font-semibold text-saffron" onClick={() => setVer(d)}>v{d.version}{d.versions > 1 ? ` (${d.versions})` : ''}</button> },
          { key: 'h', label: 'Host', render: d => d.host_visible ? <Badge tone="sky">visible</Badge> : <span className="text-xs text-mute">internal</span> },
          { key: 'u', label: 'Uploaded', render: d => <span className="text-xs text-mute">{d.uploader || 'link'} · {ago(d.created_at)}</span> },
          { key: 'a', label: '', render: d => me.can.documents && <span className="flex gap-1">{d.wedding_id && <Button size="sm" variant="ghost" icon={Share2} onClick={() => setShare(d)}>Share</Button>}<Button size="sm" variant="ghost" onClick={() => run('h', () => patch(`/documents/${d.id}`, { host_visible: d.host_visible ? 0 : 1 }), d.host_visible ? 'Hidden from host' : 'Visible to host').then(reload)}>{d.host_visible ? 'Hide' : 'Show host'}</Button><Button size="sm" variant="ghost" className="text-rose" icon={Trash2} aria-label="Delete" onClick={() => window.confirm(`Delete ${d.name} and all versions?`) && run('d', () => del(`/documents/${d.id}`), 'Deleted').then(reload)} /></span> },
        ]} />}
      </Card>
      <UploadDoc open={up} onClose={() => setUp(false)} wid={wid} cats={cats} onDone={() => { setUp(false); reload() }} />
      <Versions d={ver} onClose={() => setVer(null)} />
      <ShareDoc d={share} onClose={() => setShare(null)} />
    </Wrap>
  )
}
function UploadDoc({ open, onClose, wid, cats, onDone }: any) {
  const me = useMe()
  const [f, setF] = useState<any>({})
  const [file, setFile] = useState<File | null>(null)
  const { run, busy } = useAction()
  useEffect(() => { if (open) { setF({ wedding_id: wid || '', category: 'General', tags: '', host_visible: false }); setFile(null) } }, [open])
  const go = () => { const fd = new FormData(); fd.append('file', file!); Object.entries(f).forEach(([k, v]) => fd.append(k, String(v))); return run('u', () => api('POST', '/documents', fd), (r: any) => r.version > 1 ? `Uploaded as version ${r.version}` : 'Uploaded').then(r => r && onDone()) }
  return (
    <Modal open={open} onClose={onClose} title="Upload document" size="md" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!file} loading={busy === 'u'} onClick={go}>Upload</Button></>}>
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-5 hover:bg-paper"><Upload className="size-5 text-saffron" /><span className="text-sm">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'PDF, image, Word, Excel, CSV or text · max 50 MB'}</span><input type="file" className="sr-only" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        {!wid && <Select label="Wedding" value={f.wedding_id} onChange={e => setF({ ...f, wedding_id: e.target.value })} placeholder="Agency-wide" options={me.weddings.map(w => ({ value: w.id, label: w.name }))} />}
        <Select label="Category" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} options={cats} />
        <Input label="Tags" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} placeholder="venue, signed" />
        {f.wedding_id && <Toggle label="Visible to host" checked={f.host_visible} onChange={v => setF({ ...f, host_visible: v })} />}
        <p className="text-xs text-mute">Uploading a file with the same name creates a new version. Text is indexed for search.</p>
      </div>
    </Modal>
  )
}
function Versions({ d, onClose }: any) {
  const { data } = useApi<any[]>(d ? `/documents/${d.id}/versions` : null)
  return <Modal open={!!d} onClose={onClose} title={`Versions · ${d?.name}`} size="sm">{!data ? <Loading /> : <Divided>{data.map(v => <a key={v.id} href={fileUrl(v.file)} target="_blank" className="flex items-center justify-between py-2.5 text-sm hover:text-saffron"><span><b>v{v.version}</b> · {v.uploader || 'link'}</span><span className="text-xs text-mute">{dateTime(v.created_at)}</span></a>)}</Divided>}</Modal>
}
function ShareDoc({ d, onClose }: any) {
  const { data: w } = useApi<any>(d?.wedding_id ? `/weddings/${d.wedding_id}` : null)
  const { data: vendors } = useApi<any[]>(d?.wedding_id ? `/weddings/${d.wedding_id}/vendors` : null)
  const [r, setR] = useState('')
  const [days, setDays] = useState(7)
  const [url, setUrl] = useState<string | null>(null)
  const { run, busy } = useAction()
  useEffect(() => { setUrl(null); setR('') }, [d])
  const opts = [...(w?.hosts || []).map((h: any) => ({ value: `host:${h.id}`, label: `Host · ${h.name}` })), ...[...new Map((vendors || []).map((v: any) => [v.vendor_id, v])).values()].map((v: any) => ({ value: `vendor:${v.vendor_id}`, label: `Vendor · ${v.name}` }))]
  return (
    <Modal open={!!d} onClose={onClose} title={`Share ${d?.name}`} sub="Secure link with expiry. Recipient must belong to this wedding." size="sm"
      footer={url ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!r} loading={busy === 's'} onClick={() => { const [k, id] = r.split(':'); run('s', () => post(`/documents/${d.id}/share`, { recipient_kind: k, recipient_id: id, days }), 'Shared on WhatsApp').then(x => x && setUrl(x.url)) }}>Share</Button></>}>
      {url ? <Callout tone="sage" icon={CheckCircle2}>Link sent: <a className="underline" href={url} target="_blank">{url}</a></Callout> : <div className="space-y-3"><Select label="Recipient" value={r} onChange={e => setR(e.target.value)} placeholder="Choose…" options={opts} /><Select label="Expires after" value={String(days)} onChange={e => setDays(+e.target.value)} options={[{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} /></div>}
    </Modal>
  )
}

// =====================================================================
// Wedding setup
// =====================================================================
export function Setup() {
  const { wid } = useParams()
  const { w, reload } = useWedding()
  const me = useMe()
  const nav = useNavigate()
  const { data: team } = useApi<any>('/team')
  const { run, busy } = useAction()
  const toast = useToast()
  const [fn, setFn] = useState<any>(null)
  const [host, setHost] = useState<any>(null)
  const [faq, setFaq] = useState<any[]>(w.faq || [])
  const [basics, setBasics] = useState<any>({ name: w.name, couple: w.couple, start_date: w.start_date, end_date: w.end_date, city: w.city, venue: w.venue, budget_total: w.budget_total, guest_estimate: w.guest_estimate })
  const [archive, setArchive] = useState<any>(null)
  const perms = w.host_permissions || {}
  const setPerm = (k: string, v: boolean) => run('p', () => patch(`/weddings/${wid}`, { host_permissions: { ...perms, [k]: v } }), 'Host access updated').then(reload)
  const doArchive = async (force = false) => {
    try { await post(`/weddings/${wid}/archive`, { force, status: 'archived' }); toast('Wedding archived'); nav('/weddings') }
    catch (e: any) { if (e.status === 409) setArchive(e.detail?.blockers || [e.message]); else toast(e.message, 'error') }
  }
  return (
    <Wrap scoped>
      <h2 className="mb-4 text-2xl font-medium">Wedding setup</h2>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 font-semibold">Basics</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Name" value={basics.name || ''} onChange={e => setBasics({ ...basics, name: e.target.value })} />
            <Input className="sm:col-span-2" label="Couple" value={basics.couple || ''} onChange={e => setBasics({ ...basics, couple: e.target.value })} />
            <Input label="Start" type="date" value={basics.start_date || ''} onChange={e => setBasics({ ...basics, start_date: e.target.value })} />
            <Input label="End" type="date" value={basics.end_date || ''} onChange={e => setBasics({ ...basics, end_date: e.target.value })} />
            <Input label="City" value={basics.city || ''} onChange={e => setBasics({ ...basics, city: e.target.value })} />
            <Input label="Venue" value={basics.venue || ''} onChange={e => setBasics({ ...basics, venue: e.target.value })} />
            <Input label="Guest estimate" type="number" value={basics.guest_estimate || ''} onChange={e => setBasics({ ...basics, guest_estimate: +e.target.value })} />
            <Input label="Client budget (₹)" type="number" value={basics.budget_total || ''} onChange={e => setBasics({ ...basics, budget_total: +e.target.value })} />
          </div>
          <Button className="mt-4" variant="dark" loading={busy === 'b'} onClick={() => run('b', () => patch(`/weddings/${wid}`, basics), 'Saved').then(reload)}>Save basics</Button>
        </Card>
        <Card>
          <CardHeader title="Functions" action={<Button size="sm" icon={Plus} onClick={() => setFn({ name: '', date: w.start_date, start_time: '', end_time: '', venue: '', address: '', dress_code: '', map_url: '' })}>Add</Button>} />
          <Divided>{w.functions.map((f: any) => <Row key={f.id} onClick={() => setFn(f)}><div className="flex-1"><div className="font-semibold">{f.name}</div><div className="text-xs text-mute">{date(f.date)} · {hhmm(f.start_time)}–{hhmm(f.end_time)} · {f.venue}</div></div></Row>)}</Divided>
        </Card>
        <Card>
          <CardHeader title="Hosts & access" sub="What hosts can see and approve" icon={Crown} action={<Button size="sm" icon={Plus} onClick={() => setHost({ name: '', relation: '', phone: '', email: '' })}>Add host</Button>} />
          <Divided>{w.hosts.map((h: any) => <Row key={h.id} onClick={() => setHost(h)}><Avatar name={h.name} /><div className="flex-1"><div className="font-semibold">{h.name}</div><div className="text-xs text-mute">{h.relation} · {h.phone}</div></div></Row>)}</Divided>
          <div className="border-t border-line px-5 py-3">
            <Toggle label="Rooming approval" checked={!!perms.room_approval} onChange={v => setPerm('room_approval', v)} />
            <Toggle label="Media approval before publishing" checked={!!perms.media_approval} onChange={v => setPerm('media_approval', v)} />
            <Toggle label="Budget visibility & approvals" checked={!!perms.budget} onChange={v => setPerm('budget', v)} />
            <Toggle label="Guest additions & corrections" checked={!!perms.guest_edits} onChange={v => setPerm('guest_edits', v)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Team on this wedding" icon={Users} />
          <Divided>{(team?.members || []).filter((m: any) => m.status === 'active').map((m: any) => {
            const on = w.team.find((t: any) => t.id === m.id)
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar name={m.name} size={30} />
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{m.name}</div>{on ? <input defaultValue={(on.responsibilities || []).join(', ')} aria-label="Responsibilities" placeholder="Responsibilities" className="w-full bg-transparent text-xs text-mute focus:text-ink focus:outline-none" onBlur={e => me.can.team && post(`/weddings/${wid}/team`, { user_id: m.id, responsibilities: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }).then(reload)} /> : <div className="text-xs text-mute">{m.title}</div>}</div>
                {me.can.team && (on ? <Button size="sm" variant="ghost" onClick={() => run('t', () => del(`/weddings/${wid}/team/${m.id}`), 'Removed').then(reload)}>Remove</Button> : <Button size="sm" onClick={async () => { try { await post(`/weddings/${wid}/team`, { user_id: m.id }); reload() } catch (e: any) { if (e.status === 409 && window.confirm(`${e.message}. Assign anyway?`)) { await post(`/weddings/${wid}/team`, { user_id: m.id, override: true }); reload() } } }}>Assign</Button>)}
              </div>
            )
          })}</Divided>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Guest FAQ" sub="Powers the FAQ assistant on every guest page" action={<Button size="sm" loading={busy === 'f'} variant="dark" onClick={() => run('f', () => patch(`/weddings/${wid}`, { faq: faq.filter(x => x.q) }), 'FAQ saved').then(reload)}>Save FAQ</Button>} />
          <div className="space-y-2 p-4">
            {faq.map((x, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]"><Input aria-label="Question" value={x.q} onChange={e => setFaq(faq.map((y, j) => j === i ? { ...y, q: e.target.value } : y))} placeholder="Question" /><Input aria-label="Answer" value={x.a} onChange={e => setFaq(faq.map((y, j) => j === i ? { ...y, a: e.target.value } : y))} placeholder="Answer" /><Button variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setFaq(faq.filter((_, j) => j !== i))} /></div>)}
            <Button size="sm" icon={Plus} onClick={() => setFaq([...faq, { q: '', a: '' }])}>Add question</Button>
          </div>
        </Card>
        <Card className="border-rose/30 p-5 xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">Close & archive</div><p className="text-sm text-mute">Checks for open tasks, incidents, unpaid items, pending media approvals and testimonials first.</p></div><Button variant="danger" icon={Archive} onClick={() => doArchive()}>Archive wedding</Button></div>
        </Card>
      </div>
      <FnModal f={fn} onClose={() => setFn(null)} onDone={() => { setFn(null); reload() }} />
      <HostModal h={host} onClose={() => setHost(null)} onDone={() => { setHost(null); reload() }} />
      <Confirm open={!!archive} onClose={() => setArchive(null)} danger title="Open items remain" confirmLabel="Archive anyway" body={<ul className="list-disc pl-4">{(archive || []).map((b: string) => <li key={b}>{b}</li>)}</ul>} onConfirm={() => { setArchive(null); doArchive(true) }} />
    </Wrap>
  )
}
function FnModal({ f, onClose, onDone }: any) {
  const { wid } = useParams()
  const [x, setX] = useState<any>({})
  const { run, raw } = useAction()
  useEffect(() => { if (f) setX(f) }, [f])
  const remove = async (force = false) => { try { await raw('d', () => del(`/weddings/${wid}/functions/${x.id}${force ? '?force=1' : ''}`)); onDone() } catch (e: any) { if (e.status === 409 && window.confirm(e.message)) remove(true) } }
  return (
    <Modal open={!!f} onClose={onClose} title={x.id ? x.name : 'New function'} size="md" footer={<>{x.id && <Button variant="ghost" className="mr-auto text-rose" onClick={() => remove()}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!x.name} onClick={() => run('s', () => x.id ? patch(`/weddings/${wid}/functions/${x.id}`, x) : post(`/weddings/${wid}/functions`, x), 'Saved').then(onDone)}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Name" value={x.name || ''} onChange={e => setX({ ...x, name: e.target.value })} />
        <Input label="Date" type="date" value={x.date || ''} onChange={e => setX({ ...x, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-2"><Input label="Start" type="time" value={x.start_time || ''} onChange={e => setX({ ...x, start_time: e.target.value })} /><Input label="End" type="time" value={x.end_time || ''} onChange={e => setX({ ...x, end_time: e.target.value })} /></div>
        <Input label="Venue" value={x.venue || ''} onChange={e => setX({ ...x, venue: e.target.value })} />
        <Input label="Address" value={x.address || ''} onChange={e => setX({ ...x, address: e.target.value })} />
        <Input label="Dress code" value={x.dress_code || ''} onChange={e => setX({ ...x, dress_code: e.target.value })} />
        <Input label="Map link" value={x.map_url || ''} onChange={e => setX({ ...x, map_url: e.target.value })} />
      </div>
    </Modal>
  )
}
function HostModal({ h, onClose, onDone }: any) {
  const { wid } = useParams()
  const [x, setX] = useState<any>({})
  const { run } = useAction()
  useEffect(() => { if (h) setX(h) }, [h])
  return (
    <Modal open={!!h} onClose={onClose} title={x.id ? x.name : 'Add host'} size="sm" footer={<>{x.id && <Button variant="ghost" className="mr-auto text-rose" onClick={() => run('d', () => del(`/weddings/${wid}/hosts/${x.id}`), 'Host removed — link revoked').then(onDone)}>Remove</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!x.name} onClick={() => run('s', () => x.id ? patch(`/weddings/${wid}/hosts/${x.id}`, x) : post(`/weddings/${wid}/hosts`, x), 'Saved').then(onDone)}>Save</Button></>}>
      <div className="space-y-3">{(['name', 'relation', 'phone', 'email'] as const).map(k => <Input key={k} label={titleCase(k)} value={x[k] || ''} onChange={e => setX({ ...x, [k]: e.target.value })} />)}</div>
    </Modal>
  )
}
