import { Router } from 'express'
import { all, get, insert, update, run, tx, now } from '../db.ts'
import { wrap, fail, linkScope, audit, notify, emit, createLink, linkUrl } from '../core.ts'
import { routeInbound, markRead, vendorStatus, decideApproval, extractTicket, upsertTravelFromExtraction, weddingOf, sendMessage, agencyDefaults } from '../engines.ts'
import { upload, storeFile, ingestMedia } from './ops.ts'
import { priceSelections, totals } from './business.ts'
import { ensureRsvps } from './planner.ts'

export const links = Router()
const brand = (agencyId: string) => get('SELECT id, name, slug, tagline, city, branding FROM agencies WHERE id = ?', agencyId)
const actorOf = (req: any, name?: string) => ({ kind: req.link.kind, id: req.link.entity_id, name, agency_id: req.link.agency_id, wedding_id: req.link.wedding_id })
const publicWedding = (w: any) => ({ id: w.id, name: w.name, couple: w.couple, start_date: w.start_date, end_date: w.end_date, city: w.city, venue: w.venue, faq: w.faq || [], status: w.status })

// =====================================================================
// Guest personalized page (no account)
// =====================================================================
const G = Router({ mergeParams: true })
links.use('/g/:token', linkScope(['guest']), G)

function guestBundle(req: any) {
  const g = get('SELECT * FROM guests WHERE id = ?', req.link.entity_id)
  if (!g) fail(404, 'Guest record no longer exists')
  const w = weddingOf(g.wedding_id)
  const members = g.household_id ? all('SELECT id, name, age_group, dietary, phone FROM guests WHERE household_id = ? ORDER BY is_primary DESC, name', g.household_id) : [g]
  const ids = members.map((m: any) => m.id)
  const rsvps = all(`SELECT * FROM rsvps WHERE guest_id IN (${ids.map(() => '?').join(',')})`, ...ids)
  const fids = [...new Set(rsvps.map(r => r.function_id))]
  const functions = fids.length ? all(`SELECT id, name, date, start_time, end_time, venue, address, map_url, dress_code, notes, live_status FROM functions WHERE id IN (${fids.map(() => '?').join(',')}) ORDER BY date, start_time`, ...fids) : []
  const travel = get(`SELECT id, status, mode, carrier, number, from_loc, to_loc, arrive_at, pax, pickup_required, confidence, delay_min, live_status, trip_id FROM travel WHERE guest_id = ? AND direction = 'arrival'`, g.id)
  const trip = travel?.trip_id ? get(`SELECT t.status, t.location, t.window_start, v.label AS vehicle, v.plate, d.name AS driver, d.phone AS driver_phone FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN vendors d ON d.id = t.driver_vendor_id WHERE t.id = ? AND t.status != 'suggested'`, travel.trip_id) : null
  const room = get(`SELECT r.number, r.category, h.name AS hotel, h.address, h.check_in, h.check_out, ra.status FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id JOIN hotels h ON h.id = r.hotel_id WHERE ra.guest_id = ? AND ra.status IN ('final','checked_in','checked_out')`, g.id)
  const messages = all(`SELECT id, direction, body, status, created_at FROM messages WHERE party_kind = 'guest' AND party_id = ? ORDER BY created_at`, g.id)
  const gallery = all(`SELECT m.id, m.file, m.mime, f.name AS function_name FROM media m LEFT JOIN functions f ON f.id = m.function_id WHERE m.wedding_id = ? AND m.status = 'published' AND m.album = 'public' ORDER BY m.created_at DESC`, w.id)
  return { agency: brand(w.agency_id), wedding: publicWedding(w), guest: { id: g.id, name: g.name, code: g.code, dietary: g.dietary, needs_stay: g.needs_stay, opted_out: g.opted_out }, members, rsvps, functions, travel, trip, room, messages, gallery, frozen: !!w.settings?.rsvp_frozen }
}
G.get('/', wrap(req => { markRead('guest', req.link!.entity_id!); return guestBundle(req) }))
G.post('/rsvp', wrap(req => {
  const b = guestBundle(req)
  if (b.frozen) fail(409, 'RSVPs are closed. Please message your planner to make changes.')
  const allowed = new Set(b.members.map((m: any) => m.id))
  const invited = new Set(b.rsvps.map((r: any) => `${r.guest_id}:${r.function_id}`))
  tx(() => {
    for (const r of req.body.responses || []) {
      if (!allowed.has(r.guest_id) || !invited.has(`${r.guest_id}:${r.function_id}`)) continue
      run(`UPDATE rsvps SET status = ?, headcount = ?, source = 'link', responded_by = ?, updated_at = ? WHERE guest_id = ? AND function_id = ?`,
        r.status, r.status === 'attending' ? Math.max(1, +r.headcount || 1) : 0, req.link!.entity_id, now(), r.guest_id, r.function_id)
    }
    for (const [gid, diet] of Object.entries(req.body.dietary || {})) if (allowed.has(gid)) run('UPDATE guests SET dietary = ? WHERE id = ?', JSON.stringify(diet), gid)
    if (req.body.notes) run('UPDATE guests SET notes = ? WHERE id = ?', req.body.notes, req.link!.entity_id)
  })
  const anyYes = (req.body.responses || []).some((r: any) => r.status === 'attending')
  emit('rsvp.submitted', { agency_id: req.link!.agency_id, wedding_id: req.link!.wedding_id, guest_id: req.link!.entity_id, status: anyYes ? 'attending' : 'declined', source: 'link' })
  audit(req, 'rsvp.submitted', 'guest', req.link!.entity_id, { responses: (req.body.responses || []).length }, true, actorOf(req, b.guest.name))
  return guestBundle(req)
}))
G.post('/travel', wrap(req => {
  const gid = req.link!.entity_id!, wid = req.link!.wedding_id!
  const cur = get(`SELECT * FROM travel WHERE guest_id = ? AND direction = 'arrival'`, gid)
  const b = req.body
  const data = b.not_booked ? { status: 'pending' } : b.self ? { status: 'self', pickup_required: 0 } : { ...b, status: 'confirmed', review_needed: 0, pickup_required: b.pickup_required ?? 1 }
  delete (data as any).not_booked; delete (data as any).self
  const t = cur ? update('travel', cur.id, data) : insert('travel', { wedding_id: wid, guest_id: gid, direction: 'arrival', ...data })
  if (t.status === 'confirmed') emit('travel.submitted', { agency_id: req.link!.agency_id, wedding_id: wid, guest_id: gid, travel_id: t.id, confidence: 1 })
  audit(req, 'travel.guest_submitted', 'travel', t.id, { status: t.status }, true, actorOf(req))
  return guestBundle(req)
}))
G.post('/travel/ticket', upload.single('file'), wrap(req => {
  const s = req.file ? storeFile(req.file) : null
  if (req.file && !s) fail(422, 'That file looks empty — please try again')
  const w = weddingOf(req.link!.wedding_id!)
  const doc = s ? insert('documents', { agency_id: w.agency_id, wedding_id: w.id, entity_kind: 'guest', entity_id: req.link!.entity_id, category: 'Travel ticket', name: s.original_name, file: s.file, mime: s.mime, size: s.size, text: s.text }) : null
  const ex = extractTicket(`${s?.original_name || ''} ${s?.text || ''} ${req.body.text || ''}`)
  upsertTravelFromExtraction(w.id, req.link!.entity_id!, ex, doc?.id ?? null)
  return { extraction: ex, high_confidence: ex.confidence >= agencyDefaults(w.agency_id).ocr_confidence_threshold, ...guestBundle(req) }
}))
G.post('/faq', wrap(req => {
  const b = guestBundle(req), q = String(req.body.question || '').toLowerCase()
  if (!q.trim()) fail(422, 'Ask a question')
  const words = q.split(/\W+/).filter(w => w.length > 2)
  const faq = (b.wedding.faq || []).map((f: any) => ({ ...f, score: words.filter(w => (f.q + ' ' + f.a).toLowerCase().includes(w)).length })).sort((a: any, z: any) => z.score - a.score)
  let answer: string | null = faq[0]?.score >= 1 ? faq[0].a : null
  if (!answer) {
    const fn = b.functions.find((f: any) => q.includes(f.name.toLowerCase()))
    if (/dress|wear|outfit/.test(q)) answer = b.functions.map((f: any) => `${f.name}: ${f.dress_code || 'No dress code'}`).join('\n')
    else if (/where|venue|address|location|map/.test(q)) answer = (fn ? [fn] : b.functions).map((f: any) => `${f.name}: ${f.venue}${f.address ? ', ' + f.address : ''}`).join('\n')
    else if (/when|time|date|schedule|itinerary/.test(q)) answer = (fn ? [fn] : b.functions).map((f: any) => `${f.name}: ${f.date} ${f.start_time || ''}`).join('\n')
    else if (/hotel|room|stay|check/.test(q)) answer = b.room ? `You're at ${b.room.hotel}, room ${b.room.number}. Check-in ${b.room.check_in || 'on arrival'}.` : 'Your room details will appear here once the rooming list is final.'
    else if (/pickup|driver|cab|car|airport/.test(q)) answer = b.trip ? `${b.trip.vehicle} (${b.trip.plate || ''}) with ${b.trip.driver} ${b.trip.driver_phone || ''} at ${b.trip.location}.` : b.travel ? 'Your pickup is being arranged — details will be sent on WhatsApp.' : 'Share your travel details on this page and we will arrange a pickup.'
  }
  if (!answer) {
    routeInbound({ agency_id: req.link!.agency_id, wedding_id: req.link!.wedding_id!, party_kind: 'guest', party_id: req.link!.entity_id!, body: `[FAQ] ${req.body.question}` })
    return { answer: "I've passed your question to the planning team — they'll reply on WhatsApp shortly.", forwarded: true }
  }
  return { answer, forwarded: false }
}))
G.post('/reply', wrap(req => routeInbound({ agency_id: req.link!.agency_id, wedding_id: req.link!.wedding_id!, party_kind: 'guest', party_id: req.link!.entity_id!, body: req.body.body })))

// =====================================================================
// Host / family admin portal
// =====================================================================
const H = Router({ mergeParams: true })
links.use('/h/:token', linkScope(['host']), H)
function hostCtx(req: any) {
  const h = get('SELECT * FROM hosts WHERE id = ?', req.link.entity_id)
  if (!h) fail(404, 'Host access was removed')
  return { h, w: weddingOf(h.wedding_id) }
}
H.get('/', wrap(req => {
  const { h, w } = hostCtx(req)
  markRead('host', h.id)
  const perms = w.host_permissions || {}
  const functions = all('SELECT id, name, date, start_time, end_time, venue, dress_code, live_status FROM functions WHERE wedding_id = ? ORDER BY date, start_time', w.id)
  const heads = all(`SELECT function_id, status, COUNT(*) n, SUM(CASE WHEN status = 'attending' THEN headcount ELSE 0 END) heads FROM rsvps WHERE wedding_id = ? GROUP BY function_id, status`, w.id)
  const approvals = all(`SELECT * FROM approvals WHERE wedding_id = ? AND approver = 'host' AND status != 'superseded' ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`, w.id)
  const mediaIds = approvals.filter(a => a.kind === 'media' && a.status === 'pending').flatMap(a => a.data?.media_ids || [])
  const media = mediaIds.length ? all(`SELECT id, file, mime, status, function_id FROM media WHERE id IN (${mediaIds.map(() => '?').join(',')})`, ...mediaIds) : []
  const budget = perms.budget ? {
    planned: get('SELECT COALESCE(SUM(planned),0) n FROM budget_lines WHERE wedding_id = ?', w.id).n,
    actual: get('SELECT COALESCE(SUM(amount_base),0) n FROM expenses WHERE wedding_id = ?', w.id).n,
    categories: all(`SELECT bl.category, SUM(bl.planned) planned, COALESCE(SUM((SELECT SUM(amount_base) FROM expenses e WHERE e.line_id = bl.id)),0) actual FROM budget_lines bl WHERE wedding_id = ? GROUP BY category`, w.id),
  } : null
  const guests = all(`SELECT g.id, g.name, g.side, g.vip, g.accessibility, g.phone, g.relation, h.name AS household,
      (SELECT COUNT(*) FROM rsvps r WHERE r.guest_id = g.id AND r.status = 'attending') AS attending_fns,
      (SELECT COUNT(*) FROM rsvps r WHERE r.guest_id = g.id AND r.status = 'pending') AS pending_fns FROM guests g LEFT JOIN households h ON h.id = g.household_id WHERE g.wedding_id = ? ORDER BY h.name, g.name`, w.id)
  return {
    agency: brand(w.agency_id), wedding: publicWedding(w), host: h, permissions: perms,
    functions: functions.map(f => {
      const r = heads.filter(x => x.function_id === f.id)
      return { ...f, attending: r.find(x => x.status === 'attending')?.n || 0, headcount: r.find(x => x.status === 'attending')?.heads || 0, pending: r.find(x => x.status === 'pending')?.n || 0, declined: r.find(x => x.status === 'declined')?.n || 0 }
    }),
    approvals, media, budget, guests: perms.guest_edits ? guests : guests.map(g => ({ id: g.id, name: g.name, household: g.household, vip: g.vip, accessibility: g.accessibility, attending_fns: g.attending_fns, pending_fns: g.pending_fns })),
    requests: all(`SELECT * FROM requests WHERE wedding_id = ? AND from_kind = 'host' ORDER BY created_at DESC`, w.id),
    testimonial: get(`SELECT * FROM testimonials WHERE wedding_id = ? ORDER BY created_at DESC LIMIT 1`, w.id),
    documents: all(`SELECT id, name, category, file, created_at FROM documents WHERE wedding_id = ? AND host_visible = 1 ORDER BY created_at DESC`, w.id),
    gallery: all(`SELECT id, file, mime FROM media WHERE wedding_id = ? AND status = 'published' ORDER BY created_at DESC`, w.id),
    messages: all(`SELECT id, direction, body, created_at FROM messages WHERE party_kind = 'host' AND party_id = ? ORDER BY created_at DESC LIMIT 30`, h.id),
    preferences: w.settings?.host_preferences || {},
    totals: { guests: guests.length, attending: guests.filter(g => g.attending_fns > 0).length, pending: guests.filter(g => g.pending_fns > 0 && !g.attending_fns).length },
  }
}))
H.post('/approvals/:id', wrap(req => {
  const { h, w } = hostCtx(req)
  const ap = get('SELECT * FROM approvals WHERE id = ? AND wedding_id = ? AND approver = ?', req.params.id, w.id, 'host')
  if (!ap) fail(404, 'Approval not found')
  if (ap.status !== 'pending') fail(409, `Already ${ap.status.replace('_', ' ')}`)
  if (ap.kind === 'media' && req.body.decisions) {
    update('approvals', ap.id, { data: { ...ap.data, decisions: req.body.decisions } })
    const vals = Object.values(req.body.decisions as Record<string, string>)
    const status = vals.every(v => v === 'approved') ? 'approved' : vals.every(v => v === 'rejected') ? 'rejected' : 'approved'
    return decideApproval(ap.id, status as any, req.body.comment, { kind: 'host', id: h.id, name: h.name, agency_id: w.agency_id, wedding_id: w.id })
  }
  if (req.body.status !== 'approved' && !req.body.comment) fail(422, 'Please tell the planner what to change')
  return decideApproval(ap.id, req.body.status, req.body.comment, { kind: 'host', id: h.id, name: h.name, agency_id: w.agency_id, wedding_id: w.id })
}))
H.post('/guests', wrap(req => {
  const { h, w } = hostCtx(req)
  if (!w.host_permissions?.guest_edits) fail(403, 'Guest additions are managed by your planner')
  if (!req.body.name) fail(422, 'Name is required')
  const g = insert('guests', { wedding_id: w.id, name: req.body.name, phone: req.body.phone?.replace(/[\s-]/g, ''), side: req.body.side, relation: req.body.relation, tags: ['host-added'], code: Math.random().toString(36).slice(2, 8).toUpperCase(), is_primary: 1 })
  ensureRsvps(w.id, g.id, req.body.functions?.length ? req.body.functions : 'all')
  notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'guests', title: `${h.name} added a guest: ${g.name}`, link: `/w/${w.id}/guests` })
  audit(req, 'guest.host_added', 'guest', g.id, null, true, actorOf(req, h.name))
  return g
}))
H.patch('/guests/:id', wrap(req => {
  const { h, w } = hostCtx(req)
  const g = get('SELECT * FROM guests WHERE id = ? AND wedding_id = ?', req.params.id, w.id)
  if (!g) fail(404, 'Guest not found')
  const b = req.body, patch: any = {}
  if ('vip' in b) patch.vip = b.vip ? 1 : 0
  if ('accessibility' in b) patch.accessibility = b.accessibility || null
  if (w.host_permissions?.guest_edits) for (const k of ['name', 'phone', 'relation', 'side']) if (k in b) patch[k] = b[k]
  if (!Object.keys(patch).length) fail(403, 'You can update VIP and accessibility preferences only')
  update('guests', g.id, patch)
  notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'guests', title: `${h.name} updated ${g.name}`, body: Object.keys(patch).join(', '), link: `/w/${w.id}/guests` })
  audit(req, 'guest.host_updated', 'guest', g.id, patch, true, actorOf(req, h.name))
  return { ok: true }
}))
H.post('/preferences', wrap(req => {
  const { h, w } = hostCtx(req)
  update('weddings', w.id, { settings: { ...(w.settings || {}), host_preferences: { ...(w.settings?.host_preferences || {}), ...req.body } } })
  notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'host', title: `${h.name} updated wedding preferences`, link: `/w/${w.id}` })
}))
H.post('/requests', wrap(req => {
  const { h, w } = hostCtx(req)
  if (!req.body.title && !req.body.body) fail(422, 'Tell us what you need')
  const r = insert('requests', { wedding_id: w.id, kind: req.body.kind || 'concierge', from_kind: 'host', from_id: h.id, title: req.body.title || req.body.kind, body: req.body.body, rating: req.body.rating })
  notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'host', title: `New ${r.kind} from ${h.name}`, body: r.title, link: `/w/${w.id}/approvals?tab=requests` })
  return r
}))
H.post('/testimonial', wrap(req => {
  const { h, w } = hostCtx(req)
  const t = get(`SELECT * FROM testimonials WHERE wedding_id = ? AND status IN ('requested','revision_requested') ORDER BY created_at DESC LIMIT 1`, w.id)
  const data = { body: req.body.body, rating: req.body.rating, author: req.body.author || h.name, status: 'submitted' }
  const out = t ? update('testimonials', t.id, data) : insert('testimonials', { ...data, agency_id: w.agency_id, wedding_id: w.id })
  notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'portfolio', title: `${h.name} submitted a testimonial ⭐ ${req.body.rating || ''}`, link: '/portfolio' })
  return out
}))
H.post('/reply', wrap(req => { const { w } = hostCtx(req); return routeInbound({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'host', party_id: req.link!.entity_id!, body: req.body.body }) }))

// =====================================================================
// Vendor / driver / photographer — single-purpose link, no dashboard
// =====================================================================
const V = Router({ mergeParams: true })
links.use('/v/:token', linkScope(['vendor']), V)
function vendorBundle(req: any) {
  const v = get('SELECT id, name, kind, contact, phone FROM vendors WHERE id = ?', req.link.entity_id)
  const w = weddingOf(req.link.wedding_id)
  const assignments = all(`SELECT va.id, va.role, va.report_at, va.report_location, va.deliverables, va.status, va.live_status, va.delay_min, va.eta_min, f.name AS function_name, f.date, f.start_time, f.venue, f.address, f.map_url, f.dress_code
    FROM vendor_assignments va LEFT JOIN functions f ON f.id = va.function_id WHERE va.vendor_id = ? AND va.wedding_id = ? AND va.status != 'cancelled' ORDER BY va.report_at`, v.id, w.id)
  const trips = all(`SELECT t.id, t.location, t.window_start, t.window_end, t.pax, t.status, t.stops, t.drop_location, ve.label AS vehicle, ve.plate FROM trips t LEFT JOIN vehicles ve ON ve.id = t.vehicle_id WHERE t.driver_vendor_id = ? AND t.wedding_id = ? AND t.status != 'suggested' ORDER BY t.window_start`, v.id, w.id)
    .map(t => ({ ...t, stops: (t.stops || []).map((s: any) => ({ ...s, phone: get('SELECT phone FROM guests WHERE id = ?', s.guest_id)?.phone, live: get('SELECT live_status, delay_min FROM travel WHERE id = ?', s.travel_id) })) }))
  const uploads = /photo|video/i.test(v.kind) ? get(`SELECT COUNT(*) n FROM media WHERE uploader_vendor_id = ? AND wedding_id = ?`, v.id, w.id).n : null
  const lead = get(`SELECT u.name, u.phone FROM wedding_team wt JOIN users u ON u.id = wt.user_id WHERE wt.wedding_id = ? LIMIT 1`, w.id)
  const messages = all(`SELECT id, direction, body, status, created_at FROM messages WHERE party_kind = 'vendor' AND party_id = ? AND (wedding_id = ? OR wedding_id IS NULL) ORDER BY created_at`, v.id, w.id)
  return { agency: brand(w.agency_id), wedding: publicWedding(w), vendor: v, assignments, trips, uploads, messages, can_upload: /photo|video/i.test(v.kind), contact: lead, functions: uploads !== null ? all('SELECT id, name FROM functions WHERE wedding_id = ? ORDER BY date', w.id) : [] }
}
V.get('/', wrap(req => { markRead('vendor', req.link!.entity_id!); return vendorBundle(req) }))
const ownAssignment = (req: any) => {
  const va = get('SELECT * FROM vendor_assignments WHERE id = ? AND vendor_id = ? AND wedding_id = ?', req.params.id, req.link.entity_id, req.link.wedding_id)
  if (!va) fail(403, 'This assignment is not yours')
  return va
}
V.post('/assignments/:id/status', wrap(req => {
  ownAssignment(req)
  const allowed = ['confirm', 'decline', 'checkin', 'enroute', 'arrived', 'setup', 'ready', 'complete', 'delay']
  if (!allowed.includes(req.body.action)) fail(400, 'Unknown action')
  if (req.body.action === 'delay' && !(+req.body.minutes > 0)) fail(422, 'How many minutes late?')
  vendorStatus(req.params.id, req.body.action, { minutes: +req.body.minutes || undefined, note: req.body.note })
  return vendorBundle(req)
}))
V.post('/assignments/:id/deliverables', wrap(req => {
  const va = ownAssignment(req)
  const d = [...(va.deliverables || [])]
  if (!d[req.body.index]) fail(404, 'Deliverable not found')
  d[req.body.index] = { ...d[req.body.index], done: !!req.body.done, at: now() }
  update('vendor_assignments', va.id, { deliverables: d })
  audit(req, 'vendor.deliverable', 'vendor_assignment', va.id, { item: d[req.body.index].text, done: !!req.body.done }, true, actorOf(req))
  return vendorBundle(req)
}))
V.post('/trips/:id/stop', wrap(req => {
  const t = get('SELECT * FROM trips WHERE id = ? AND driver_vendor_id = ?', req.params.id, req.link!.entity_id)
  if (!t) fail(403, 'This trip is not assigned to you')
  const status = req.body.status
  if (!['picked_up', 'dropped', 'no_show', 'waiting'].includes(status)) fail(400, 'Unknown status')
  const stops = (t.stops || []).map((s: any) => s.travel_id === req.body.travel_id ? { ...s, status, at: now() } : s)
  const done = stops.every((s: any) => ['dropped', 'no_show'].includes(s.status))
  update('trips', t.id, { stops, status: done ? 'completed' : 'en_route' })
  update('travel', req.body.travel_id, { live_status: status, ...(status === 'dropped' ? { status: 'completed' } : {}) })
  const w = weddingOf(t.wedding_id)
  if (status === 'no_show') {
    const s = stops.find((x: any) => x.travel_id === req.body.travel_id)
    notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'travel', severity: 'warning', title: `Guest no-show at pickup: ${s?.name}`, body: t.location, link: `/w/${w.id}/travel?tab=pickups` })
  }
  audit(req, `travel.${status}`, 'trip', t.id, { travel_id: req.body.travel_id }, true, actorOf(req))
  return vendorBundle(req)
}))
V.post('/trips/:id/start', wrap(req => {
  const t = get('SELECT * FROM trips WHERE id = ? AND driver_vendor_id = ?', req.params.id, req.link!.entity_id)
  if (!t) fail(403, 'This trip is not assigned to you')
  update('trips', t.id, { status: 'en_route' })
  return vendorBundle(req)
}))
V.post('/media', upload.array('files', 50), wrap(req => {
  const b = vendorBundle(req)
  if (!b.can_upload) fail(403, 'Uploads are only enabled for photographers and videographers')
  const res = ingestMedia(weddingOf(req.link!.wedding_id!), (req.files as Express.Multer.File[]) || [], { function_id: req.body.function_id, vendor_id: req.link!.entity_id })
  audit(req, 'media.uploaded', 'media', null, res, true, actorOf(req, b.vendor.name))
  return { ...res, ...vendorBundle(req) }
}))
V.post('/reply', wrap(req => routeInbound({ agency_id: req.link!.agency_id, wedding_id: req.link!.wedding_id!, party_kind: 'vendor', party_id: req.link!.entity_id!, body: req.body.body })))

// =====================================================================
// Prospect — Make Your Own Wedding + proposal decision
// =====================================================================
const P = Router({ mergeParams: true })
links.use('/p/:token', linkScope(['prospect']), P)
function prospectBundle(req: any) {
  const l = get('SELECT * FROM leads WHERE id = ?', req.link.entity_id)
  const p = get('SELECT * FROM proposals WHERE lead_id = ? AND status != ? ORDER BY version DESC LIMIT 1', l.id, 'superseded')
  const expired = p?.status === 'sent' && p.expires_at && p.expires_at < now()
  const cat = all('SELECT id, kind, name, description, pricing, price, category FROM catalogue WHERE agency_id = ? AND active = 1 ORDER BY kind, category, price', l.agency_id)
  const proposal = p ? { id: p.id, version: p.version, status: expired ? 'expired' : p.status, selections: p.selections, guest_count: p.guest_count, destination: p.destination, wedding_date: p.wedding_date, preferences: p.preferences,
    items: (p.items || []).map(({ cost, ...i }: any) => i), discount: p.discount, notes: p.notes, comment: p.comment, expires_at: p.expires_at, subtotal: p.subtotal, total: p.total } : null
  const portfolio = all(`SELECT cs.id, cs.title, cs.summary, cs.services, cs.media_ids FROM case_studies cs WHERE agency_id = ? AND status = 'published' LIMIT 4`, l.agency_id)
    .map(cs => ({ ...cs, cover: cs.media_ids?.[0] ? get('SELECT file FROM media WHERE id = ?', cs.media_ids[0])?.file : null }))
  const testimonials = all(`SELECT author, body, rating FROM testimonials WHERE agency_id = ? AND status = 'published' LIMIT 4`, l.agency_id)
  return { agency: brand(l.agency_id), lead: { name: l.name, wedding_date: l.wedding_date, destination: l.destination, guest_count: l.guest_count }, catalogue: cat, proposal, portfolio, testimonials }
}
P.get('/', wrap(req => prospectBundle(req)))
P.post('/configure', wrap(req => {
  const l = get('SELECT * FROM leads WHERE id = ?', req.link!.entity_id)
  const p = get('SELECT * FROM proposals WHERE lead_id = ? ORDER BY version DESC LIMIT 1', l.id)
  if (!['configuring', 'draft', 'revision_requested'].includes(p.status)) fail(409, 'Your proposal has been sent — comment on it or request a revision instead')
  const b = req.body
  if (!(+b.guest_count > 0)) fail(422, 'Tell us roughly how many guests')
  const items = priceSelections(l.agency_id, { ids: b.ids || [], guest_count: +b.guest_count })
  if (!items.some(i => i.kind === 'function')) fail(422, 'Pick at least one function')
  const t = totals(items, p.discount)
  update('proposals', p.id, { selections: { ids: b.ids }, items, guest_count: +b.guest_count, destination: b.destination, wedding_date: b.wedding_date, preferences: b.preferences, subtotal: t.subtotal, cost: t.cost, total: t.total, status: b.submit ? 'submitted' : p.status })
  update('leads', l.id, { guest_count: +b.guest_count, destination: b.destination, wedding_date: b.wedding_date, status: b.submit ? 'proposal_requested' : l.status })
  if (b.submit) notify({ agency_id: l.agency_id, kind: 'proposal', title: `${l.name} configured their wedding — review the estimate`, body: `₹${t.total.toLocaleString('en-IN')} · ${b.guest_count} guests`, link: `/proposals/${l.id}` })
  return { estimate: { items: items.map(({ cost, ...i }) => i), subtotal: t.subtotal, total: t.total }, ...prospectBundle(req) }
}))
P.post('/estimate', wrap(req => {
  const l = get('SELECT agency_id FROM leads WHERE id = ?', req.link!.entity_id)
  const items = priceSelections(l.agency_id, { ids: req.body.ids || [], guest_count: +req.body.guest_count || 100 })
  return { items: items.map(({ cost, ...i }) => i), total: items.reduce((s, i) => s + i.amount, 0) }
}))
P.post('/decision', wrap(req => {
  const l = get('SELECT * FROM leads WHERE id = ?', req.link!.entity_id)
  const p = get(`SELECT * FROM proposals WHERE lead_id = ? AND status = 'sent' ORDER BY version DESC LIMIT 1`, l.id)
  if (!p) fail(409, 'There is no proposal awaiting your decision')
  if (p.expires_at && p.expires_at < now()) fail(410, 'This proposal has expired — request a fresh version and we will update the pricing')
  const d = req.body.decision
  const actor = { kind: 'prospect', id: l.id, name: l.name, agency_id: l.agency_id }
  if (d === 'accept') {
    update('proposals', p.id, { status: 'accepted', decided_at: now(), comment: req.body.comment })
    update('leads', l.id, { status: 'accepted' })
    notify({ agency_id: l.agency_id, kind: 'proposal', severity: 'info', title: `🎉 ${l.name} accepted proposal v${p.version}`, body: `₹${(p.total || 0).toLocaleString('en-IN')} — convert it to a wedding`, link: `/proposals/${l.id}` })
    emit('proposal.accepted', { agency_id: l.agency_id, proposal_id: p.id, lead_id: l.id, total: p.total })
  } else if (d === 'revision') {
    if (!req.body.comment) fail(422, 'Tell the planner what to change')
    update('proposals', p.id, { status: 'revision_requested', comment: req.body.comment })
    update('leads', l.id, { status: 'revision' })
    notify({ agency_id: l.agency_id, kind: 'proposal', severity: 'warning', title: `${l.name} requested changes`, body: req.body.comment, link: `/proposals/${l.id}` })
  } else if (d === 'decline') {
    update('proposals', p.id, { status: 'declined', decided_at: now(), comment: req.body.comment })
    update('leads', l.id, { status: 'lost' })
    notify({ agency_id: l.agency_id, kind: 'proposal', title: `${l.name} declined the proposal`, body: req.body.comment, link: `/proposals/${l.id}` })
  } else fail(400, 'Unknown decision')
  audit(null, `proposal.${d}`, 'proposal', p.id, { comment: req.body.comment }, true, actor)
  return prospectBundle(req)
}))

// =====================================================================
// Document share link
// =====================================================================
links.get('/d/:token', linkScope(['share']), wrap(req => {
  const d = get('SELECT id, name, category, file, mime, size, created_at FROM documents WHERE id = ?', req.link!.entity_id)
  if (!d) fail(404, 'This document was deleted')
  audit(req, 'document.opened', 'document', d.id, null, true, { kind: req.link!.scope?.recipient_kind || 'share', id: req.link!.scope?.recipient_id, agency_id: req.link!.agency_id, wedding_id: req.link!.wedding_id || undefined })
  return { ...d, expires_at: req.link!.expires_at, agency: brand(req.link!.agency_id) }
}))

// =====================================================================
// Public portfolio (prospect entry point)
// =====================================================================
links.get('/public/portfolio/:slug', wrap(req => {
  const a = get('SELECT id, name, slug, tagline, about, city, branding FROM agencies WHERE slug = ?', req.params.slug)
  if (!a) fail(404, 'Agency not found')
  const cases = all(`SELECT cs.id, cs.title, cs.summary, cs.services, cs.media_ids, w.city, w.start_date FROM case_studies cs LEFT JOIN weddings w ON w.id = cs.wedding_id WHERE cs.agency_id = ? AND cs.status = 'published' ORDER BY cs.updated_at DESC`, a.id)
    .map(cs => ({ ...cs, media: (cs.media_ids || []).map((id: string) => get('SELECT file, mime FROM media WHERE id = ?', id)).filter(Boolean) }))
  return { agency: a, case_studies: cases, testimonials: all(`SELECT author, body, rating FROM testimonials WHERE agency_id = ? AND status = 'published'`, a.id) }
}))
links.post('/public/portfolio/:slug/enquire', wrap(req => {
  const a = get('SELECT id FROM agencies WHERE slug = ?', req.params.slug)
  if (!a) fail(404, 'Agency not found')
  const b = req.body
  if (!b.name || (!b.phone && !b.email)) fail(422, 'Name and a phone or email are required')
  const l = insert('leads', { agency_id: a.id, name: b.name, phone: b.phone?.replace(/[\s-]/g, ''), email: b.email, wedding_date: b.wedding_date, destination: b.destination, guest_count: +b.guest_count || null, notes: b.notes, source: 'portfolio', status: 'new' })
  insert('proposals', { agency_id: a.id, lead_id: l.id, version: 1, status: 'configuring', guest_count: l.guest_count, destination: l.destination, wedding_date: l.wedding_date, selections: { ids: [] }, items: [] })
  notify({ agency_id: a.id, kind: 'proposal', title: `New enquiry from ${l.name} (portfolio)`, link: `/proposals/${l.id}` })
  return { ok: true, link: linkUrl('prospect', createLink('prospect', { agency_id: a.id, entity_id: l.id })) }
}))
