import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, CheckCheck, Check as CheckOne, AlertCircle, Clock3 } from 'lucide-react'
import { useApi, post } from '../api'
import { cx, Spinner, Button } from '../ui'
import { ago, time } from '../format'

export function useLink<T = any>(path: string) { return useApi<T>(`/l${path}`) }

export function LinkError({ error }: { error: any }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-bad-50"><AlertCircle className="size-6 text-bad" /></div>
        <h1 className="text-2xl font-medium">{error.status === 410 ? 'This link has expired' : 'Link not available'}</h1>
        <p className="mt-2 text-sm text-mute">{error.message}</p>
      </div>
    </div>
  )
}
export const LinkLoading = () => <div className="grid min-h-dvh place-items-center bg-canvas"><Spinner /></div>

/** Quiet header: who is hosting you and what this page is. The ticket below carries the visual weight. */
export function LinkHeader({ agency, title, sub, right }: { agency: any; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="px-4 pt-5 pb-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-2"><span className="grid size-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-haldi" aria-hidden>{(agency?.branding?.logo_text || agency?.name || 'S')[0]}</span>{agency?.branding?.logo_text || agency?.name}</div>
          {right}
        </div>
        <h1 className="mt-4 text-[27px] sm:text-[32px]">{title}</h1>
        {sub && <div className="mt-1 text-[15px] text-mute">{sub}</div>}
      </div>
    </header>
  )
}

export function TabBar<T extends string>({ value, onChange, tabs }: { value: T; onChange: (t: T) => void; tabs: { value: T; label: string; icon: any; badge?: number }[] }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur" aria-label="Sections">
      <div className="mx-auto grid max-w-2xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => { onChange(t.value); window.scrollTo({ top: 0 }) }} aria-current={value === t.value ? 'page' : undefined}
            className={cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', value === t.value ? 'text-brand' : 'text-mute')}>
            <t.icon className="size-5" />{t.label}
            {!!t.badge && <span className="absolute top-2 right-[calc(50%-18px)] grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] text-white">{t.badge}</span>}
          </button>
        ))}
      </div>
    </nav>
  )
}

export const Section = ({ title, children, action, className }: { title?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) => (
  <section className={cx('rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5', className)}>
    {title && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-sans text-[15px] font-semibold">{title}</h2>{action}</div>}
    {children}
  </section>
)

/** Simulated WhatsApp thread for a link-holder. Replies are routed exactly like real inbound WhatsApp messages. */
export function WhatsAppPanel({ messages, replyPath, onReplied, who }: { messages: any[]; replyPath: string; onReplied: () => void; who: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try { const r = await post<any>(`/l${replyPath}`, { body: text }); setNote(`SUTR understood: ${r.intent.replace(/_/g, ' ')} → ${r.action}`); setText(''); onReplied() } finally { setBusy(false) }
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line shadow-card">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white"><MessageCircle className="size-5" /><div><div className="text-sm font-semibold">WhatsApp (simulated)</div><div className="text-[11px] opacity-75">What {who} sees on their phone</div></div></div>
      <div className="max-h-[55dvh] min-h-64 space-y-2 overflow-y-auto bg-[#efeae2] p-3">
        {!messages.length && <div className="py-10 text-center text-sm text-mute">No messages yet.</div>}
        {messages.map(m => {
          const mine = m.direction === 'in' // from the link-holder's perspective, inbound-to-SUTR = sent by them
          return (
            <div key={m.id} className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap shadow-card', mine ? 'ml-auto rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-white')}>
              {m.body}
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-mute">{time(m.created_at)}{!mine && m.status === 'failed' ? <span className="text-bad">not delivered</span> : !mine && (m.status === 'read' ? <CheckCheck className="size-3 text-info" /> : <CheckOne className="size-3" />)}</div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {note && <div className="flex items-start gap-2 bg-info-50 px-3 py-2 text-xs text-info"><span className="flex-1">{note}</span><button aria-label="Dismiss" onClick={() => setNote(null)}><X className="size-3.5" /></button></div>}
      <div className="flex gap-2 bg-[#f0f2f5] p-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Reply on WhatsApp…" aria-label="Reply" className="h-11 flex-1 rounded-full border-0 bg-white px-4 text-[15px] focus:outline-none" />
        <button onClick={send} disabled={busy || !text.trim()} aria-label="Send" className="grid size-11 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-50">{busy ? <Spinner className="text-white" /> : <Send className="size-5" />}</button>
      </div>
    </div>
  )
}

/** "Status before you walk in": a plan checklist where each row says done / to do / waiting with an icon AND a word. */
export type PlanState = 'done' | 'todo' | 'waiting'
const PLAN_ICON = { done: CheckCheck, todo: AlertCircle, waiting: Clock3 }
const PLAN_WORD = { done: 'Done', todo: 'To do', waiting: 'With the team' }
export function PlanList({ items }: { items: { state: PlanState; title: string; detail?: React.ReactNode; onClick?: () => void }[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {items.map((i, k) => {
        const I = PLAN_ICON[i.state]
        const C = i.onClick ? 'button' : 'div'
        return (
          <li key={k}>
            <C onClick={i.onClick} className={cx('flex w-full items-center gap-3 px-4 py-3.5 text-left', i.onClick && 'hover:bg-canvas')}>
              <I className={cx('size-5 shrink-0', i.state === 'done' ? 'text-ok' : i.state === 'todo' ? 'text-warn' : 'text-mute')} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{i.title}</span>{i.detail && <span className="block text-sm text-mute">{i.detail}</span>}</span>
              <span className={cx('shrink-0 text-sm font-semibold', i.state === 'done' ? 'text-ok' : i.state === 'todo' ? 'text-warn' : 'text-mute')}>{PLAN_WORD[i.state]}</span>
            </C>
          </li>
        )
      })}
    </ul>
  )
}

export const ActionCard = ({ icon: Icon, title, sub, onClick, cta }: { icon: any; title: string; sub?: React.ReactNode; tone?: string; onClick?: () => void; cta?: string }) => (
  <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-line bg-card p-4 text-left hover:border-brand/40">
    <Icon className="size-5 shrink-0 text-brand" aria-hidden />
    <div className="min-w-0 flex-1"><div className="font-semibold">{title}</div>{sub && <div className="text-sm text-mute">{sub}</div>}</div>
    {cta && <span className="text-sm font-semibold text-brand">{cta}</span>}
  </button>
)
export { Button, ago }
