import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Copy, Download, ExternalLink, Globe, Handshake, Heart, Images, Mail, Play, Plus, Power, Send, Shield, Sparkles, Star, Store, Trash2, Users2, Zap, KeyRound, Plug, Building2, MessageSquare, SlidersHorizontal, ScrollText, Database, RefreshCw, Lock,
} from 'lucide-react'
import { useApi, post, patch, del, fileUrl, get } from '../api'
import { useMe, useAuth } from '../auth'
import { Page } from '../shell'
import { Avatar, Badge, Button, Callout, Card, CardHeader, Check, Confirm, cx, DataTable, Divided, Empty, ErrorBox, Grid, Input, Loading, Modal, PageHeader, Progress, Row, Segmented, Select, Stat, Status, Textarea, Toggle, useAction, useToast } from '../ui'
import { ago, date, dateTime, inr, inrFull, plural, titleCase } from '../format'

// =====================================================================
// Proposals pipeline
// =====================================================================
const STAGES = [['new', 'New'], ['proposal_requested', 'Configured'], ['proposal_sent', 'Sent'], ['revision', 'Revision'], ['accepted', 'Accepted'], ['won', 'Won'], ['lost', 'Lost']]
export function Proposals() {
  const nav = useNavigate()
  const { data, error, reload } = useApi<any[]>('/leads')
  const [add, setAdd] = useState(false)
  const [stage, setStage] = useState('open')
  if (error) return <Page><ErrorBox error={error} /></Page>
  if (!data) return <Loading />
  const list = data.filter(l => stage === 'all' || (stage === 'open' ? !['won', 'lost'].includes(l.status) : l.status === stage))
  const pipeline = data.filter(l => ['proposal_sent', 'revision', 'accepted'].includes(l.status)).reduce((s, l) => s + (l.total || 0), 0)
  return (
    <Page wide>
      <PageHeader title="Proposals" sub="Make Your Own Wedding links, versioned quotes and one-click conversion into a wedding workspace" actions={<><Button icon={Store} onClick={() => nav('/proposals?catalogue=1')}>Catalogue</Button><Button variant="primary" icon={Plus} onClick={() => setAdd(true)}>New prospect</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Open leads" value={data.filter(l => !['won', 'lost'].includes(l.status)).length} />
        <Stat label="Pipeline value" value={inr(pipeline)} />
        <Stat label="Won" value={data.filter(l => l.status === 'won').length} tone="sage" />
        <Stat label="Win rate" value={`${Math.round(data.filter(l => l.status === 'won').length / Math.max(1, data.filter(l => ['won', 'lost'].includes(l.status)).length) * 100)}%`} />
      </Grid>
      <CatalogueInline />
      <Segmented className="mb-3" value={stage} onChange={setStage} options={[{ value: 'open', label: 'Open' }, ...STAGES.map(([v, l]) => ({ value: v, label: l, count: data.filter(x => x.status === v).length })), { value: 'all', label: 'All' }]} />
      <Card>
        <DataTable rows={list} rowKey={l => l.id} onRow={l => nav(`/proposals/${l.id}`)} empty={<Empty icon={Handshake} title="No leads here" />} cols={[
          { key: 'n', label: 'Prospect', mobile: 'title', render: l => <span className="font-semibold">{l.name}</span> },
          { key: 'd', label: 'Wedding', mobile: 'sub', render: l => `${l.destination || '—'} · ${l.wedding_date ? date(l.wedding_date, { month: 'short', year: 'numeric' }) : 'date TBC'} · ${l.guest_count || '?'} guests` },
          { key: 's', label: 'Source', render: l => <span className="text-xs text-mute">{l.source}</span> },
          { key: 'v', label: 'Proposal', render: l => l.version ? <span className="flex items-center gap-1.5 text-xs">v{l.version} <Status s={l.proposal_status} /></span> : '—' },
          { key: 't', label: 'Value', render: l => l.total ? <b className="tabular">{inr(l.total)}</b> : '—' },
          { key: 'st', label: 'Stage', render: l => <Status s={l.status} /> },
          { key: 'u', label: 'Updated', render: l => <span className="text-xs text-mute">{ago(l.updated_at)}</span> },
        ]} />
      </Card>
      <NewLead open={add} onClose={() => setAdd(false)} onDone={l => { setAdd(false); nav(`/proposals/${l.id}`) }} />
    </Page>
  )
}
function CatalogueInline() {
  const [sp, setSp] = useSearchParams()
  const open = sp.get('catalogue') === '1'
  const { data, reload } = useApi<any[]>(open ? '/catalogue' : null)
  const { run } = useAction()
  const [e, setE] = useState<any>(null)
  return (
    <Modal open={open} onClose={() => setSp({})} title="Service catalogue" sub="What prospects can pick in Make Your Own Wedding" size="xl">
      <div className="mb-3 flex justify-end"><Button size="sm" icon={Plus} onClick={() => setE({ kind: 'service', name: '', pricing: 'fixed', cost: 0, price: 0, category: '', description: '' })}>Add item</Button></div>
      {!data ? <Loading /> : <DataTable rows={data.filter(c => c.active)} rowKey={c => c.id} onRow={setE} cols={[
        { key: 'k', label: 'Type', render: c => <Badge tone={c.kind === 'function' ? 'saffron' : c.kind === 'addon' ? 'sky' : 'neutral'}>{c.kind}</Badge> },
        { key: 'n', label: 'Item', mobile: 'title', render: c => <span className="font-semibold">{c.name}</span> },
        { key: 'p', label: 'Pricing', render: c => c.pricing.replace('_', ' ') },
        { key: 'c', label: 'Cost', render: c => inrFull(c.cost) }, { key: 'pr', label: 'Price', render: c => <b>{inrFull(c.price)}</b> },
        { key: 'm', label: 'Margin', render: c => `${c.price ? Math.round((1 - c.cost / c.price) * 100) : 0}%` },
      ]} />}
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Edit item' : 'New item'} size="md" footer={<>{e?.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/catalogue/${e.id}`), 'Archived').then(() => { setE(null); reload() })}>Archive</Button>}<Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" onClick={() => run('s', () => e.id ? patch(`/catalogue/${e.id}`, e) : post('/catalogue', e), 'Saved').then(() => { setE(null); reload() })}>Save</Button></>}>
        {e && <div className="grid gap-3 sm:grid-cols-2"><Select label="Type" value={e.kind} onChange={x => setE({ ...e, kind: x.target.value })} options={['function', 'service', 'addon']} /><Select label="Pricing" value={e.pricing} onChange={x => setE({ ...e, pricing: x.target.value })} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'per_guest', label: 'Per guest' }, { value: 'per_function', label: 'Per function' }]} /><Input className="sm:col-span-2" label="Name" value={e.name} onChange={x => setE({ ...e, name: x.target.value })} /><Input label="Your cost (₹)" type="number" value={e.cost} onChange={x => setE({ ...e, cost: +x.target.value })} /><Input label="Price (₹)" type="number" value={e.price} onChange={x => setE({ ...e, price: +x.target.value })} /><Input label="Category" value={e.category || ''} onChange={x => setE({ ...e, category: x.target.value })} /><Textarea className="sm:col-span-2" label="Description (shown to prospects)" value={e.description || ''} onChange={x => setE({ ...e, description: x.target.value })} /></div>}
      </Modal>
    </Modal>
  )
}
function NewLead({ open, onClose, onDone }: any) {
  const [f, setF] = useState<any>({})
  const { run, busy } = useAction()
  useEffect(() => { if (open) setF({ name: '', phone: '', email: '', destination: '', wedding_date: '', guest_count: '', source: 'Referral', notes: '' }) }, [open])
  return (
    <Modal open={open} onClose={onClose} title="New prospect" size="md" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.name} loading={busy === 'c'} onClick={() => run('c', () => post('/leads', { ...f, guest_count: +f.guest_count || null }), 'Prospect created').then(r => r && onDone(r))}>Create</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2"><Input className="sm:col-span-2" label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /><Input label="WhatsApp" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /><Input label="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /><Input label="Destination" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} /><Input label="Wedding date" type="date" value={f.wedding_date} onChange={e => setF({ ...f, wedding_date: e.target.value })} /><Input label="Guests" type="number" value={f.guest_count} onChange={e => setF({ ...f, guest_count: e.target.value })} /><Input label="Source" value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /><Textarea className="sm:col-span-2" label="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
    </Modal>
  )
}

export function LeadDetail() {
  const { id } = useParams()
  const me = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const { data: l, error, reload } = useApi<any>(`/leads/${id}`)
  const { data: cat } = useApi<any[]>('/catalogue')
  const { run, busy, raw } = useAction()
  const [items, setItems] = useState<any[] | null>(null)
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [vi, setVi] = useState(0)
  const p = l?.proposals?.[vi]
  useEffect(() => { if (p) { setItems(p.items || []); setDiscount(p.discount || 0); setNotes(p.notes || '') } }, [p?.id, p?.updated_at])
  if (error) return <Page><ErrorBox error={error} /></Page>
  if (!l || !items) return <Loading />
  const editable = ['configuring', 'draft', 'submitted', 'revision_requested'].includes(p.status)
  const subtotal = items.reduce((s, i) => s + (+i.amount || 0), 0), cost = items.reduce((s, i) => s + (+i.cost || 0), 0)
  const total = Math.round(subtotal * (1 - discount / 100)), margin = total ? Math.round((1 - cost / total) * 100) : 0
  const save = () => raw('save', () => patch(`/proposals/${p.id}`, { items, discount, notes })).then(() => { toast('Proposal saved'); reload() }).catch(() => {})
  const addItem = (c: any) => { const q = c.pricing === 'per_guest' ? p.guest_count || 100 : c.pricing === 'per_function' ? Math.max(1, items.filter(i => i.kind === 'function').length) : 1; setItems([...items, { catalogue_id: c.id, kind: c.kind, category: c.category, name: c.name, pricing: c.pricing, unit: c.price, qty: q, amount: c.price * q, cost: c.cost * q }]) }
  const setQty = (i: number, qty: number) => setItems(items.map((x, j) => j === i ? { ...x, qty, amount: Math.round(x.unit * qty), cost: Math.round((x.cost / Math.max(1, x.qty)) * qty) } : x))
  return (
    <Page wide>
      <Link to="/proposals" className="mb-2 inline-block text-sm text-mute hover:text-ink">← Proposals</Link>
      <PageHeader title={l.name} sub={`${l.destination || 'Destination TBC'} · ${l.wedding_date ? date(l.wedding_date, { day: 'numeric', month: 'short', year: 'numeric' }) : 'date TBC'} · ${l.guest_count || '?'} guests · ${l.source}`}
        actions={<>
          <Button icon={Copy} onClick={() => { navigator.clipboard?.writeText(location.origin + l.link); toast('Prospect link copied') }}>Copy link</Button>
          <a href={l.link} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-wash"><ExternalLink className="size-4" />Prospect view</a>
          <Button icon={Send} onClick={() => run('l', () => post(`/leads/${l.id}/send-link`), 'Make Your Own Wedding link sent')}>Send configurator</Button>
          {!['won', 'lost'].includes(l.status) && <Button variant="ghost" className="text-bad" onClick={() => run('lost', () => patch(`/leads/${l.id}`, { status: 'lost' }), 'Marked lost').then(reload)}>Mark lost</Button>}
        </>} />
      {p.status === 'revision_requested' && <div className="mb-4"><Callout tone="amber" icon={AlertTriangle}><b>Revision requested:</b> “{p.comment}”</Callout></div>}
      {p.status === 'accepted' && !l.wedding_id && <div className="mb-4"><Callout tone="sage" icon={CheckCircle2} action={<Button variant="success" size="sm" icon={Sparkles} onClick={() => nav(`/weddings/new?proposal=${p.id}`)}>Convert to wedding</Button>}>Accepted {ago(p.decided_at)}! Convert it into a pre-populated wedding workspace.</Callout></div>}
      {l.wedding_id && <div className="mb-4"><Callout tone="sage" icon={Heart} action={<Link to={`/w/${l.wedding_id}`} className="text-sm font-semibold underline">Open wedding</Link>}>Converted into a wedding.</Callout></div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title={`Proposal v${p.version}`} sub={<span className="flex items-center gap-2"><Status s={p.status} />{p.expires_at && p.status === 'sent' && `expires ${ago(p.expires_at)}`}</span>}
            action={l.proposals.length > 1 && <Select aria-label="Version" value={String(vi)} onChange={e => setVi(+e.target.value)} options={l.proposals.map((x: any, i: number) => ({ value: String(i), label: `v${x.version} · ${x.status}` }))} />} />
          {!items.length && <Empty icon={Handshake} title="No line items yet" sub="Send the Make Your Own Wedding link, or add items from the catalogue." />}
          <div className="scroll-x">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-mute"><th className="px-4 py-2">Item</th><th className="px-2 py-2">Pricing</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">Cost</th><th className="w-8" /></tr></thead>
              <tbody className="divide-y divide-line">{items.map((it, i) => (
                <tr key={i}>
                  <td className="px-4 py-2"><div className="font-semibold">{it.name}</div><div className="text-xs text-mute">{it.kind}</div></td>
                  <td className="px-2 py-2 text-xs text-mute">{it.pricing?.replace('_', ' ')} · {inrFull(it.unit)}</td>
                  <td className="px-2 py-2 text-right">{editable ? <input type="number" min={1} aria-label="Quantity" value={it.qty} onChange={e => setQty(i, +e.target.value)} className="h-8 w-20 rounded-lg border border-line px-2 text-right" /> : it.qty}</td>
                  <td className="px-2 py-2 text-right tabular">{editable ? <input type="number" aria-label="Price" value={it.amount} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, amount: +e.target.value } : x))} className="h-8 w-28 rounded-lg border border-line px-2 text-right" /> : inrFull(it.amount)}</td>
                  <td className="px-2 py-2 text-right text-xs text-mute tabular">{inrFull(it.cost)}</td>
                  <td>{editable && <button aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))} className="p-1 text-mute hover:text-bad"><Trash2 className="size-4" /></button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {editable && <div className="border-t border-line p-4"><Select aria-label="Add item" value="" onChange={e => { const c = cat?.find(x => x.id === e.target.value); if (c) addItem(c) }} placeholder="+ Add from catalogue" options={(cat || []).filter(c => c.active).map(c => ({ value: c.id, label: `${c.kind} · ${c.name} · ${inr(c.price)}${c.pricing !== 'fixed' ? ` ${c.pricing.replace('_', ' ')}` : ''}` }))} /></div>}
        </Card>
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-mute">Subtotal</span><span className="tabular">{inrFull(subtotal)}</span></div>
              <div className="flex items-center justify-between"><span className="text-mute">Discount</span>{editable ? <span className="flex items-center gap-1"><input type="number" min={0} max={50} aria-label="Discount percent" value={discount} onChange={e => setDiscount(+e.target.value)} className="h-8 w-16 rounded-lg border border-line px-2 text-right" />%</span> : <span>{discount}%</span>}</div>
              {discount > 15 && me.user.role !== 'owner' && <div className="text-xs text-bad">Discounts above 15% need the owner.</div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="tabular">{inrFull(total)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-mute">Internal cost</span><span className="tabular">{inrFull(cost)}</span></div>
              <div className="flex items-center justify-between"><span className="text-xs text-mute">Margin</span><Badge tone={margin < 25 ? 'rose' : margin < 35 ? 'amber' : 'sage'}>{margin}%</Badge></div>
            </div>
            {editable && <Textarea className="mt-4" label="Note to prospect" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />}
            <div className="mt-4 flex flex-col gap-2">
              {editable && <><Button variant="dark" loading={busy === 'save'} onClick={save}>Save</Button><Button variant="primary" icon={Send} disabled={!items.length} loading={busy === 'send'} onClick={async () => { await save(); run('send', () => post(`/proposals/${p.id}/send`, {}), 'Branded proposal sent').then(reload) }}>Send proposal</Button></>}
              {['sent', 'revision_requested', 'declined'].includes(p.status) && <Button icon={RefreshCw} onClick={() => run('nv', () => post(`/proposals/${p.id}/new-version`), 'New version created').then(() => { setVi(0); reload() })}>Create v{(l.proposals[0]?.version || 0) + 1}</Button>}
            </div>
          </Card>
          {p.preferences && <Card className="p-4 text-sm"><div className="mb-1 text-xs font-semibold text-mute">Prospect preferences</div>{p.preferences}</Card>}
          {l.notes && <Card className="p-4 text-sm"><div className="mb-1 text-xs font-semibold text-mute">Notes</div>{l.notes}</Card>}
        </div>
      </div>
    </Page>
  )
}

// =====================================================================
// Portfolio & testimonials
// =====================================================================
export function Portfolio() {
  const me = useMe()
  const toast = useToast()
  const { data, reload } = useApi<any>('/portfolio')
  const { run, raw } = useAction()
  const [cs, setCs] = useState<any>(null)
  if (!data) return <Loading />
  const publish = async (c: any, unpublish = false) => {
    try { await raw('p', () => post(`/case-studies/${c.id}/publish`, { unpublish })); toast(unpublish ? 'Unpublished' : 'Published to portfolio'); reload() }
    catch (e: any) { if (e.status === 409 && c.consent !== 'declined' && window.confirm(`${e.message}. Publish anyway (consent not required)?`)) { await post(`/case-studies/${c.id}/publish`, { consent_not_required: true }); reload() } }
  }
  return (
    <Page wide>
      <PageHeader title="Portfolio & testimonials" sub="Turn completed weddings into sales assets — with client consent"
        actions={<><a href={`/studio/${data.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-wash"><Globe className="size-4" />Public page</a>{me.can['portfolio.edit'] && <Button variant="primary" icon={Plus} onClick={() => setCs({ title: '', summary: '', wedding_id: '', services: [], media_ids: [] })}>New case study</Button>}</>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!data.case_studies.length && <Card className="md:col-span-2 xl:col-span-3"><Empty icon={Images} title="No case studies yet" /></Card>}
        {data.case_studies.map((c: any) => (
          <Card key={c.id} className="flex flex-col overflow-hidden">
            <CoverStrip ids={c.media_ids} wid={c.wedding_id} />
            <div className="flex-1 p-4"><div className="flex items-start justify-between gap-2"><div className="font-semibold">{c.title}</div><Status s={c.status} /></div><div className="text-xs text-mute">{c.wedding || 'No wedding linked'}</div><p className="mt-2 line-clamp-3 text-sm text-ink-2">{c.summary}</p></div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-xs">
              <span className="mr-auto flex items-center gap-1">Consent <Status s={c.consent === 'not_requested' ? 'draft' : c.consent} label={c.consent.replace('_', ' ')} /></span>
              {me.can['portfolio.edit'] && <>
                {c.consent === 'not_requested' && <Button size="sm" onClick={() => run('c', () => post(`/case-studies/${c.id}/request-consent`), 'Consent request sent to host').then(reload)}>Ask host</Button>}
                <Button size="sm" variant="ghost" onClick={() => setCs(c)}>Edit</Button>
                <Button size="sm" variant={c.status === 'published' ? 'ghost' : 'primary'} onClick={() => publish(c, c.status === 'published')}>{c.status === 'published' ? 'Unpublish' : 'Publish'}</Button>
              </>}
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Testimonials" icon={Star} />
          {data.testimonials.length ? <Divided>{data.testimonials.map((t: any) => (
            <div key={t.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold">{t.author || 'Awaiting host'} {t.rating ? <span className="text-haldi">{'★'.repeat(t.rating)}</span> : null}</div><Status s={t.status} /></div>
              <div className="text-xs text-mute">{t.wedding}</div>
              {t.body && <p className="mt-1 text-sm text-ink-2">“{t.body}”</p>}
              {me.can['portfolio.edit'] && t.status === 'submitted' && <div className="mt-2 flex gap-2"><Button size="sm" variant="success" onClick={() => run('t', () => patch(`/testimonials/${t.id}`, { status: 'published' }), 'Published').then(reload)}>Publish</Button><Button size="sm" onClick={() => run('t', () => patch(`/testimonials/${t.id}`, { status: 'private' }), 'Kept private').then(reload)}>Keep private</Button><Button size="sm" variant="ghost" onClick={() => run('t', () => patch(`/testimonials/${t.id}`, { status: 'revision_requested' }), 'Revision requested').then(reload)}>Ask for edit</Button></div>}
            </div>
          ))}</Divided> : <Empty icon={Star} title="No testimonials yet" />}
        </Card>
        <Card>
          <CardHeader title="Completed weddings" sub="Request testimonials and build case studies" icon={Heart} />
          <Divided>{data.completed.map((w: any) => <div key={w.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><div className="truncate font-semibold">{w.name}</div><div className="text-xs text-mute">{date(w.start_date)} · {w.media} published photo(s)</div></div>{me.can['portfolio.edit'] && <Button size="sm" onClick={() => run('r', () => post('/testimonials/request', { wedding_id: w.id }), 'Testimonial request sent to host').then(reload)}>Request testimonial</Button>}</div>)}</Divided>
        </Card>
      </div>
      <CaseStudyModal c={cs} completed={data.completed} onClose={() => setCs(null)} onDone={() => { setCs(null); reload() }} />
    </Page>
  )
}
function CoverStrip({ ids, wid }: { ids: string[]; wid: string }) {
  const { data } = useApi<any[]>(wid ? `/portfolio/media/${wid}` : null)
  const pics = (data || []).filter(m => (ids || []).includes(m.id)).slice(0, 3)
  return <div className="grid h-36 grid-cols-3 gap-0.5 bg-wash">{pics.length ? pics.map(m => <img key={m.id} src={fileUrl(m.file)} alt="" className="size-full object-cover" />) : <div className="col-span-3 grid place-items-center text-xs text-mute">No photos selected</div>}</div>
}
function CaseStudyModal({ c, completed, onClose, onDone }: any) {
  const [f, setF] = useState<any>({})
  const { data: media } = useApi<any[]>(f.wedding_id ? `/portfolio/media/${f.wedding_id}` : null)
  const { run } = useAction()
  useEffect(() => { if (c) setF({ ...c, services: (c.services || []).join(', ') }) }, [c])
  const toggle = (id: string) => setF({ ...f, media_ids: f.media_ids.includes(id) ? f.media_ids.filter((x: string) => x !== id) : [...f.media_ids, id] })
  return (
    <Modal open={!!c} onClose={onClose} title={f.id ? 'Edit case study' : 'New case study'} size="xl" footer={<>{f.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/case-studies/${f.id}`), 'Deleted').then(onDone)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.title} onClick={() => { const body = { ...f, services: f.services.split(',').map((s: string) => s.trim()).filter(Boolean) }; run('s', () => f.id ? patch(`/case-studies/${f.id}`, body) : post('/case-studies', body), 'Saved').then(onDone) }}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Wedding" value={f.wedding_id || ''} onChange={e => setF({ ...f, wedding_id: e.target.value, media_ids: [] })} placeholder="Choose…" options={completed.map((w: any) => ({ value: w.id, label: w.name }))} />
        <Input label="Title" value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} />
        <Textarea className="sm:col-span-2" label="Story" rows={4} value={f.summary || ''} onChange={e => setF({ ...f, summary: e.target.value })} />
        <Input className="sm:col-span-2" label="Services delivered" value={f.services || ''} onChange={e => setF({ ...f, services: e.target.value })} hint="comma separated" />
      </div>
      {f.wedding_id && <div className="mt-4"><div className="mb-2 text-sm font-semibold">Select photos ({f.media_ids?.length || 0})</div>
        {!media ? <Loading /> : !media.length ? <p className="text-sm text-mute">No approved public photos for this wedding.</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{media.map(m => <button key={m.id} onClick={() => toggle(m.id)} className={cx('relative overflow-hidden rounded-lg border-2', f.media_ids?.includes(m.id) ? 'border-brand' : 'border-transparent')}><img src={fileUrl(m.file)} alt="" className="aspect-[4/3] w-full object-cover" />{f.media_ids?.includes(m.id) && <CheckCircle2 className="absolute top-1 right-1 size-5 text-white drop-shadow" />}</button>)}</div>}
      </div>}
    </Modal>
  )
}

// =====================================================================
// Analytics
// =====================================================================
function Bar({ label, value, max, sub, tone = 'saffron' }: any) {
  return <div><div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-mute tabular">{sub ?? value}</span></div><Progress value={value} max={max} tone={tone} /></div>
}
export function Analytics() {
  const me = useMe()
  const nav = useNavigate()
  const [wid, setWid] = useState('')
  const [domain, setDomain] = useState('overview')
  const { data, error } = useApi<any>(`/analytics${wid ? `?wedding_id=${wid}` : ''}`)
  if (error) return <Page><ErrorBox error={error} /></Page>
  if (!data) return <Loading />
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const goEx = (x: any) => nav(x.wedding_id ? `/w/${x.wedding_id}/${x.module}` : wid ? `/w/${wid}/${x.module}` : '/weddings')
  return (
    <Page wide>
      <PageHeader title="Analytics" sub="Operational and business insight. Every number drills down to the records behind it." actions={<Select aria-label="Scope" className="w-56" value={wid} onChange={e => setWid(e.target.value)} placeholder="All weddings (agency)" options={me.weddings.map(w => ({ value: w.id, label: w.name }))} />} />
      {data.insufficient && <div className="mb-4"><Callout tone="sky">{data.guidance}</Callout></div>}
      {data.exceptions?.length > 0 && <Card className="mb-5"><CardHeader title="Exceptions worth acting on" icon={AlertTriangle} /><Divided>{data.exceptions.map((x: any, i: number) => <Row key={i} onClick={() => goEx(x)}><span className="size-2 rounded-full bg-haldi" /><div className="flex-1 text-sm font-semibold">{x.title}</div></Row>)}</Divided></Card>}
      <Segmented className="mb-4" value={domain} onChange={setDomain} options={[{ value: 'overview', label: 'Overview' }, { value: 'guests', label: 'Guests & comms' }, { value: 'logistics', label: 'Travel & vendors' }, { value: 'execution', label: 'Tasks & incidents' }, { value: 'finance', label: 'Budget' }, ...(data.sales ? [{ value: 'sales', label: 'Sales' }] : [])]} />
      {domain === 'overview' && <>
        <Grid cols={4} className="mb-5">
          <Stat label="RSVP response rate" value={`${pct(data.rsvp.responded, data.rsvp.total)}%`} sub={`${data.rsvp.responded}/${data.rsvp.total} function invites`} />
          <Stat label="WhatsApp delivery" value={`${pct(data.msgs.delivered, data.msgs.total)}%`} sub={`${data.msgs.read} read · ${data.msgs.failed} failed`} />
          <Stat label="Replies auto-handled" value={`${pct(data.inbound.auto, data.inbound.total)}%`} sub={`${data.inbound.total} inbound`} />
          <Stat label="Task completion" value={`${pct(data.tasks.done, data.tasks.total)}%`} sub={`${data.tasks.overdue} overdue`} tone={data.tasks.overdue ? 'amber' : undefined} />
        </Grid>
        {!wid && <Card><CardHeader title="By wedding" />
          <DataTable rows={data.per_wedding} rowKey={w => w.id} onRow={w => setWid(w.id)} cols={[
            { key: 'n', label: 'Wedding', mobile: 'title', render: w => <b>{w.name}</b> }, { key: 'd', label: 'Date', render: w => date(w.start_date) }, { key: 's', label: 'Status', render: w => <Status s={w.status} /> },
            { key: 'g', label: 'Guests', render: w => w.guests }, { key: 'r', label: 'RSVP', render: w => <span className="flex w-28 items-center gap-2"><Progress className="flex-1" value={w.rsvp_rate} tone="sage" /><span className="text-xs">{w.rsvp_rate}%</span></span> },
            { key: 't', label: 'Tasks done', render: w => <span className="flex w-28 items-center gap-2"><Progress className="flex-1" value={w.task_done} /><span className="text-xs">{w.task_done}%</span></span> },
          ]} /></Card>}
      </>}
      {domain === 'guests' && <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><div className="mb-4 font-semibold">RSVP</div><div className="space-y-3"><Bar label="Responded" value={data.rsvp.responded} max={data.rsvp.total} sub={`${data.rsvp.responded}/${data.rsvp.total}`} tone="sage" /><Bar label="Attending" value={data.rsvp.attending} max={data.rsvp.total} /><Bar label="Responded via WhatsApp reply" value={data.rsvp.via_wa} max={data.rsvp.responded} /><Bar label="Responded after a reminder" value={data.rsvp.after_reminder} max={data.rsvp.responded} tone="amber" /></div>
          {data.daily.length > 0 && <div className="mt-5"><div className="mb-2 text-xs font-semibold text-mute">Responses per day</div><div className="flex h-24 items-end gap-1">{data.daily.map((d: any) => <div key={d.day} title={`${d.day}: ${d.n}`} className="flex-1 rounded-t bg-brand/70" style={{ height: `${Math.max(4, d.n / Math.max(...data.daily.map((x: any) => x.n)) * 100)}%` }} />)}</div></div>}
        </Card>
        <Card className="p-5"><div className="mb-4 font-semibold">Messaging</div><div className="space-y-3"><Bar label="Delivered" value={data.msgs.delivered} max={data.msgs.total} sub={`${data.msgs.delivered}/${data.msgs.total}`} tone="sage" /><Bar label="Read" value={data.msgs.read} max={data.msgs.total} tone="sky" />{data.fail_reasons.map((r: any) => <Bar key={r.reason} label={`Failed: ${titleCase(r.reason)}`} value={r.n} max={data.msgs.total} sub={r.n} tone="rose" />)}</div></Card>
      </div>}
      {domain === 'logistics' && <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><div className="mb-4 font-semibold">Travel</div><div className="space-y-3"><Bar label="Confirmed" value={data.travel.confirmed} max={data.travel.total} sub={`${data.travel.confirmed}/${data.travel.total}`} tone="sage" /><Bar label="Needed OCR review" value={data.travel.review} max={data.travel.total} tone="amber" /><Bar label="Delayed arrivals" value={data.travel.delayed} max={data.travel.total} tone="rose" /></div><div className="mt-3 text-xs text-mute">Average OCR confidence {Math.round((data.travel.conf || 0) * 100)}%</div></Card>
        <Card><CardHeader title="Vendor performance" sub={`${pct(data.vendors.confirmed, data.vendors.total)}% confirmed · ${data.vendors.cancelled} cancelled · avg delay ${Math.round(data.vendors.avg_delay || 0)} min`} />
          <DataTable rows={data.vendor_perf} rowKey={v => v.name} cols={[{ key: 'n', label: 'Vendor', mobile: 'title', render: v => <b>{v.name}</b> }, { key: 'k', label: 'Type', mobile: 'sub', render: v => v.kind }, { key: 'o', label: 'On time', render: v => v.on_time_pct === null ? '—' : <Badge tone={v.on_time_pct >= 90 ? 'sage' : v.on_time_pct >= 75 ? 'amber' : 'rose'}>{v.on_time_pct}%</Badge> }, { key: 'd', label: 'Delays here', render: v => v.delays || 0 }, { key: 'r', label: 'Rating', render: v => `★ ${v.rating}` }]} />
        </Card>
      </div>}
      {domain === 'execution' && <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Tasks by owner" /><DataTable rows={data.by_owner} rowKey={o => o.name} cols={[{ key: 'n', label: 'Owner', mobile: 'title', render: o => <b>{o.name}</b> }, { key: 't', label: 'Total', render: o => o.total }, { key: 'd', label: 'Done', render: o => <span className="flex w-28 items-center gap-2"><Progress className="flex-1" value={o.done} max={o.total} tone="sage" />{pct(o.done, o.total)}%</span> }, { key: 'o', label: 'Overdue', render: o => o.overdue ? <Badge tone="rose">{o.overdue}</Badge> : '0' }]} /></Card>
        <Card className="p-5"><div className="mb-4 font-semibold">Incidents</div><div className="space-y-3">{data.incidents.length ? data.incidents.map((i: any) => <Bar key={i.severity} label={titleCase(i.severity)} value={i.resolved} max={i.n} sub={`${i.resolved}/${i.n} resolved`} tone={i.severity === 'critical' ? 'rose' : 'amber'} />) : <p className="text-sm text-mute">No incidents logged.</p>}</div><div className="mt-4 text-xs text-mute">{data.tasks.escalated} task(s) were escalated for being overdue · {data.tasks.blocked} currently blocked</div></Card>
      </div>}
      {domain === 'finance' && <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><div className="mb-4 font-semibold">Planned vs actual by category</div><div className="space-y-3">{data.budget_cats.map((c: any) => <Bar key={c.category} label={c.category} value={c.actual} max={c.planned} sub={`${inr(c.actual)} / ${inr(c.planned)}`} tone={c.actual > c.planned ? 'rose' : 'sage'} />)}</div></Card>
        <Card><CardHeader title="By wedding" /><DataTable rows={data.budget} rowKey={b => b.id} cols={[{ key: 'n', label: 'Wedding', mobile: 'title', render: b => <b>{b.name}</b> }, { key: 'p', label: 'Planned', render: b => inr(b.planned) }, { key: 'a', label: 'Actual', render: b => inr(b.actual) }, { key: 'v', label: 'Variance', render: b => b.planned ? <Badge tone={b.actual > b.planned ? 'rose' : 'sage'}>{Math.round((b.actual / b.planned - 1) * 100)}%</Badge> : '—' }]} /></Card>
      </div>}
      {domain === 'sales' && data.sales && <Grid cols={4}><Stat label="Leads" value={data.sales.leads.total} sub={`${data.sales.leads.open} open`} /><Stat label="Won" value={data.sales.leads.won} tone="sage" /><Stat label="Pipeline (sent)" value={inr(data.sales.pipeline)} /><Stat label="Accepted value" value={inr(data.sales.won_value)} /></Grid>}
    </Page>
  )
}

// =====================================================================
// Team management
// =====================================================================
export function Team() {
  const me = useMe()
  const toast = useToast()
  const { data, reload } = useApi<any>('/team')
  const [inv, setInv] = useState(false)
  const [edit, setEdit] = useState<any>(null)
  if (!data) return <Loading />
  return (
    <Page wide>
      <PageHeader title="Team" sub="Roles, permissions, wedding assignments and availability" actions={me.can.team && <Button variant="primary" icon={Plus} onClick={() => setInv(true)}>Invite member</Button>} />
      <Card>
        <DataTable rows={data.members} rowKey={m => m.id} onRow={m => (me.can.team || m.id === me.user.id) && setEdit(m)} cols={[
          { key: 'n', label: 'Member', mobile: 'title', render: m => <span className="flex items-center gap-3"><Avatar name={m.name} size={32} /><span><span className="block font-semibold">{m.name}{m.id === me.user.id && <span className="ml-1 text-xs text-mute">(you)</span>}</span><span className="block text-xs text-mute">{m.email}</span></span></span> },
          { key: 'r', label: 'Role', render: m => <span className="capitalize">{m.role}</span> },
          { key: 't', label: 'Title', mobile: 'sub', render: m => m.title || '—' },
          { key: 'w', label: 'Weddings', render: m => m.weddings },
          { key: 'o', label: 'Open tasks', render: m => m.open_tasks },
          { key: 'a', label: 'Availability', render: m => (m.unavailable || []).length ? <span className="text-xs text-warn">{m.unavailable.map((u: any) => `${date(u.from)}–${date(u.to)}`).join(', ')}</span> : <span className="text-xs text-mute">available</span> },
          { key: 's', label: 'Status', render: m => <span className="flex items-center gap-1.5"><Status s={m.status} />{m.status === 'invited' && me.can.team && <button className="text-xs font-semibold text-brand" onClick={e => { e.stopPropagation(); post(`/team/${m.id}/resend`).then((r: any) => { navigator.clipboard?.writeText(location.origin + r.invite_link); toast('Invite re-sent — link copied') }) }}>Resend</button>}</span> },
        ]} />
      </Card>
      <Card className="mt-5"><CardHeader title="Assignments" sub="Who is on which wedding" />
        <div className="scroll-x"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-mute"><th className="px-4 py-2">Member</th>{[...new Map(data.assignments.map((a: any) => [a.wedding_id, a])).values()].map((a: any) => <th key={a.wedding_id} className="px-3 py-2">{a.wedding}<div className="font-normal">{date(a.start_date)}</div></th>)}</tr></thead>
          <tbody className="divide-y divide-line">{data.members.filter((m: any) => m.status === 'active').map((m: any) => <tr key={m.id}><td className="px-4 py-2 font-semibold">{m.name}</td>{[...new Map(data.assignments.map((a: any) => [a.wedding_id, a])).values()].map((w: any) => { const a = data.assignments.find((x: any) => x.wedding_id === w.wedding_id && x.user_id === m.id); return <td key={w.wedding_id} className="px-3 py-2 text-xs">{a ? <Badge tone="saffron">{(a.responsibilities || []).join(', ') || 'assigned'}</Badge> : <span className="text-line">—</span>}</td> })}</tr>)}</tbody>
        </table></div>
      </Card>
      <InviteModal open={inv} keys={data.permission_keys} onClose={() => setInv(false)} onDone={() => { setInv(false); reload() }} />
      <MemberModal m={edit} keys={data.permission_keys} members={data.members} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />
    </Page>
  )
}
function PermGrid({ keys, value, onChange, disabled }: any) {
  return <div className="grid gap-x-6 sm:grid-cols-2">{Object.entries(keys).map(([k, l]: any) => <Toggle key={k} label={l} checked={!!value?.[k]} disabled={disabled} onChange={v => onChange({ ...value, [k]: v })} />)}</div>
}
function InviteModal({ open, keys, onClose, onDone }: any) {
  const [f, setF] = useState<any>({})
  const [link, setLink] = useState<string | null>(null)
  const { run, busy } = useAction()
  useEffect(() => { if (open) { setF({ name: '', email: '', title: '', role: 'coordinator', permissions: { documents: true } }); setLink(null) } }, [open])
  return (
    <Modal open={open} onClose={link ? onDone : onClose} title="Invite a team member" size="md" footer={link ? <Button variant="primary" onClick={onDone}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Mail} loading={busy === 'i'} disabled={!f.email} onClick={() => run('i', () => post('/team/invite', f), 'Invite sent').then(r => r && setLink(r.invite_link))}>Send invite</Button></>}>
      {link ? <Callout tone="sage" icon={CheckCircle2}>Invite emailed (simulated). They can also use this link — it expires in 7 days:<br /><a href={link} target="_blank" className="font-semibold underline">{location.origin}{link}</a></Callout> : <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /><Input label="Email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /><Input label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><Select label="Role" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} options={[{ value: 'coordinator', label: 'Coordinator (assigned weddings)' }, { value: 'planner', label: 'Planner (full access)' }]} /></div>
        {f.role === 'coordinator' && <div><div className="mb-1 text-sm font-semibold">Permissions</div><PermGrid keys={keys} value={f.permissions} onChange={(p: any) => setF({ ...f, permissions: p })} /></div>}
      </div>}
    </Modal>
  )
}
function MemberModal({ m, keys, members, onClose, onDone }: any) {
  const me = useMe()
  const [f, setF] = useState<any>({})
  const [deact, setDeact] = useState<any>(null)
  const [to, setTo] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const { run, raw } = useAction()
  useEffect(() => { if (m) { setF({ ...m }); setDeact(null) } }, [m])
  if (!m) return null
  const save = (p: any) => run('s', () => patch(`/team/${m.id}`, p), 'Saved').then(r => r && onDone())
  const deactivate = async () => { try { await raw('d', () => patch(`/team/${m.id}`, { status: 'deactivated', reassign_to: to || undefined })); onDone() } catch (e: any) { if (e.status === 409) setDeact(e.detail) } }
  const admin = me.can.team && m.role !== 'owner'
  return (
    <Modal open={!!m} onClose={onClose} title={m.name} sub={m.email} size="lg" footer={<>{admin && m.status === 'active' && m.id !== me.user.id && <><Button variant="ghost" className="mr-auto text-bad" onClick={deactivate}>Deactivate</Button><Button variant="ghost" onClick={() => save({ status: 'suspended' })}>Suspend</Button></>}{admin && m.status !== 'active' && m.status !== 'invited' && <Button className="mr-auto" onClick={() => save({ status: 'active' })}>Reactivate</Button>}{m.status === 'invited' && admin && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('r', () => post(`/team/${m.id}/revoke`), 'Invite revoked').then(onDone)}>Revoke invite</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => save({ title: f.title, role: admin ? f.role : undefined, permissions: admin ? f.permissions : undefined, unavailable: f.unavailable })}>Save</Button></>}>
      {deact && <div className="mb-4 space-y-2"><Callout tone="amber" icon={AlertTriangle}>{m.name} owns {deact.open_tasks} open task(s) on {deact.weddings} wedding(s). Choose who takes over.</Callout><div className="flex gap-2"><Select className="flex-1" aria-label="Reassign to" value={to} onChange={e => setTo(e.target.value)} placeholder="Reassign to…" options={members.filter((x: any) => x.id !== m.id && x.status === 'active').map((x: any) => ({ value: x.id, label: x.name }))} /><Button variant="danger" disabled={!to} onClick={deactivate}>Reassign & deactivate</Button></div></div>}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Title" value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} />{admin && <Select label="Role" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} options={[{ value: 'coordinator', label: 'Coordinator' }, { value: 'planner', label: 'Planner' }]} />}</div>
        {f.role === 'coordinator' && <div><div className="mb-1 text-sm font-semibold">Permissions</div><PermGrid keys={keys} value={f.permissions} disabled={!admin} onChange={(p: any) => setF({ ...f, permissions: p })} /><p className="mt-1 text-xs text-mute">Changes apply immediately, even mid-session.</p></div>}
        <div><div className="mb-1 text-sm font-semibold">Unavailable dates</div>
          <div className="flex flex-wrap gap-2">{(f.unavailable || []).map((u: any, i: number) => <Badge key={i} tone="amber">{date(u.from)} – {date(u.to)} <button aria-label="Remove" onClick={() => setF({ ...f, unavailable: f.unavailable.filter((_: any, j: number) => j !== i) })}>×</button></Badge>)}</div>
          <div className="mt-2 flex flex-wrap items-end gap-2"><Input label="From" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /><Input label="To" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /><Button disabled={!range.from || !range.to} onClick={() => { setF({ ...f, unavailable: [...(f.unavailable || []), range] }); setRange({ from: '', to: '' }) }}>Add</Button></div>
        </div>
      </div>
    </Modal>
  )
}

// =====================================================================
// Vendor directory
// =====================================================================
export function VendorDirectory() {
  const [sp] = useSearchParams()
  const { data, reload } = useApi<any[]>('/vendors')
  const [q, setQ] = useState(sp.get('q') || '')
  const [kind, setKind] = useState('')
  const [e, setE] = useState<any>(null)
  const { run, raw } = useAction()
  if (!data) return <Loading />
  const kinds = [...new Set(data.map(v => v.kind))].sort()
  const list = data.filter(v => (!q || `${v.name} ${v.contact} ${v.city}`.toLowerCase().includes(q.toLowerCase())) && (!kind || v.kind === kind))
  const save = async (force = false) => { try { await raw('s', () => e.id ? patch(`/vendors/${e.id}`, e) : post('/vendors', { ...e, force })); setE(null); reload() } catch (x: any) { if (x.status === 409 && window.confirm(`${x.message}. Add anyway?`)) save(true) } }
  return (
    <Page wide>
      <PageHeader title="Vendor directory" sub="Your trusted vendors with on-time performance from every wedding" actions={<Button variant="primary" icon={Plus} onClick={() => setE({ name: '', kind: 'Decorator', contact: '', phone: '', email: '', city: '', rating: 4.5 })}>Add vendor</Button>} />
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row"><Input className="flex-1" aria-label="Search" placeholder="Search vendors" value={q} onChange={x => setQ(x.target.value)} /><Select aria-label="Type" className="sm:w-48" value={kind} onChange={x => setKind(x.target.value)} placeholder="All types" options={kinds} /></div>
        <DataTable rows={list} rowKey={v => v.id} onRow={setE} cols={[
          { key: 'n', label: 'Vendor', mobile: 'title', render: v => <b>{v.name}</b> }, { key: 'k', label: 'Type', mobile: 'sub', render: v => `${v.kind} · ${v.city || ''}` },
          { key: 'c', label: 'Contact', render: v => <span className="text-xs">{v.contact} · {v.phone}</span> },
          { key: 'r', label: 'Rating', render: v => `★ ${v.rating ?? '—'}` },
          { key: 'o', label: 'On time', render: v => v.on_time_pct === null ? <span className="text-mute">new</span> : <Badge tone={v.on_time_pct >= 90 ? 'sage' : v.on_time_pct >= 75 ? 'amber' : 'rose'}>{v.on_time_pct}% of {v.jobs}</Badge> },
          { key: 'a', label: 'Assignments', render: v => v.assignments },
        ]} />
      </Card>
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? e.name : 'Add vendor'} size="md" footer={<>{e?.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/vendors/${e.id}`), 'Removed').then(() => { setE(null); reload() })}>Remove</Button>}<Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" disabled={!e?.name} onClick={() => save()}>Save</Button></>}>
        {e && <div className="grid gap-3 sm:grid-cols-2"><Input className="sm:col-span-2" label="Business name" value={e.name} onChange={x => setE({ ...e, name: x.target.value })} /><Select label="Type" value={e.kind} onChange={x => setE({ ...e, kind: x.target.value })} options={['Decorator', 'Caterer', 'Photographer', 'Videographer', 'DJ', 'Band', 'Mehendi Artist', 'Makeup Artist', 'Officiant', 'Driver', 'Florist', 'Lighting', 'Other']} /><Input label="City" value={e.city || ''} onChange={x => setE({ ...e, city: x.target.value })} /><Input label="Contact person" value={e.contact || ''} onChange={x => setE({ ...e, contact: x.target.value })} /><Input label="WhatsApp" value={e.phone || ''} onChange={x => setE({ ...e, phone: x.target.value })} /><Input label="Email" value={e.email || ''} onChange={x => setE({ ...e, email: x.target.value })} /><Input label="Rating" type="number" step="0.1" min={0} max={5} value={e.rating ?? ''} onChange={x => setE({ ...e, rating: +x.target.value })} /><Textarea className="sm:col-span-2" label="Notes" value={e.notes || ''} onChange={x => setE({ ...e, notes: x.target.value })} /></div>}
      </Modal>
    </Page>
  )
}

// =====================================================================
// Automation hub
// =====================================================================
const OPS = [['eq', 'equals'], ['neq', 'is not'], ['gt', 'greater than'], ['lt', 'less than'], ['contains', 'contains'], ['exists', 'is set']]
export function Automation() {
  const { data, reload } = useApi<any>('/automations', { poll: 20000 })
  const { data: templates } = useApi<any[]>('/templates')
  const { run, busy, raw } = useAction()
  const toast = useToast()
  const [e, setE] = useState<any>(null)
  const [tab, setTab] = useState<'rules' | 'runs'>('rules')
  if (!data) return <Loading />
  const toggle = async (r: any) => { try { await raw('t', () => patch(`/automations/${r.id}`, { enabled: r.enabled ? 0 : 1 })); toast(r.enabled ? 'Paused' : 'Enabled'); reload() } catch (x: any) { if (x.detail?.errors) toast(x.detail.errors[0], 'error') } }
  return (
    <Page wide>
      <PageHeader title="Automation hub" sub="Trigger → conditions → (delay / approval) → actions, with retries, loop guards and a full run log"
        actions={<><Button icon={Play} loading={busy === 'tick'} onClick={() => run('tick', () => post('/system/tick', { force: true }), (r: any) => `Reminder engine ran: ${r.log.length} action(s)`).then(reload)}>Run reminder engine now</Button>{data.can_edit && <Button variant="primary" icon={Plus} onClick={() => setE({ name: '', trigger: 'rsvp.submitted', conditions: [], actions: [{ type: 'notify_planner', title: '' }], delay_min: 0, requires_approval: 0, retries: 2 })}>New automation</Button>}</>} />
      {!data.can_edit && <div className="mb-4"><Callout tone="sky" icon={Lock}>You can view automations and their runs. Editing needs the “Edit automations” permission.</Callout></div>}
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'rules', label: 'Automations', count: data.rules.length }, { value: 'runs', label: 'Run log', count: data.runs.filter((r: any) => ['failed', 'loop_blocked', 'awaiting_approval'].includes(r.status)).length }]} />
      {tab === 'rules' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.rules.map((r: any) => (
            <Card key={r.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-semibold">{r.name}</div><div className="mt-0.5 text-xs text-mute">v{r.version} · {r.runs} run(s){r.wedding ? ` · ${r.wedding}` : ' · all weddings'}</div></div>
                <Toggle checked={!!r.enabled} onChange={() => data.can_edit && toggle(r)} disabled={!data.can_edit} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone="sky">When: {data.triggers[r.trigger]}</Badge>
                {(r.conditions || []).map((c: any, i: number) => <Badge key={i}>if {c.field} {OPS.find(o => o[0] === c.op)?.[1]} {String(c.value ?? '')}</Badge>)}
                {r.delay_min > 0 && <Badge tone="amber">wait {r.delay_min}m</Badge>}{r.requires_approval ? <Badge tone="amber">needs approval</Badge> : null}
                {(r.actions || []).map((a: any, i: number) => <Badge key={i} tone="saffron">→ {a.type.replace('_', ' ')}</Badge>)}
              </div>
              <div className="mt-auto flex items-center justify-between pt-3"><span className="text-xs text-mute">Last run: {r.last_status ? <Status s={r.last_status} /> : 'never'}</span>{data.can_edit && <Button size="sm" variant="ghost" onClick={() => setE(r)}>Edit</Button>}</div>
            </Card>
          ))}
        </div>
      ) : (
        <Card><DataTable rows={data.runs} rowKey={r => r.id} empty={<Empty icon={Zap} title="No runs yet" />} cols={[
          { key: 'n', label: 'Automation', mobile: 'title', render: r => <b>{r.name}</b> }, { key: 'e', label: 'Trigger', render: r => <span className="text-xs">{data.triggers[r.event] || r.event}</span> },
          { key: 's', label: 'Result', render: r => <Status s={r.status} /> }, { key: 'd', label: 'Detail', mobile: 'sub', render: r => <span className="text-xs text-ink-2">{r.detail}</span> },
          { key: 't', label: 'When', render: r => <span className="text-xs text-mute">{ago(r.created_at)}</span> },
        ]} /></Card>
      )}
      <RuleEditor r={e} data={data} templates={templates || []} onClose={() => setE(null)} onDone={() => { setE(null); reload() }} />
    </Page>
  )
}
function RuleEditor({ r, data, templates, onClose, onDone }: any) {
  const me = useMe()
  const [f, setF] = useState<any>({})
  const [test, setTest] = useState<any>(null)
  const { run, busy } = useAction()
  useEffect(() => { if (r) { setF(JSON.parse(JSON.stringify(r))); setTest(null) } }, [r])
  if (!r) return null
  const setA = (i: number, p: any) => setF({ ...f, actions: f.actions.map((a: any, j: number) => j === i ? { ...a, ...p } : a) })
  return (
    <Modal open={!!r} onClose={onClose} title={f.id ? `Edit · ${f.name}` : 'New automation'} sub={f.id ? 'Editing creates a new version; in-flight runs keep the old one' : undefined} size="xl"
      footer={<>{f.id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => run('d', () => del(`/automations/${f.id}`), 'Deleted').then(onDone)}>Delete</Button>}<Button onClick={() => run('t', () => post('/automations/test', f)).then(setTest)}>Test with sample data</Button><Button variant="primary" disabled={!f.name} loading={busy === 's'} onClick={() => run('s', () => f.id ? patch(`/automations/${f.id}`, f) : post('/automations', f), 'Saved (enable it from the list)').then(onDone)}>Save</Button></>}>
      <div className="space-y-5">
        {test && <Callout tone={test.ok ? 'sage' : 'rose'} icon={test.ok ? CheckCircle2 : AlertTriangle}>{test.ok ? `Configuration valid. Sample event ${test.sample_matches ? 'matches' : 'does not match'} the conditions.` : <ul className="list-disc pl-4">{test.errors.map((e: string) => <li key={e}>{e}</li>)}</ul>}</Callout>}
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Name" value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /><Select label="Scope" value={f.wedding_id || ''} onChange={e => setF({ ...f, wedding_id: e.target.value || null })} placeholder="All weddings" options={me.weddings.map(w => ({ value: w.id, label: w.name }))} /></div>
        <div><div className="mb-1.5 text-sm font-semibold">1 · When this happens</div><Select aria-label="Trigger" value={f.trigger} onChange={e => setF({ ...f, trigger: e.target.value })} options={Object.entries(data.triggers).map(([v, l]: any) => ({ value: v, label: l }))} /></div>
        <div><div className="mb-1.5 text-sm font-semibold">2 · Only if</div>
          {(f.conditions || []).map((c: any, i: number) => <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><Input aria-label="Field" value={c.field} onChange={e => setF({ ...f, conditions: f.conditions.map((x: any, j: number) => j === i ? { ...x, field: e.target.value } : x) })} placeholder="status / minutes / severity…" /><Select aria-label="Operator" value={c.op} onChange={e => setF({ ...f, conditions: f.conditions.map((x: any, j: number) => j === i ? { ...x, op: e.target.value } : x) })} options={OPS.map(([v, l]) => ({ value: v, label: l }))} /><Input aria-label="Value" value={c.value ?? ''} onChange={e => setF({ ...f, conditions: f.conditions.map((x: any, j: number) => j === i ? { ...x, value: e.target.value } : x) })} /><Button variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setF({ ...f, conditions: f.conditions.filter((_: any, j: number) => j !== i) })} /></div>)}
          <Button size="sm" icon={Plus} onClick={() => setF({ ...f, conditions: [...(f.conditions || []), { field: 'status', op: 'eq', value: '' }] })}>Add condition</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3"><Input label="Delay (minutes)" type="number" min={0} value={f.delay_min || 0} onChange={e => setF({ ...f, delay_min: +e.target.value })} /><Input label="Retries on failure" type="number" min={0} max={5} value={f.retries ?? 2} onChange={e => setF({ ...f, retries: +e.target.value })} /><div className="flex items-end"><Toggle label="Require planner approval" checked={!!f.requires_approval} onChange={v => setF({ ...f, requires_approval: v ? 1 : 0 })} /></div></div>
        <div><div className="mb-1.5 text-sm font-semibold">3 · Do this</div>
          {(f.actions || []).map((a: any, i: number) => (
            <div key={i} className="mb-2 space-y-2 rounded-xl border border-line p-3">
              <div className="flex gap-2"><Select className="flex-1" aria-label="Action" value={a.type} onChange={e => setA(i, { type: e.target.value })} options={[{ value: 'send_message', label: 'Send WhatsApp message' }, { value: 'notify_planner', label: 'Notify planner' }, { value: 'create_task', label: 'Create task' }, { value: 'create_incident', label: 'Create incident' }]} /><Button variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setF({ ...f, actions: f.actions.filter((_: any, j: number) => j !== i) })} /></div>
              {a.type === 'send_message' && <div className="grid gap-2 sm:grid-cols-2"><Select aria-label="Recipient" value={a.to || ''} onChange={e => setA(i, { to: e.target.value })} placeholder="Recipient…" options={[{ value: 'trigger', label: 'The guest / vendor who triggered it' }, { value: 'host', label: 'The host' }]} /><Select aria-label="Template" value={a.template_id || ''} onChange={e => setA(i, { template_id: e.target.value || undefined })} placeholder="Custom text" options={templates.map((t: any) => ({ value: t.id, label: t.name }))} />{!a.template_id && <Textarea className="sm:col-span-2" aria-label="Message" rows={2} value={a.body || ''} onChange={e => setA(i, { body: e.target.value })} placeholder="Hi {{first_name}}…" />}</div>}
              {['notify_planner', 'create_task', 'create_incident'].includes(a.type) && <div className="grid gap-2 sm:grid-cols-3"><Input className="sm:col-span-2" aria-label="Title" value={a.title || ''} onChange={e => setA(i, { title: e.target.value })} placeholder="Title (supports {{vendor}}, {{status}}…)" />{a.type === 'create_task' ? <Input aria-label="Due in hours" type="number" value={a.due_hours || 24} onChange={e => setA(i, { due_hours: +e.target.value, owner: 'lead' })} hint="due in hrs" /> : <Select aria-label="Severity" value={a.severity || 'info'} onChange={e => setA(i, { severity: e.target.value })} options={a.type === 'create_incident' ? ['low', 'medium', 'high', 'critical'] : ['info', 'warning', 'critical']} />}</div>}
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => setF({ ...f, actions: [...(f.actions || []), { type: 'notify_planner', title: '' }] })}>Add action</Button>
        </div>
      </div>
    </Modal>
  )
}

// =====================================================================
// Settings & administration
// =====================================================================
export function Settings() {
  const me = useMe()
  const { refresh } = useAuth()
  const { data, error, reload } = useApi<any>('/settings')
  const [sec, setSec] = useState('profile')
  const { run, busy, raw } = useAction()
  const toast = useToast()
  const [f, setF] = useState<any>(null)
  useEffect(() => { if (data) setF(JSON.parse(JSON.stringify(data))) }, [data])
  if (error) return <Page><ErrorBox error={error} /></Page>
  if (!f) return <Loading />
  const save = (section: string, d: any) => run('s', () => patch('/settings', { section, data: d }), 'Settings saved').then(() => { reload(); refresh() })
  const test = (key: string) => raw('t' + key, () => post(`/settings/integrations/${key}/test`, f.integrations?.[key] || {})).then(() => { toast('Connection OK'); reload() }).catch(() => reload())
  const SECS = [['profile', 'Agency profile', Building2], ['branding', 'Branding', Sparkles], ['messaging', 'Messaging', MessageSquare], ['defaults', 'Defaults', SlidersHorizontal], ['integrations', 'Integrations', Plug], ['security', 'Security', Shield], ['audit', 'Audit log', ScrollText], ['data', 'Data', Database]] as const
  const I = (s: string, k: string) => ({ value: f[s]?.[k] ?? '', onChange: (e: any) => setF({ ...f, [s]: { ...(f[s] || {}), [k]: e.target.value } }) })
  return (
    <Page wide>
      <PageHeader title="Settings & administration" sub={data.name} />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav className="scroll-x flex gap-1 lg:flex-col">{SECS.map(([k, l, Ic]) => <button key={k} onClick={() => setSec(k)} className={cx('flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium', sec === k ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-wash')}><Ic className="size-4" />{l}</button>)}</nav>
        <Card className="p-5 sm:p-6">
          {sec === 'profile' && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Input label="Agency name" value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /><Input label="Public URL slug" value={f.slug || ''} onChange={e => setF({ ...f, slug: e.target.value })} hint={`/studio/${f.slug}`} /><Input label="Tagline" value={f.tagline || ''} onChange={e => setF({ ...f, tagline: e.target.value })} /><Input label="City" value={f.city || ''} onChange={e => setF({ ...f, city: e.target.value })} /></div><Textarea label="About (portfolio page)" rows={4} value={f.about || ''} onChange={e => setF({ ...f, about: e.target.value })} /><Button variant="dark" loading={busy === 's'} onClick={() => save('profile', { name: f.name, slug: f.slug, tagline: f.tagline, about: f.about, city: f.city })}>Save</Button></div>}
          {sec === 'branding' && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><Input label="Logo text" {...I('branding', 'logo_text')} /><Input label="Primary colour" type="color" {...I('branding', 'color')} /><Input label="Accent colour" type="color" {...I('branding', 'accent')} /></div><div className="rounded-2xl p-6 text-white" style={{ background: f.branding?.color }}><div className="display text-2xl">{f.branding?.logo_text || f.name}</div><div className="mt-1 text-sm opacity-80">Preview of guest & proposal pages</div><div className="mt-3 inline-block rounded-lg px-3 py-1 text-sm font-semibold text-ink" style={{ background: f.branding?.accent }}>RSVP now</div></div><Button variant="dark" onClick={() => save('branding', f.branding)}>Save</Button></div>}
          {sec === 'messaging' && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Input label="WhatsApp business number" {...I('messaging', 'whatsapp_number')} /><Input label="Sender name" {...I('messaging', 'sender_name')} /><Input label="Email from" {...I('messaging', 'email_from')} /><Input label="Signature" {...I('messaging', 'signature')} /></div><Button variant="dark" onClick={() => save('messaging', f.messaging)}>Save</Button></div>}
          {sec === 'defaults' && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[['rsvp_reminder_hours', 'RSVP reminder interval (hours)'], ['rsvp_max_reminders', 'Max RSVP reminders before a follow-up task'], ['vendor_reminder_hours', 'Vendor confirmation reminder (hours)'], ['travel_reminder_hours', 'Travel details reminder (hours)'], ['pickup_window_min', 'Pickup clustering window (minutes)'], ['budget_variance_pct', 'Budget variance alert threshold (%)'], ['ocr_confidence_threshold', 'OCR auto-accept confidence (0–1)']].map(([k, l]) => <Input key={k} label={l} type="number" step="any" value={f.defaults?.[k] ?? ''} onChange={e => setF({ ...f, defaults: { ...f.defaults, [k]: +e.target.value } })} />)}
          </div><div className="text-sm font-semibold">Exchange rates to INR</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(f.defaults?.fx || {}).map(([c, v]: any) => <Input key={c} label={c} type="number" step="any" value={v} disabled={c === 'INR'} onChange={e => setF({ ...f, defaults: { ...f.defaults, fx: { ...f.defaults.fx, [c]: +e.target.value } } })} />)}</div><Button variant="dark" onClick={() => save('defaults', f.defaults)}>Save defaults</Button></div>}
          {sec === 'integrations' && <div className="space-y-4">
            {[['whatsapp', 'WhatsApp Cloud API', ['phone_number_id', 'access_token']], ['email', 'Email (SMTP)', ['smtp_host', 'from']], ['google_calendar', 'Google Calendar sync', ['calendar_id']], ['storage', 'Cloud storage', ['bucket']]].map(([k, l, fields]: any) => {
              const st = f.integrations?.[k]?.status
              return (
                <div key={k} className="rounded-2xl border border-line p-4">
                  <div className="mb-3 flex items-center justify-between"><div className="font-semibold">{l}</div><Status s={st || 'draft'} label={st || 'not connected'} /></div>
                  <div className="grid gap-3 sm:grid-cols-2">{fields.map((fl: string) => <Input key={fl} label={titleCase(fl)} type={/token/.test(fl) ? 'password' : 'text'} value={f.integrations?.[k]?.[fl] || ''} onChange={e => setF({ ...f, integrations: { ...f.integrations, [k]: { ...(f.integrations?.[k] || {}), [fl]: e.target.value } } })} />)}</div>
                  <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => save('integrations', { [k]: f.integrations?.[k] })}>Save</Button><Button size="sm" variant="dark" loading={busy === 't' + k} onClick={() => test(k)}>Test connection</Button>{k === 'whatsapp' && <Button size="sm" variant="ghost" onClick={() => save('integrations', { whatsapp: { ...f.integrations.whatsapp, status: st === 'outage' ? 'connected' : 'outage' } })}>{st === 'outage' ? 'End simulated outage' : 'Simulate outage'}</Button>}</div>
                </div>
              )
            })}
            <p className="text-xs text-mute">In this MVP, providers are simulated locally: messages are “delivered” to each recipient's link page, and invalid numbers, opt-outs and outages fail exactly as they would in production.</p>
          </div>}
          {sec === 'security' && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Input label="Session length (hours)" type="number" value={f.security?.session_hours ?? 12} onChange={e => setF({ ...f, security: { ...f.security, session_hours: +e.target.value } })} /><Input label="Secure link expiry (days)" type="number" value={f.security?.link_expiry_days ?? 60} onChange={e => setF({ ...f, security: { ...f.security, link_expiry_days: +e.target.value } })} /></div><Toggle label="Require two-factor for planners" sub="Enforced at next sign-in (needs an authenticator integration)" checked={!!f.security?.require_2fa} onChange={v => setF({ ...f, security: { ...f.security, require_2fa: v } })} /><Button variant="dark" onClick={() => save('security', f.security)}>Save</Button></div>}
          {sec === 'audit' && <AuditLog />}
          {sec === 'data' && <DataSection />}
        </Card>
      </div>
    </Page>
  )
}
function AuditLog() {
  const [q, setQ] = useState('')
  const [denied, setDenied] = useState(false)
  const { data } = useApi<any[]>(`/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(denied ? { denied: '1' } : {}) })}`)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3"><Input className="flex-1" aria-label="Filter" placeholder="Filter by action or person" value={q} onChange={e => setQ(e.target.value)} /><Check label="Blocked actions only" checked={denied} onChange={setDenied} /></div>
      {!data ? <Loading /> : <div className="max-h-[560px] divide-y divide-line overflow-y-auto rounded-xl border border-line">{data.map(a => <div key={a.id} className={cx('flex gap-3 px-3 py-2 text-xs', !a.allowed && 'bg-bad-50/50')}><span className="w-28 shrink-0 text-mute">{dateTime(a.created_at)}</span><span className="flex-1"><b>{a.actor_name}</b> <span className="text-mute">({a.actor_kind})</span> · {a.action}{a.detail ? <span className="text-mute"> · {a.detail.slice(0, 80)}</span> : ''}</span>{!a.allowed && <Badge tone="rose">blocked</Badge>}</div>)}</div>}
    </div>
  )
}
function DataSection() {
  const me = useMe()
  const { refresh } = useAuth()
  const [wid, setWid] = useState('')
  const [typed, setTyped] = useState('')
  const { run, busy } = useAction()
  const exportData = async () => { const d = await get('/settings/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = `sutr-export-${new Date().toISOString().slice(0, 10)}.json`; a.click() }
  const w = me.weddings.find(x => x.id === wid)
  return (
    <div className="space-y-6">
      <div><div className="font-semibold">Export</div><p className="mb-2 text-sm text-mute">Weddings, guests, RSVPs, vendors, tasks and expenses as JSON.</p><Button icon={Download} onClick={exportData}>Download export</Button></div>
      <div className="rounded-2xl border border-bad/30 p-4"><div className="font-semibold text-bad">Permanently delete a wedding</div><p className="mb-3 text-sm text-mute">Owner only. Removes every guest, message, file reference and link. This can't be undone.</p>
        <div className="grid gap-3 sm:grid-cols-2"><Select label="Wedding" value={wid} onChange={e => { setWid(e.target.value); setTyped('') }} placeholder="Choose…" options={me.weddings.map(x => ({ value: x.id, label: x.name }))} />{w && <Input label={`Type “${w.name}” to confirm`} value={typed} onChange={e => setTyped(e.target.value)} />}</div>
        <Button className="mt-3" variant="danger" disabled={!w || typed !== w.name || me.user.role !== 'owner'} loading={busy === 'del'} onClick={() => run('del', () => post('/settings/delete-wedding', { wedding_id: wid, confirm: typed }), 'Wedding deleted').then(() => { setWid(''); refresh() })}>Delete permanently</Button>
      </div>
    </div>
  )
}

// =====================================================================
// My profile
// =====================================================================
export function Profile() {
  const me = useMe()
  const { refresh } = useAuth()
  const { data } = useApi<any>('/team')
  const mine = data?.members.find((m: any) => m.id === me.user.id)
  const [f, setF] = useState<any>(null)
  const { run, busy } = useAction()
  useEffect(() => { if (mine) setF({ name: mine.name, phone: mine.phone || '', shift_status: mine.shift_status || 'off', password: '' }) }, [mine?.id])
  if (!f) return <Loading />
  return (
    <Page>
      <PageHeader title="My profile" sub={`${me.user.email} · ${me.user.role}`} />
      <Card className="max-w-xl space-y-4 p-5">
        <Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <Input label="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <div><div className="mb-1.5 text-[13px] font-semibold text-ink-2">Shift status</div><Segmented value={f.shift_status} onChange={v => setF({ ...f, shift_status: v })} options={[{ value: 'on', label: 'On shift' }, { value: 'break', label: 'On break' }, { value: 'off', label: 'Off' }]} /></div>
        <Input label="New password" type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} hint="leave empty to keep" autoComplete="new-password" />
        <Button variant="dark" loading={busy === 's'} onClick={() => run('s', () => patch('/auth/me', { ...f, password: f.password || undefined }), 'Profile saved').then(refresh)}>Save</Button>
      </Card>
    </Page>
  )
}
