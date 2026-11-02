import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Copy, FileText, Handshake, Heart, LayoutTemplate, Plus, Sparkles, Trash2, Users2, Clock, Flame,
} from 'lucide-react'
import { useApi, post, get } from '../api'
import { useMe, useAuth } from '../auth'
import { Page } from '../shell'
import { Avatar, Badge, Button, Callout, Card, CardHeader, Check, cx, Empty, ErrorBox, HealthRing, Input, Loading, PageHeader, Segmented, Select, Status, Textarea, Toggle, useAction, Divided, Row, Ticket } from '../ui'
import { date, dateLong, daysTo, hhmm, inr, plural, ago } from '../format'

// =====================================================================
// Agency workspace — Morning Brief
// =====================================================================
export function Brief() {
  const me = useMe()
  const { data: b, error, reload } = useApi<any>('/brief', { poll: 60000 })
  const nav = useNavigate()
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  if (error) return <Page><ErrorBox error={error} retry={reload} /></Page>
  if (!b) return <Loading />
  const go = (i: any) => nav(`/w/${i.wedding_id}/${i.module === 'overview' ? '' : i.module}`)
  return (
    <Page wide>
      <PageHeader eyebrow={dateLong(b.date)} title={`${hello}, ${me.user.name.split(' ')[0]}`} sub={b.summary}
        actions={<>
          {me.can.proposals && <Button icon={Handshake} onClick={() => nav('/proposals')}>Proposals</Button>}
          {me.can.createWedding && <Button variant="primary" icon={Plus} onClick={() => nav('/weddings/new')}>New wedding</Button>}
        </>} />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          {b.critical[0] ? (
            <Ticket stub="Needs you first" stubIcon={Flame} title={b.critical[0].title} sub={b.critical[0].wedding}
              sign={b.critical.length > 1 ? `+${b.critical.length - 1}` : undefined} signLabel={b.critical.length > 1 ? 'more critical' : undefined}
              rows={b.critical[0].next ? [{ icon: ArrowRight, text: b.critical[0].next }] : []}
              actions={<Button variant="haldi" size="lg" onClick={() => go(b.critical[0])}>Open it</Button>} />
          ) : <Ticket stub="All clear" stubIcon={CheckCircle2} title="Nothing critical across your weddings" sub={b.attention.length ? `${b.attention.length} smaller item(s) below` : 'Enjoy the quiet'} />}

          {b.critical.length + b.attention.length > 1 && (
            <Card>
              <CardHeader title="Everything else, most urgent first" icon={AlertTriangle} />
              <Divided>
                {[...b.critical.slice(1), ...b.attention].map((a: any, i: number) => (
                  <Row key={i} onClick={() => go(a)}>
                    <span className={cx('size-2.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-bad' : 'bg-haldi')} aria-label={a.severity} />
                    <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold">{a.title}</div><div className="text-sm text-mute">{a.wedding}{a.next ? <span>. {a.next}</span> : null}</div></div>
                  </Row>
                ))}
              </Divided>
            </Card>
          )}

          <Card>
            <CardHeader title="Weddings" sub={`${b.weddings.length} active`} icon={Heart} action={<Link to="/weddings" className="text-xs font-semibold text-brand">All weddings</Link>} />
            {b.weddings.length ? <Divided>
              {b.weddings.map((w: any) => (
                <Link key={w.id} to={`/w/${w.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-canvas sm:px-5">
                  <HealthRing score={w.score} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate font-semibold">{w.name}</span><Status s={w.status} /></div>
                    <div className="truncate text-sm text-mute">{w.status === 'live' ? 'Happening now' : w.days_out >= 0 ? `${w.days_out} days to go, ${date(w.start_date)}` : 'Completed'} in {w.city}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-mute" />
                </Link>
              ))}
            </Divided> : <Empty icon={Heart} title="No active weddings" sub="Create a wedding or convert an accepted proposal." />}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="This week" sub="Functions in the next 7 days" icon={CalendarDays} action={<Link to="/calendar" className="text-xs font-semibold text-brand">Calendar</Link>} />
            {b.functions.length ? <Divided>
              {b.functions.map((f: any) => (
                <Link key={f.id} to={`/w/${f.wedding_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5">
                  <div className="w-12 shrink-0 text-center"><div className="text-[11px] font-semibold text-mute">{date(f.date, { weekday: 'short' })}</div><div className="text-lg font-semibold">{date(f.date, { day: 'numeric' })}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{f.name}{f.live_status === 'live' && <span className="ml-2 inline-flex items-center gap-1 text-xs text-bad"><span className="live-dot size-1.5 rounded-full bg-bad" />live</span>}</div><div className="truncate text-xs text-mute">{f.wedding} · {hhmm(f.start_time)} · {f.venue}</div></div>
                </Link>
              ))}
            </Divided> : <div className="px-5 py-6 text-sm text-mute">No functions this week.</div>}
          </Card>

          <Card>
            <CardHeader title="My tasks" sub="Due today or overdue" icon={CheckCircle2} action={<Link to="/tasks?filter=mine" className="text-xs font-semibold text-brand">All tasks</Link>} />
            {b.my_tasks.length ? <Divided>
              {b.my_tasks.map((t: any) => (
                <Link key={t.id} to={t.wedding_id ? `/w/${t.wedding_id}/tasks` : '/tasks'} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas sm:px-5">
                  <Status s={t.status} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{t.title}</div><div className="truncate text-xs text-mute">{t.wedding || 'Agency'} · {t.due_at ? (daysTo(t.due_at)! < 0 ? <span className="text-bad">overdue {ago(t.due_at)}</span> : `due ${ago(t.due_at)}`) : 'no due date'}</div></div>
                </Link>
              ))}
            </Divided> : <div className="px-5 py-6 text-sm text-mute">Nothing due. 🎉</div>}
          </Card>

          <Card>
            <CardHeader title="Team today" icon={Users2} action={<Link to="/team" className="text-xs font-semibold text-brand">Team</Link>} />
            <div className="flex flex-wrap gap-2 p-4">
              {b.team.map((u: any) => (
                <div key={u.id} className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1">
                  <Avatar name={u.name} size={26} />
                  <span className="text-xs font-semibold">{u.name.split(' ')[0]}</span>
                  <span className={cx('size-2 rounded-full', !u.available_today ? 'bg-bad' : u.shift_status === 'on' ? 'bg-ok' : 'bg-line')} title={!u.available_today ? 'Unavailable' : u.shift_status === 'on' ? 'On shift' : 'Off shift'} />
                </div>
              ))}
            </div>
          </Card>

          {me.can.proposals && b.leads.length > 0 && (
            <Card>
              <CardHeader title="Open leads" icon={Handshake} action={<Link to="/proposals" className="text-xs font-semibold text-brand">Pipeline</Link>} />
              <Divided>{b.leads.map((l: any) => <Row key={l.id} onClick={() => nav(`/proposals/${l.id}`)}><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{l.name}</div><div className="text-xs text-mute">{l.destination || '—'} · {l.guest_count || '?'} guests</div></div><Status s={l.proposal_status || l.status} /></Row>)}</Divided>
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}

// =====================================================================
// Weddings list
// =====================================================================
export function Weddings() {
  const me = useMe()
  const { data, error, reload } = useApi<any[]>('/weddings')
  const [tab, setTab] = useState<'active' | 'completed' | 'all'>('active')
  const nav = useNavigate()
  if (error) return <Page><ErrorBox error={error} retry={reload} /></Page>
  if (!data) return <Loading />
  const list = data.filter(w => tab === 'all' || (tab === 'active' ? ['planning', 'live'].includes(w.status) : ['completed', 'archived'].includes(w.status)))
  return (
    <Page wide>
      <PageHeader title="Weddings" sub={`${data.length} wedding(s) you can access`} actions={me.can.createWedding && <Button variant="primary" icon={Plus} onClick={() => nav('/weddings/new')}>New wedding</Button>} />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[
        { value: 'active', label: 'Active', count: data.filter(w => ['planning', 'live'].includes(w.status)).length },
        { value: 'completed', label: 'Completed', count: data.filter(w => ['completed', 'archived'].includes(w.status)).length },
        { value: 'all', label: 'All' }]} />
      {!list.length ? <Card><Empty icon={Heart} title="No weddings here" action={me.can.createWedding && <Button variant="primary" icon={Plus} onClick={() => nav('/weddings/new')}>Create one</Button>} /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(w => (
            <Link key={w.id} to={`/w/${w.id}`} className="group flex flex-col rounded-2xl border border-line bg-card p-5 shadow-card hover:border-brand/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="truncate text-lg font-semibold">{w.name}</div><div className="truncate text-sm text-mute">{w.couple}</div></div>
                <HealthRing score={w.score} size={44} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-mute">Dates</div><div className="font-semibold">{date(w.start_date)}</div></div>
                <div><div className="text-mute">Guests</div><div className="font-semibold">{w.guest_count}</div></div>
                <div><div className="text-mute">Status</div><Status s={w.status} /></div>
              </div>
              <div className={cx('mt-4 flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium', w.critical ? 'bg-bad-50 text-bad' : w.top ? 'bg-warn-50 text-warn' : 'bg-ok-50 text-ok')}>
                {w.critical ? <AlertTriangle className="size-3.5 shrink-0" /> : <CheckCircle2 className="size-3.5 shrink-0" />}
                <span className="truncate">{w.top?.title || 'On track'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  )
}

// =====================================================================
// Create wedding wizard
// =====================================================================
type Fn = { name: string; date: string; start_time?: string; venue?: string; dress_code?: string }
const STEPS = ['Method', 'Basics', 'Functions', 'People', 'Preferences', 'Review']

export function CreateWedding() {
  const me = useMe()
  const { refresh } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { run, busy } = useAction()
  const { data: sops } = useApi<any[]>('/sops')
  const { data: team } = useApi<any>('/team')
  const { data: weddings } = useApi<any[]>('/weddings')
  const { data: leads } = useApi<any[]>(me.can.proposals ? '/leads' : null)
  const [step, setStep] = useState(0)
  const [v, setV] = useState<any>(null)
  const [f, setF] = useState<any>({
    method: sp.get('proposal') ? 'proposal' : 'scratch', proposal_id: sp.get('proposal') || '', clone_from: '', copy: ['functions', 'faq'], sop_id: '',
    name: '', couple: '', start_date: '', end_date: '', city: '', venue: '', guest_estimate: '', budget_total: '',
    functions: [] as Fn[], hosts: [{ name: '', phone: '', email: '', relation: '' }], team: [] as string[],
    host_room_approval: true, host_media_approval: true, host_budget: false, host_guest_edits: false, whatsapp: true, email: false, auto_reminders: true,
  })
  const set = (k: string, val: any) => setF((s: any) => ({ ...s, [k]: val }))
  const accepted = (leads || []).filter(l => l.proposal_status === 'accepted' && !l.wedding_id)

  useEffect(() => {
    if (f.method !== 'proposal' || !f.proposal_id || !leads) return
    const l = leads.find(x => x.proposal_id === f.proposal_id)
    if (!l) return
    get(`/leads/${l.id}`).then(d => {
      const p = d.proposals.find((x: any) => x.id === f.proposal_id)
      setF((s: any) => ({ ...s, name: s.name || `${l.name} Wedding`, couple: s.couple || l.name, start_date: s.start_date || p.wedding_date || '', end_date: s.end_date || p.wedding_date || '', city: s.city || p.destination || '', guest_estimate: s.guest_estimate || p.guest_count || '', budget_total: s.budget_total || p.total || '',
        functions: s.functions.length ? s.functions : (p.items || []).filter((i: any) => i.kind === 'function').map((i: any) => ({ name: i.name, date: p.wedding_date || '' })),
        hosts: s.hosts[0]?.name ? s.hosts : [{ name: l.name, phone: l.phone || '', email: l.email || '', relation: 'Client' }] }))
    })
  }, [f.method, f.proposal_id, leads])
  useEffect(() => {
    if (f.method !== 'clone' || !f.clone_from) return
    get(`/weddings/${f.clone_from}`).then(w => setF((s: any) => ({ ...s, functions: s.copy.includes('functions') ? w.functions.map((x: any) => ({ name: x.name, date: '', start_time: x.start_time, venue: x.venue, dress_code: x.dress_code })) : s.functions, city: s.city || w.city, venue: s.venue || w.venue })))
  }, [f.method, f.clone_from])

  const payload = () => ({ ...f, guest_estimate: +f.guest_estimate || null, budget_total: +f.budget_total || null, hosts: f.hosts.filter((h: any) => h.name), functions: f.functions.filter((x: Fn) => x.name).map((x: Fn) => ({ ...x, date: x.date || f.start_date })), proposal_id: f.method === 'proposal' ? f.proposal_id : undefined, clone_from: f.method === 'clone' ? f.clone_from : undefined, sop_id: f.sop_id || undefined })
  const validate = async () => { const r = await post('/weddings', { ...payload(), dry_run: true }); setV(r); return r }
  const next = async () => { if (step === 4) await validate(); setStep(s => Math.min(STEPS.length - 1, s + 1)) }
  const publish = async (override = false) => {
    const w = await run('publish', () => post('/weddings', { ...payload(), override }), 'Wedding workspace created')
    if (w) { await refresh(); nav(`/w/${w.id}`) }
  }
  const canNext = step === 0 ? (f.method !== 'proposal' || f.proposal_id) && (f.method !== 'clone' || f.clone_from) : step === 1 ? f.name && f.start_date : true

  return (
    <Page>
      <PageHeader eyebrow="New wedding" title="Create a wedding workspace" sub="Minimal setup now — everything can be edited later." />
      <ol className="scroll-x mb-5 flex gap-2">
        {STEPS.map((s, i) => (
          <li key={s}><button onClick={() => i < step && setStep(i)} className={cx('flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold whitespace-nowrap', i === step ? 'bg-ink text-canvas' : i < step ? 'bg-ok-50 text-ok' : 'bg-wash text-mute')}>
            <span className="grid size-5 place-items-center rounded-full bg-canvas/20 text-[11px]">{i < step ? '✓' : i + 1}</span>{s}
          </button></li>
        ))}
      </ol>
      <Card className="p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[['scratch', 'From scratch', 'Enter the basics yourself', FileText], ['template', 'From an SOP template', 'Pre-load a task plan', LayoutTemplate], ['clone', 'Clone a past wedding', 'Copy functions, vendors, budget…', Copy], ['proposal', 'From an accepted proposal', 'Pre-fill functions, services & budget', Handshake]].map(([k, t, d, I]: any) => (
                <button key={k} onClick={() => set('method', k)} disabled={k === 'proposal' && !accepted.length && !f.proposal_id} className={cx('flex items-start gap-3 rounded-2xl border p-4 text-left disabled:opacity-40', f.method === k ? 'border-brand bg-brand-50/50 ring-2 ring-brand/15' : 'border-line hover:bg-canvas')}>
                  <I className="mt-0.5 size-5 text-brand" /><span><span className="block font-semibold">{t}</span><span className="text-sm text-mute">{k === 'proposal' && !accepted.length ? 'No accepted proposals waiting' : d}</span></span>
                </button>
              ))}
            </div>
            {f.method === 'template' && <Select label="SOP template" value={f.sop_id} onChange={e => set('sop_id', e.target.value)} placeholder="Choose…" options={(sops || []).map(s => ({ value: s.id, label: `${s.name} (${s.steps?.length} tasks)` }))} />}
            {f.method === 'clone' && <>
              <Select label="Source wedding" value={f.clone_from} onChange={e => set('clone_from', e.target.value)} placeholder="Choose…" options={(weddings || []).map(w => ({ value: w.id, label: w.name }))} />
              <div><div className="mb-1.5 text-[13px] font-semibold text-ink-2">Copy</div><div className="flex flex-wrap gap-4">{['functions', 'vendors', 'budget', 'tasks', 'faq'].map(k => <Check key={k} label={k[0].toUpperCase() + k.slice(1)} checked={f.copy.includes(k)} onChange={c => set('copy', c ? [...f.copy, k] : f.copy.filter((x: string) => x !== k))} />)}</div><p className="mt-1 text-xs text-mute">Guests are never copied automatically. Import them from the source wedding in Guest Operations if needed.</p></div>
            </>}
            {f.method === 'proposal' && <Select label="Accepted proposal" value={f.proposal_id} onChange={e => set('proposal_id', e.target.value)} placeholder="Choose…" options={accepted.map(l => ({ value: l.proposal_id, label: `${l.name} · v${l.version} · ${inr(l.total)}` }))} />}
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Wedding name" required value={f.name} onChange={e => set('name', e.target.value)} placeholder="Meera & Aarav · Udaipur" className="sm:col-span-2" />
            <Input label="Couple" value={f.couple} onChange={e => set('couple', e.target.value)} placeholder="Meera Kapoor & Aarav Malhotra" className="sm:col-span-2" />
            <Input label="Start date" type="date" required value={f.start_date} onChange={e => set('start_date', e.target.value)} />
            <Input label="End date" type="date" value={f.end_date} min={f.start_date} onChange={e => set('end_date', e.target.value)} />
            <Input label="City" value={f.city} onChange={e => set('city', e.target.value)} />
            <Input label="Main venue" value={f.venue} onChange={e => set('venue', e.target.value)} />
            <Input label="Guest estimate" type="number" min={0} value={f.guest_estimate} onChange={e => set('guest_estimate', e.target.value)} />
            <Input label="Budget baseline (₹)" type="number" min={0} value={f.budget_total} onChange={e => set('budget_total', e.target.value)} />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            {f.functions.map((fn: Fn, i: number) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1.2fr_auto] sm:items-end">
                <Input label="Function" value={fn.name} onChange={e => set('functions', f.functions.map((x: Fn, j: number) => j === i ? { ...x, name: e.target.value } : x))} />
                <Input label="Date" type="date" value={fn.date} min={f.start_date} max={f.end_date || undefined} onChange={e => set('functions', f.functions.map((x: Fn, j: number) => j === i ? { ...x, date: e.target.value } : x))} />
                <Input label="Time" type="time" value={fn.start_time || ''} onChange={e => set('functions', f.functions.map((x: Fn, j: number) => j === i ? { ...x, start_time: e.target.value } : x))} />
                <Input label="Venue" value={fn.venue || ''} onChange={e => set('functions', f.functions.map((x: Fn, j: number) => j === i ? { ...x, venue: e.target.value } : x))} />
                <Button variant="ghost" icon={Trash2} aria-label="Remove function" onClick={() => set('functions', f.functions.filter((_: Fn, j: number) => j !== i))} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button icon={Plus} onClick={() => set('functions', [...f.functions, { name: '', date: f.start_date }])}>Add function</Button>
              {!f.functions.length && ['Haldi', 'Mehendi', 'Sangeet', 'Wedding', 'Reception'].map(n => <Button key={n} variant="ghost" size="sm" onClick={() => set('functions', [...f.functions, { name: n, date: f.start_date }])}>+ {n}</Button>)}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <div className="mb-2 font-semibold">Host contacts</div>
              <div className="space-y-2">
                {f.hosts.map((h: any, i: number) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-4">
                    {(['name', 'relation', 'phone', 'email'] as const).map(k => <Input key={k} aria-label={k} placeholder={k[0].toUpperCase() + k.slice(1)} value={h[k]} onChange={e => set('hosts', f.hosts.map((x: any, j: number) => j === i ? { ...x, [k]: e.target.value } : x))} />)}
                  </div>
                ))}
                <Button size="sm" icon={Plus} onClick={() => set('hosts', [...f.hosts, { name: '', phone: '', email: '', relation: '' }])}>Add host</Button>
              </div>
              <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
                <Toggle label="Rooming approval" sub="Host approves the rooming list" checked={f.host_room_approval} onChange={x => set('host_room_approval', x)} />
                <Toggle label="Media approval" sub="Host approves photos before guests see them" checked={f.host_media_approval} onChange={x => set('host_media_approval', x)} />
                <Toggle label="Budget visibility" sub="Host can see planned vs actual" checked={f.host_budget} onChange={x => set('host_budget', x)} />
                <Toggle label="Guest additions" sub="Host can add or correct guests" checked={f.host_guest_edits} onChange={x => set('host_guest_edits', x)} />
              </div>
            </div>
            <div>
              <div className="mb-2 font-semibold">Assign team</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(team?.members || []).filter((m: any) => m.status === 'active').map((m: any) => (
                  <label key={m.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', f.team.includes(m.id) ? 'border-brand bg-brand-50/40' : 'border-line')}>
                    <input type="checkbox" className="accent-[#0E6B66]" checked={f.team.includes(m.id)} onChange={e => set('team', e.target.checked ? [...f.team, m.id] : f.team.filter((x: string) => x !== m.id))} />
                    <Avatar name={m.name} size={30} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="block truncate text-xs text-mute">{m.title}</span></span>
                    {(m.unavailable || []).some((r: any) => f.start_date && r.from <= (f.end_date || f.start_date) && r.to >= f.start_date) && <Badge tone="rose">Unavailable</Badge>}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <Toggle label="WhatsApp messaging" sub="Primary channel for guests and vendors" checked={f.whatsapp} onChange={x => set('whatsapp', x)} />
            <Toggle label="Email messaging" sub="Fallback for guests without WhatsApp" checked={f.email} onChange={x => set('email', x)} />
            <Toggle label="Automatic RSVP reminders" sub="Two reminders, then a manual follow-up task" checked={f.auto_reminders} onChange={x => set('auto_reminders', x)} />
            {f.method !== 'template' && <Select label="Apply an SOP task plan (optional)" value={f.sop_id} onChange={e => set('sop_id', e.target.value)} placeholder="None" options={(sops || []).map(s => ({ value: s.id, label: s.name }))} />}
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            {v?.errors?.length > 0 && <Callout tone="rose" icon={AlertTriangle}><b>Fix before publishing:</b><ul className="mt-1 list-disc pl-4">{v.errors.map((e: string) => <li key={e}>{e}</li>)}</ul></Callout>}
            {v?.conflicts?.length > 0 && <Callout tone="amber" icon={Clock}><b>Scheduling conflicts:</b><ul className="mt-1 list-disc pl-4">{v.conflicts.map((c: any, i: number) => <li key={i}>{c.message}</li>)}</ul><p className="mt-1">Resolve them by going back, or publish with an override (it will be logged).</p></Callout>}
            {v && !v.errors.length && !v.conflicts.length && <Callout tone="sage" icon={CheckCircle2}>All checks passed.</Callout>}
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[['Name', f.name], ['Dates', `${date(f.start_date)} → ${date(f.end_date || f.start_date)}`], ['Venue', [f.venue, f.city].filter(Boolean).join(', ') || '—'], ['Functions', f.functions.map((x: Fn) => x.name).filter(Boolean).join(', ') || '—'], ['Hosts', f.hosts.filter((h: any) => h.name).map((h: any) => h.name).join(', ') || '—'], ['Team', (team?.members || []).filter((m: any) => f.team.includes(m.id)).map((m: any) => m.name).join(', ') || '—'], ['Budget', f.budget_total ? inr(+f.budget_total) : '—'], ['Guests', f.guest_estimate || '—']].map(([k, val]) => (
                <div key={k as string}><dt className="text-xs text-mute">{k}</dt><dd className="font-semibold">{val}</dd></div>
              ))}
            </dl>
          </div>
        )}
        <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => step ? setStep(step - 1) : nav(-1)}>{step ? 'Back' : 'Cancel'}</Button>
          {step < STEPS.length - 1 ? <Button variant="dark" disabled={!canNext} onClick={next}>Continue<ArrowRight className="size-4" /></Button> : (
            <div className="flex gap-2">
              <Button onClick={validate}>Re-check</Button>
              {v?.conflicts?.length > 0 && !v.errors.length ? <Button variant="danger" loading={busy === 'publish'} onClick={() => publish(true)}>Override & publish</Button>
                : <Button variant="primary" icon={Sparkles} disabled={!!v?.errors?.length} loading={busy === 'publish'} onClick={() => publish(false)}>Publish workspace</Button>}
            </div>
          )}
        </div>
      </Card>
    </Page>
  )
}
