import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileText, Download, Star, Send, MapPin } from 'lucide-react'
import { post, fileUrl } from '../api'
import { Button, Input, Textarea, useToast } from '../ui'
import { date } from '../format'
import { useLink, LinkError, LinkLoading, LinkHeader, Section } from './common'

export function SharedDoc() {
  const { token } = useParams()
  const { data, error } = useLink<any>(`/d/${token}`)
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  return (
    <div className="min-h-dvh bg-paper">
      <LinkHeader agency={data.agency} title={data.name} sub={`${data.category} · shared securely${data.expires_at ? ` · link expires ${date(data.expires_at)}` : ''}`} />
      <main className="mx-auto -mt-4 max-w-2xl px-4">
        <Section>
          <div className="flex items-center gap-3"><FileText className="size-8 text-saffron" /><div className="flex-1"><div className="font-semibold">{data.name}</div><div className="text-xs text-mute">{Math.round(data.size / 1024)} KB · {data.mime}</div></div><a href={fileUrl(data.file)} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl bg-saffron px-4 text-sm font-semibold text-white"><Download className="size-4" />Open</a></div>
          {/^image\//.test(data.mime) && <img src={fileUrl(data.file)} alt="" className="mt-4 w-full rounded-xl" />}
        </Section>
      </main>
    </div>
  )
}

export function PublicPortfolio() {
  const { slug } = useParams()
  const { data, error } = useLink<any>(`/public/portfolio/${slug}`)
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState({ name: '', phone: '', email: '', destination: '', wedding_date: '', guest_count: '', notes: '' })
  const [busy, setBusy] = useState(false)
  if (error) return <LinkError error={error} />
  if (!data) return <LinkLoading />
  const a = data.agency
  const enquire = async () => {
    setBusy(true)
    try { const r = await post<any>(`/l/public/portfolio/${slug}/enquire`, f); toast('Thank you! Design your wedding next…'); nav(r.link) } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="min-h-dvh bg-paper pb-12">
      <LinkHeader agency={a} title={a.name} sub={<>{a.tagline}{a.city && <span className="ml-2 inline-flex items-center gap-1 opacity-80"><MapPin className="size-3.5" />{a.city}</span>}</>} />
      <main className="mx-auto -mt-4 max-w-5xl space-y-6 px-4">
        {a.about && <Section><p className="display text-xl leading-relaxed">{a.about}</p></Section>}
        {data.case_studies.map((c: any) => (
          <article key={c.id} className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
            {c.media.length > 0 && <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">{c.media.slice(0, 6).map((m: any, i: number) => <img key={i} src={fileUrl(m.file)} alt="" loading="lazy" className={i === 0 ? 'col-span-2 row-span-2 aspect-square w-full object-cover sm:aspect-auto sm:h-full' : 'aspect-square w-full object-cover'} />)}</div>}
            <div className="p-5 sm:p-7"><div className="text-xs font-semibold tracking-wide text-saffron uppercase">{c.city} · {date(c.start_date, { month: 'long', year: 'numeric' })}</div><h2 className="mt-1 text-2xl font-medium">{c.title}</h2><p className="mt-2 text-ink-2">{c.summary}</p>{c.services?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{c.services.map((s: string) => <span key={s} className="rounded-full bg-sand px-3 py-1 text-xs font-semibold">{s}</span>)}</div>}</div>
          </article>
        ))}
        {data.testimonials.length > 0 && <div className="grid gap-4 md:grid-cols-2">{data.testimonials.map((t: any, i: number) => <Section key={i}><div className="flex gap-0.5">{Array.from({ length: t.rating || 5 }, (_, k) => <Star key={k} className="size-4 fill-marigold text-marigold" />)}</div><p className="display mt-2 text-lg leading-snug">“{t.body}”</p><div className="mt-2 text-sm text-mute">— {t.author}</div></Section>)}</div>}
        <Section title="Start planning with us">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Your name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            <Input label="WhatsApp" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
            <Input label="Email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
            <Input label="Destination" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} />
            <Input label="Tentative date" type="date" value={f.wedding_date} onChange={e => setF({ ...f, wedding_date: e.target.value })} />
            <Input label="Guests" type="number" value={f.guest_count} onChange={e => setF({ ...f, guest_count: e.target.value })} />
            <Textarea className="sm:col-span-2" label="Anything else?" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button className="mt-4 w-full sm:w-auto" variant="primary" size="lg" icon={Send} loading={busy} disabled={!f.name || (!f.phone && !f.email)} onClick={enquire}>Design my wedding</Button>
        </Section>
      </main>
    </div>
  )
}
