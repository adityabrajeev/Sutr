import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { all, get, insert, run, uid, now } from './db.ts'

export type Role = 'owner' | 'planner' | 'coordinator'
export interface User { id: string; agency_id: string; name: string; email: string; role: Role; permissions: Record<string, boolean>; status: string }

declare global {
  namespace Express {
    interface Request { user?: User; link?: Link }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: any) { super(message) }
}
export const fail = (status: number, message: string, detail?: any): never => { throw new HttpError(status, message, detail) }

// ---------- passwords & sessions ----------
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}
export function verifyPassword(pw: string, stored?: string | null) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(pw, salt, 32)
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'))
}
export function createSession(userId: string, hours = 12) {
  const id = crypto.randomBytes(24).toString('base64url')
  insert('sessions', { id, user_id: userId, expires_at: new Date(Date.now() + hours * 3600e3).toISOString() })
  return id
}

export function auth(req: Request, _res: Response, next: NextFunction) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token) return next(new HttpError(401, 'Not signed in'))
  const s = get('SELECT * FROM sessions WHERE id = ?', token)
  if (!s || s.expires_at < now()) return next(new HttpError(401, 'Session expired'))
  const u = get<User>('SELECT id, agency_id, name, email, role, permissions, status FROM users WHERE id = ?', s.user_id)
  if (!u) return next(new HttpError(401, 'User not found'))
  if (u.status !== 'active') return next(new HttpError(403, 'Account suspended or deactivated'))
  u.permissions = u.permissions || {}
  req.user = u
  next()
}

// ---------- permissions (matrix from the Workflow Bible) ----------
// Coordinators get assigned-scope access to operational modules; these keys gate the "Permissioned" cells.
export const PERMISSION_KEYS = {
  createWedding: 'Create weddings',
  budget: 'View & edit budgets',
  documents: 'Manage documents',
  automationEdit: 'Edit automations',
  guestsDelete: 'Delete guests',
  broadcast: 'Send broadcasts',
  analytics: 'Analytics (assigned weddings)',
} as const

const ADMIN_ONLY = new Set(['settings', 'team', 'proposals', 'portfolio.edit', 'vendors.directory.delete'])

export function isAdmin(u: User) { return u.role === 'owner' || u.role === 'planner' }

export function can(u: User, action: string): boolean {
  if (isAdmin(u)) return true
  if (ADMIN_ONLY.has(action)) return false
  const key = action as keyof typeof PERMISSION_KEYS
  if (key in PERMISSION_KEYS) return !!u.permissions?.[key]
  return true
}

export function requirePerm(action: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (can(req.user!, action)) return next()
    audit(req, 'permission.denied', action, null, { path: req.path }, false)
    next(new HttpError(403, `Your role does not allow: ${action}`))
  }
}

export function weddingIdsFor(u: User): string[] {
  if (isAdmin(u)) return all<{ id: string }>('SELECT id FROM weddings WHERE agency_id = ?', u.agency_id).map(r => r.id)
  return all<{ wedding_id: string }>(
    'SELECT wt.wedding_id FROM wedding_team wt JOIN weddings w ON w.id = wt.wedding_id WHERE wt.user_id = ? AND w.agency_id = ?',
    u.id, u.agency_id).map(r => r.wedding_id)
}

export function canWedding(u: User, wid: string) {
  const w = get('SELECT agency_id FROM weddings WHERE id = ?', wid)
  if (!w || w.agency_id !== u.agency_id) return false
  if (isAdmin(u)) return true
  return !!get('SELECT 1 AS ok FROM wedding_team WHERE wedding_id = ? AND user_id = ?', wid, u.id)
}

/** Middleware for /weddings/:wid/* routes */
export function weddingScope(req: Request, _res: Response, next: NextFunction) {
  const wid = req.params.wid
  if (!canWedding(req.user!, wid)) {
    audit(req, 'permission.denied', 'wedding', wid, { path: req.originalUrl }, false)
    return next(new HttpError(403, 'This wedding is not assigned to you'))
  }
  next()
}

// ---------- audit ----------
export function audit(req: Request | null, action: string, entity?: string | null, entityId?: string | null, detail?: any, allowed = true, actor?: { kind: string; id?: string; name?: string; agency_id?: string; wedding_id?: string }) {
  const u = req?.user
  const l = req?.link
  insert('audit_log', {
    agency_id: actor?.agency_id ?? u?.agency_id ?? l?.agency_id,
    wedding_id: actor?.wedding_id ?? req?.params?.wid ?? l?.wedding_id ?? null,
    actor_kind: actor?.kind ?? (u ? u.role : l ? l.kind : 'system'),
    actor_id: actor?.id ?? u?.id ?? l?.entity_id,
    actor_name: actor?.name ?? u?.name ?? (l ? `${l.kind} link` : 'SUTR System'),
    action, entity: entity ?? null, entity_id: entityId ?? null,
    detail: detail ? JSON.stringify(detail) : null, allowed: allowed ? 1 : 0,
  })
}
export const systemActor = (agency_id?: string, wedding_id?: string) => ({ kind: 'system', name: 'SUTR System', agency_id, wedding_id })

// ---------- notifications ----------
export function notify(opts: { agency_id: string; wedding_id?: string | null; user_id?: string | null; kind: string; title: string; body?: string; severity?: 'info' | 'warning' | 'critical'; link?: string }) {
  // user_id null = all admins of the agency
  return insert('notifications', { severity: 'info', ...opts })
}

// ---------- event bus ----------
type Listener = (payload: any) => void
const listeners = new Map<string, Listener[]>()
export function on(event: string, fn: Listener) {
  listeners.set(event, [...(listeners.get(event) || []), fn])
}
export function emit(event: string, payload: Record<string, any>) {
  for (const fn of [...(listeners.get(event) || []), ...(listeners.get('*') || [])]) {
    try { fn({ ...payload, event }) } catch (e) { console.error(`[event ${event}]`, e) }
  }
}

// ---------- secure links ----------
export interface Link { token: string; kind: string; agency_id: string; wedding_id: string | null; entity_id: string | null; scope: any; expires_at: string | null; revoked: number; opened_at?: string | null }

export function createLink(kind: string, opts: { agency_id: string; wedding_id?: string | null; entity_id?: string | null; scope?: any; days?: number }) {
  const existing = get<Link>('SELECT * FROM links WHERE kind = ? AND entity_id IS ? AND wedding_id IS ? AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?)',
    kind, opts.entity_id ?? null, opts.wedding_id ?? null, now())
  if (existing && !opts.scope) return existing.token
  const token = crypto.randomBytes(12).toString('base64url')
  insert('links', {
    token, kind, agency_id: opts.agency_id, wedding_id: opts.wedding_id ?? null, entity_id: opts.entity_id ?? null,
    scope: opts.scope ?? null, expires_at: opts.days ? new Date(Date.now() + opts.days * 864e5).toISOString() : null,
  })
  return token
}

export function linkScope(kinds: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const l = get<Link>('SELECT * FROM links WHERE token = ?', req.params.token)
    if (!l || l.revoked) return next(new HttpError(404, 'This link is invalid or has been revoked'))
    if (l.expires_at && l.expires_at < now()) return next(new HttpError(410, 'This link has expired. Ask your planner for a new one.'))
    if (!kinds.includes(l.kind)) return next(new HttpError(403, 'This link cannot be used here'))
    if (!l.opened_at) run('UPDATE links SET opened_at = ? WHERE token = ?', now(), l.token)
    req.link = l
    next()
  }
}

export const linkUrl = (kind: string, token: string) => {
  const path = ({ guest: 'g', host: 'h', vendor: 'v', prospect: 'p', invite: 'invite', share: 'd' } as Record<string, string>)[kind] || kind
  return `/${path}/${token}`
}

export const wrap = (fn: (req: Request, res: Response) => any) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res)
      if (out instanceof Promise) out.then(v => { if (!res.headersSent) res.json(v ?? { ok: true }) }).catch(next)
      else if (!res.headersSent) res.json(out ?? { ok: true })
    } catch (e) { next(e) }
  }

export { uid, now }
