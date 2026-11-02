import React, { createContext, useContext, useEffect, useState } from 'react'
import { get, post, setToken, getToken } from './api'

export interface Me {
  user: { id: string; name: string; email: string; role: 'owner' | 'planner' | 'coordinator'; permissions: Record<string, boolean>; agency_id: string }
  agency: { id: string; name: string; slug: string; tagline?: string; branding?: any }
  weddings: { id: string; name: string; couple: string; start_date: string; end_date: string; status: string; city: string }[]
  can: Record<string, boolean>
  admin: boolean
}
const Ctx = createContext<{ me: Me | null; loading: boolean; login: (e: string, p: string) => Promise<void>; logout: () => void; refresh: () => Promise<void>; setSession: (t: string) => Promise<void> }>(null as any)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(!!getToken())
  const refresh = async () => {
    if (!getToken()) { setMe(null); setLoading(false); return }
    try { setMe(await get<Me>('/auth/me')) } catch { setMe(null) } finally { setLoading(false) }
  }
  useEffect(() => {
    refresh()
    const out = () => setMe(null)
    window.addEventListener('sutr-logout', out)
    return () => window.removeEventListener('sutr-logout', out)
  }, [])
  const setSession = async (t: string) => { setToken(t); setLoading(true); await refresh() }
  const login = async (email: string, password: string) => { const { token } = await post<{ token: string }>('/auth/login', { email, password }); await setSession(token) }
  const logout = () => { post('/auth/logout').catch(() => {}); setToken(null); setMe(null) }
  return <Ctx.Provider value={{ me, loading, login, logout, refresh, setSession }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
export const useMe = () => useContext(Ctx).me!
