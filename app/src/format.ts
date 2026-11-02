export const inr = (n?: number | null, cur = 'INR') => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (cur !== 'INR') return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
  const a = Math.abs(n)
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 2).replace(/\.0+$/, '')} Cr`
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 1 : 2).replace(/\.0+$/, '')} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
export const inrFull = (n?: number | null) => (n === null || n === undefined ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`)

const parse = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T00:00` : s) : null)
export const date = (s?: string | null, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => { const d = parse(s); return d ? d.toLocaleDateString('en-IN', o) : '—' }
export const dateLong = (s?: string | null) => date(s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
export const time = (s?: string | null) => { const d = parse(s); return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—' }
export const dateTime = (s?: string | null) => (s ? `${date(s)}, ${time(s)}` : '—')
export const hhmm = (t?: string | null) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) }

export function ago(s?: string | null) {
  const d = parse(s); if (!d) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  const fut = diff < 0, a = Math.abs(diff)
  const v = a < 60 ? 'just now' : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : a < 86400 * 30 ? `${Math.round(a / 86400)}d` : date(s)
  if (v === 'just now' || v === date(s)) return v
  return fut ? `in ${v}` : `${v} ago`
}
export const daysTo = (s?: string | null) => { const d = parse(s); if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return s!.length === 10 ? Math.round((d.getTime() - t.getTime()) / 864e5) : Math.ceil((d.getTime() - Date.now()) / 864e5) }
export const plural = (n: number, w: string, p = w + 's') => `${n} ${n === 1 ? w : p}`
export const initials = (n?: string) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
export const titleCase = (s?: string | null) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
export const toLocalInput = (iso?: string | null) => { const d = parse(iso); if (!d) return ''; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)
