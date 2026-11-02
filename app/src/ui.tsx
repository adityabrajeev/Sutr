import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertTriangle, CheckCircle2, Info, ChevronRight, Inbox } from 'lucide-react'
import { ApiError } from './api'
import { initials } from './format'

export const cx = (...c: any[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------- Button
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-saffron text-white hover:bg-[#9c4623] shadow-sm',
  dark: 'bg-ink text-paper hover:bg-ink-2',
  secondary: 'bg-card text-ink border border-line hover:bg-sand',
  ghost: 'text-ink-2 hover:bg-sand',
  danger: 'bg-rose text-white hover:bg-[#9a2c3f]',
  success: 'bg-sage text-white hover:bg-[#33664a]',
}
export function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, children, className, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: any }) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : size === 'lg' ? 'h-12 px-5 text-[15px] gap-2' : 'h-10 px-4 text-sm gap-2'
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx('inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', sz, BTN[variant], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
    </button>
  )
}
export const IconButton = ({ icon: Icon, label, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: any; label: string }) => (
  <button aria-label={label} title={label} {...p} className={cx('inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-sand disabled:opacity-40', className)}><Icon className="size-[18px]" /></button>
)

// ---------------------------------------------------------------- Layout
export const Card = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
  <div {...p} className={cx('rounded-2xl border border-line bg-card shadow-card', className)}>{children}</div>
export const CardHeader = ({ title, sub, action, icon: Icon }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; icon?: any }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
    <div className="flex min-w-0 items-center gap-2.5">
      {Icon && <Icon className="size-4 shrink-0 text-saffron" />}
      <div className="min-w-0"><h3 className="truncate font-sans text-[15px] font-semibold">{title}</h3>{sub && <p className="truncate text-xs text-mute">{sub}</p>}</div>
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>
)
export function PageHeader({ title, sub, actions, eyebrow }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-saffron">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-medium sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- Badge
type Tone = 'neutral' | 'saffron' | 'sage' | 'rose' | 'amber' | 'sky' | 'ink'
const TONE: Record<Tone, string> = {
  neutral: 'bg-sand text-ink-2', saffron: 'bg-saffron-50 text-saffron', sage: 'bg-sage-50 text-sage', rose: 'bg-rose-50 text-rose',
  amber: 'bg-amber-50 text-amber', sky: 'bg-sky-50 text-sky', ink: 'bg-ink text-paper',
}
export const Badge = ({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', TONE[tone], className)}>
    {dot && <span className="size-1.5 rounded-full bg-current" />}{children}
  </span>
)
const STATUS_TONE: Record<string, Tone> = {
  attending: 'sage', confirmed: 'sage', approved: 'sage', done: 'sage', completed: 'sage', delivered: 'sage', read: 'sage', final: 'sage', checked_in: 'sage', published: 'sage', resolved: 'sage', ready: 'sage', arrived: 'sage', dropped: 'sage', accepted: 'sage', won: 'sage', connected: 'sage', granted: 'sage', succeeded: 'sage', active: 'sage', picked_up: 'sky',
  pending: 'amber', review: 'amber', in_review: 'amber', todo: 'neutral', queued: 'neutral', proposed: 'amber', pending_approval: 'amber', maybe: 'amber', waiting: 'neutral', scheduled: 'sky', sent: 'sky', in_progress: 'sky', en_route: 'sky', setup: 'sky', planning: 'sky', live: 'rose', submitted: 'sky', configuring: 'neutral', draft: 'neutral', requested: 'amber', invited: 'amber', proposal_sent: 'sky', new: 'saffron', revision: 'amber', revision_requested: 'amber', changes_requested: 'amber', checked_out: 'neutral', open: 'amber', self: 'neutral', needs_replan: 'rose', awaiting_approval: 'amber', retrying: 'amber',
  declined: 'rose', failed: 'rose', rejected: 'rose', blocked: 'rose', cancelled: 'rose', delayed: 'rose', critical: 'rose', high: 'rose', lost: 'rose', no_show: 'rose', expired: 'rose', error: 'rose', outage: 'rose', suspended: 'rose', deactivated: 'neutral', loop_blocked: 'rose', throttled: 'amber', skipped: 'neutral', superseded: 'neutral',
  medium: 'amber', low: 'neutral', warning: 'amber', info: 'sky',
}
export const Status = ({ s, label }: { s?: string | null; label?: string }) => s ? <Badge tone={STATUS_TONE[s] || 'neutral'} dot>{label || s.replace(/_/g, ' ')}</Badge> : null

// ---------------------------------------------------------------- Stats
export function Stat({ label, value, sub, tone, icon: Icon, onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'rose' | 'sage' | 'amber'; icon?: any; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div'
  return (
    <C onClick={onClick} className={cx('min-w-0 rounded-2xl border border-line bg-card p-4 text-left shadow-card', onClick && 'hover:border-saffron/40')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-mute">{Icon && <Icon className="size-3.5" />}{label}</div>
      <div className={cx('mt-1.5 text-2xl font-semibold tabular', tone === 'rose' && 'text-rose', tone === 'sage' && 'text-sage', tone === 'amber' && 'text-amber')}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-mute">{sub}</div>}
    </C>
  )
}
export function Progress({ value, max = 100, tone = 'saffron', className }: { value: number; max?: number; tone?: 'saffron' | 'sage' | 'rose' | 'amber' | 'sky'; className?: string }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0))
  const c = { saffron: 'bg-saffron', sage: 'bg-sage', rose: 'bg-rose', amber: 'bg-marigold', sky: 'bg-sky' }[tone]
  return <div className={cx('h-1.5 overflow-hidden rounded-full bg-sand', className)}><div className={cx('h-full rounded-full transition-all', c)} style={{ width: `${pct}%` }} /></div>
}
export function HealthRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r
  const color = score >= 80 ? 'var(--color-sage)' : score >= 60 ? 'var(--color-marigold)' : 'var(--color-rose)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Health score ${score} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-sand)" strokeWidth="5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-bold tabular">{score}</div>
    </div>
  )
}
export const Avatar = ({ name, size = 32, tone = 'sand' }: { name?: string; size?: number; tone?: 'sand' | 'ink' | 'saffron' }) => (
  <div className={cx('grid shrink-0 place-items-center rounded-full font-semibold', tone === 'ink' ? 'bg-ink text-paper' : tone === 'saffron' ? 'bg-saffron-50 text-saffron' : 'bg-sand text-ink-2')} style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</div>
)

// ---------------------------------------------------------------- Feedback
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('size-5 animate-spin text-mute', className)} />
export const Loading = ({ label = 'Loading…' }: { label?: string }) => <div className="flex items-center justify-center gap-2 py-16 text-sm text-mute"><Spinner />{label}</div>
export function Empty({ icon: Icon = Inbox, title, sub, action }: { icon?: any; title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-sand"><Icon className="size-5 text-mute" /></div>
      <div className="font-semibold">{title}</div>
      {sub && <div className="mt-1 max-w-sm text-sm text-mute">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function ErrorBox({ error, retry }: { error: any; retry?: () => void }) {
  if (!error) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose/20 bg-rose-50 p-3 text-sm text-rose">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{error.message || String(error)}{error.detail?.errors && <ul className="mt-1 list-disc pl-4">{error.detail.errors.map((e: string) => <li key={e}>{e}</li>)}</ul>}</div>
      {retry && <button className="font-semibold underline" onClick={retry}>Retry</button>}
    </div>
  )
}
export function Callout({ tone = 'amber', icon: Icon = Info, children, action }: { tone?: 'amber' | 'rose' | 'sky' | 'sage'; icon?: any; children: React.ReactNode; action?: React.ReactNode }) {
  const t = { amber: 'bg-amber-50 text-amber border-amber/20', rose: 'bg-rose-50 text-rose border-rose/20', sky: 'bg-sky-50 text-sky border-sky/20', sage: 'bg-sage-50 text-sage border-sage/20' }[tone]
  return <div className={cx('flex items-start gap-3 rounded-xl border p-3 text-sm', t)}><Icon className="mt-0.5 size-4 shrink-0" /><div className="flex-1 text-ink-2">{children}</div>{action}</div>
}

// ---------------------------------------------------------------- Toasts
type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string }
const ToastCtx = createContext<(t: Omit<Toast, 'id'> | string, tone?: Toast['tone']) => void>(() => {})
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = (t: any, tone: Toast['tone'] = 'success') => {
    const item = typeof t === 'string' ? { tone, text: t } : t
    const id = Date.now() + Math.random()
    setItems(s => [...s, { ...item, id }])
    setTimeout(() => setItems(s => s.filter(x => x.id !== id)), item.tone === 'error' ? 6000 : 3500)
  }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className="anim-pop pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-paper shadow-pop">
            {t.tone === 'error' ? <AlertTriangle className="size-4 text-marigold" /> : t.tone === 'info' ? <Info className="size-4 text-marigold" /> : <CheckCircle2 className="size-4 text-[#8fd1a9]" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/** Wrap an async action: shows a toast on success/error, returns the result (or undefined on error). */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(key)
    try {
      const r = await fn()
      if (success) toast(typeof success === 'function' ? success(r) : success)
      return r
    } catch (e: any) {
      toast(e.message || 'Something went wrong', e instanceof ApiError && e.detail?.queued ? 'info' : 'error')
      throw e
    } finally { setBusy(null) }
  }
  return { run: (k: string, fn: () => Promise<any>, s?: any) => run(k, fn, s).catch(() => undefined), busy, raw: run }
}

// ---------------------------------------------------------------- Modal / sheet
export function Modal({ open, onClose, title, sub, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30)
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size]
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} className={cx('anim-sheet sm:anim-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-card shadow-pop sm:rounded-2xl', w)}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div><h2 className="font-sans text-lg font-semibold">{title}</h2>{sub && <p className="mt-0.5 text-sm text-mute">{sub}</p>}</div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, busy }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>{body && <div className="text-sm text-ink-2">{body}</div>}</Modal>
}

// ---------------------------------------------------------------- Forms
export const Label = ({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) =>
  <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-ink-2">{children}{hint && <span className="font-normal text-mute">{hint}</span>}</span>
const fieldCls = 'w-full rounded-xl border border-line bg-card px-3 text-[14px] text-ink placeholder:text-mute/70 focus:border-saffron focus:ring-2 focus:ring-saffron/15 focus:outline-none disabled:bg-sand'
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; hint?: React.ReactNode; error?: string }>(
  ({ label, hint, error, className, ...p }, ref) => (
    <label className={cx('block', className)}>
      {label && <Label hint={hint}>{label}</Label>}
      <input ref={ref} {...p} className={cx(fieldCls, 'h-10', error && 'border-rose')} />
      {error && <span className="mt-1 block text-xs text-rose">{error}</span>}
    </label>
  ))
export const Textarea = ({ label, hint, className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: React.ReactNode; hint?: React.ReactNode }) => (
  <label className={cx('block', className)}>{label && <Label hint={hint}>{label}</Label>}<textarea rows={3} {...p} className={cx(fieldCls, 'py-2.5')} /></label>
)
export function Select({ label, hint, options, className, placeholder, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: React.ReactNode; hint?: React.ReactNode; options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <Label hint={hint}>{label}</Label>}
      <select {...p} className={cx(fieldCls, 'h-10 pr-8')}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
export const Toggle = ({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; sub?: React.ReactNode; disabled?: boolean }) => (
  <label className={cx('flex cursor-pointer items-start justify-between gap-4 py-1.5', disabled && 'opacity-50')}>
    {label && <span><span className="block text-sm font-medium">{label}</span>{sub && <span className="block text-xs text-mute">{sub}</span>}</span>}
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cx('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-saffron' : 'bg-line')}>
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  </label>
)
export const Check = ({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; className?: string }) => (
  <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="size-4 rounded border-line accent-[#b4532a]" />{label}
  </label>
)
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cx('scroll-x inline-flex max-w-full gap-1 rounded-xl bg-sand p-1', className)} role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition-colors', value === o.value ? 'bg-card text-ink shadow-card' : 'text-mute hover:text-ink')}>
          {o.label}{o.count !== undefined && o.count > 0 && <span className={cx('rounded-full px-1.5 text-[11px]', value === o.value ? 'bg-saffron-50 text-saffron' : 'bg-line text-ink-2')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Lists
export function Row({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  const C = onClick ? 'button' : 'div'
  return <C onClick={onClick} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5', onClick && 'hover:bg-paper', className)}>{children}{onClick && <ChevronRight className="size-4 shrink-0 text-mute" />}</C>
}
export const Divided = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cx('divide-y divide-line', className)}>{children}</div>

/** Responsive table: real table on md+, stacked cards on mobile. */
type T = any
export function DataTable({ rows, cols, empty, onRow, rowKey, selectable, selected, onSelect }: {
  rows: T[]; cols: { key: string; label: React.ReactNode; render: (r: T) => React.ReactNode; className?: string; mobile?: 'title' | 'sub' | 'meta' | 'hide' }[]
  empty?: React.ReactNode; onRow?: (r: T) => void; rowKey: (r: T) => string; selectable?: boolean; selected?: Set<string>; onSelect?: (s: Set<string>) => void
}) {
  if (!rows.length) return <>{empty || <Empty title="Nothing here yet" />}</>
  const toggle = (k: string) => { const s = new Set(selected); s.has(k) ? s.delete(k) : s.add(k); onSelect?.(s) }
  const title = cols.find(c => c.mobile === 'title') || cols[0]
  const sub = cols.filter(c => c.mobile === 'sub')
  const meta = cols.filter(c => c.mobile === 'meta' || (!c.mobile && c !== title))
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs font-semibold text-mute">
            {selectable && <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Select all" className="accent-[#b4532a]" checked={rows.length > 0 && rows.every(r => selected?.has(rowKey(r)))} onChange={e => onSelect?.(new Set(e.target.checked ? rows.map(rowKey) : []))} /></th>}
            {cols.map(c => <th key={c.key} className={cx('px-4 py-2.5 font-semibold', c.className)}>{c.label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => (
              <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cx(onRow && 'cursor-pointer hover:bg-paper', selected?.has(rowKey(r)) && 'bg-saffron-50/40')}>
                {selectable && <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label="Select row" className="accent-[#b4532a]" checked={!!selected?.has(rowKey(r))} onChange={() => toggle(rowKey(r))} /></td>}
                {cols.map(c => <td key={c.key} className={cx('px-4 py-2.5 align-middle', c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-line md:hidden">
        {rows.map(r => (
          <div key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cx('flex gap-3 px-4 py-3', onRow && 'active:bg-paper')}>
            {selectable && <input type="checkbox" aria-label="Select row" className="mt-1 accent-[#b4532a]" checked={!!selected?.has(rowKey(r))} onClick={e => e.stopPropagation()} onChange={() => toggle(rowKey(r))} />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{title.render(r)}</div>
              {sub.map(c => <div key={c.key} className="text-xs text-mute">{c.render(r)}</div>)}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">{meta.filter(c => c.mobile !== 'hide').map(c => <span key={c.key} className="inline-flex items-center gap-1"><span className="text-mute">{c.label}:</span>{c.render(r)}</span>)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function Grid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6; className?: string }) {
  const c = { 2: 'grid-cols-2', 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4', 5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5', 6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' }[cols]
  return <div className={cx('grid gap-3', c, className)}>{children}</div>
}
export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-mute">{children}</kbd>
export function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; onClick: () => void; danger?: boolean; icon?: any }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [open])
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && <div className="anim-pop absolute right-0 z-50 mt-1 min-w-48 rounded-xl border border-line bg-card p-1 shadow-pop">
        {items.map(i => <button key={i.label} onClick={() => { setOpen(false); i.onClick() }} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-sand', i.danger && 'text-rose')}>{i.icon && <i.icon className="size-4" />}{i.label}</button>)}
      </div>}
    </div>
  )
}
