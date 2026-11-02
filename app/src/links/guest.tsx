import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Home, MailCheck, Plane, CalendarHeart, Images, MessageCircle, BedDouble, Car, MapPin, Shirt, Clock, Sparkles, Upload, CheckCircle2, HelpCircle, Send, Utensils, KeyRound, Phone, UserRound } from 'lucide-react'
import { post, api, fileUrl } from '../api'
import { Button, Callout, Check, cx, Input, Select, Textarea, useToast, Ticket, useCountdown } from '../ui'
import { date, dateLong, hhmm, time, dateTime } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, TabBar, Section, WhatsAppPanel, PlanList, type PlanState } from './common'

type Tab = 'home' | 'schedule' | 'stay' | 'ask'
type View = Tab | 'rsvp'
const DIETS = ['Vegetarian', 'Jain', 'Vegan', 'Gluten-free', 'No onion/garlic', 'Nut allergy']

export default function GuestPage() {
  const { token } = useParams()
  const { data, error, reload, setData } = useLink<any>(`/g/${token}`)
  const [view, setView] = useState<View>('home')
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const { wedding, guest, rsvps, functions, travel, room } = data
  const pending = rsvps.filter((r: any) => r.status === 'pending').length
  const attending = rsvps.some((r: any) => r.status === 'attending')
  const unread = data.messages.filter((m: any) => m.direction === 'out' && m.status !== 'read').length
  const go = (v: View) => { setView(v); window.scrollTo({ top: 0 }) }
  const tab: Tab = view === 'rsvp' ? 'home' : view
  return (
    <div className="min-h-dvh bg-canvas pb-24">
      <LinkHeader agency={data.agency} title={wedding.couple || wedding.name} sub={`${dateLong(wedding.start_date)}, ${wedding.venue || wedding.city}`} />
      <main className="mx-auto max-w-2xl space-y-4 px-4">
        {view === 'home' && <>
          <GuestTicket data={data} go={go} />
          <section aria-label="Your plan">
            <h2 className="mb-2 text-[17px]">Your plan</h2>
            <PlanList items={[
              { state: pending ? 'todo' : 'done', title: pending ? `RSVP for ${pending} function${pending > 1 ? 's' : ''}` : attending ? 'RSVP sent' : 'You let us know you can’t come', detail: data.members.length > 1 ? `For your household of ${data.members.length}` : undefined, onClick: () => go('rsvp') },
              ...(attending ? [
                { state: (!travel || travel.status === 'pending' ? 'todo' : travel.status === 'review' ? 'waiting' : 'done') as PlanState, title: !travel || travel.status === 'pending' ? 'Share your travel' : travel.status === 'self' ? 'Own arrangements' : `${travel.carrier || ''} ${travel.number || travel.mode || ''}`.trim(), detail: travel?.arrive_at ? `Arriving ${dateTime(travel.arrive_at)}` : 'So we can pick you up', onClick: () => go('stay') },
                ...(data.guest.needs_stay ? [{ state: (room ? 'done' : 'waiting') as PlanState, title: room ? `${room.hotel}, room ${room.number}` : 'Your room', detail: room ? `Check-in ${date(room.check_in)}` : 'We’ll send your room once the list is final', onClick: () => go('stay') }] : []),
              ] : []),
            ]} />
          </section>
          {data.gallery.length > 0 && <Section title="Photos" action={<span className="text-sm text-mute">{data.gallery.length}</span>}><div className="grid grid-cols-3 gap-1.5">{data.gallery.slice(0, 9).map((m: any) => <a key={m.id} href={fileUrl(m.file)} target="_blank"><img src={fileUrl(m.file)} alt={m.function_name || 'Wedding photo'} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /></a>)}</div></Section>}
          {data.guest.opted_out ? <p className="text-center text-sm text-mute">You've turned off WhatsApp updates. This page still works.</p> : null}
        </>}
        {view === 'rsvp' && <>
          <button onClick={() => go('home')} className="text-sm font-semibold text-brand">Back</button>
          <RsvpForm data={data} token={token!} onSaved={d => { setData(d); go('home') }} />
        </>}
        {view === 'stay' && <>
          <TravelForm data={data} token={token!} onSaved={d => setData(d)} />
          {room && <Section title="Your room"><RoomCard room={room} /></Section>}
        </>}
        {view === 'schedule' && <Schedule functions={functions} rsvps={rsvps} guest={guest} />}
        {view === 'ask' && <>
          <FaqAssistant token={token!} />
          <h2 className="pt-2 text-[17px]">Message the planning team</h2>
          <WhatsAppPanel who={guest.name.split(' ')[0]} messages={data.messages} replyPath={`/g/${token}/reply`} onReplied={reload} />
        </>}
      </main>
      <TabBar value={tab} onChange={go} tabs={[{ value: 'home', label: 'Home', icon: Home, badge: pending ? 1 : 0 }, { value: 'schedule', label: 'Schedule', icon: CalendarHeart }, { value: 'stay', label: 'Stay', icon: BedDouble }, { value: 'ask', label: 'Ask', icon: MessageCircle, badge: unread }]} />
    </div>
  )
}

/** The one thing this guest needs right now, chosen by where they are in the stay. */
function GuestTicket({ data, go }: { data: any; go: (v: View) => void }) {
  const { wedding, rsvps, functions, travel, trip, room, gallery } = data
  const today = new Date().toISOString().slice(0, 10)
  const mine = (f: any) => rsvps.some((r: any) => r.function_id === f.id && r.status === 'attending')
  const live = functions.find((f: any) => f.live_status === 'live' && mine(f))
  const next = functions.find((f: any) => f.date >= today && f.live_status !== 'done' && mine(f))
  const pending = rsvps.filter((r: any) => r.status === 'pending').length
  const attending = rsvps.some((r: any) => r.status === 'attending')
  const cd = useCountdown(next ? `${next.date}T${next.start_time || '00:00'}` : wedding.start_date)
  if (live) return <Ticket live stub="Happening now" title={live.name} sub={live.venue} rows={[...(live.dress_code ? [{ icon: Shirt, text: `Dress code: ${live.dress_code}` }] : []), ...(live.address ? [{ icon: MapPin, text: live.address }] : [])]}
    actions={live.map_url ? <a href={live.map_url} target="_blank" className="inline-flex h-12 items-center gap-2 rounded-xl bg-haldi px-5 font-semibold text-ink"><MapPin className="size-4" />Directions</a> : undefined} />
  if (wedding.end_date < today && gallery.length) return <Ticket stub="Thank you for coming" stubIcon={Images} title="The photos are ready" sub={`${gallery.length} approved photos from ${wedding.couple || wedding.name}`} actions={<a href={fileUrl(gallery[0].file)} target="_blank" className="inline-flex h-12 items-center rounded-xl bg-haldi px-5 font-semibold text-ink">See the photos</a>} />
  if (pending) return <Ticket stub="Your invitation" stubIcon={MailCheck} title="Will you join us?" sub={`${pending} function${pending > 1 ? 's' : ''} to answer for`} sign={cd?.text} signLabel="to go"
    actions={<Button variant="haldi" size="lg" onClick={() => go('rsvp')}>RSVP now</Button>} />
  if (!attending) return <Ticket stub="RSVP received" title="We'll miss you" sub="If your plans change, you can update your answer." actions={<Button variant="onDark" size="lg" onClick={() => go('rsvp')}>Change my RSVP</Button>} />
  if (trip && travel?.live_status !== 'dropped') return <Ticket stub="Your pickup" stubIcon={Car} title={`${trip.vehicle || 'Car'} ${trip.plate || ''}`.trim()} sub={`Meet your driver at ${trip.location}`} sign={time(trip.window_start)} signLabel={date(trip.window_start)}
    rows={[{ icon: UserRound, text: `${trip.driver}, your driver` }, ...(travel?.delay_min ? [{ icon: Clock, text: `Your flight is about ${travel.delay_min} min late. Your driver knows.` }] : [])]}
    actions={trip.driver_phone ? <a href={`tel:${trip.driver_phone}`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-haldi px-5 font-semibold text-ink"><Phone className="size-4" />Call {trip.driver?.split(' ')[0]}</a> : undefined} />
  if (room) return <Ticket stub="Your room" stubIcon={KeyRound} title={room.hotel} sub={room.category} sign={room.number} signLabel={room.status === 'checked_in' ? 'checked in' : 'room'}
    rows={[{ icon: Clock, text: `Check-in ${date(room.check_in)}, check-out ${date(room.check_out)}` }, ...(room.address ? [{ icon: MapPin, text: room.address }] : [])]} />
  if (!travel || travel.status === 'pending') return <Ticket stub="One more thing" stubIcon={Plane} title="Tell us how you're arriving" sub="Forward your ticket and we'll arrange a pickup." sign={cd?.text} signLabel="to go"
    actions={<Button variant="haldi" size="lg" onClick={() => go('stay')}>Add my travel</Button>} />
  if (next) return <Ticket stub="You're all set" stubIcon={CheckCircle2} title={`Next: ${next.name}`} sub={next.venue} sign={cd?.text} signLabel="to go"
    rows={[{ icon: Clock, text: `${date(next.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${hhmm(next.start_time)}` }, ...(next.dress_code ? [{ icon: Shirt, text: next.dress_code }] : [])]} />
  return <Ticket stub="You're all set" stubIcon={CheckCircle2} title="See you there" sub={wedding.venue} />
}

function RoomCard({ room }: { room: any }) {
  return (
    <div className="flex items-center gap-4">
      <div className="sign rounded-xl bg-ink px-4 py-3 text-[32px] text-haldi">{room.number}</div>
      <div className="min-w-0 text-[15px]"><div className="font-semibold">{room.hotel}</div><div className="text-mute">{room.category}</div><div className="text-mute">Check-in {date(room.check_in)}, check-out {date(room.check_out)}</div></div>
    </div>
  )
}

function Schedule({ functions, rsvps, guest }: any) {
  return (
    <ol className="space-y-3">
      {functions.map((f: any) => {
        const s = rsvps.find((r: any) => r.function_id === f.id && r.guest_id === guest.id)?.status
        return (
          <li key={f.id} className={cx('rounded-xl border bg-card p-4', f.live_status === 'live' ? 'border-bad' : 'border-line')}>
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-sm text-mute">{date(f.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div><div className="text-[17px] font-semibold">{f.name}</div></div>
              <div className="sign text-[22px] text-ink">{hhmm(f.start_time)}</div>
            </div>
            <div className="mt-2 space-y-1 text-[15px]">
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden /><span>{f.venue}{f.address ? `, ${f.address}` : ''}{f.map_url && <a href={f.map_url} target="_blank" className="ml-2 font-semibold text-brand">Map</a>}</span></div>
              {f.dress_code && <div className="flex items-start gap-2"><Shirt className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden />{f.dress_code}</div>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold">{f.live_status === 'live' && <span className="flex items-center gap-1.5 text-bad"><span className="live-dot size-2 rounded-full bg-bad" />Happening now</span>}<RsvpBadge s={s} /></div>
          </li>
        )
      })}
    </ol>
  )
}

const RsvpBadge = ({ s }: { s?: string }) => s ? <span className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', s === 'attending' ? 'bg-ok-50 text-ok' : s === 'declined' ? 'bg-bad-50 text-bad' : 'bg-warn-50 text-warn')}>{s === 'attending' ? "You're attending" : s === 'declined' ? 'Not attending' : 'RSVP pending'}</span> : null

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
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2">
                      <span className="text-sm font-medium">{m.name}{m.age_group === 'child' && <span className="text-mute"> · child</span>}</span>
                      <div className="flex rounded-lg bg-wash p-0.5" role="radiogroup" aria-label={`${m.name} at ${f.name}`}>
                        {[['attending', 'Yes'], ['declined', 'No']].map(([s, l]) => <button key={s} role="radio" aria-checked={v === s} onClick={() => setAns({ ...ans, [k]: s })} className={cx('h-9 min-w-14 rounded-md px-3 text-sm font-semibold', v === s ? s === 'attending' ? 'bg-ok text-white' : 'bg-bad text-white' : 'text-mute')}>{l}</button>)}
                      </div>
                    </div>
                  )
                })}</div>
              </div>
            )
          })}
        </div>
      </Section>
      <Section title={<span className="flex items-center gap-2"><Utensils className="size-4 text-brand" />Dietary & special needs</span>}>
        <div className="space-y-3">{data.members.map((m: any) => (
          <div key={m.id}><div className="mb-1.5 text-sm font-medium">{m.name}</div><div className="flex flex-wrap gap-1.5">{DIETS.map(d => { const on = (diet[m.id] || []).includes(d); return <button key={d} onClick={() => setDiet({ ...diet, [m.id]: on ? diet[m.id].filter(x => x !== d) : [...(diet[m.id] || []), d] })} className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', on ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink-2')}>{d}</button> })}</div></div>
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
            {data.trip && <div className="mt-3 rounded-xl bg-ok-50 p-3 text-ok"><b>Pickup confirmed:</b> {data.trip.vehicle} {data.trip.plate} · {data.trip.driver} <a href={`tel:${data.trip.driver_phone}`} className="font-semibold underline">{data.trip.driver_phone}</a></div>}
          </>}</div>
        </Section>
      )}
      <Section title={t && t.status !== 'pending' ? 'Update travel' : 'How are you getting here?'}>
        <div className="mb-4 flex rounded-xl bg-wash p-1">{([['upload', 'Upload ticket'], ['manual', 'Enter details']] as const).map(([v, l]) => <button key={v} onClick={() => setMode(v)} className={cx('h-9 flex-1 rounded-lg text-sm font-semibold', mode === v ? 'bg-card shadow-card' : 'text-mute')}>{l}</button>)}</div>
        {mode === 'upload' ? (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center hover:bg-canvas"><Upload className="size-6 text-brand" /><span className="font-semibold">{file ? file.name : 'Photo or PDF of your ticket'}</span><span className="text-xs text-mute">We read the flight, date and time automatically</span><input type="file" accept="image/*,.pdf,.txt" capture="environment" className="sr-only" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
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
    <Section title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-brand" />Quick answers</span>}>
      {log.map((l, i) => <div key={i} className="mb-3 space-y-1.5"><div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-ink px-3 py-2 text-sm text-canvas">{l.q}</div><div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-wash px-3 py-2 text-sm whitespace-pre-wrap">{l.a}</div></div>)}
      {!log.length && <div className="mb-3 flex flex-wrap gap-1.5">{['What should I wear?', 'Is there airport pickup?', 'Where is the wedding?', 'Which hotel am I in?'].map(s => <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-wash">{s}</button>)}</div>}
      <div className="flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Dress code, venue, timings…" aria-label="Ask a question" className="h-11 flex-1 rounded-xl border border-line px-3 text-[15px] focus:border-brand focus:outline-none" /><Button variant="dark" icon={Send} loading={busy} onClick={() => ask()} aria-label="Ask" /></div>
    </Section>
  )
}
