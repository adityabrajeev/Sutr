import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const DATA_DIR = process.env.SUTR_DATA_DIR ? path.resolve(process.env.SUTR_DATA_DIR) : path.resolve(import.meta.dirname, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'sutr.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

// JSON columns are stored as TEXT and decoded on read by `decode`.
const JSON_COLS = new Set([
  'tags', 'functions', 'permissions', 'checklist', 'depends_on', 'items', 'selections', 'scope', 'data',
  'conditions', 'actions', 'deliverables', 'members', 'dietary', 'extracted', 'media_ids', 'services',
  'responsibilities', 'unavailable', 'stops', 'payload', 'branding', 'messaging', 'defaults',
  'integrations', 'security', 'variables', 'steps', 'faq', 'log', 'answers', 'trigger_filter', 'guest_ids',
  'settings', 'host_permissions', 'preferences', 'audience', 'related_ids',
])

export function decode<T = any>(row: any): T {
  if (!row) return row
  const out: any = {}
  for (const [k, v] of Object.entries(row)) {
    if (JSON_COLS.has(k) && typeof v === 'string') {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    } else out[k] = v
  }
  return out
}

function encode(v: any) {
  if (v === undefined) return null
  if (v !== null && typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

export const all = <T = any>(sql: string, ...p: any[]): T[] => (db.prepare(sql).all(...p.map(encode)) as any[]).map(decode)
export const get = <T = any>(sql: string, ...p: any[]): T | undefined => decode(db.prepare(sql).get(...p.map(encode)))
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p.map(encode))

export const uid = (prefix = '') => prefix + crypto.randomBytes(6).toString('base64url')
export const now = () => new Date().toISOString()
/** Local calendar date (YYYY-MM-DD), offset by whole days. Function dates are stored in the agency's local time. */
export const localDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 864e5)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const colCache = new Map<string, Set<string>>()
export function columns(table: string) {
  if (!colCache.has(table)) colCache.set(table, new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name)))
  return colCache.get(table)!
}

/** Insert a row, ignoring keys that are not columns. Returns the decoded row. */
export function insert<T = any>(table: string, data: Record<string, any>): T {
  const cols = columns(table)
  const pk = cols.has('id') ? 'id' : 'token'
  const row: Record<string, any> = { ...data }
  if (pk === 'id') row.id = data.id ?? uid()
  if (cols.has('created_at') && !row.created_at) row.created_at = now()
  if (cols.has('updated_at') && !row.updated_at) row.updated_at = now()
  const keys = Object.keys(row).filter(k => cols.has(k))
  run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => row[k]))
  return get(`SELECT * FROM ${table} WHERE ${pk} = ?`, row[pk]) as T
}

export function update<T = any>(table: string, id: string, data: Record<string, any>): T {
  const cols = columns(table)
  const patch: Record<string, any> = { ...data }
  delete patch.id
  if (cols.has('updated_at')) patch.updated_at = now()
  const keys = Object.keys(patch).filter(k => cols.has(k))
  if (keys.length) run(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => patch[k]), id)
  return get(`SELECT * FROM ${table} WHERE id = ?`, id) as T
}

export const remove = (table: string, id: string) => run(`DELETE FROM ${table} WHERE id = ?`, id)

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e }
}

db.exec(`
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE, tagline TEXT, about TEXT, city TEXT,
  branding TEXT, messaging TEXT, defaults TEXT, integrations TEXT, security TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT,
  password_hash TEXT, role TEXT NOT NULL DEFAULT 'coordinator', title TEXT, permissions TEXT,
  status TEXT NOT NULL DEFAULT 'active', invite_token TEXT, invite_expires TEXT, unavailable TEXT,
  shift_status TEXT DEFAULT 'off', created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS weddings (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, couple TEXT, start_date TEXT, end_date TEXT,
  city TEXT, venue TEXT, status TEXT NOT NULL DEFAULT 'planning', guest_estimate INTEGER, budget_total REAL,
  currency TEXT DEFAULT 'INR', template TEXT, source TEXT, proposal_id TEXT, faq TEXT, settings TEXT,
  host_permissions TEXT, live_function_id TEXT, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS wedding_team (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, user_id TEXT NOT NULL, responsibilities TEXT, created_at TEXT,
  UNIQUE(wedding_id, user_id));

CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, relation TEXT,
  permissions TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS functions (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, name TEXT NOT NULL, date TEXT, start_time TEXT, end_time TEXT,
  venue TEXT, address TEXT, map_url TEXT, dress_code TEXT, notes TEXT, sort INTEGER DEFAULT 0,
  live_status TEXT DEFAULT 'upcoming', created_at TEXT);

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, name TEXT NOT NULL, side TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, household_id TEXT, name TEXT NOT NULL, phone TEXT, email TEXT,
  side TEXT, relation TEXT, age_group TEXT DEFAULT 'adult', vip INTEGER DEFAULT 0, accessibility TEXT,
  tags TEXT, functions TEXT, dietary TEXT, needs_stay INTEGER DEFAULT 0, stay_from TEXT, stay_to TEXT,
  opted_out INTEGER DEFAULT 0, is_primary INTEGER DEFAULT 0, code TEXT UNIQUE, checked_in INTEGER DEFAULT 0,
  notes TEXT, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, guest_id TEXT NOT NULL, function_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', headcount INTEGER DEFAULT 1, source TEXT, responded_by TEXT,
  reminders INTEGER DEFAULT 0, last_reminded_at TEXT, created_at TEXT, updated_at TEXT,
  UNIQUE(guest_id, function_id));

CREATE TABLE IF NOT EXISTS travel (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, guest_id TEXT NOT NULL, direction TEXT DEFAULT 'arrival',
  status TEXT DEFAULT 'pending', mode TEXT, carrier TEXT, number TEXT, from_loc TEXT, to_loc TEXT,
  arrive_at TEXT, pax INTEGER DEFAULT 1, pickup_required INTEGER DEFAULT 1, ticket_doc_id TEXT,
  extracted TEXT, confidence REAL, review_needed INTEGER DEFAULT 0, live_status TEXT, delay_min INTEGER DEFAULT 0,
  trip_id TEXT, reminders INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, label TEXT, kind TEXT, capacity INTEGER, plate TEXT,
  driver_vendor_id TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, vehicle_id TEXT, driver_vendor_id TEXT, location TEXT,
  window_start TEXT, window_end TEXT, pax INTEGER, status TEXT DEFAULT 'suggested', suggested_kind TEXT, stops TEXT,
  drop_location TEXT, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS hotels (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, name TEXT NOT NULL, address TEXT, contact TEXT,
  check_in TEXT, check_out TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, hotel_id TEXT NOT NULL, number TEXT NOT NULL, category TEXT,
  capacity INTEGER DEFAULT 2, accessible INTEGER DEFAULT 0, floor INTEGER, available_from TEXT, available_to TEXT,
  status TEXT DEFAULT 'available', created_at TEXT);

CREATE TABLE IF NOT EXISTS room_assignments (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, room_id TEXT NOT NULL, guest_id TEXT NOT NULL,
  status TEXT DEFAULT 'proposed', checked_in_at TEXT, checked_out_at TEXT, created_at TEXT,
  UNIQUE(guest_id));

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT, contact TEXT, phone TEXT,
  email TEXT, city TEXT, rating REAL, jobs INTEGER DEFAULT 0, on_time INTEGER DEFAULT 0, notes TEXT,
  created_at TEXT);

CREATE TABLE IF NOT EXISTS vendor_assignments (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, vendor_id TEXT NOT NULL, function_id TEXT, role TEXT,
  report_at TEXT, report_location TEXT, deliverables TEXT, status TEXT DEFAULT 'pending',
  eta_min INTEGER, delay_min INTEGER DEFAULT 0, live_status TEXT, backup_vendor_id TEXT, quote REAL,
  reminders INTEGER DEFAULT 0, last_reminded_at TEXT, confirmed_at TEXT, arrived_at TEXT, completed_at TEXT,
  created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, category TEXT NOT NULL, label TEXT, planned REAL DEFAULT 0,
  vendor_id TEXT, function_id TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, line_id TEXT, label TEXT, amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR', amount_base REAL, date TEXT, vendor_id TEXT, doc_id TEXT,
  payment_status TEXT DEFAULT 'unpaid', flagged TEXT, created_by TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, wedding_id TEXT, title TEXT NOT NULL, description TEXT, owner_id TEXT,
  due_at TEXT, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'todo', blocked_reason TEXT,
  checklist TEXT, depends_on TEXT, requires_proof INTEGER DEFAULT 0, proof TEXT, review_note TEXT,
  category TEXT, sop_id TEXT, escalated INTEGER DEFAULT 0, source TEXT, created_by TEXT,
  completed_at TEXT, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, steps TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, wedding_id TEXT, agency_id TEXT, title TEXT NOT NULL, kind TEXT, start_at TEXT,
  end_at TEXT, owner_id TEXT, location TEXT, depends_on TEXT, notes TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, function_id TEXT, title TEXT NOT NULL, description TEXT,
  severity TEXT DEFAULT 'medium', owner_id TEXT, status TEXT DEFAULT 'open', source TEXT, related TEXT,
  resolution TEXT, log TEXT, created_at TEXT, resolved_at TEXT);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, function_id TEXT, uploader_vendor_id TEXT, file TEXT,
  original_name TEXT, mime TEXT, size INTEGER, hash TEXT, status TEXT DEFAULT 'pending', album TEXT DEFAULT 'public',
  comment TEXT, approval_owner TEXT DEFAULT 'host', created_at TEXT);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, wedding_id TEXT, kind TEXT NOT NULL, title TEXT, description TEXT, entity_id TEXT,
  data TEXT, status TEXT DEFAULT 'pending', approver TEXT DEFAULT 'host', comment TEXT, decided_at TEXT,
  created_at TEXT);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, kind TEXT, from_kind TEXT, from_id TEXT, title TEXT,
  body TEXT, status TEXT DEFAULT 'open', response TEXT, rating INTEGER, created_at TEXT);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, channel TEXT DEFAULT 'whatsapp',
  purpose TEXT, body TEXT NOT NULL, variables TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, kind TEXT, name TEXT, audience TEXT, template_id TEXT,
  body TEXT, scheduled_at TEXT, status TEXT DEFAULT 'draft', steps TEXT, created_by TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, agency_id TEXT, wedding_id TEXT, campaign_id TEXT, direction TEXT DEFAULT 'out',
  channel TEXT DEFAULT 'whatsapp', party_kind TEXT, party_id TEXT, phone TEXT, body TEXT, link TEXT,
  status TEXT DEFAULT 'queued', fail_reason TEXT, scheduled_at TEXT, sent_at TEXT, read_at TEXT,
  intent TEXT, handled INTEGER DEFAULT 0, assigned_to TEXT, dedupe_key TEXT, attempts INTEGER DEFAULT 0,
  created_at TEXT);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, wedding_id TEXT, entity_kind TEXT, entity_id TEXT,
  category TEXT, name TEXT NOT NULL, file TEXT, mime TEXT, size INTEGER, version INTEGER DEFAULT 1,
  parent_id TEXT, text TEXT, tags TEXT, host_visible INTEGER DEFAULT 0, uploaded_by TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS links (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, agency_id TEXT, wedding_id TEXT, entity_id TEXT, scope TEXT,
  expires_at TEXT, revoked INTEGER DEFAULT 0, opened_at TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, wedding_id TEXT, name TEXT NOT NULL, trigger TEXT NOT NULL,
  trigger_filter TEXT, conditions TEXT, actions TEXT, delay_min INTEGER DEFAULT 0, requires_approval INTEGER DEFAULT 0,
  retries INTEGER DEFAULT 2, enabled INTEGER DEFAULT 0, version INTEGER DEFAULT 1, runs INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, wedding_id TEXT, event TEXT, payload TEXT,
  status TEXT, detail TEXT, attempts INTEGER DEFAULT 0, dedupe_key TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, source TEXT,
  status TEXT DEFAULT 'new', wedding_date TEXT, destination TEXT, guest_count INTEGER, notes TEXT,
  wedding_id TEXT, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS catalogue (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  pricing TEXT DEFAULT 'fixed', cost REAL DEFAULT 0, price REAL DEFAULT 0, category TEXT, active INTEGER DEFAULT 1,
  created_at TEXT);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, lead_id TEXT NOT NULL, version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'configuring', selections TEXT, items TEXT, guest_count INTEGER, destination TEXT,
  wedding_date TEXT, preferences TEXT, discount REAL DEFAULT 0, notes TEXT, subtotal REAL, cost REAL,
  total REAL, comment TEXT, expires_at TEXT, sent_at TEXT, decided_at TEXT, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS case_studies (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, wedding_id TEXT, title TEXT NOT NULL, summary TEXT,
  services TEXT, media_ids TEXT, consent TEXT DEFAULT 'not_requested', status TEXT DEFAULT 'draft',
  created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, wedding_id TEXT, case_study_id TEXT, author TEXT, body TEXT,
  rating INTEGER, status TEXT DEFAULT 'requested', created_at TEXT);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, agency_id TEXT, user_id TEXT, wedding_id TEXT, kind TEXT, title TEXT, body TEXT,
  severity TEXT DEFAULT 'info', link TEXT, read INTEGER DEFAULT 0, created_at TEXT);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, agency_id TEXT, wedding_id TEXT, actor_kind TEXT, actor_id TEXT, actor_name TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, allowed INTEGER DEFAULT 1, created_at TEXT);

CREATE INDEX IF NOT EXISTS idx_guests_w ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_w ON rsvps(wedding_id);
CREATE INDEX IF NOT EXISTS idx_msgs_w ON messages(wedding_id);
CREATE INDEX IF NOT EXISTS idx_tasks_w ON tasks(wedding_id);
CREATE INDEX IF NOT EXISTS idx_audit ON audit_log(agency_id, created_at);
`)
