import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Sparkles, ArrowRight, ArrowLeft, Star, PartyPopper, Clock, MessageSquare, X, Heart } from 'lucide-react'
import { post, fileUrl } from '../api'
import { Button, Callout, cx, Input, Textarea, useToast, Modal } from '../ui'
import { date, inr, inrFull } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, Section } from './common'

const STEPS = [['function', 'Functions', 'Which celebrations are you planning?'], ['service', 'Services', 'How much should we take off your plate?'], ['addon', 'Add-ons', 'Little extras that make it unforgettable'], ['details', 'Details', 'A few details to size the estimate']] as const

export default function ProspectPage() {
  const { token } = useParams()
  const { data, error, setData } = useLink<any>(`/p/${token}`)
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const p = data.proposal
  const view = !p || ['configuring', 'draft'].includes(p.status) ? 'configure' : p.status
  return (
    <div className="min-h-dvh bg-paper pb-10">
      <LinkHeader agency={data.agency} title={view === 'configure' ? 'Make Your Own Wedding' : `Your proposal${p ? ` · v${p.version}` : ''}`} sub={`For ${data.lead.name}${data.agency.tagline ? ` · ${data.agency.tagline}` : ''}`} />
      <main className="mx-auto -mt-4 max-w-3xl space-y-4 px-4">
        {view === 'configure' && <Configurator data={data} token={token!} onSaved={setData} />}
        {view === 'submitted' && <Section><div className="flex items-start gap-3"><Clock className="mt-0.5 size-5 text-saffron" /><div><div className="font-semibold">Your planner is reviewing your estimate</div><p className="text-sm text-mute">You'll get a branded proposal on WhatsApp shortly. Estimated total so far: <b className="text-ink">{inr(p.total)}</b>.</p></div></div></Section>}
        {view === 'revision_requested' && <Section><div className="flex items-start gap-3"><MessageSquare className="mt-0.5 size-5 text-saffron" /><div><div className="font-semibold">Changes requested</div><p className="text-sm text-mute">“{p.comment}” — a revised version is on its way.</p></div></div></Section>}
        {['sent', 'expired'].includes(view) && <ProposalView data={data} token={token!} onSaved={setData} />}
        {view === 'accepted' && <Section className="text-center"><PartyPopper className="mx-auto size-10 text-saffron" /><h2 className="mt-3 text-2xl font-medium">You're booked! 🎉</h2><p className="mt-1 text-sm text-mute">{data.agency.name} is setting up your wedding workspace. Your planner will be in touch on WhatsApp.</p></Section>}
        {view === 'declined' && <Section className="text-center"><Heart className="mx-auto size-8 text-mute" /><h2 className="mt-3 text-xl font-medium">Thanks for considering us</h2><p className="mt-1 text-sm text-mute">If plans change, just reply on WhatsApp — we'd love to help.</p></Section>}
        {(data.portfolio.length > 0 || data.testimonials.length > 0) && <>
          <h2 className="pt-4 text-xl font-medium">Weddings we've planned</h2>
          <div className="grid gap-3 sm:grid-cols-2">{data.portfolio.map((c: any) => <div key={c.id} className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">{c.cover && <img src={fileUrl(c.cover)} alt="" className="aspect-[16/9] w-full object-cover" />}<div className="p-4"><div className="font-semibold">{c.title}</div><p className="mt-1 line-clamp-3 text-sm text-mute">{c.summary}</p></div></div>)}</div>
          {data.testimonials.map((t: any, i: number) => <Section key={i}><div className="flex gap-0.5">{Array.from({ length: t.rating || 5 }, (_, k) => <Star key={k} className="size-4 fill-marigold text-marigold" />)}</div><p className="display mt-2 text-lg leading-snug">“{t.body}”</p><div className="mt-2 text-sm text-mute">— {t.author}</div></Section>)}
        </>}
      </main>
    </div>
  )
}

function Configurator({ data, token, onSaved }: any) {
  const toast = useToast()
  const p = data.proposal
  const [step, setStep] = useState(0)
  const [ids, setIds] = useState<string[]>(p?.selections?.ids || [])
  const [d, setD] = useState({ guest_count: p?.guest_count || data.lead.guest_count || 150, destination: p?.destination || data.lead.destination || '', wedding_date: p?.wedding_date || data.lead.wedding_date || '', preferences: p?.preferences || '' })
  const [est, setEst] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => post(`/l/p/${token}/estimate`, { ids, guest_count: d.guest_count }).then(setEst).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [ids.join(), d.guest_count])
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const kind = STEPS[step][0]
  const items = data.catalogue.filter((c: any) => c.kind === kind)
  const fnCount = data.catalogue.filter((c: any) => c.kind === 'function' && ids.includes(c.id)).length
  const submit = async () => {
    setBusy(true)
    try { onSaved(await post(`/l/p/${token}/configure`, { ids, ...d, guest_count: +d.guest_count, submit: true })); toast('Sent to your planner!') } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const priceLabel = (c: any) => c.pricing === 'per_guest' ? `${inr(c.price)} / guest` : c.pricing === 'per_function' ? `${inr(c.price)} / function` : inr(c.price)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="flex gap-1.5">{STEPS.map((s, i) => <button key={s[0]} onClick={() => setStep(i)} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-saffron' : 'bg-line')} aria-label={s[1]} />)}</div>
        <div><div className="text-xs font-semibold tracking-wide text-saffron uppercase">Step {step + 1} of {STEPS.length} · {STEPS[step][1]}</div><h2 className="mt-1 text-2xl font-medium">{STEPS[step][2]}</h2></div>
        {kind !== 'details' ? (
          <div className="grid gap-2.5 sm:grid-cols-2">{items.map((c: any) => {
            const on = ids.includes(c.id)
            return (
              <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on} className={cx('flex flex-col rounded-2xl border bg-card p-4 text-left shadow-card transition', on ? 'border-saffron ring-2 ring-saffron/20' : 'border-line hover:border-saffron/40')}>
                <div className="flex items-start justify-between gap-2"><span className="font-semibold">{c.name}</span><span className={cx('grid size-6 shrink-0 place-items-center rounded-full border', on ? 'border-saffron bg-saffron text-white' : 'border-line')}>{on && <Check className="size-4" />}</span></div>
                <span className="mt-1 flex-1 text-sm text-mute">{c.description}</span>
                <span className="mt-2 text-sm font-semibold text-ink-2">{priceLabel(c)}</span>
              </button>
            )
          })}</div>
        ) : (
          <Section>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Approx. guests" type="number" min={1} value={d.guest_count} onChange={e => setD({ ...d, guest_count: +e.target.value })} />
              <Input label="Destination" value={d.destination} onChange={e => setD({ ...d, destination: e.target.value })} placeholder="Udaipur, Goa, Kerala…" />
              <Input label="Tentative date" type="date" value={d.wedding_date} onChange={e => setD({ ...d, wedding_date: e.target.value })} />
              <Textarea className="sm:col-span-2" label="Tell us your dream" rows={4} value={d.preferences} onChange={e => setD({ ...d, preferences: e.target.value })} placeholder="Colours, vibe, must-haves, budget comfort…" />
            </div>
          </Section>
        )}
        <div className="flex justify-between">
          <Button variant="ghost" icon={ArrowLeft} disabled={!step} onClick={() => setStep(step - 1)}>Back</Button>
          {step < STEPS.length - 1 ? <Button variant="dark" onClick={() => setStep(step + 1)} disabled={step === 0 && !fnCount}>Continue<ArrowRight className="size-4" /></Button>
            : <Button variant="primary" size="lg" icon={Sparkles} loading={busy} disabled={!fnCount || !d.guest_count} onClick={submit}>Send to planner</Button>}
        </div>
      </div>
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Section title="Live estimate">
          {!est?.items?.length ? <p className="text-sm text-mute">Pick a few options to see your estimate.</p> : <>
            <div className="space-y-1.5 text-sm">{est.items.map((i: any) => <div key={i.catalogue_id} className="flex justify-between gap-2"><span className="truncate text-ink-2">{i.name}{i.qty > 1 && <span className="text-mute"> ×{i.qty}</span>}</span><span className="tabular">{inr(i.amount)}</span></div>)}</div>
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-semibold"><span>Estimate</span><span className="tabular">{inr(est.total)}</span></div>
            <p className="mt-1 text-xs text-mute">Indicative. Your planner finalizes pricing in the proposal.</p>
          </>}
        </Section>
      </div>
    </div>
  )
}

function ProposalView({ data, token, onSaved }: any) {
  const toast = useToast()
  const p = data.proposal
  const [mode, setMode] = useState<null | 'revision' | 'decline'>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const expired = p.status === 'expired'
  const decide = async (decision: string) => {
    setBusy(true)
    try { onSaved(await post(`/l/p/${token}/decision`, { decision, comment })); setMode(null); toast(decision === 'accept' ? 'Accepted — welcome aboard! 🎉' : decision === 'revision' ? 'Sent to your planner' : 'Thanks for letting us know') } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const groups = ['function', 'service', 'addon'].map(k => [k, p.items.filter((i: any) => i.kind === k)] as const).filter(([, l]) => l.length)
  return (
    <>
      {expired && <Callout tone="rose" icon={Clock}>This proposal expired on {date(p.expires_at)}. Request a fresh version and we'll update the pricing.</Callout>}
      <Section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><div className="text-sm text-mute">{p.guest_count} guests · {p.destination || 'Destination TBC'} · {p.wedding_date ? date(p.wedding_date, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date TBC'}</div></div>{p.expires_at && !expired && <div className="text-xs text-mute">Valid until {date(p.expires_at, { day: 'numeric', month: 'short' })}</div>}</div>
        {groups.map(([k, list]) => <div key={k} className="mb-4"><div className="mb-1.5 text-xs font-semibold tracking-wide text-saffron uppercase">{{ function: 'Celebrations', service: 'Services', addon: 'Add-ons' }[k]}</div>{list.map((i: any, n: number) => <div key={n} className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-0"><span>{i.name}{i.qty > 1 && <span className="text-mute"> · {i.qty} {i.pricing === 'per_guest' ? 'guests' : 'functions'}</span>}</span><span className="tabular">{inrFull(i.amount)}</span></div>)}</div>)}
        <div className="space-y-1 border-t-2 border-ink pt-3 text-sm">
          <div className="flex justify-between"><span className="text-mute">Subtotal</span><span className="tabular">{inrFull(p.subtotal)}</span></div>
          {p.discount > 0 && <div className="flex justify-between text-sage"><span>Discount ({p.discount}%)</span><span className="tabular">−{inrFull(p.subtotal - p.total)}</span></div>}
          <div className="flex justify-between pt-1 text-xl font-semibold"><span>Total</span><span className="tabular">{inrFull(p.total)}</span></div>
        </div>
        {p.notes && <div className="mt-4 rounded-xl bg-paper p-3 text-sm whitespace-pre-wrap"><div className="mb-1 text-xs font-semibold text-mute">A note from your planner</div>{p.notes}</div>}
      </Section>
      {!expired ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="ghost" onClick={() => setMode('decline')}>Decline</Button>
          <Button onClick={() => setMode('revision')}>Request changes</Button>
          <Button variant="success" size="lg" loading={busy} onClick={() => window.confirm(`Accept proposal for ${inrFull(p.total)}?`) && decide('accept')}>Accept proposal</Button>
        </div>
      ) : <Button className="w-full" onClick={() => setMode('revision')}>Request a fresh version</Button>}
      <Modal open={!!mode} onClose={() => setMode(null)} title={mode === 'decline' ? 'Decline this proposal?' : 'What should change?'} size="sm" footer={<Button className="w-full" variant={mode === 'decline' ? 'danger' : 'primary'} loading={busy} disabled={mode === 'revision' && !comment} onClick={() => decide(mode === 'decline' ? 'decline' : 'revision')}>{mode === 'decline' ? 'Decline' : 'Send to planner'}</Button>}>
        <Textarea rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder={mode === 'decline' ? 'Optional — tell us why' : 'e.g. Drop the reception, add a cocktail night, budget closer to ₹45L'} aria-label="Comment" />
      </Modal>
    </>
  )
}
