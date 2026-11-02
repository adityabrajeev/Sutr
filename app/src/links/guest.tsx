import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Home, MailCheck, Plane, CalendarHeart, Images, MessageCircle, BedDouble, Car, MapPin, Shirt, Clock, Sparkles, Upload, CheckCircle2, HelpCircle, Send, Utensils } from 'lucide-react'
import { post, api, fileUrl } from '../api'
import { Button, Callout, Check, cx, Input, Select, Textarea, useToast } from '../ui'
import { date, dateLong, hhmm, time, dateTime } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, TabBar, Section, WhatsAppPanel, Countdown, ActionCard } from './common'

type Tab = 'home' | 'rsvp' | 'travel' | 'schedule' | 'chat'
const DIETS = ['Vegetarian', 'Jain', 'Vegan', 'Gluten-free', 'No onion/garlic', 'Nut allergy']

export default function GuestPage() {
  const { token } = useParams()
  const { data, error, reload, setData } = useLink<any>(`/g/${token}`)
  const [tab, setTab] = useState<Tab>('home')
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const { wedding, guest, rsvps, functions, travel, trip, room } = data
  const pending = rsvps.filter((r: any) => r.status === 'pending').length
  const attending = rsvps.some((r: any) => r.status === 'attending')
  const unread = data.messages.filter((m: any) => m.direction === 'out' && m.status !== 'read').length
  const next = functions.find((f: any) => f.date >= new Date().toISOString().slice(0, 10))
  return (
    <div className="min-h-dvh bg-paper pb-24">
      <LinkHeader agency={data.agency} title={wedding.couple || wedding.name} sub={<>{dateLong(wedding.start_date)} · {wedding.venue || wedding.city}<div className="mt-3"><Countdown to={wedding.start_date} /></div></>} />
      <main className="mx-auto -mt-4 max-w-2xl space-y-4 px-4">
        {tab === 'home' && <>
          <Section><div className="text-lg font-semibold">Namaste, {guest.name.split(' ')[0]} 🙏</div><p className="mt-1 text-sm text-mute">Everything for the celebration lives here — no app or login needed.{data.members.length > 1 && ` You can respond for your household (${data.members.length} people).`}</p></Section>
          <div className="space-y-2.5">
            <ActionCard icon={MailCheck} title={pending ? `RSVP for ${pending} function${pending > 1 ? 's' : ''}` : 'RSVP received'} sub={pending ? 'Takes 30 seconds' : attending ? "We can't wait to see you" : 'Sorry you can’t make it'} tone={pending ? 'warn' : 'ok'} cta={pending ? 'RSVP' : 'Edit'} onClick={() => setTab('rsvp')} />
            {attending && <ActionCard icon={Plane} title={!travel || travel.status === 'pending' ? 'Share your travel' : travel.status === 'self' ? 'Own arrangements' : `${travel.number || travel.mode} · ${travel.arrive_at ? dateTime(travel.arrive_at) : ''}`} sub={!travel || travel.status === 'pending' ? 'Forward your ticket and we arrange pickup' : travel.status === 'review' ? 'We’re double-checking your ticket' : 'Travel saved'} tone={!travel || travel.status === 'pending' ? 'warn' : 'ok'} onClick={() => setTab('travel')} cta={!travel || travel.status === 'pending' ? 'Add' : 'View'} />}
            {trip && <ActionCard icon={Car} title={`Pickup: ${trip.vehicle} ${trip.plate || ''}`} sub={<>Driver {trip.driver} · <a className="font-semibold text-saffron" href={`tel:${trip.driver_phone}`}>{trip.driver_phone}</a> · {trip.location} {time(trip.window_start)}</>} tone="ok" />}
            {room && <ActionCard icon={BedDouble} title={`${room.hotel} · Room ${room.number}`} sub={`${room.category} · check-in ${date(room.check_in)}${room.status === 'checked_in' ? ' · checked in ✓' : ''}`} tone="ok" />}
            {next && <ActionCard icon={CalendarHeart} title={`Next: ${next.name}`} sub={`${date(next.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hhmm(next.start_time)} · ${next.venue}`} onClick={() => setTab('schedule')} cta="Itinerary" />}
          </div>
          <FaqAssistant token={token!} />
          {data.gallery.length > 0 && <Section title="Gallery" action={<span className="text-xs text-mute">{data.gallery.length} photos</span>}><div className="grid grid-cols-3 gap-1.5">{data.gallery.map((m: any) => <a key={m.id} href={fileUrl(m.file)} target="_blank"><img src={fileUrl(m.file)} alt={m.function_name || ''} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /></a>)}</div></Section>}
          {data.guest.opted_out ? <p className="text-center text-xs text-mute">You've opted out of WhatsApp updates. You can still use this page.</p> : null}
        </>}
        {tab === 'rsvp' && <RsvpForm data={data} token={token!} onSaved={d => { setData(d); setTab('home') }} />}
        {tab === 'travel' && <TravelForm data={data} token={token!} onSaved={d => setData(d)} />}
        {tab === 'schedule' && <>
          {functions.map((f: any) => (
            <Section key={f.id}>
              <div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold tracking-wide text-saffron uppercase">{date(f.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div><div className="mt-0.5 text-lg font-semibold">{f.name}</div></div>{f.live_status === 'live' && <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose"><span className="live-dot size-1.5 rounded-full bg-rose" />Happening now</span>}</div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><Clock className="size-4 text-mute" />{hhmm(f.start_time)}{f.end_time ? ` – ${hhmm(f.end_time)}` : ''}</div>
                <div className="flex items-center gap-2"><MapPin className="size-4 text-mute" />{f.venue}{f.address ? `, ${f.address}` : ''}{f.map_url && <a href={f.map_url} target="_blank" className="ml-1 font-semibold text-saffron">Map</a>}</div>
                {f.dress_code && <div className="flex items-center gap-2"><Shirt className="size-4 text-mute" />{f.dress_code}</div>}
              </div>
              <div className="mt-3"><RsvpBadge s={rsvps.find((r: any) => r.function_id === f.id && r.guest_id === guest.id)?.status} /></div>
            </Section>
          ))}
          {room && <Section title="Your stay"><div className="text-sm"><b>{room.hotel}</b>, room {room.number} ({room.category})<div className="text-mute">{room.address}</div><div className="mt-1">Check-in {date(room.check_in)} · check-out {date(room.check_out)}</div></div></Section>}
        </>}
        {tab === 'chat' && <WhatsAppPanel who={guest.name.split(' ')[0]} messages={data.messages} replyPath={`/g/${token}/reply`} onReplied={reload} />}
      </main>
      <TabBar value={tab} onChange={setTab} tabs={[{ value: 'home', label: 'Home', icon: Home }, { value: 'rsvp', label: 'RSVP', icon: MailCheck, badge: pending }, { value: 'travel', label: 'Travel', icon: Plane }, { value: 'schedule', label: 'Itinerary', icon: CalendarHeart }, { value: 'chat', label: 'WhatsApp', icon: MessageCircle, badge: unread }]} />
    </div>
  )
}

const RsvpBadge = ({ s }: { s?: string }) => s ? <span className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', s === 'attending' ? 'bg-sage-50 text-sage' : s === 'declined' ? 'bg-rose-50 text-rose' : 'bg-amber-50 text-amber')}>{s === 'attending' ? "You're attending" : s === 'declined' ? 'Not attending' : 'RSVP pending'}</span> : null

function RsvpForm({ data, token, onSaved }: { data: any; token: string; onSaved: (d: any) => void }) {
  const toast = useToast()
  const [ans, setAns] = useState<Record<string, string>>({})
  const [diet, setDiet] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setAns(Object.fromEntries(data.rsvps.map((r: any) => [`${r.guest_id}:${r.function_id}`, r.status === 'pending' ? 'attending' : r.status])))
    setDiet(Object.fromEntries(data.members.map((m: any) => [m.id, m.dietary || []])))
  }, [data])
  const submit = async () => {
    setBusy(true)
    try {
      const responses = Object.entries(ans).map(([k, status]) => { const [guest_id, function_id] = k.split(':'); return { guest_id, function_id, status, headcount: 1 } })
      onSaved(await post(`/l/g/${token}/rsvp`, { responses, dietary: diet, notes }))
      toast(responses.some(r => r.status === 'attending') ? 'RSVP sent — see you there! 🎉' : 'RSVP sent. We’ll miss you!')
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  if (data.frozen) return <Section><Callout tone="sky">RSVPs are closed. To change your plans, message your planner on WhatsApp.</Callout></Section>
  const allNo = () => setAns(Object.fromEntries(Object.keys(ans).map(k => [k, 'declined'])))
  return (
    <>
      <Section title="Who's coming?" action={<button onClick={allNo} className="text-xs font-semibold text-mute underline">We can't make it</button>}>
        <div className="space-y-5">
          {data.functions.map((f: any) => {
            const invited = data.members.filter((m: any) => data.rsvps.some((r: any) => r.guest_id === m.id && r.function_id === f.id))
            if (!invited.length) return null
            return (
              <div key={f.id}>
                <div className="mb-2"><div className="font-semibold">{f.name}</div><div className="text-xs text-mute">{date(f.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {hhmm(f.start_time)} · {f.venue}</div></div>
                <div className="space-y-1.5">{invited.map((m: any) => {
                  const k = `${m.id}:${f.id}`, v = ans[k]
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2">
                      <span className="text-sm font-medium">{m.name}{m.age_group === 'child' && <span className="text-mute"> · child</span>}</span>
                      <div className="flex rounded-lg bg-sand p-0.5" role="radiogroup" aria-label={`${m.name} at ${f.name}`}>
                        {[['attending', 'Yes'], ['declined', 'No']].map(([s, l]) => <button key={s} role="radio" aria-checked={v === s} onClick={() => setAns({ ...ans, [k]: s })} className={cx('h-9 min-w-14 rounded-md px-3 text-sm font-semibold', v === s ? s === 'attending' ? 'bg-sage text-white' : 'bg-rose text-white' : 'text-mute')}>{l}</button>)}
                      </div>
                    </div>
                  )
                })}</div>
              </div>
            )
          })}
        </div>
      </Section>
      <Section title={<span className="flex items-center gap-2"><Utensils className="size-4 text-saffron" />Dietary & special needs</span>}>
        <div className="space-y-3">{data.members.map((m: any) => (
          <div key={m.id}><div className="mb-1.5 text-sm font-medium">{m.name}</div><div className="flex flex-wrap gap-1.5">{DIETS.map(d => { const on = (diet[m.id] || []).includes(d); return <button key={d} onClick={() => setDiet({ ...diet, [m.id]: on ? diet[m.id].filter(x => x !== d) : [...(diet[m.id] || []), d] })} className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', on ? 'border-saffron bg-saffron-50 text-saffron' : 'border-line text-ink-2')}>{d}</button> })}</div></div>
        ))}<Textarea label="Anything else? (accessibility, allergies, special requests)" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </Section>
      <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={submit}>Send RSVP</Button>
    </>
  )
}

function TravelForm({ data, token, onSaved }: { data: any; token: string; onSaved: (d: any) => void }) {
  const toast = useToast()
  const t = data.travel
  const [mode, setMode] = useState<'upload' | 'manual'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [f, setF] = useState<any>({ mode: 'flight', carrier: '', number: '', from_loc: '', to_loc: '', arrive_at: '', pax: data.members.length, pickup_required: true })
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const upload = async () => {
    setBusy(true)
    try { const fd = new FormData(); if (file) fd.append('file', file); if (text) fd.append('text', text); const r = await api<any>('POST', `/l/g/${token}/travel/ticket`, fd); setRes(r); onSaved(r) }
    catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const save = async (extra: any = {}) => {
    setBusy(true)
    try { onSaved(await post(`/l/g/${token}/travel`, { ...f, ...extra, pickup_required: f.pickup_required ? 1 : 0 })); toast(extra.not_booked ? "Got it — we'll remind you later" : extra.self ? 'Noted: own arrangements' : 'Travel saved — pickup details coming soon') }
    catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <>
      {t && t.status !== 'pending' && (
        <Section title="Your travel">
          <div className="text-sm">{t.status === 'self' ? 'You’re making your own way. 🚗' : <>
            <div className="text-lg font-semibold">{t.carrier} {t.number}</div>
            <div className="text-mute">{t.from_loc} → {t.to_loc} · arrives {t.arrive_at ? dateTime(t.arrive_at) : 'TBC'} · {t.pax} traveller(s)</div>
            {t.status === 'review' && <div className="mt-2"><Callout tone="amber">We couldn’t read everything on your ticket — our team will confirm the details.</Callout></div>}
            {t.delay_min > 0 && <div className="mt-2"><Callout tone="amber">We see your flight is ~{t.delay_min} min late. Your pickup is being adjusted.</Callout></div>}
            {data.trip && <div className="mt-3 rounded-xl bg-sage-50 p-3 text-sage"><b>Pickup confirmed:</b> {data.trip.vehicle} {data.trip.plate} · {data.trip.driver} <a href={`tel:${data.trip.driver_phone}`} className="font-semibold underline">{data.trip.driver_phone}</a></div>}
          </>}</div>
        </Section>
      )}
      <Section title={t && t.status !== 'pending' ? 'Update travel' : 'How are you getting here?'}>
        <div className="mb-4 flex rounded-xl bg-sand p-1">{([['upload', 'Upload ticket'], ['manual', 'Enter details']] as const).map(([v, l]) => <button key={v} onClick={() => setMode(v)} className={cx('h-9 flex-1 rounded-lg text-sm font-semibold', mode === v ? 'bg-card shadow-card' : 'text-mute')}>{l}</button>)}</div>
        {mode === 'upload' ? (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center hover:bg-paper"><Upload className="size-6 text-saffron" /><span className="font-semibold">{file ? file.name : 'Photo or PDF of your ticket'}</span><span className="text-xs text-mute">We read the flight, date and time automatically</span><input type="file" accept="image/*,.pdf,.txt" capture="environment" className="sr-only" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
            <Textarea label="…or paste the booking text" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="6E 2134 DEL → UDR, 21 Nov, arrives 09:40" />
            <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!file && !text} onClick={upload}>Read my ticket</Button>
            {res && <Callout tone={res.high_confidence ? 'sage' : 'amber'} icon={res.high_confidence ? CheckCircle2 : HelpCircle}>{res.high_confidence ? `Got it: ${res.extraction.number} arriving ${res.extraction.date} ${res.extraction.time}.` : 'We picked up part of it — our team will verify the rest. Thanks!'}</Callout>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mode" value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })} options={['flight', 'train', 'car', 'bus']} />
            <Input label="Flight / train no." value={f.number} onChange={e => setF({ ...f, number: e.target.value.toUpperCase() })} placeholder="6E 2134" />
            <Input label="From" value={f.from_loc} onChange={e => setF({ ...f, from_loc: e.target.value.toUpperCase() })} placeholder="DEL" />
            <Input label="Arriving at" value={f.to_loc} onChange={e => setF({ ...f, to_loc: e.target.value.toUpperCase() })} placeholder="UDR" />
            <Input className="col-span-2" label="Arrival date & time" type="datetime-local" value={f.arrive_at} onChange={e => setF({ ...f, arrive_at: e.target.value })} />
            <Input label="Travellers" type="number" min={1} value={f.pax} onChange={e => setF({ ...f, pax: +e.target.value })} />
            <div className="flex items-end pb-2"><Check label="Need a pickup" checked={f.pickup_required} onChange={v => setF({ ...f, pickup_required: v })} /></div>
            <Button className="col-span-2" variant="primary" size="lg" loading={busy} disabled={!f.arrive_at || !f.to_loc} onClick={() => save()}>Save travel</Button>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row"><Button className="flex-1" variant="ghost" onClick={() => save({ not_booked: true })}>Not booked yet</Button><Button className="flex-1" variant="ghost" onClick={() => save({ self: true })}>I'll make my own way</Button></div>
      </Section>
    </>
  )
}

function FaqAssistant({ token }: { token: string }) {
  const [q, setQ] = useState('')
  const [log, setLog] = useState<{ q: string; a: string }[]>([])
  const [busy, setBusy] = useState(false)
  const ask = async (question = q) => {
    if (!question.trim()) return
    setBusy(true)
    try { const r = await post<any>(`/l/g/${token}/faq`, { question }); setLog([...log, { q: question, a: r.answer }]); setQ('') } finally { setBusy(false) }
  }
  return (
    <Section title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-saffron" />Ask anything</span>}>
      {log.map((l, i) => <div key={i} className="mb-3 space-y-1.5"><div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-ink px-3 py-2 text-sm text-paper">{l.q}</div><div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-sand px-3 py-2 text-sm whitespace-pre-wrap">{l.a}</div></div>)}
      {!log.length && <div className="mb-3 flex flex-wrap gap-1.5">{['What should I wear?', 'Is there airport pickup?', 'Where is the wedding?', 'Which hotel am I in?'].map(s => <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-sand">{s}</button>)}</div>}
      <div className="flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Dress code, venue, timings…" aria-label="Ask a question" className="h-11 flex-1 rounded-xl border border-line px-3 text-[15px] focus:border-saffron focus:outline-none" /><Button variant="dark" icon={Send} loading={busy} onClick={() => ask()} aria-label="Ask" /></div>
    </Section>
  )
}
