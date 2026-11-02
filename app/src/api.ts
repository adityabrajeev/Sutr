import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: any) { super(message) }
}

const TOKEN_KEY = 'sutr.token'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ } }

// ---------- offline write queue (wedding-day resilience) ----------
const QUEUE_KEY = 'sutr.offline-queue'
type Queued = { id: string; method: string; path: string; body: any; at: string; label?: string }
const readQ = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] } }
const writeQ = (q: Queued[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* ignore */ } window.dispatchEvent(new Event('sutr-queue')) }
export const offlineQueue = () => readQ()

export async function flushQueue() {
  const q = readQ()
  if (!q.length || !navigator.onLine) return { sent: 0, failed: 0 }
  let sent = 0, failed = 0
  const rest: Queued[] = []
  for (const item of q) {
    try { await api(item.method, item.path, item.body, { noQueue: true }); sent++ }
    catch (e: any) { if (e instanceof ApiError) failed++; else rest.push(item) } // server rejected → drop; network → keep
  }
  writeQ(rest)
  return { sent, failed }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { flushQueue() })

export async function api<T = any>(method: string, path: string, body?: any, opts: { noQueue?: boolean; queueLabel?: string } = {}): Promise<T> {
  const token = getToken()
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), ...(token && !path.startsWith('/l/') ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch (e) {
    if (method !== 'GET' && !isForm && !opts.noQueue && !path.startsWith('/l/')) {
      writeQ([...readQ(), { id: Math.random().toString(36).slice(2), method, path, body, at: new Date().toISOString(), label: opts.queueLabel }])
      throw new ApiError(0, 'You are offline — saved and will sync when you reconnect', { queued: true })
    }
    throw new ApiError(0, 'Network error — check your connection')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/l/')) { setToken(null); window.dispatchEvent(new Event('sutr-logout')) }
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.detail)
  }
  return data as T
}
export const get = <T = any>(p: string) => api<T>('GET', p)
export const post = <T = any>(p: string, b?: any, o?: { queueLabel?: string }) => api<T>('POST', p, b ?? {}, o)
export const patch = <T = any>(p: string, b?: any, o?: { queueLabel?: string }) => api<T>('PATCH', p, b ?? {}, o)
export const del = <T = any>(p: string) => api<T>('DELETE', p)

/** Data hook with reload + optional polling. */
export function useApi<T = any>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(!!path)
  const live = useRef(true)
  const load = useCallback(async (quiet = false) => {
    if (!path) return
    if (!quiet) setLoading(true)
    try { const d = await get<T>(path); if (live.current) { setData(d); setError(null) } }
    catch (e: any) { if (live.current) setError(e) }
    finally { if (live.current) setLoading(false) }
  }, [path])
  useEffect(() => { live.current = true; load(); return () => { live.current = false } }, [load])
  useEffect(() => {
    if (!opts.poll || !path) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, opts.poll)
    return () => clearInterval(t)
  }, [opts.poll, path, load])
  return { data, error, loading, reload: () => load(true), setData }
}

export const fileUrl = (f?: string | null) => (f ? `/files/${f}` : '')
