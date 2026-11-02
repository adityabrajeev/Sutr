import { all, get, insert, run, update, now, uid, tx, localDate } from './db.ts'
import { emit, notify, on, audit, systemActor, createLink, linkUrl } from './core.ts'

// =====================================================================
// Agency defaults
// =====================================================================
export const DEFAULTS = {
  rsvp_reminder_hours: 48,
  rsvp_max_reminders: 2,
  vendor_reminder_hours: 24,
  travel_reminder_hours: 48,
  pickup_window_min: 60,
  budget_variance_pct: 10,
  ocr_confidence_threshold: 0.75,
  base_currency: 'INR',
  fx: { INR: 1, USD: 83, EUR: 90, GBP: 105, AED: 22.6 } as Record<string, number>,
  vehicles: [
    { kind: 'Sedan', capacity: 4 },
    { kind: 'SUV', capacity: 6 },
    { kind: 'Tempo Traveller', capacity: 12 },
    { kind: 'Coach', capacity: 26 },
  ],
  quiet_hours: { start: '22:00', end: '08:00' },
}
export type Defaults = typeof DEFAULTS

export function agencyDefaults(agencyId: string): Defaults {
  const a = get('SELECT defaults FROM agencies WHERE id = ?', agencyId)
  return { ...DEFAULTS, ...(a?.defaults || {}) }
}
export const weddingOf = (wid: string) => get('SELECT * FROM weddings WHERE id = ?', wid)
const hoursAgo = (iso: string | null | undefined, h: number) => !!iso && Date.parse(iso) < Date.now() - h * 3600e3

// =====================================================================
// Messaging (simulated WhatsApp / email provider)
// =====================================================================
export function renderTemplate(body: string, vars: Record<string, any>) {
  const missing: string[] = []
  const text = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    if (vars[k] === undefined || vars[k] === null || vars[k] === '') { missing.push(k); return `[${k}]` }
    return String(vars[k])
  })
  return { text, missing }
}

export function partyVars(kind: string, id: string, wedding?: any): Record<string, any> {
  const w = wedding || {}
  const base = { wedding: w.name, couple: w.couple, city: w.city, venue: w.venue, date: w.start_date }
  if (kind === 'guest') {
    const g = get('SELECT * FROM guests WHERE id = ?', id)
    if (!g) return base
    const room = get(`SELECT r.number, h.name AS hotel FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id JOIN hotels h ON h.id = r.hotel_id
      WHERE ra.guest_id = ? AND ra.status IN ('final','checked_in')`, id)
    const trip = get(`SELECT t.*, v.label AS vehicle, v.plate, d.name AS driver, d.phone AS driver_phone FROM travel tr JOIN trips t ON t.id = tr.trip_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN vendors d ON d.id = t.driver_vendor_id WHERE tr.guest_id = ? AND t.status != 'suggested'`, id)
    return {
      ...base, name: g.name, first_name: g.name.split(' ')[0], link: guestLink(g),
      hotel: room?.hotel, room: room?.number,
      pickup: trip ? `${trip.vehicle || 'Vehicle'} ${trip.plate || ''} · driver ${trip.driver || 'TBA'} ${trip.driver_phone || ''}`.trim() : undefined,
    }
  }
  if (kind === 'vendor') {
    const v = get('SELECT * FROM vendors WHERE id = ?', id)
    return { ...base, name: v?.name, first_name: v?.contact?.split(' ')[0] || v?.name }
  }
  if (kind === 'host') {
    const h = get('SELECT * FROM hosts WHERE id = ?', id)
    return { ...base, name: h?.name, first_name: h?.name?.split(' ')[0], link: h ? linkUrl('host', createLink('host', { agency_id: w.agency_id, wedding_id: h.wedding_id, entity_id: h.id })) : undefined }
  }
  return base
}

export function guestLink(g: any) {
  const w = weddingOf(g.wedding_id)
  return linkUrl('guest', createLink('guest', { agency_id: w.agency_id, wedding_id: g.wedding_id, entity_id: g.id }))
}

const PHONE_RE = /^\+?\d{10,15}$/
function partyPhone(kind: string, id: string) {
  const t = ({ guest: 'guests', vendor: 'vendors', host: 'hosts', lead: 'leads', user: 'users' } as any)[kind]
  if (!t) return null
  return get(`SELECT * FROM ${t} WHERE id = ?`, id)
}

export interface SendOpts {
  agency_id: string; wedding_id?: string | null; party_kind: string; party_id: string; body: string
  link?: string; campaign_id?: string; scheduled_at?: string | null; dedupe_key?: string; channel?: 'whatsapp' | 'email'
  intent?: string
}

export function sendMessage(o: SendOpts) {
  if (o.dedupe_key) {
    const dup = get(`SELECT * FROM messages WHERE dedupe_key = ? AND status != 'failed' AND created_at > ?`, o.dedupe_key, new Date(Date.now() - 864e5).toISOString())
    if (dup) return { ...dup, duplicate: true }
  }
  const party = partyPhone(o.party_kind, o.party_id)
  const m = insert('messages', {
    agency_id: o.agency_id, wedding_id: o.wedding_id ?? null, campaign_id: o.campaign_id ?? null, direction: 'out',
    channel: o.channel || 'whatsapp', party_kind: o.party_kind, party_id: o.party_id,
    phone: o.channel === 'email' ? party?.email : party?.phone, body: o.body, link: o.link ?? null,
    status: 'queued', scheduled_at: o.scheduled_at ?? null, dedupe_key: o.dedupe_key ?? null, intent: o.intent ?? null,
  })
  if (!o.scheduled_at || o.scheduled_at <= now()) return deliver(m.id)
  return m
}

/** Simulated provider. Mirrors real failure classes: invalid number, opt-out, API outage. */
export function deliver(messageId: string) {
  const m = get('SELECT * FROM messages WHERE id = ?', messageId)
  if (!m || m.status === 'delivered' || m.status === 'read') return m
  const ag = get('SELECT integrations FROM agencies WHERE id = ?', m.agency_id)
  const party = partyPhone(m.party_kind, m.party_id)
  let status = 'delivered', reason: string | null = null
  if (m.channel === 'whatsapp' && ag?.integrations?.whatsapp?.status === 'outage') { status = 'failed'; reason = 'api_outage' }
  else if (party?.opted_out) { status = 'failed'; reason = 'opt_out' }
  else if (m.channel === 'whatsapp' && (!m.phone || !PHONE_RE.test(String(m.phone).replace(/[\s-]/g, '')))) { status = 'failed'; reason = 'invalid_number' }
  else if (m.channel === 'email' && !/@/.test(m.phone || '')) { status = 'failed'; reason = 'invalid_email' }
  const out = update('messages', m.id, { status, fail_reason: reason, sent_at: now(), attempts: (m.attempts || 0) + 1 })
  if (status === 'failed') emit('message.failed', { agency_id: m.agency_id, wedding_id: m.wedding_id, message_id: m.id, reason, party_kind: m.party_kind, party_id: m.party_id })
  return out
}

export function markRead(partyKind: string, partyId: string) {
  run(`UPDATE messages SET status = 'read', read_at = ? WHERE party_kind = ? AND party_id = ? AND direction = 'out' AND status = 'delivered'`, now(), partyKind, partyId)
}

// ---------- inbound replies ----------
export function classifyInbound(kind: string, body: string): { intent: string; minutes?: number } {
  const t = body.toLowerCase()
  if (kind === 'vendor') {
    const d = t.match(/(late|delay|delayed|running|stuck|traffic)[^\d]*(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)?/)
    if (d) return { intent: 'vendor_delay', minutes: /^h/.test(d[3] || '') ? +d[2] * 60 : +d[2] }
    if (/\b(cancel|can't make|cannot make|not available|unavailable)\b/.test(t)) return { intent: 'vendor_cancel' }
    if (/\b(reached|arrived|here now|at venue)\b/.test(t)) return { intent: 'vendor_arrived' }
    if (/\b(leaving|left|on the way|en route|started)\b/.test(t)) return { intent: 'vendor_enroute' }
    if (/\b(yes|confirm|confirmed|ok|okay|done|sure)\b/.test(t)) return { intent: 'vendor_confirm' }
  }
  if (kind === 'guest') {
    if (/\b(pnr|flight|train|ticket|arriving|landing)\b/.test(t) || /\b(6e|ai|uk|sg|qp|ix|ek)\s?-?\d{3,4}\b/.test(t)) return { intent: 'travel_ticket' }
    if (/\b(not coming|can't come|cannot come|decline|won't|wont|regret|no)\b/.test(t)) return { intent: 'rsvp_no' }
    if (/\b(yes|coming|attending|will attend|confirm|see you)\b/.test(t)) return { intent: 'rsvp_yes' }
    if (/\b(stop|unsubscribe)\b/.test(t)) return { intent: 'opt_out' }
  }
  if (kind === 'host') {
    if (/\b(approve|approved|looks good|go ahead|ok)\b/.test(t)) return { intent: 'host_approve' }
    if (/\b(change|reject|not ok|revise|swap)\b/.test(t)) return { intent: 'host_changes' }
  }
  return { intent: 'unclear' }
}

export function routeInbound(o: { agency_id: string; wedding_id: string; party_kind: string; party_id: string; body: string }) {
  const c = classifyInbound(o.party_kind, o.body)
  const m = insert('messages', { ...o, direction: 'in', status: 'received', intent: c.intent, phone: partyPhone(o.party_kind, o.party_id)?.phone })
  const actor = { kind: o.party_kind, id: o.party_id, agency_id: o.agency_id, wedding_id: o.wedding_id, name: partyPhone(o.party_kind, o.party_id)?.name }
  let action = 'Forwarded to the planning team'
  if (c.intent === 'rsvp_yes' || c.intent === 'rsvp_no') {
    const status = c.intent === 'rsvp_yes' ? 'attending' : 'declined'
    const n = run(`UPDATE rsvps SET status = ?, source = 'whatsapp', updated_at = ? WHERE guest_id = ? AND status = 'pending'`, status, now(), o.party_id).changes
    action = n ? `Marked ${n} pending function(s) as ${status}` : 'No pending RSVPs — logged for the team'
    if (n) emit('rsvp.submitted', { agency_id: o.agency_id, wedding_id: o.wedding_id, guest_id: o.party_id, status, source: 'whatsapp' })
  } else if (c.intent === 'opt_out') {
    run('UPDATE guests SET opted_out = 1 WHERE id = ?', o.party_id); action = 'Guest opted out of WhatsApp'
  } else if (c.intent === 'travel_ticket') {
    const ex = extractTicket(o.body)
    upsertTravelFromExtraction(o.wedding_id, o.party_id, ex, null)
    action = ex.confidence >= agencyDefaults(o.agency_id).ocr_confidence_threshold ? 'Travel saved from message' : 'Travel captured — sent for planner review (low confidence)'
  } else if (c.intent.startsWith('vendor_')) {
    const va = get(`SELECT va.* FROM vendor_assignments va JOIN functions f ON f.id = va.function_id WHERE va.vendor_id = ? AND va.wedding_id = ? AND va.status NOT IN ('completed','cancelled') ORDER BY f.date, va.report_at LIMIT 1`, o.party_id, o.wedding_id)
      || get(`SELECT * FROM vendor_assignments WHERE vendor_id = ? AND wedding_id = ? AND status NOT IN ('completed','cancelled') ORDER BY report_at LIMIT 1`, o.party_id, o.wedding_id)
    if (va) { vendorStatus(va.id, c.intent.replace('vendor_', ''), { minutes: c.minutes, note: o.body }, actor); action = `Assignment updated: ${c.intent.replace('vendor_', '')}` }
  } else if (c.intent === 'host_approve' || c.intent === 'host_changes') {
    const ap = get(`SELECT * FROM approvals WHERE wedding_id = ? AND approver = 'host' AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, o.wedding_id)
    if (ap) { decideApproval(ap.id, c.intent === 'host_approve' ? 'approved' : 'changes_requested', o.body, actor); action = `Approval "${ap.title}" ${c.intent === 'host_approve' ? 'approved' : 'sent back with changes'}` }
  }
  if (c.intent === 'unclear' || action === 'Forwarded to the planning team') {
    const lead = get(`SELECT user_id FROM wedding_team WHERE wedding_id = ? LIMIT 1`, o.wedding_id)
    update('messages', m.id, { assigned_to: lead?.user_id ?? null })
    emit('message.inbound_unclear', { agency_id: o.agency_id, wedding_id: o.wedding_id, message_id: m.id, party_kind: o.party_kind, party_id: o.party_id })
    notify({ agency_id: o.agency_id, wedding_id: o.wedding_id, kind: 'inbox', title: `New ${o.party_kind} message needs a reply`, body: o.body.slice(0, 120), link: `/w/${o.wedding_id}/comms?tab=inbox` })
  } else update('messages', m.id, { handled: 1 })
  audit(null, 'message.inbound', 'message', m.id, { intent: c.intent, action }, true, actor)
  return { intent: c.intent, action }
}

// =====================================================================
// OCR / ticket extraction (deterministic stub that behaves like a real extractor)
// =====================================================================
const AIRPORTS: Record<string, string> = {
  DEL: 'Delhi', BOM: 'Mumbai', BLR: 'Bengaluru', HYD: 'Hyderabad', MAA: 'Chennai', CCU: 'Kolkata', GOI: 'Goa', GOX: 'Goa (Mopa)',
  JAI: 'Jaipur', UDR: 'Udaipur', AMD: 'Ahmedabad', COK: 'Kochi', PNQ: 'Pune', LKO: 'Lucknow', IXC: 'Chandigarh', JDH: 'Jodhpur',
  DXB: 'Dubai', LHR: 'London', JFK: 'New York', SIN: 'Singapore', SFO: 'San Francisco', YYZ: 'Toronto',
}
const AIRLINES: Record<string, string> = { '6E': 'IndiGo', AI: 'Air India', UK: 'Vistara', SG: 'SpiceJet', QP: 'Akasa Air', IX: 'Air India Express', EK: 'Emirates', BA: 'British Airways' }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export interface Extraction { mode?: string; carrier?: string; number?: string; from_loc?: string; to_loc?: string; date?: string; time?: string; arrive_at?: string; pax?: number; confidence: number; raw: string }

export function extractTicket(text: string, fallbackYear = new Date().getFullYear()): Extraction {
  const raw = text.replace(/[_]+/g, ' ')
  const up = raw.toUpperCase()
  const ex: Extraction = { confidence: 0, raw: raw.slice(0, 500) }
  const fl = up.match(/\b(6E|AI|UK|SG|QP|IX|EK|BA)\s?-?(\d{2,4})\b/)
  const tr = up.match(/\b(?:TRAIN|TRN|TRAIN NO\.?)\s*:?\s*(\d{5})\b/) || (/\bTRAIN|RAJDHANI|SHATABDI|VANDE\b/.test(up) ? up.match(/\b(\d{5})\b/) : null)
  if (fl) { ex.mode = 'flight'; ex.carrier = AIRLINES[fl[1]]; ex.number = `${fl[1]} ${fl[2]}` }
  else if (tr) { ex.mode = 'train'; ex.carrier = 'Indian Railways'; ex.number = tr[1] }
  const codes = [...up.matchAll(/\b([A-Z]{3})\b/g)].map(m => m[1]).filter(c => AIRPORTS[c])
  if (codes.length >= 2) { ex.from_loc = codes[0]; ex.to_loc = codes[1] } else if (codes.length === 1) ex.to_loc = codes[0]
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  const dmy = raw.match(/\b(\d{1,2})[\s\-/.](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/.,]*(\d{2,4})?\b/i)
  if (iso) ex.date = `${iso[1]}-${iso[2]}-${iso[3]}`
  else if (dmy) {
    const y = dmy[3] ? (dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]) : fallbackYear
    ex.date = `${y}-${String(MONTHS.indexOf(dmy[2].toLowerCase().slice(0, 3)) + 1).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const times = [...raw.matchAll(/\b(\d{1,2})[:.](\d{2})\s?(am|pm)?\b/gi)]
  const t = times[times.length - 1] // arrival time is usually the last time on a ticket
  if (t) {
    let h = +t[1]; if (/pm/i.test(t[3] || '') && h < 12) h += 12; if (/am/i.test(t[3] || '') && h === 12) h = 0
    ex.time = `${String(h).padStart(2, '0')}:${t[2]}`
  }
  const pax = up.match(/\b(\d)\s?(PAX|PASSENGERS?|ADULTS?)\b/)
  if (pax) ex.pax = +pax[1]
  if (ex.date && ex.time) ex.arrive_at = `${ex.date}T${ex.time}`
  const found = [ex.number, ex.to_loc, ex.date, ex.time].filter(Boolean).length
  ex.confidence = Math.round((found / 4) * 100) / 100
  return ex
}

export function upsertTravelFromExtraction(wid: string, guestId: string, ex: Extraction, docId: string | null) {
  const w = weddingOf(wid)
  const th = agencyDefaults(w.agency_id).ocr_confidence_threshold
  const existing = get(`SELECT * FROM travel WHERE guest_id = ? AND direction = 'arrival'`, guestId)
  const dup = existing && existing.number && ex.number && existing.number === ex.number && existing.arrive_at === ex.arrive_at
  const high = ex.confidence >= th
  const data: any = {
    mode: ex.mode, carrier: ex.carrier, number: ex.number, from_loc: ex.from_loc, to_loc: ex.to_loc, arrive_at: ex.arrive_at,
    pax: ex.pax || existing?.pax || householdSize(guestId), extracted: ex, confidence: ex.confidence, ticket_doc_id: docId,
    status: high ? 'confirmed' : 'review', review_needed: high ? 0 : 1,
  }
  const rec = existing ? update('travel', existing.id, data) : insert('travel', { wedding_id: wid, guest_id: guestId, direction: 'arrival', pickup_required: 1, ...data })
  emit(high ? 'travel.submitted' : 'travel.low_confidence', { agency_id: w.agency_id, wedding_id: wid, guest_id: guestId, travel_id: rec.id, confidence: ex.confidence, duplicate: !!dup })
  if (!high) notify({ agency_id: w.agency_id, wedding_id: wid, kind: 'travel', severity: 'warning', title: 'Ticket needs review', body: `OCR confidence ${Math.round(ex.confidence * 100)}%`, link: `/w/${wid}/travel?tab=review` })
  return rec
}

function householdSize(guestId: string) {
  const g = get('SELECT household_id FROM guests WHERE id = ?', guestId)
  if (!g?.household_id) return 1
  return get(`SELECT COUNT(*) AS n FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.household_id = ? AND r.status = 'attending' GROUP BY r.function_id ORDER BY n DESC LIMIT 1`, g.household_id)?.n || 1
}

// =====================================================================
// Pickup clustering + vehicle suggestion
// =====================================================================
export function clusterPickups(wid: string) {
  const w = weddingOf(wid)
  const d = agencyDefaults(w.agency_id)
  return tx(() => {
    run(`UPDATE travel SET trip_id = NULL WHERE wedding_id = ? AND trip_id IN (SELECT id FROM trips WHERE wedding_id = ? AND status = 'suggested')`, wid, wid)
    run(`DELETE FROM trips WHERE wedding_id = ? AND status = 'suggested'`, wid)
    const pool = all(`SELECT t.*, g.name AS guest_name FROM travel t JOIN guests g ON g.id = t.guest_id
      WHERE t.wedding_id = ? AND t.direction = 'arrival' AND t.pickup_required = 1 AND t.status = 'confirmed' AND t.trip_id IS NULL AND t.arrive_at IS NOT NULL
      ORDER BY t.to_loc, t.arrive_at`, wid)
    const eff = (t: any) => Date.parse(t.arrive_at) + (t.delay_min || 0) * 60e3
    const byLoc = new Map<string, any[]>()
    for (const t of pool) byLoc.set(t.to_loc || 'Unknown', [...(byLoc.get(t.to_loc || 'Unknown') || []), t])
    const maxCap = Math.max(...d.vehicles.map(v => v.capacity))
    const trips: any[] = []
    for (const [loc, list] of byLoc) {
      list.sort((a, b) => eff(a) - eff(b))
      let cur: any[] = []
      const flush = () => {
        if (!cur.length) return
        const pax = cur.reduce((s, t) => s + (t.pax || 1), 0)
        const vehicle = d.vehicles.find(v => v.capacity >= pax) || d.vehicles[d.vehicles.length - 1]
        trips.push(insert('trips', {
          wedding_id: wid, location: loc, window_start: new Date(eff(cur[0])).toISOString(), window_end: new Date(eff(cur[cur.length - 1])).toISOString(),
          pax, status: 'suggested', suggested_kind: vehicle.kind, drop_location: w.venue,
          stops: cur.map(t => ({ travel_id: t.id, guest_id: t.guest_id, name: t.guest_name, pax: t.pax || 1, arrive_at: t.arrive_at, number: t.number, status: 'waiting' })),
        }))
        cur = []
      }
      for (const t of list) {
        const pax = cur.reduce((s, x) => s + (x.pax || 1), 0)
        if (cur.length && (eff(t) - eff(cur[0]) > d.pickup_window_min * 60e3 || pax + (t.pax || 1) > maxCap)) flush()
        cur.push(t)
      }
      flush()
    }
    for (const tr of trips) for (const s of tr.stops) run('UPDATE travel SET trip_id = ? WHERE id = ?', tr.id, s.travel_id)
    return trips
  })
}

// =====================================================================
// Room allocation suggestions + conflict detection
// =====================================================================
export function suggestRooms(wid: string) {
  return tx(() => {
    run(`DELETE FROM room_assignments WHERE wedding_id = ? AND status = 'proposed'`, wid)
    const locked = new Set(all(`SELECT guest_id FROM room_assignments WHERE wedding_id = ?`, wid).map(r => r.guest_id))
    const guests = all(`SELECT g.* FROM guests g WHERE g.wedding_id = ? AND g.needs_stay = 1
      AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status != 'declined')`, wid).filter(g => !locked.has(g.id))
    const rooms = all(`SELECT r.*, (SELECT COUNT(*) FROM room_assignments ra WHERE ra.room_id = r.id) AS used FROM rooms r WHERE r.wedding_id = ? AND r.status = 'available' ORDER BY r.floor, r.number`, wid)
      .map(r => ({ ...r, free: r.capacity - r.used }))
    const groups = new Map<string, any[]>()
    for (const g of guests) groups.set(g.household_id || g.id, [...(groups.get(g.household_id || g.id) || []), g])
    const ordered = [...groups.values()].sort((a, b) =>
      (+b.some(g => g.vip) - +a.some(g => g.vip)) || (+b.some(g => g.accessibility) - +a.some(g => g.accessibility)) || b.length - a.length)
    const rank = (r: any, vip: boolean, acc: boolean) => (acc && !r.accessible ? 100 : 0) + (vip && !/suite|premium/i.test(r.category || '') ? 10 : 0) + (!vip && /suite/i.test(r.category || '') ? 5 : 0)
    const placed: any[] = []
    const unplaced: any[] = []
    for (const fam of ordered) {
      const vip = fam.some(g => g.vip), acc = fam.some(g => g.accessibility)
      let left = [...fam].sort((a, b) => +!!b.accessibility - +!!a.accessibility)
      let floor: number | null = null
      while (left.length) {
        const cands = rooms.filter(r => r.free > 0).sort((a, b) => {
          const fitA = a.free >= left.length ? 0 : 1, fitB = b.free >= left.length ? 0 : 1
          return (rank(a, vip, acc && !!left[0].accessibility) - rank(b, vip, acc && !!left[0].accessibility)) || fitA - fitB
            || (floor !== null ? Math.abs(a.floor - floor) - Math.abs(b.floor - floor) : 0) || a.free - b.free
        })
        const room = cands[0]
        if (!room) { unplaced.push(...left); break }
        const take = left.splice(0, room.free)
        floor = room.floor
        for (const g of take) placed.push(insert('room_assignments', { wedding_id: wid, room_id: room.id, guest_id: g.id, status: 'proposed' }))
        room.free -= take.length
      }
    }
    return { placed: placed.length, unplaced: unplaced.map(g => ({ id: g.id, name: g.name })) }
  })
}

export function roomConflicts(wid: string) {
  const out: { kind: string; severity: string; message: string; room_id?: string; guest_id?: string }[] = []
  const rows = all(`SELECT ra.*, r.number, r.capacity, r.accessible, r.category, r.floor, r.available_from, r.available_to,
      g.name, g.vip, g.accessibility, g.household_id, g.stay_from, g.stay_to
    FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id JOIN guests g ON g.id = ra.guest_id WHERE ra.wedding_id = ?`, wid)
  const byRoom = new Map<string, any[]>()
  for (const r of rows) byRoom.set(r.room_id, [...(byRoom.get(r.room_id) || []), r])
  for (const [rid, list] of byRoom) if (list.length > list[0].capacity)
    out.push({ kind: 'capacity', severity: 'critical', room_id: rid, message: `Room ${list[0].number} holds ${list.length} guests but sleeps ${list[0].capacity}` })
  for (const r of rows) {
    if (r.accessibility && !r.accessible) out.push({ kind: 'accessibility', severity: 'critical', guest_id: r.guest_id, room_id: r.room_id, message: `${r.name} needs an accessible room (${r.accessibility}); room ${r.number} isn't` })
    if (r.vip && !/suite|premium|deluxe/i.test(r.category || '')) out.push({ kind: 'vip', severity: 'warning', guest_id: r.guest_id, room_id: r.room_id, message: `VIP ${r.name} is in a ${r.category || 'standard'} room` })
    if (r.stay_from && r.available_from && (r.stay_from < r.available_from || (r.stay_to && r.available_to && r.stay_to > r.available_to)))
      out.push({ kind: 'dates', severity: 'warning', guest_id: r.guest_id, room_id: r.room_id, message: `${r.name}'s stay (${r.stay_from}→${r.stay_to}) is outside room ${r.number}'s block` })
  }
  const fam = new Map<string, Set<number>>()
  for (const r of rows) if (r.household_id) fam.set(r.household_id, (fam.get(r.household_id) || new Set()).add(r.floor))
  for (const [hid, floors] of fam) if (floors.size > 1) {
    const h = get('SELECT name FROM households WHERE id = ?', hid)
    out.push({ kind: 'family_split', severity: 'warning', message: `${h?.name || 'A household'} is split across floors ${[...floors].join(', ')}` })
  }
  const unassigned = all(`SELECT g.id, g.name FROM guests g WHERE g.wedding_id = ? AND g.needs_stay = 1
    AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status != 'declined')
    AND NOT EXISTS (SELECT 1 FROM room_assignments ra WHERE ra.guest_id = g.id)`, wid)
  for (const g of unassigned) out.push({ kind: 'unassigned', severity: 'warning', guest_id: g.id, message: `${g.name} needs a stay but has no room` })
  return out
}

// =====================================================================
// Guest data quality: duplicates + household suggestions
// =====================================================================
const normPhone = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10)
const normName = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '')
function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 99
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export function findDuplicates(wid: string, incoming?: { name: string; phone?: string; household?: string; _row?: number }[]) {
  const existing = all('SELECT id, name, phone, side, household_id FROM guests WHERE wedding_id = ?', wid)
  const pairs: { a: any; b: any; reason: string }[] = []
  const check = (a: any, b: any) => {
    const pa = normPhone(a.phone), pb = normPhone(b.phone)
    const samePhone = pa.length === 10 && pa === pb
    const sameHouse = a.household_id && a.household_id === b.household_id || (a.household && a.household === b.household)
    if (samePhone && !sameHouse && normName(a.name) !== normName(b.name)) return // shared household number: not a dup
    if (samePhone && normName(a.name) === normName(b.name)) return pairs.push({ a, b, reason: 'Same name and phone' })
    const d = lev(normName(a.name), normName(b.name))
    if (d <= 1 && (samePhone || !pa || !pb)) pairs.push({ a, b, reason: a.side && b.side && a.side !== b.side ? 'Similar name on both bride & groom sides' : 'Very similar name' })
  }
  if (incoming) for (const n of incoming) for (const e of existing) check(n, e)
  else for (let i = 0; i < existing.length; i++) for (let j = i + 1; j < existing.length; j++) check(existing[i], existing[j])
  return pairs
}

export function suggestHouseholds(wid: string) {
  const loose = all('SELECT * FROM guests WHERE wedding_id = ? AND household_id IS NULL', wid)
  const groups = new Map<string, any[]>()
  for (const g of loose) {
    const key = normPhone(g.phone) ? `p:${normPhone(g.phone)}` : `s:${(g.side || '')}:${g.name.trim().split(/\s+/).pop()!.toLowerCase()}`
    groups.set(key, [...(groups.get(key) || []), g])
  }
  return [...groups.values()].filter(l => l.length > 1).map(l => ({
    name: `${l[0].name.trim().split(/\s+/).pop()} Family`, side: l[0].side, guest_ids: l.map(g => g.id), names: l.map(g => g.name),
  }))
}

// =====================================================================
// Wedding health, priority queue & morning brief
// =====================================================================
type Item = { severity: 'critical' | 'warning' | 'info'; domain: string; title: string; detail?: string; module: string; next?: string }


/** Turn "1 guest(s) haven't" into "1 guest hasn't" and "3 reply(ies)" into "3 replies". */
export function plain(t: string) {
  return t
    .replace(/(\d+) ([^()]*?)y\(ies\)/g, (_, n, w) => `${n} ${w}${+n === 1 ? 'y' : 'ies'}`)
    .replace(/(\d+) ([^()]*?)\(s\)/g, (_, n, w) => `${n} ${w}${+n === 1 ? '' : 's'}`)
    .replace(/^1 ([\w ]+?) haven't/, "1 $1 hasn't")
    .replace(/^1 ([\w ]+?) need /, '1 $1 needs ')
    .replace(/\(s\)/g, '')
}

export function weddingHealth(wid: string) {
  const w = weddingOf(wid)
  if (!w) return null
  const d = agencyDefaults(w.agency_id)
  const q: Item[] = []
  const daysOut = w.start_date ? Math.round((Date.parse(`${w.start_date}T00:00`) - Date.parse(`${localDate()}T00:00`)) / 864e5) : 99
  const n = (sql: string, ...p: any[]) => get(sql, ...p)?.n ?? 0

  const guests = n('SELECT COUNT(*) n FROM guests WHERE wedding_id = ?', wid)
  const noPhone = n(`SELECT COUNT(*) n FROM guests WHERE wedding_id = ? AND (phone IS NULL OR phone = '') AND age_group != 'child'`, wid)
  const noFn = n(`SELECT COUNT(*) n FROM guests g WHERE wedding_id = ? AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id)`, wid)
  if (noPhone) q.push({ severity: 'warning', domain: 'guests', title: `${noPhone} adult guest(s) missing a phone number`, module: 'guests', next: 'Add numbers so WhatsApp can reach them' })
  if (noFn) q.push({ severity: 'warning', domain: 'guests', title: `${noFn} guest(s) not invited to any function`, module: 'guests', next: 'Set function access' })

  const rsvpTotal = n('SELECT COUNT(*) n FROM rsvps WHERE wedding_id = ?', wid)
  const rsvpPending = n(`SELECT COUNT(*) n FROM rsvps WHERE wedding_id = ? AND status = 'pending'`, wid)
  const vipPending = n(`SELECT COUNT(DISTINCT g.id) n FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE r.wedding_id = ? AND r.status = 'pending' AND g.vip = 1`, wid)
  if (vipPending) q.push({ severity: daysOut < 21 ? 'critical' : 'warning', domain: 'rsvp', title: `${vipPending} VIP guest(s) haven't RSVP'd`, module: 'rsvp', next: 'Call personally' })
  if (rsvpTotal && rsvpPending / rsvpTotal > 0.3 && daysOut < 30) q.push({ severity: 'warning', domain: 'rsvp', title: `${Math.round(rsvpPending / rsvpTotal * 100)}% of RSVPs still pending`, module: 'rsvp', next: 'Send a reminder' })

  const travelReview = n(`SELECT COUNT(*) n FROM travel WHERE wedding_id = ? AND status = 'review'`, wid)
  const travelPending = n(`SELECT COUNT(*) n FROM travel WHERE wedding_id = ? AND status = 'pending'`, wid)
  const noTrip = n(`SELECT COUNT(*) n FROM travel t WHERE wedding_id = ? AND status = 'confirmed' AND pickup_required = 1 AND (trip_id IS NULL OR EXISTS (SELECT 1 FROM trips x WHERE x.id = t.trip_id AND x.status = 'suggested'))`, wid)
  const delayed = n(`SELECT COUNT(*) n FROM travel WHERE wedding_id = ? AND delay_min > 30 AND live_status NOT IN ('dropped','picked_up')`, wid)
  if (travelReview) q.push({ severity: 'warning', domain: 'travel', title: `${travelReview} ticket(s) need OCR review`, module: 'travel?tab=review', next: 'Confirm extracted fields' })
  if (noTrip) q.push({ severity: daysOut < 7 ? 'critical' : 'warning', domain: 'travel', title: `${noTrip} arrival(s) without a confirmed pickup`, module: 'travel?tab=pickups', next: 'Confirm vehicles and drivers' })
  if (delayed) q.push({ severity: 'critical', domain: 'travel', title: `${delayed} arrival(s) delayed 30+ min`, module: 'travel', next: 'Re-plan pickups' })

  const needStay = n(`SELECT COUNT(*) n FROM guests g WHERE wedding_id = ? AND needs_stay = 1 AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status != 'declined')`, wid)
  const unroomed = n(`SELECT COUNT(*) n FROM guests g WHERE wedding_id = ? AND needs_stay = 1 AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status != 'declined') AND NOT EXISTS (SELECT 1 FROM room_assignments ra WHERE ra.guest_id = g.id AND ra.status IN ('final','checked_in','checked_out'))`, wid)
  const roomApproval = get(`SELECT status FROM approvals WHERE wedding_id = ? AND kind = 'rooming' ORDER BY created_at DESC LIMIT 1`, wid)
  if (unroomed && daysOut < 14) q.push({ severity: daysOut < 5 ? 'critical' : 'warning', domain: 'rooms', title: `${unroomed} guest(s) without a finalized room`, module: 'rooms', next: roomApproval?.status === 'pending' ? 'Waiting on host approval' : 'Generate & finalize rooming' })
  if (roomApproval?.status === 'changes_requested') q.push({ severity: 'warning', domain: 'rooms', title: 'Host requested rooming changes', module: 'rooms', next: 'Revise allocation' })

  const vTotal = n('SELECT COUNT(*) n FROM vendor_assignments WHERE wedding_id = ?', wid)
  const vPending = n(`SELECT COUNT(*) n FROM vendor_assignments WHERE wedding_id = ? AND status = 'pending'`, wid)
  const vCancelled = n(`SELECT COUNT(*) n FROM vendor_assignments WHERE wedding_id = ? AND status = 'cancelled' AND backup_vendor_id IS NULL`, wid)
  const vDelayed = n(`SELECT COUNT(*) n FROM vendor_assignments WHERE wedding_id = ? AND live_status = 'delayed'`, wid)
  if (vPending) q.push({ severity: daysOut < 7 ? 'critical' : 'warning', domain: 'vendors', title: `${vPending} vendor assignment(s) unconfirmed`, module: 'vendors', next: 'Follow up' })
  if (vCancelled) q.push({ severity: 'critical', domain: 'vendors', title: `${vCancelled} cancelled vendor(s) without a backup`, module: 'vendors', next: 'Assign a replacement' })
  if (vDelayed) q.push({ severity: 'critical', domain: 'vendors', title: `${vDelayed} vendor(s) running late`, module: 'live', next: 'Check timeline impact' })

  const tTotal = n('SELECT COUNT(*) n FROM tasks WHERE wedding_id = ?', wid)
  const overdue = n(`SELECT COUNT(*) n FROM tasks WHERE wedding_id = ? AND status NOT IN ('done') AND due_at < ?`, wid, now())
  const blocked = n(`SELECT COUNT(*) n FROM tasks WHERE wedding_id = ? AND status = 'blocked'`, wid)
  const review = n(`SELECT COUNT(*) n FROM tasks WHERE wedding_id = ? AND status = 'review'`, wid)
  if (overdue) q.push({ severity: 'warning', domain: 'tasks', title: `${overdue} overdue task(s)`, module: 'tasks?filter=overdue', next: 'Reassign or extend' })
  if (blocked) q.push({ severity: 'warning', domain: 'tasks', title: `${blocked} blocked task(s)`, module: 'tasks?filter=blocked', next: 'Resolve blockers' })
  if (review) q.push({ severity: 'info', domain: 'tasks', title: `${review} task(s) awaiting your review`, module: 'tasks?filter=review' })

  const planned = n('SELECT COALESCE(SUM(planned),0) n FROM budget_lines WHERE wedding_id = ?', wid)
  const actual = n('SELECT COALESCE(SUM(amount_base),0) n FROM expenses WHERE wedding_id = ?', wid)
  const overLines = all(`SELECT bl.category, bl.planned, COALESCE(SUM(e.amount_base),0) AS actual FROM budget_lines bl LEFT JOIN expenses e ON e.line_id = bl.id WHERE bl.wedding_id = ? GROUP BY bl.id HAVING actual > planned * (1 + ? / 100.0) AND planned > 0`, wid, d.budget_variance_pct)
  for (const l of overLines) q.push({ severity: 'warning', domain: 'budget', title: `${l.category} is ${Math.round((l.actual / l.planned - 1) * 100)}% over plan`, module: 'budget', next: 'Review variance' })
  const flagged = n(`SELECT COUNT(*) n FROM expenses WHERE wedding_id = ? AND flagged IS NOT NULL`, wid)
  if (flagged) q.push({ severity: 'info', domain: 'budget', title: `${flagged} expense(s) flagged for correction`, module: 'budget' })

  const openInc = n(`SELECT COUNT(*) n FROM incidents WHERE wedding_id = ? AND status != 'resolved'`, wid)
  const critInc = n(`SELECT COUNT(*) n FROM incidents WHERE wedding_id = ? AND status != 'resolved' AND severity = 'critical'`, wid)
  if (critInc) q.push({ severity: 'critical', domain: 'live', title: `${critInc} critical incident(s) open`, module: 'live' })
  else if (openInc) q.push({ severity: 'warning', domain: 'live', title: `${openInc} open incident(s)`, module: 'live' })

  const failed = n(`SELECT COUNT(*) n FROM messages WHERE wedding_id = ? AND status = 'failed' AND handled = 0`, wid)
  const inbox = n(`SELECT COUNT(*) n FROM messages WHERE wedding_id = ? AND direction = 'in' AND handled = 0`, wid)
  if (failed) q.push({ severity: 'warning', domain: 'comms', title: `${failed} message(s) failed to deliver`, module: 'comms?tab=failures', next: 'Fix numbers or contact manually' })
  if (inbox) q.push({ severity: 'info', domain: 'comms', title: `${inbox} reply(ies) need a human`, module: 'comms?tab=inbox' })

  const mediaPending = n(`SELECT COUNT(*) n FROM media WHERE wedding_id = ? AND status = 'pending'`, wid)
  if (mediaPending) q.push({ severity: 'info', domain: 'media', title: `${mediaPending} media item(s) awaiting approval`, module: 'media' })

  const pct = (bad: number, tot: number) => (tot ? Math.max(0, Math.round(100 - (bad / tot) * 100)) : 100)
  const domains = {
    guests: { score: pct(noPhone + noFn, guests), metric: `${guests} guests` },
    rsvp: { score: pct(rsvpPending, rsvpTotal), metric: `${rsvpTotal - rsvpPending}/${rsvpTotal} responded` },
    travel: { score: pct(travelReview + travelPending + noTrip, n('SELECT COUNT(*) n FROM travel WHERE wedding_id = ?', wid)), metric: `${noTrip} need pickup` },
    rooms: { score: pct(unroomed, needStay), metric: `${needStay - unroomed}/${needStay} finalized` },
    vendors: { score: pct(vPending + vCancelled * 2, vTotal), metric: `${vTotal - vPending}/${vTotal} confirmed` },
    tasks: { score: pct(overdue + blocked, tTotal), metric: `${overdue} overdue · ${blocked} blocked` },
    budget: { score: planned ? Math.max(0, Math.round(100 - Math.max(0, (actual / planned - 1) * 200))) : 100, metric: `${Math.round(planned ? actual / planned * 100 : 0)}% spent` },
  }
  for (const i of q) i.title = plain(i.title)
  const order = { critical: 0, warning: 1, info: 2 }
  q.sort((a, b) => order[a.severity] - order[b.severity])
  const vals = Object.values(domains).map(d => d.score)
  const score = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) - q.filter(i => i.severity === 'critical').length * 5
  return { wedding_id: wid, score: Math.max(0, Math.min(100, score)), days_out: daysOut, domains, queue: q }
}

export function morningBrief(user: any, weddingIds: string[]) {
  const today = localDate()
  const week = localDate(7)
  const weddings = weddingIds.map(id => weddingOf(id)).filter(w => ['planning', 'live'].includes(w.status)).map(w => ({ ...w, health: weddingHealth(w.id) }))
  const critical = weddings.flatMap(w => w.health!.queue.filter(i => i.severity === 'critical').map(i => ({ ...i, wedding_id: w.id, wedding: w.name })))
  const attention = weddings.flatMap(w => w.health!.queue.filter(i => i.severity === 'warning').map(i => ({ ...i, wedding_id: w.id, wedding: w.name })))
  const ids = weddingIds.length ? weddingIds : ['-']
  const ph = ids.map(() => '?').join(',')
  const functions = all(`SELECT f.*, w.name AS wedding FROM functions f JOIN weddings w ON w.id = f.wedding_id WHERE f.wedding_id IN (${ph}) AND f.date BETWEEN ? AND ? ORDER BY f.date, f.start_time`, ...ids, today, week)
  const myTasks = all(`SELECT t.*, w.name AS wedding FROM tasks t LEFT JOIN weddings w ON w.id = t.wedding_id WHERE t.owner_id = ? AND t.status != 'done' AND (t.due_at IS NULL OR t.due_at <= ?) ORDER BY t.due_at LIMIT 12`, user.id, `${today}T23:59`)
  const team = all(`SELECT id, name, title, role, unavailable, shift_status FROM users WHERE agency_id = ? AND status = 'active'`, user.agency_id)
    .map(u => ({ ...u, available_today: !(u.unavailable || []).some((r: any) => r.from <= today && r.to >= today) }))
  const leads = all(`SELECT l.*, (SELECT status FROM proposals p WHERE p.lead_id = l.id ORDER BY version DESC LIMIT 1) AS proposal_status FROM leads l WHERE l.agency_id = ? AND l.status IN ('new','proposal_sent','revision') ORDER BY l.updated_at DESC LIMIT 6`, user.agency_id)
  const summary = plain(critical.length
    ? `${critical.length} critical item(s) across ${new Set(critical.map(c => c.wedding_id)).size} wedding(s) need you first.`
    : attention.length ? `No fires. ${attention.length} item(s) need attention today.` : 'All weddings are on track.')
  return { date: today, summary, critical, attention: attention.slice(0, 12), functions, my_tasks: myTasks, team, leads, weddings: weddings.map(w => ({ id: w.id, name: w.name, couple: w.couple, start_date: w.start_date, end_date: w.end_date, city: w.city, status: w.status, score: w.health!.score, days_out: w.health!.days_out, top: w.health!.queue[0] || null })) }
}

// =====================================================================
// Vendor status + approvals (shared by links, inbound and planner UI)
// =====================================================================
export function vendorStatus(assignmentId: string, action: string, opts: { minutes?: number; note?: string } = {}, actor?: any) {
  const va = get('SELECT * FROM vendor_assignments WHERE id = ?', assignmentId)
  const w = weddingOf(va.wedding_id)
  const vendor = get('SELECT * FROM vendors WHERE id = ?', va.vendor_id)
  const patch: any = {}
  const ev = { agency_id: w.agency_id, wedding_id: w.id, assignment_id: va.id, vendor_id: va.vendor_id, vendor: vendor.name, function_id: va.function_id }
  switch (action) {
    case 'confirm': patch.status = 'confirmed'; patch.confirmed_at = now(); emit('vendor.confirmed', ev); break
    case 'decline': case 'cancel':
      patch.status = 'cancelled'; patch.live_status = 'cancelled'
      notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'vendor', severity: 'critical', title: `${vendor.name} cancelled`, body: opts.note, link: `/w/${w.id}/vendors` })
      emit('vendor.cancelled', ev); break
    case 'checkin': patch.live_status = 'checked_in'; break
    case 'enroute': patch.live_status = 'en_route'; if (opts.minutes) patch.eta_min = opts.minutes; break
    case 'arrived': patch.live_status = 'arrived'; patch.arrived_at = now(); if (va.status === 'pending') patch.status = 'confirmed'; break
    case 'setup': patch.live_status = 'setup'; break
    case 'ready': patch.live_status = 'ready'; break
    case 'complete': patch.live_status = 'completed'; patch.status = 'completed'; patch.completed_at = now(); break
    case 'delay': {
      patch.live_status = 'delayed'; patch.delay_min = opts.minutes || 15
      const impact = delayImpact(va, patch.delay_min)
      const critical = patch.delay_min >= 30 || impact.tasks.length > 2
      notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'vendor', severity: critical ? 'critical' : 'warning', title: `${vendor.name} running ${patch.delay_min} min late`, body: impact.summary, link: `/w/${w.id}/live` })
      for (const t of impact.tasks) if (t.owner_id) notify({ agency_id: w.agency_id, wedding_id: w.id, user_id: t.owner_id, kind: 'task', severity: 'warning', title: `Dependency delayed: ${t.title}`, body: `${vendor.name} is ${patch.delay_min} min late`, link: `/w/${w.id}/tasks` })
      if (critical) insert('incidents', { wedding_id: w.id, function_id: va.function_id, title: `${vendor.name} delayed ${patch.delay_min} min`, description: opts.note || impact.summary, severity: patch.delay_min >= 45 ? 'critical' : 'high', source: 'vendor', related: va.id, log: [{ at: now(), text: 'Auto-created from vendor delay report' }] })
      emit('vendor.delayed', { ...ev, minutes: patch.delay_min, critical })
      break
    }
  }
  const out = update('vendor_assignments', va.id, patch)
  if (action === 'complete' || action === 'arrived') {
    const onTime = action === 'arrived' && (!va.report_at || Date.now() <= Date.parse(va.report_at) + 10 * 60e3) && !va.delay_min
    if (action === 'arrived') run('UPDATE vendors SET jobs = jobs + 1, on_time = on_time + ? WHERE id = ?', onTime ? 1 : 0, va.vendor_id)
  }
  audit(null, `vendor.${action}`, 'vendor_assignment', va.id, opts, true, actor || { kind: 'vendor', id: va.vendor_id, name: vendor.name, agency_id: w.agency_id, wedding_id: w.id })
  return out
}

export function delayImpact(va: any, minutes: number) {
  const f = va.function_id ? get('SELECT * FROM functions WHERE id = ?', va.function_id) : null
  const tasks = all(`SELECT * FROM tasks WHERE wedding_id = ? AND status NOT IN ('done') AND (depends_on LIKE ? OR (? IS NOT NULL AND description LIKE ?))`, va.wedding_id, `%${va.id}%`, f?.name ?? null, `%${f?.name ?? '~'}%`)
  const later = all(`SELECT va.*, v.name FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.wedding_id = ? AND va.function_id IS ? AND va.report_at > ? AND va.id != ?`, va.wedding_id, va.function_id, va.report_at || '', va.id)
  const summary = `${f ? f.name : 'Function'}: ${tasks.length} dependent task(s), ${later.length} downstream vendor(s) may shift by ~${minutes} min.`
  return { function: f, tasks, downstream: later, summary }
}

export function decideApproval(id: string, status: 'approved' | 'rejected' | 'changes_requested', comment: string | undefined, actor: any) {
  const ap = get('SELECT * FROM approvals WHERE id = ?', id)
  if (!ap || ap.status !== 'pending') return ap
  const out = update('approvals', id, { status, comment: comment ?? null, decided_at: now() })
  const w = ap.wedding_id ? weddingOf(ap.wedding_id) : null
  const agency_id = w?.agency_id ?? actor?.agency_id
  if (ap.kind === 'rooming') {
    if (status === 'approved') run(`UPDATE room_assignments SET status = 'approved' WHERE wedding_id = ? AND status IN ('proposed','pending_approval')`, ap.wedding_id)
    else run(`UPDATE room_assignments SET status = 'proposed' WHERE wedding_id = ? AND status = 'pending_approval'`, ap.wedding_id)
  }
  if (ap.kind === 'media') {
    const ids: string[] = ap.data?.media_ids || []
    const decisions: Record<string, string> = ap.data?.decisions || {}
    for (const mid of ids) {
      const d = decisions[mid] || (status === 'approved' ? 'approved' : 'rejected')
      run(`UPDATE media SET status = ?, comment = COALESCE(?, comment) WHERE id = ? AND status IN ('pending','in_review')`, d, d === 'rejected' ? comment ?? null : null, mid)
    }
  }
  if (ap.kind === 'case_study') run('UPDATE case_studies SET consent = ? WHERE id = ?', status === 'approved' ? 'granted' : 'declined', ap.entity_id)
  if (ap.kind === 'budget') run('UPDATE expenses SET flagged = NULL WHERE id = ? AND ? = ?', ap.entity_id, status, 'approved')
  if (agency_id) notify({ agency_id, wedding_id: ap.wedding_id, kind: 'approval', severity: status === 'approved' ? 'info' : 'warning', title: `${ap.title}: ${status.replace('_', ' ')}`, body: comment, link: ap.wedding_id ? `/w/${ap.wedding_id}/approvals` : undefined })
  emit('approval.decided', { agency_id, wedding_id: ap.wedding_id, approval_id: id, kind: ap.kind, status })
  audit(null, `approval.${status}`, 'approval', id, { comment }, true, actor)
  return out
}

// =====================================================================
// Automation engine (trigger → conditions → [delay] → [approval] → actions, with retries & loop guards)
// =====================================================================
export const TRIGGERS: Record<string, string> = {
  'guest.created': 'Guest added',
  'rsvp.submitted': 'RSVP submitted',
  'travel.submitted': 'Travel details saved',
  'travel.low_confidence': 'Ticket needs review (low OCR confidence)',
  'travel.delayed': 'Arrival delayed',
  'vendor.confirmed': 'Vendor confirmed',
  'vendor.no_response': 'Vendor did not respond',
  'vendor.delayed': 'Vendor reported delay',
  'vendor.cancelled': 'Vendor cancelled',
  'approval.decided': 'Host approval decided',
  'task.blocked': 'Task blocked',
  'task.overdue': 'Task overdue',
  'incident.created': 'Incident created',
  'media.uploaded': 'Media uploaded',
  'message.failed': 'Message failed',
  'message.inbound_unclear': 'Unclear inbound reply',
  'budget.exception': 'Budget variance exceeded',
  'proposal.accepted': 'Proposal accepted',
}
export const ACTIONS = ['send_message', 'notify_planner', 'create_task', 'create_incident'] as const

const OPS: Record<string, (a: any, b: any) => boolean> = {
  eq: (a, b) => String(a) === String(b), neq: (a, b) => String(a) !== String(b),
  gt: (a, b) => +a > +b, lt: (a, b) => +a < +b, contains: (a, b) => String(a ?? '').includes(b), exists: a => a !== undefined && a !== null,
}
export const evalConditions = (conds: any[] = [], p: any) => conds.every(c => OPS[c.op]?.(p[c.field], c.value))

let depth = 0
on('*', (payload: any) => {
  if (payload.event?.startsWith('automation.') || !payload.agency_id) return
  const rules = all(`SELECT * FROM automations WHERE agency_id = ? AND enabled = 1 AND trigger = ? AND (wedding_id IS NULL OR wedding_id = ?)`, payload.agency_id, payload.event, payload.wedding_id ?? null)
  for (const r of rules) startRun(r, payload)
})

function startRun(rule: any, payload: any) {
  const key = `${rule.id}:${rule.version}:${payload.event}:${payload.guest_id || payload.assignment_id || payload.task_id || payload.message_id || payload.travel_id || payload.approval_id || payload.incident_id || ''}`
  const base = { automation_id: rule.id, wedding_id: payload.wedding_id ?? null, event: payload.event, payload, dedupe_key: key }
  if (depth > 3) return insert('automation_runs', { ...base, status: 'loop_blocked', detail: 'Stopped: automation chain exceeded 3 levels (possible recursive loop)' })
  if (get(`SELECT 1 FROM automation_runs WHERE dedupe_key = ? AND status IN ('succeeded','scheduled','awaiting_approval') AND created_at > ?`, key, new Date(Date.now() - 10 * 60e3).toISOString()))
    return insert('automation_runs', { ...base, status: 'skipped', detail: 'Duplicate trigger within 10 minutes' })
  const recent = get(`SELECT COUNT(*) n FROM automation_runs WHERE automation_id = ? AND created_at > ?`, rule.id, new Date(Date.now() - 60e3).toISOString()).n
  if (recent > 50) return insert('automation_runs', { ...base, status: 'throttled', detail: 'Trigger storm: more than 50 runs in a minute' })
  if (!evalConditions(rule.conditions, payload)) return insert('automation_runs', { ...base, status: 'skipped', detail: 'Conditions not met' })
  run('UPDATE automations SET runs = runs + 1 WHERE id = ?', rule.id)
  if (rule.requires_approval) {
    const r = insert('automation_runs', { ...base, status: 'awaiting_approval' })
    insert('approvals', { wedding_id: payload.wedding_id, kind: 'automation', title: `Run "${rule.name}"?`, description: TRIGGERS[payload.event], entity_id: r.id, approver: 'planner', data: { run_id: r.id } })
    return r
  }
  if (rule.delay_min > 0) return insert('automation_runs', { ...base, status: 'scheduled', detail: `Runs at ${new Date(Date.now() + rule.delay_min * 60e3).toISOString()}` })
  const r = insert('automation_runs', { ...base, status: 'running' })
  return executeRun(r.id)
}

export function executeRun(runId: string) {
  const r = get('SELECT * FROM automation_runs WHERE id = ?', runId)
  const rule = get('SELECT * FROM automations WHERE id = ?', r.automation_id)
  if (!rule) return update('automation_runs', runId, { status: 'failed', detail: 'Automation deleted' })
  const p = r.payload
  const results: string[] = []
  depth++
  try {
    for (const a of rule.actions || []) results.push(runAction(rule, a, p))
    return update('automation_runs', runId, { status: 'succeeded', detail: results.join(' · '), attempts: (r.attempts || 0) + 1 })
  } catch (e: any) {
    const attempts = (r.attempts || 0) + 1
    if (attempts > (rule.retries ?? 2)) {
      notify({ agency_id: rule.agency_id, wedding_id: p.wedding_id, kind: 'automation', severity: 'warning', title: `Automation "${rule.name}" failed`, body: e.message, link: '/automation' })
      return update('automation_runs', runId, { status: 'failed', detail: `Retries exhausted: ${e.message}`, attempts })
    }
    return update('automation_runs', runId, { status: 'retrying', detail: e.message, attempts })
  } finally { depth-- }
}

function runAction(rule: any, a: any, p: any): string {
  const w = p.wedding_id ? weddingOf(p.wedding_id) : null
  const vars = { ...p, wedding: w?.name, couple: w?.couple }
  switch (a.type) {
    case 'send_message': {
      const target = a.to === 'trigger' ? (p.guest_id ? ['guest', p.guest_id] : p.vendor_id ? ['vendor', p.vendor_id] : null)
        : a.to === 'host' ? ['host', get('SELECT id FROM hosts WHERE wedding_id = ? LIMIT 1', p.wedding_id)?.id] : null
      if (!target || !target[1]) throw new Error('No recipient for message action')
      const tpl = a.template_id ? get('SELECT body FROM templates WHERE id = ?', a.template_id)?.body : a.body
      const { text } = renderTemplate(tpl || '', { ...vars, ...partyVars(target[0], target[1], w) })
      const m = sendMessage({ agency_id: rule.agency_id, wedding_id: p.wedding_id, party_kind: target[0], party_id: target[1], body: text, dedupe_key: `auto:${rule.id}:${target[1]}:${p.event}` })
      if (m.status === 'failed') {
        if (m.fail_reason === 'opt_out') return 'Skipped: recipient opted out'
        throw new Error(`Message failed: ${m.fail_reason}`)
      }
      return `Messaged ${target[0]}`
    }
    case 'notify_planner':
      notify({ agency_id: rule.agency_id, wedding_id: p.wedding_id, kind: 'automation', severity: a.severity || 'info', title: renderTemplate(a.title || rule.name, vars).text, body: TRIGGERS[p.event] })
      return 'Planner notified'
    case 'create_task': {
      const owner = a.owner === 'lead' ? get('SELECT user_id FROM wedding_team WHERE wedding_id = ? LIMIT 1', p.wedding_id)?.user_id : null
      insert('tasks', { wedding_id: p.wedding_id, title: renderTemplate(a.title || rule.name, vars).text, priority: a.priority || 'medium', owner_id: owner, due_at: new Date(Date.now() + (a.due_hours || 24) * 3600e3).toISOString(), source: `automation:${rule.id}` })
      return 'Task created'
    }
    case 'create_incident':
      insert('incidents', { wedding_id: p.wedding_id, title: renderTemplate(a.title || rule.name, vars).text, severity: a.severity || 'medium', source: 'automation', log: [{ at: now(), text: `Created by automation "${rule.name}"` }] })
      return 'Incident created'
  }
  throw new Error(`Unknown action ${a.type}`)
}

export function testAutomation(rule: any) {
  const errors: string[] = []
  if (!TRIGGERS[rule.trigger]) errors.push('Choose a valid trigger')
  if (!rule.actions?.length) errors.push('Add at least one action')
  for (const a of rule.actions || []) {
    if (!ACTIONS.includes(a.type)) errors.push(`Unknown action "${a.type}"`)
    if (a.type === 'send_message' && !a.body && !a.template_id) errors.push('Message action needs a template or body')
    if (a.type === 'send_message' && !['trigger', 'host'].includes(a.to)) errors.push('Message action needs a recipient')
  }
  for (const c of rule.conditions || []) if (!OPS[c.op]) errors.push(`Unknown operator "${c.op}"`)
  const loops = rule.actions?.some((a: any) => a.type === 'create_task') && rule.trigger === 'task.overdue'
  if (loops) errors.push('This would create tasks from task events, which can loop. Add a condition.')
  const sample: any = { event: rule.trigger, guest_id: 'sample', status: 'attending', minutes: 45, confidence: 0.5, severity: 'critical', reason: 'invalid_number' }
  return { ok: !errors.length, errors, sample_matches: evalConditions(rule.conditions, sample) }
}

// =====================================================================
// Scheduler / reminder engine
// =====================================================================
export function tick(opts: { force?: boolean; agency_id?: string } = {}) {
  const log: string[] = []
  const f = !!opts.force
  // 1. scheduled + retryable messages
  for (const m of all(`SELECT id FROM messages WHERE status = 'queued' AND scheduled_at <= ?`, now())) { deliver(m.id); log.push('Sent scheduled message') }
  for (const m of all(`SELECT id FROM messages WHERE status = 'failed' AND fail_reason = 'api_outage' AND attempts < 3`)) { deliver(m.id); log.push('Retried message after outage') }
  // 2. delayed automation runs + retries
  for (const r of all(`SELECT * FROM automation_runs WHERE status IN ('scheduled','retrying')`)) {
    const at = r.detail?.match(/Runs at (\S+)/)?.[1]
    if (r.status === 'retrying' || f || !at || at <= now()) { executeRun(r.id); log.push('Ran automation') }
  }
  const agencies = opts.agency_id ? [{ id: opts.agency_id }] : all('SELECT id FROM agencies')
  for (const ag of agencies) {
    const d = agencyDefaults(ag.id)
    const weddings = all(`SELECT * FROM weddings WHERE agency_id = ? AND status IN ('planning','live')`, ag.id)
    for (const w of weddings) {
      // 3. RSVP reminders → manual follow-up for VIPs / exhausted
      const pend = all(`SELECT g.*, MAX(r.reminders) AS reminders, MAX(r.last_reminded_at) AS last_reminded_at, MIN(r.created_at) AS invited_at
        FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE r.wedding_id = ? AND r.status = 'pending' GROUP BY g.id`, w.id)
      for (const g of pend) {
        const firstSent = get(`SELECT MIN(created_at) AS t FROM messages WHERE party_kind = 'guest' AND party_id = ? AND intent = 'rsvp_request'`, g.id)?.t
        if (!firstSent) continue
        const due = f || hoursAgo(g.last_reminded_at || firstSent, d.rsvp_reminder_hours)
        if (!due) continue
        if (g.reminders < d.rsvp_max_reminders) {
          const { text } = renderTemplate(`Hi {{first_name}}, gentle reminder to RSVP for {{wedding}} 🙏 It takes 30 seconds: {{link}}`, partyVars('guest', g.id, w))
          sendMessage({ agency_id: ag.id, wedding_id: w.id, party_kind: 'guest', party_id: g.id, body: text, intent: 'rsvp_reminder', dedupe_key: `rsvp-rem-${g.id}-${g.reminders + 1}` })
          run(`UPDATE rsvps SET reminders = reminders + 1, last_reminded_at = ? WHERE guest_id = ? AND status = 'pending'`, now(), g.id)
          log.push(`RSVP reminder ${g.reminders + 1} → ${g.name}`)
        } else if (!get(`SELECT 1 FROM tasks WHERE source = ?`, `rsvp-followup:${g.id}`)) {
          const lead = get('SELECT user_id FROM wedding_team WHERE wedding_id = ? LIMIT 1', w.id)?.user_id
          insert('tasks', { wedding_id: w.id, title: `Call ${g.name} for RSVP${g.vip ? ' (VIP)' : ''}`, priority: g.vip ? 'high' : 'medium', owner_id: lead, category: 'rsvp', due_at: new Date(Date.now() + 864e5).toISOString(), source: `rsvp-followup:${g.id}` })
          log.push(`Follow-up task for ${g.name}`)
        }
      }
      // 4. Vendor confirmations
      for (const va of all(`SELECT va.*, v.name FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.wedding_id = ? AND va.status = 'pending'`, w.id)) {
        if (!(f || hoursAgo(va.last_reminded_at || va.created_at, d.vendor_reminder_hours))) continue
        if (va.reminders < 1) {
          sendMessage({ agency_id: ag.id, wedding_id: w.id, party_kind: 'vendor', party_id: va.vendor_id, body: `Reminder: please confirm your ${va.role || 'assignment'} for ${w.name}. Reply YES or open your link.`, dedupe_key: `vend-rem-${va.id}` })
          update('vendor_assignments', va.id, { reminders: 1, last_reminded_at: now() })
          log.push(`Vendor reminder → ${va.name}`)
        } else if (va.reminders === 1) {
          update('vendor_assignments', va.id, { reminders: 2 })
          notify({ agency_id: ag.id, wedding_id: w.id, kind: 'vendor', severity: 'warning', title: `${va.name} hasn't confirmed`, body: 'Automated reminder got no response', link: `/w/${w.id}/vendors` })
          emit('vendor.no_response', { agency_id: ag.id, wedding_id: w.id, assignment_id: va.id, vendor_id: va.vendor_id })
          log.push(`Planner alerted: ${va.name} unresponsive`)
        }
      }
      // 5. Travel detail reminders
      for (const t of all(`SELECT t.*, g.name FROM travel t JOIN guests g ON g.id = t.guest_id WHERE t.wedding_id = ? AND t.status = 'pending' AND t.reminders < 1`, w.id)) {
        if (!(f || hoursAgo(t.created_at, d.travel_reminder_hours))) continue
        const { text } = renderTemplate(`Hi {{first_name}}, once your travel is booked please share your ticket here so we can arrange pickup: {{link}}`, partyVars('guest', t.guest_id, w))
        sendMessage({ agency_id: ag.id, wedding_id: w.id, party_kind: 'guest', party_id: t.guest_id, body: text, dedupe_key: `travel-rem-${t.id}` })
        update('travel', t.id, { reminders: 1 })
        log.push(`Travel reminder → ${t.name}`)
      }
      // 6. Overdue task escalation
      for (const t of all(`SELECT * FROM tasks WHERE wedding_id = ? AND status NOT IN ('done') AND escalated = 0 AND due_at < ?`, w.id, now())) {
        update('tasks', t.id, { escalated: 1 })
        notify({ agency_id: ag.id, wedding_id: w.id, kind: 'task', severity: t.priority === 'high' ? 'critical' : 'warning', title: `Overdue: ${t.title}`, link: `/w/${w.id}/tasks?filter=overdue` })
        emit('task.overdue', { agency_id: ag.id, wedding_id: w.id, task_id: t.id, priority: t.priority })
        log.push(`Escalated overdue task: ${t.title}`)
      }
    }
  }
  if (log.length) audit(null, 'scheduler.tick', null, null, { actions: log.length, force: f }, true, systemActor(opts.agency_id))
  return log
}

export { uid }
