import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { all, get, insert, update, remove, run, tx, now, localDate, UPLOAD_DIR } from '../db.ts'
import { wrap, fail, requirePerm, audit, notify, emit, createLink, linkUrl, weddingIdsFor, canWedding, isAdmin } from '../core.ts'
import {
  extractTicket, upsertTravelFromExtraction, clusterPickups, suggestRooms, roomConflicts, sendMessage, renderTemplate, partyVars,
  vendorStatus, delayImpact, agencyDefaults, weddingOf, weddingHealth,
} from '../engines.ts'
import { planner, weddingRouter as W, notifyHosts } from './planner.ts'

export const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } })

/** Persist an uploaded file with a content hash; returns null for empty/corrupt files. */
export function storeFile(f: Express.Multer.File) {
  if (!f || !f.size) { if (f?.path) fs.rmSync(f.path, { force: true }); return null }
  const buf = fs.readFileSync(f.path)
  const hash = crypto.createHash('sha1').update(buf).digest('hex')
  const ext = path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const name = `${hash.slice(0, 16)}${crypto.randomBytes(4).toString('hex')}${ext}`
  fs.renameSync(f.path, path.join(UPLOAD_DIR, name))
  return { file: name, hash, size: f.size, mime: f.mimetype, original_name: f.originalname, text: /text|csv|json/.test(f.mimetype) ? buf.toString('utf8').slice(0, 20000) : /pdf/.test(f.mimetype) ? (buf.toString('latin1').match(/\(([^)]{2,})\)/g) || []).map(s => s.slice(1, -1)).join(' ').slice(0, 20000) : null }
}

const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBA'

// =====================================================================
// Travel operations
// =====================================================================
W.get('/travel', wrap(req => {
  const wid = req.params.wid
  const travel = all(`SELECT t.*, g.name AS guest_name, g.phone, g.vip, h.name AS household FROM travel t JOIN guests g ON g.id = t.guest_id LEFT JOIN households h ON h.id = g.household_id WHERE t.wedding_id = ? ORDER BY t.arrive_at`, wid)
  const trips = all(`SELECT t.*, v.label AS vehicle_label, v.kind AS vehicle_kind, v.capacity AS vehicle_capacity, v.plate, d.name AS driver_name, d.phone AS driver_phone
    FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN vendors d ON d.id = t.driver_vendor_id WHERE t.wedding_id = ? ORDER BY t.window_start`, wid)
  const vehicles = all('SELECT v.*, d.name AS driver_name FROM vehicles v LEFT JOIN vendors d ON d.id = v.driver_vendor_id WHERE v.wedding_id = ?', wid)
  const drivers = all(`SELECT * FROM vendors WHERE agency_id = ? AND kind = 'Driver'`, weddingOf(wid).agency_id)
  const needing = all(`SELECT g.id, g.name FROM guests g WHERE g.wedding_id = ? AND g.is_primary = 1 AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status = 'attending') AND NOT EXISTS (SELECT 1 FROM travel t WHERE t.guest_id = g.id)`, wid)
  const c = (s: string) => travel.filter(t => t.status === s).length
  return { travel, trips, vehicles, drivers, needing_request: needing, summary: { total: travel.length, confirmed: c('confirmed'), review: c('review'), pending: c('pending'), self: c('self'), pickup: travel.filter(t => t.pickup_required && t.status === 'confirmed').length, delayed: travel.filter(t => t.delay_min > 0).length } }
}))

W.post('/travel/request', wrap(req => {
  const w = weddingOf(req.params.wid)
  const guests = all(`SELECT g.* FROM guests g WHERE g.wedding_id = ? AND g.is_primary = 1 AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status = 'attending') AND NOT EXISTS (SELECT 1 FROM travel t WHERE t.guest_id = g.id)`, w.id)
    .filter(g => !req.body?.guest_ids || req.body.guest_ids.includes(g.id))
  let sent = 0
  for (const g of guests) {
    insert('travel', { wedding_id: w.id, guest_id: g.id, direction: 'arrival', status: 'pending', pickup_required: 1 })
    const { text } = renderTemplate(`Hi {{first_name}} ✈️ Please share your travel for {{wedding}} — just forward your ticket here or open {{link}}. We'll arrange your pickup.`, partyVars('guest', g.id, w))
    if (g.phone) { sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'guest', party_id: g.id, body: text, intent: 'travel_request' }); sent++ }
  }
  return { requested: guests.length, sent }
}))

W.post('/travel', wrap(req => {
  const b = req.body
  const existing = get(`SELECT * FROM travel WHERE guest_id = ? AND direction = ?`, b.guest_id, b.direction || 'arrival')
  const data = { ...b, status: b.status || (b.self ? 'self' : 'confirmed'), pickup_required: b.self ? 0 : b.pickup_required ?? 1, review_needed: 0 }
  const t = existing ? update('travel', existing.id, data) : insert('travel', { ...data, wedding_id: req.params.wid })
  audit(req, 'travel.saved', 'travel', t.id)
  if (t.status === 'confirmed') emit('travel.submitted', { agency_id: req.user!.agency_id, wedding_id: req.params.wid, guest_id: t.guest_id, travel_id: t.id, confidence: 1 })
  return t
}))
W.patch('/travel/:id', wrap(req => {
  const patch = { ...req.body }
  if (patch.status === 'confirmed') patch.review_needed = 0
  const t = update('travel', req.params.id, patch)
  audit(req, 'travel.updated', 'travel', t.id, Object.keys(patch))
  return t
}))
W.post('/travel/ticket', upload.single('file'), wrap(req => {
  const stored = storeFile(req.file!)
  if (!stored) fail(422, 'The file is empty or corrupt — please upload it again')
  const w = weddingOf(req.params.wid)
  const doc = insert('documents', { agency_id: w.agency_id, wedding_id: w.id, entity_kind: 'guest', entity_id: req.body.guest_id, category: 'Travel ticket', name: stored!.original_name, file: stored!.file, mime: stored!.mime, size: stored!.size, text: stored!.text, uploaded_by: req.user!.id })
  const ex = extractTicket(`${stored!.original_name} ${stored!.text || ''} ${req.body.text || ''}`)
  return { travel: upsertTravelFromExtraction(w.id, req.body.guest_id, ex, doc.id), extraction: ex }
}))
W.post('/travel/:id/delay', wrap(req => {
  const t = get('SELECT * FROM travel WHERE id = ?', req.params.id)
  const w = weddingOf(req.params.wid)
  const cancelled = !!req.body.cancelled
  const minutes = cancelled ? 0 : +req.body.minutes || 0
  update('travel', t.id, { delay_min: minutes, live_status: cancelled ? 'cancelled' : minutes ? 'delayed' : 'on_time', status: cancelled ? 'cancelled' : t.status })
  let impact = 'No operational change needed'
  if (t.trip_id) {
    const trip = get('SELECT * FROM trips WHERE id = ?', t.trip_id)
    const eff = Date.parse(t.arrive_at) + minutes * 60e3
    const outside = cancelled || eff > Date.parse(trip.window_end) + 20 * 60e3
    if (outside && trip.status !== 'suggested') {
      update('trips', trip.id, { status: 'needs_replan' })
      impact = cancelled ? 'Guest removed from a confirmed pickup — re-plan the trip' : `Arrival now outside trip window by ${Math.round((eff - Date.parse(trip.window_end)) / 60e3)} min — reassign, merge or reschedule`
      notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'travel', severity: 'critical', title: `Pickup re-plan needed (${t.number || 'arrival'})`, body: impact, link: `/w/${w.id}/travel?tab=pickups` })
    }
  }
  emit('travel.delayed', { agency_id: w.agency_id, wedding_id: w.id, travel_id: t.id, guest_id: t.guest_id, minutes, cancelled })
  audit(req, 'travel.delay', 'travel', t.id, { minutes, cancelled })
  return { impact }
}))
W.post('/travel/cluster', wrap(req => {
  const trips = clusterPickups(req.params.wid)
  audit(req, 'travel.clustered', 'trip', null, { trips: trips.length })
  return trips
}))

W.post('/vehicles', wrap(req => insert('vehicles', { ...req.body, wedding_id: req.params.wid })))
W.patch('/vehicles/:id', wrap(req => update('vehicles', req.params.id, req.body)))
W.delete('/vehicles/:id', wrap(req => remove('vehicles', req.params.id)))

W.patch('/trips/:id', wrap(req => {
  const trip = get('SELECT * FROM trips WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  if (!trip) fail(404, 'Trip not found')
  const b = req.body
  if (b.status === 'confirmed') {
    const v = b.vehicle_id ? get('SELECT * FROM vehicles WHERE id = ?', b.vehicle_id) : trip.vehicle_id ? get('SELECT * FROM vehicles WHERE id = ?', trip.vehicle_id) : null
    const driver = b.driver_vendor_id || trip.driver_vendor_id || v?.driver_vendor_id
    if (!v || !driver) fail(422, 'Pick a vehicle and a driver before confirming')
    if (v.capacity < trip.pax && !b.override) fail(409, `${v.label} seats ${v.capacity} but this trip has ${trip.pax} passengers`)
    const clash = get(`SELECT * FROM trips WHERE wedding_id = ? AND id != ? AND status IN ('confirmed','en_route') AND (vehicle_id = ? OR driver_vendor_id = ?) AND window_start < ? AND window_end > ?`,
      trip.wedding_id, trip.id, v.id, driver, new Date(Date.parse(trip.window_end) + 90 * 60e3).toISOString(), new Date(Date.parse(trip.window_start) - 90 * 60e3).toISOString())
    if (clash && !b.override) fail(409, `This vehicle/driver is already on a trip at ${fmtTime(clash.window_start)}`)
    b.driver_vendor_id = driver; b.vehicle_id = v.id
  }
  const out = update('trips', trip.id, b)
  if (b.status === 'confirmed') {
    const w = weddingOf(trip.wedding_id)
    const token = createLink('vendor', { agency_id: w.agency_id, wedding_id: w.id, entity_id: out.driver_vendor_id })
    const v = get('SELECT * FROM vehicles WHERE id = ?', out.vehicle_id)
    sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'vendor', party_id: out.driver_vendor_id, link: linkUrl('vendor', token), dedupe_key: `trip:${trip.id}:${out.updated_at}`,
      body: `New pickup for ${w.name}: ${trip.location} · ${fmtTime(trip.window_start)} · ${trip.pax} pax (${(trip.stops || []).map((s: any) => s.name).join(', ')}). Trip sheet: ${linkUrl('vendor', token)}` })
    const driver = get('SELECT * FROM vendors WHERE id = ?', out.driver_vendor_id)
    for (const s of out.stops || []) {
      const g = get('SELECT * FROM guests WHERE id = ?', s.guest_id)
      sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'guest', party_id: s.guest_id, dedupe_key: `pickup:${trip.id}:${s.guest_id}:${out.updated_at}`,
        body: `Hi ${g.name.split(' ')[0]}, your pickup at ${trip.location} is confirmed 🚗 ${v.label} (${v.plate || ''}), driver ${driver.name} ${driver.phone || ''}. Please call the driver after landing.` })
    }
  }
  audit(req, 'trip.updated', 'trip', trip.id, b)
  return out
}))
W.post('/trips/merge', wrap(req => tx(() => {
  const trips = (req.body.ids as string[]).map(id => get('SELECT * FROM trips WHERE id = ? AND wedding_id = ?', id, req.params.wid)).filter(Boolean)
  if (trips.length < 2) fail(422, 'Select at least two trips')
  const [keep, ...rest] = trips.sort((a, b) => a.window_start.localeCompare(b.window_start))
  const stops = trips.flatMap(t => t.stops || [])
  update('trips', keep.id, { stops, pax: stops.reduce((s: number, x: any) => s + x.pax, 0), window_end: trips.map(t => t.window_end).sort().pop(), status: keep.status === 'confirmed' ? 'needs_replan' : keep.status })
  for (const t of rest) { run('UPDATE travel SET trip_id = ? WHERE trip_id = ?', keep.id, t.id); remove('trips', t.id) }
  return get('SELECT * FROM trips WHERE id = ?', keep.id)
})))
W.post('/trips/:id/move', wrap(req => tx(() => {
  const from = get('SELECT * FROM trips WHERE id = ?', req.params.id)
  const stop = (from.stops || []).find((s: any) => s.travel_id === req.body.travel_id)
  if (!stop) fail(404, 'Passenger not on this trip')
  const fromStops = from.stops.filter((s: any) => s !== stop && s.travel_id !== stop.travel_id)
  update('trips', from.id, { stops: fromStops, pax: fromStops.reduce((s: number, x: any) => s + x.pax, 0), status: from.status === 'confirmed' ? 'needs_replan' : from.status })
  if (req.body.to_trip_id) {
    const to = get('SELECT * FROM trips WHERE id = ?', req.body.to_trip_id)
    const st = [...(to.stops || []), stop]
    update('trips', to.id, { stops: st, pax: st.reduce((s: number, x: any) => s + x.pax, 0), status: to.status === 'confirmed' ? 'needs_replan' : to.status })
    run('UPDATE travel SET trip_id = ? WHERE id = ?', to.id, stop.travel_id)
  } else run('UPDATE travel SET trip_id = NULL WHERE id = ?', stop.travel_id)
  if (!fromStops.length) remove('trips', from.id)
  return { ok: true }
})))

// =====================================================================
// Accommodation operations
// =====================================================================
W.get('/rooms', wrap(req => {
  const wid = req.params.wid
  const hotels = all('SELECT * FROM hotels WHERE wedding_id = ?', wid)
  const rooms = all('SELECT * FROM rooms WHERE wedding_id = ? ORDER BY hotel_id, floor, number', wid)
  const asg = all(`SELECT ra.*, g.name, g.vip, g.accessibility, g.age_group, g.household_id, h.name AS household FROM room_assignments ra JOIN guests g ON g.id = ra.guest_id LEFT JOIN households h ON h.id = g.household_id WHERE ra.wedding_id = ?`, wid)
  const unassigned = all(`SELECT g.id, g.name, g.vip, g.accessibility, g.age_group, g.stay_from, g.stay_to, h.name AS household FROM guests g LEFT JOIN households h ON h.id = g.household_id
    WHERE g.wedding_id = ? AND g.needs_stay = 1 AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.status != 'declined') AND NOT EXISTS (SELECT 1 FROM room_assignments ra WHERE ra.guest_id = g.id) ORDER BY h.name`, wid)
  const approval = get(`SELECT * FROM approvals WHERE wedding_id = ? AND kind = 'rooming' ORDER BY created_at DESC LIMIT 1`, wid)
  const counts = { total: rooms.length, capacity: rooms.reduce((s, r) => s + r.capacity, 0), assigned: asg.length, final: asg.filter(a => ['final', 'checked_in', 'checked_out'].includes(a.status)).length, checked_in: asg.filter(a => a.status === 'checked_in').length }
  return { hotels, rooms: rooms.map(r => ({ ...r, guests: asg.filter(a => a.room_id === r.id) })), unassigned, conflicts: roomConflicts(wid), approval, counts, host_approval: !!weddingOf(wid).host_permissions?.room_approval }
}))
W.post('/hotels', wrap(req => insert('hotels', { ...req.body, wedding_id: req.params.wid })))
W.patch('/hotels/:id', wrap(req => update('hotels', req.params.id, req.body)))
W.delete('/hotels/:id', wrap(req => tx(() => {
  if (get(`SELECT COUNT(*) n FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id WHERE r.hotel_id = ?`, req.params.id).n && !req.query.force) fail(409, 'Guests are assigned to this hotel')
  run('DELETE FROM room_assignments WHERE room_id IN (SELECT id FROM rooms WHERE hotel_id = ?)', req.params.id)
  run('DELETE FROM rooms WHERE hotel_id = ?', req.params.id); remove('hotels', req.params.id)
})))
W.post('/hotels/:id/rooms', wrap(req => tx(() => {
  const hotel = get('SELECT * FROM hotels WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  if (!hotel) fail(404, 'Hotel not found')
  const rows: any[] = req.body.rows || [req.body]
  const errors: string[] = []
  const existing = new Set(all('SELECT number FROM rooms WHERE hotel_id = ?', hotel.id).map(r => String(r.number)))
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const num = String(r.number ?? '').trim()
    if (!num) errors.push(`Row ${i + 1}: room number missing`)
    else if (existing.has(num) || seen.has(num)) errors.push(`Row ${i + 1}: duplicate room ${num}`)
    seen.add(num)
    if (!(+r.capacity > 0)) errors.push(`Row ${i + 1}: capacity must be at least 1`)
    if (r.available_from && r.available_to && r.available_to < r.available_from) errors.push(`Row ${i + 1}: availability ends before it starts`)
  })
  if (errors.length && !req.body.skip_invalid) fail(422, `${errors.length} invalid row(s)`, { errors })
  let n = 0
  for (const r of rows) {
    const num = String(r.number ?? '').trim()
    if (!num || existing.has(num) || !(+r.capacity > 0)) continue
    insert('rooms', { wedding_id: hotel.wedding_id, hotel_id: hotel.id, number: num, category: r.category || 'Deluxe', capacity: +r.capacity, accessible: /^(y|yes|1|true)$/i.test(String(r.accessible)) ? 1 : 0, floor: +r.floor || +num.slice(0, -2) || 1, available_from: r.available_from || hotel.check_in, available_to: r.available_to || hotel.check_out })
    existing.add(num); n++
  }
  return { created: n, errors }
})))
W.patch('/rooms/:id', wrap(req => {
  const r = update('rooms', req.params.id, req.body)
  if (req.body.status && req.body.status !== 'available') {
    const affected = all('SELECT ra.*, g.name FROM room_assignments ra JOIN guests g ON g.id = ra.guest_id WHERE ra.room_id = ?', r.id)
    if (affected.length) notify({ agency_id: req.user!.agency_id, wedding_id: req.params.wid, kind: 'rooms', severity: 'warning', title: `Room ${r.number} is now ${req.body.status.replace('_', ' ')}`, body: `${affected.length} guest(s) need a new room: ${affected.map(a => a.name).join(', ')}`, link: `/w/${req.params.wid}/rooms` })
    run(`DELETE FROM room_assignments WHERE room_id = ? AND status IN ('proposed')`, r.id)
  }
  return r
}))
W.delete('/rooms/:id', wrap(req => { run('DELETE FROM room_assignments WHERE room_id = ?', req.params.id); remove('rooms', req.params.id) }))
W.post('/rooms/suggest', wrap(req => { const r = suggestRooms(req.params.wid); audit(req, 'rooms.suggested', null, null, r); return r }))
W.post('/rooms/assign', wrap(req => {
  const { guest_id, room_id } = req.body
  const cur = get('SELECT * FROM room_assignments WHERE guest_id = ?', guest_id)
  if (cur && ['checked_in', 'checked_out'].includes(cur.status)) fail(409, 'Guest has already checked in — use Room change instead')
  if (!room_id) { if (cur) remove('room_assignments', cur.id); return { ok: true } }
  const room = get('SELECT * FROM rooms WHERE id = ?', room_id)
  const used = get('SELECT COUNT(*) n FROM room_assignments WHERE room_id = ? AND guest_id != ?', room_id, guest_id).n
  if (used >= room.capacity && !req.body.override) fail(409, `Room ${room.number} is full (${room.capacity})`)
  const status = cur?.status === 'final' ? 'final' : 'proposed'
  const out = cur ? update('room_assignments', cur.id, { room_id, status }) : insert('room_assignments', { wedding_id: req.params.wid, room_id, guest_id, status: 'proposed' })
  audit(req, 'rooms.assigned', 'room_assignment', out.id, { room: room.number })
  return out
}))
W.post('/rooms/submit-approval', wrap(req => {
  const wid = req.params.wid
  const w = weddingOf(wid)
  const crit = roomConflicts(wid).filter(c => c.severity === 'critical')
  if (crit.length && !req.body.override) fail(409, `${crit.length} critical conflict(s) — resolve before sending`, { conflicts: crit })
  if (!w.host_permissions?.room_approval) return finalizeRooms(wid, req)
  run(`UPDATE approvals SET status = 'superseded' WHERE wedding_id = ? AND kind = 'rooming' AND status = 'pending'`, wid)
  run(`UPDATE room_assignments SET status = 'pending_approval' WHERE wedding_id = ? AND status IN ('proposed')`, wid)
  const snapshot = all(`SELECT r.id AS room_id, r.number, r.category, ho.name AS hotel, g.name AS guest, g.id AS guest_id, hh.name AS household FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id JOIN hotels ho ON ho.id = r.hotel_id JOIN guests g ON g.id = ra.guest_id LEFT JOIN households hh ON hh.id = g.household_id WHERE ra.wedding_id = ? ORDER BY ho.name, r.number`, wid)
  const ap = insert('approvals', { wedding_id: wid, kind: 'rooming', title: 'Rooming list', description: `${snapshot.length} guests across ${new Set(snapshot.map(s => s.room_id)).size} rooms`, data: { rooms: snapshot, note: req.body.note }, approver: 'host' })
  notifyHosts(wid, 'Your rooming list is ready for approval 🏨')
  audit(req, 'rooms.sent_for_approval', 'approval', ap.id)
  return ap
}))
function finalizeRooms(wid: string, req: any) {
  const w = weddingOf(wid)
  const pending = get(`SELECT * FROM approvals WHERE wedding_id = ? AND kind = 'rooming' AND status = 'pending'`, wid)
  if (pending && !req.body.override) fail(409, 'Host approval is still pending')
  const n = run(`UPDATE room_assignments SET status = 'final' WHERE wedding_id = ? AND status IN ('approved','proposed','pending_approval')`, wid).changes
  const rows = all(`SELECT ra.guest_id, g.name, r.number, ho.name AS hotel, ho.address, ho.check_in FROM room_assignments ra JOIN guests g ON g.id = ra.guest_id JOIN rooms r ON r.id = ra.room_id JOIN hotels ho ON ho.id = r.hotel_id WHERE ra.wedding_id = ? AND ra.status = 'final' AND g.phone IS NOT NULL`, wid)
  for (const r of rows) sendMessage({ agency_id: w.agency_id, wedding_id: wid, party_kind: 'guest', party_id: r.guest_id, dedupe_key: `room:${r.guest_id}:${r.number}`, body: `Hi ${r.name.split(' ')[0]} 🏨 You're staying at ${r.hotel}, room ${r.number}. Check-in from ${r.check_in || 'arrival'}. ${r.address || ''}` })
  audit(req, 'rooms.finalized', null, null, { rooms: n })
  return { finalized: n, notified: rows.length }
}
W.post('/rooms/finalize', wrap(req => finalizeRooms(req.params.wid, req)))
W.post('/rooms/checkin', wrap(req => {
  const a = get('SELECT * FROM room_assignments WHERE guest_id = ? AND wedding_id = ?', req.body.guest_id, req.params.wid)
  if (!a) fail(404, 'Guest has no room')
  const out = update('room_assignments', a.id, req.body.out ? { status: 'checked_out', checked_out_at: now() } : { status: 'checked_in', checked_in_at: now() })
  audit(req, req.body.out ? 'rooms.checkout' : 'rooms.checkin', 'room_assignment', a.id)
  return out
}))
W.post('/rooms/change', wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid)
  const a = get('SELECT ra.*, r.category, r.capacity, r.hotel_id FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id WHERE ra.guest_id = ?', req.body.guest_id)
  const g = get('SELECT * FROM guests WHERE id = ?', req.body.guest_id)
  const mates = a ? all('SELECT guest_id FROM room_assignments WHERE room_id = ?', a.room_id).map(x => x.guest_id) : [g.id]
  const need = req.body.move_roommates ? mates.length : 1
  const alt = all(`SELECT r.*, (SELECT COUNT(*) FROM room_assignments x WHERE x.room_id = r.id) AS used FROM rooms r WHERE r.wedding_id = ? AND r.status = 'available' AND r.id != ?`, wid, a?.room_id || '')
    .filter(r => r.capacity - r.used >= need && (!g.accessibility || r.accessible))
    .sort((x, y) => (x.category === a?.category ? 0 : 1) - (y.category === a?.category ? 0 : 1) || (x.hotel_id === a?.hotel_id ? 0 : 1) - (y.hotel_id === a?.hotel_id ? 0 : 1))[0]
  if (!alt) {
    insert('requests', { wedding_id: wid, kind: 'room_waitlist', from_kind: 'guest', from_id: g.id, title: `Room change for ${g.name}`, body: req.body.reason })
    insert('incidents', { wedding_id: wid, title: `No alternative room for ${g.name}`, description: req.body.reason, severity: 'high', source: 'rooms', related: g.id, log: [{ at: now(), text: 'Waitlisted — escalate to hotel' }] })
    return { found: false, message: 'No room available — guest waitlisted and escalated' }
  }
  for (const gid of req.body.move_roommates ? mates : [g.id]) {
    const cur = get('SELECT * FROM room_assignments WHERE guest_id = ?', gid)
    if (cur) update('room_assignments', cur.id, { room_id: alt.id, status: cur.status === 'checked_in' ? 'checked_in' : 'final' })
    else insert('room_assignments', { wedding_id: wid, room_id: alt.id, guest_id: gid, status: 'final' })
  }
  if (req.body.reason && a) update('rooms', a.room_id, { status: req.body.room_issue ? 'out_of_service' : 'available' })
  const hotel = get('SELECT name FROM hotels WHERE id = ?', alt.hotel_id)
  sendMessage({ agency_id: w.agency_id, wedding_id: wid, party_kind: 'guest', party_id: g.id, body: `Hi ${g.name.split(' ')[0]}, we've moved you to room ${alt.number} at ${hotel.name}. Sorry for the trouble!` })
  audit(req, 'rooms.changed', 'room', alt.id, { guest: g.name, reason: req.body.reason })
  return { found: true, room: alt.number, hotel: hotel.name }
}))

// =====================================================================
// Vendor operations
// =====================================================================
planner.get('/vendors', wrap(req => all(`SELECT v.*, (SELECT COUNT(*) FROM vendor_assignments va WHERE va.vendor_id = v.id) AS assignments,
  CASE WHEN v.jobs > 0 THEN ROUND(100.0 * v.on_time / v.jobs) END AS on_time_pct FROM vendors v WHERE agency_id = ? ORDER BY kind, name`, req.user!.agency_id)))
planner.post('/vendors', wrap(req => {
  if (req.body.phone && get('SELECT 1 FROM vendors WHERE agency_id = ? AND phone = ?', req.user!.agency_id, req.body.phone.replace(/[\s-]/g, '')) && !req.body.force) fail(409, 'A vendor with this phone already exists')
  return insert('vendors', { ...req.body, phone: req.body.phone?.replace(/[\s-]/g, ''), agency_id: req.user!.agency_id })
}))
planner.patch('/vendors/:id', wrap(req => update('vendors', req.params.id, req.body)))
planner.delete('/vendors/:id', requirePerm('vendors.directory.delete'), wrap(req => {
  if (get(`SELECT 1 FROM vendor_assignments WHERE vendor_id = ? AND status NOT IN ('completed','cancelled')`, req.params.id)) fail(409, 'Vendor has active assignments')
  remove('vendors', req.params.id)
}))

W.get('/vendors', wrap(req => all(`SELECT va.*, v.name, v.kind, v.phone, v.contact, v.rating, f.name AS function_name, f.date AS function_date, b.name AS backup_name,
  CASE WHEN v.jobs > 0 THEN ROUND(100.0 * v.on_time / v.jobs) END AS on_time_pct
  FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id LEFT JOIN functions f ON f.id = va.function_id LEFT JOIN vendors b ON b.id = va.backup_vendor_id
  WHERE va.wedding_id = ? ORDER BY f.date, va.report_at`, req.params.wid)))

function sendVendorAssignment(va: any) {
  const w = weddingOf(va.wedding_id), v = get('SELECT * FROM vendors WHERE id = ?', va.vendor_id)
  const f = va.function_id ? get('SELECT * FROM functions WHERE id = ?', va.function_id) : null
  const link = linkUrl('vendor', createLink('vendor', { agency_id: w.agency_id, wedding_id: w.id, entity_id: v.id }))
  return sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'vendor', party_id: v.id, link, dedupe_key: `assign:${va.id}`,
    body: `Hi ${v.contact || v.name}, new assignment from ${get('SELECT name FROM agencies WHERE id = ?', w.agency_id).name}: ${va.role || v.kind} for ${w.name}${f ? ` · ${f.name}` : ''}. Report ${fmtTime(va.report_at)} at ${va.report_location || f?.venue || w.venue}. Reply YES to confirm or open ${link}` })
}

W.post('/vendors/assign', wrap(req => {
  const b = req.body, wid = req.params.wid
  if (!b.vendor_id) fail(422, 'Choose a vendor')
  if (b.report_at) {
    const t = Date.parse(b.report_at)
    const clash = all(`SELECT va.*, w.name AS wedding FROM vendor_assignments va JOIN weddings w ON w.id = va.wedding_id WHERE va.vendor_id = ? AND va.status != 'cancelled' AND va.report_at IS NOT NULL`, b.vendor_id)
      .find(x => Math.abs(Date.parse(x.report_at) - t) < 4 * 3600e3)
    if (clash && !b.force) fail(409, `Possible double booking: already reporting to ${clash.wedding} at ${fmtTime(clash.report_at)}`)
  }
  const va = insert('vendor_assignments', { ...b, wedding_id: wid, status: 'pending', deliverables: (b.deliverables || []).map((d: any) => typeof d === 'string' ? { text: d, done: false } : d) })
  if (b.quote && !get('SELECT 1 FROM budget_lines WHERE wedding_id = ? AND vendor_id = ?', wid, b.vendor_id)) {
    const v = get('SELECT * FROM vendors WHERE id = ?', b.vendor_id)
    insert('budget_lines', { wedding_id: wid, category: v.kind || 'Vendors', label: v.name, planned: b.quote, vendor_id: v.id, function_id: b.function_id })
  }
  if (b.send !== false) sendVendorAssignment(va)
  audit(req, 'vendor.assigned', 'vendor_assignment', va.id)
  return va
}))
W.patch('/vendor-assignments/:id', wrap(req => update('vendor_assignments', req.params.id, req.body)))
W.delete('/vendor-assignments/:id', wrap(req => remove('vendor_assignments', req.params.id)))
W.post('/vendor-assignments/:id/status', wrap(req => vendorStatus(req.params.id, req.body.action, { minutes: req.body.minutes, note: req.body.note }, { kind: req.user!.role, id: req.user!.id, name: req.user!.name, agency_id: req.user!.agency_id, wedding_id: req.params.wid })))
W.post('/vendor-assignments/:id/remind', wrap(req => {
  const va = get('SELECT * FROM vendor_assignments WHERE id = ?', req.params.id)
  update('vendor_assignments', va.id, { reminders: (va.reminders || 0) + 1, last_reminded_at: now() })
  run('DELETE FROM messages WHERE dedupe_key = ?', `assign:${va.id}`)
  return sendVendorAssignment(va)
}))
W.get('/vendor-assignments/:id/impact', wrap(req => {
  const va = get('SELECT * FROM vendor_assignments WHERE id = ?', req.params.id)
  return delayImpact(va, va.delay_min || +String(req.query.minutes || 30))
}))
W.post('/vendor-assignments/:id/backup', wrap(req => tx(() => {
  const va = get('SELECT * FROM vendor_assignments WHERE id = ?', req.params.id)
  const nb = insert('vendor_assignments', { wedding_id: va.wedding_id, vendor_id: req.body.vendor_id, function_id: va.function_id, role: va.role, report_at: va.report_at, report_location: va.report_location, deliverables: (va.deliverables || []).map((d: any) => ({ ...d, done: false })), quote: va.quote, status: 'pending' })
  update('vendor_assignments', va.id, { backup_vendor_id: req.body.vendor_id, status: 'cancelled' })
  sendVendorAssignment(nb)
  audit(req, 'vendor.backup_assigned', 'vendor_assignment', nb.id, { replaces: va.id })
  return nb
})))

// =====================================================================
// Budget & finance (tracking only — no payment processing)
// =====================================================================
W.get('/budget', requirePerm('budget'), wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid), d = agencyDefaults(w.agency_id)
  const lines = all(`SELECT bl.*, v.name AS vendor_name, f.name AS function_name, COALESCE((SELECT SUM(amount_base) FROM expenses e WHERE e.line_id = bl.id), 0) AS actual,
    COALESCE((SELECT SUM(amount_base) FROM expenses e WHERE e.line_id = bl.id AND payment_status = 'paid'), 0) AS paid
    FROM budget_lines bl LEFT JOIN vendors v ON v.id = bl.vendor_id LEFT JOIN functions f ON f.id = bl.function_id WHERE bl.wedding_id = ? ORDER BY bl.category`, wid)
    .map(l => ({ ...l, variance_pct: l.planned ? Math.round((l.actual / l.planned - 1) * 100) : null, over: l.planned > 0 && l.actual > l.planned * (1 + d.budget_variance_pct / 100) }))
  const expenses = all('SELECT e.*, bl.category, v.name AS vendor_name FROM expenses e LEFT JOIN budget_lines bl ON bl.id = e.line_id LEFT JOIN vendors v ON v.id = e.vendor_id WHERE e.wedding_id = ? ORDER BY e.date DESC, e.created_at DESC', wid)
  const planned = lines.reduce((s, l) => s + l.planned, 0), actual = lines.reduce((s, l) => s + l.actual, 0)
  const committed = all(`SELECT COALESCE(SUM(quote),0) q FROM vendor_assignments WHERE wedding_id = ? AND status != 'cancelled'`, wid)[0].q
  const forecast = lines.reduce((s, l) => s + Math.max(l.actual, l.planned), 0)
  const cats: Record<string, { planned: number; actual: number }> = {}
  for (const l of lines) { cats[l.category] ||= { planned: 0, actual: 0 }; cats[l.category].planned += l.planned; cats[l.category].actual += l.actual }
  return { currency: w.currency, total_budget: w.budget_total, planned, actual, committed, forecast, paid: lines.reduce((s, l) => s + l.paid, 0), lines, expenses, categories: cats, threshold: d.budget_variance_pct, fx: d.fx, host_visible: !!w.host_permissions?.budget, approvals: all(`SELECT * FROM approvals WHERE wedding_id = ? AND kind = 'budget' ORDER BY created_at DESC`, wid) }
}))
W.post('/budget/lines', requirePerm('budget'), wrap(req => insert('budget_lines', { ...req.body, wedding_id: req.params.wid, planned: +req.body.planned || 0 })))
W.patch('/budget/lines/:id', requirePerm('budget'), wrap(req => { audit(req, 'budget.line_updated', 'budget_line', req.params.id, req.body); return update('budget_lines', req.params.id, req.body) }))
W.delete('/budget/lines/:id', requirePerm('budget'), wrap(req => { run('UPDATE expenses SET line_id = NULL WHERE line_id = ?', req.params.id); remove('budget_lines', req.params.id) }))
W.post('/budget/expenses', requirePerm('budget'), upload.single('file'), wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid), d = agencyDefaults(w.agency_id), b = req.body
  const amount = +b.amount
  if (!(amount > 0)) fail(422, 'Amount must be greater than zero')
  const currency = b.currency || w.currency || 'INR'
  if (!d.fx[currency]) fail(422, `No exchange rate configured for ${currency}`)
  const base = Math.round(amount * d.fx[currency] / (d.fx[w.currency || 'INR'] || 1))
  let doc_id = null
  if (req.file) { const s = storeFile(req.file); if (s) doc_id = insert('documents', { agency_id: w.agency_id, wedding_id: wid, entity_kind: 'expense', category: 'Invoice', name: s.original_name, file: s.file, mime: s.mime, size: s.size, text: s.text, uploaded_by: req.user!.id }).id }
  const date = b.date || localDate()
  const dup = get(`SELECT * FROM expenses WHERE wedding_id = ? AND ABS(amount - ?) < 0.01 AND currency = ? AND ((vendor_id IS NOT NULL AND vendor_id = ?) OR lower(COALESCE(label, '')) = lower(?)) AND date = ?`, wid, amount, currency, b.vendor_id || null, b.label || '', date)
  const e = insert('expenses', { wedding_id: wid, line_id: b.line_id || null, label: b.label, amount, currency, amount_base: base, date, vendor_id: b.vendor_id || null, doc_id, payment_status: b.payment_status || 'unpaid', flagged: dup ? `Possible duplicate of "${dup.label}" (${dup.date})` : null, created_by: req.user!.id })
  if (e.line_id) {
    const l = get('SELECT bl.*, (SELECT SUM(amount_base) FROM expenses WHERE line_id = bl.id) AS actual FROM budget_lines bl WHERE id = ?', e.line_id)
    if (l.planned > 0 && l.actual > l.planned * (1 + d.budget_variance_pct / 100)) {
      notify({ agency_id: w.agency_id, wedding_id: wid, kind: 'budget', severity: 'warning', title: `${l.category} over budget by ${Math.round((l.actual / l.planned - 1) * 100)}%`, link: `/w/${wid}/budget` })
      emit('budget.exception', { agency_id: w.agency_id, wedding_id: wid, line_id: l.id, variance_pct: Math.round((l.actual / l.planned - 1) * 100) })
    }
  }
  audit(req, 'budget.expense_added', 'expense', e.id, { amount, currency, flagged: !!e.flagged })
  return e
}))
W.patch('/budget/expenses/:id', requirePerm('budget'), wrap(req => update('expenses', req.params.id, req.body)))
W.delete('/budget/expenses/:id', requirePerm('budget'), wrap(req => { audit(req, 'budget.expense_deleted', 'expense', req.params.id); remove('expenses', req.params.id) }))
W.post('/budget/lines/:id/host-decision', requirePerm('budget'), wrap(req => {
  const l = get('SELECT bl.*, (SELECT SUM(amount_base) FROM expenses WHERE line_id = bl.id) AS actual FROM budget_lines bl WHERE id = ?', req.params.id)
  const ap = insert('approvals', { wedding_id: req.params.wid, kind: 'budget', title: `${l.category}: approve revised spend`, description: req.body.note || `Planned ₹${l.planned.toLocaleString('en-IN')} · now ₹${(l.actual || 0).toLocaleString('en-IN')}`, entity_id: l.id, data: { planned: l.planned, actual: l.actual, proposed: req.body.proposed }, approver: 'host' })
  notifyHosts(req.params.wid, `Budget decision needed: ${l.category}`)
  return ap
}))

// =====================================================================
// Master calendar (agency + per-wedding)
// =====================================================================
function calendarItems(wids: string[], from: string, to: string) {
  if (!wids.length) return []
  const ph = wids.map(() => '?').join(',')
  const items: any[] = []
  for (const f of all(`SELECT f.*, w.name AS wedding FROM functions f JOIN weddings w ON w.id = f.wedding_id WHERE f.wedding_id IN (${ph}) AND f.date BETWEEN ? AND ?`, ...wids, from.slice(0, 10), to.slice(0, 10)))
    items.push({ id: f.id, type: 'function', title: f.name, wedding_id: f.wedding_id, wedding: f.wedding, start: `${f.date}T${f.start_time || '10:00'}`, end: `${f.date}T${f.end_time || '13:00'}`, location: f.venue })
  for (const t of all(`SELECT t.*, w.name AS wedding, u.name AS owner FROM tasks t LEFT JOIN weddings w ON w.id = t.wedding_id LEFT JOIN users u ON u.id = t.owner_id WHERE t.wedding_id IN (${ph}) AND t.due_at BETWEEN ? AND ? AND t.status != 'done'`, ...wids, from, to))
    items.push({ id: t.id, type: 'task', title: t.title, wedding_id: t.wedding_id, wedding: t.wedding, start: t.due_at, end: t.due_at, owner: t.owner, owner_id: t.owner_id, priority: t.priority, status: t.status })
  for (const v of all(`SELECT va.*, v.name, w.name AS wedding FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id JOIN weddings w ON w.id = va.wedding_id WHERE va.wedding_id IN (${ph}) AND va.report_at BETWEEN ? AND ? AND va.status != 'cancelled'`, ...wids, from, to))
    items.push({ id: v.id, type: 'vendor', title: `${v.name} reports`, wedding_id: v.wedding_id, wedding: v.wedding, start: v.report_at, end: v.report_at, location: v.report_location, status: v.status })
  for (const t of all(`SELECT t.*, w.name AS wedding FROM trips t JOIN weddings w ON w.id = t.wedding_id WHERE t.wedding_id IN (${ph}) AND t.window_start BETWEEN ? AND ?`, ...wids, from, to))
    items.push({ id: t.id, type: 'travel', title: `Pickup · ${t.location} (${t.pax})`, wedding_id: t.wedding_id, wedding: t.wedding, start: t.window_start, end: t.window_end, status: t.status })
  for (const h of all(`SELECT h.*, w.name AS wedding FROM hotels h JOIN weddings w ON w.id = h.wedding_id WHERE h.wedding_id IN (${ph}) AND h.check_in BETWEEN ? AND ?`, ...wids, from.slice(0, 10), to.slice(0, 10)))
    items.push({ id: h.id, type: 'room', title: `Check-in · ${h.name}`, wedding_id: h.wedding_id, wedding: h.wedding, start: `${h.check_in}T14:00`, end: `${h.check_in}T18:00` })
  for (const e of all(`SELECT e.*, w.name AS wedding, u.name AS owner FROM events e LEFT JOIN weddings w ON w.id = e.wedding_id LEFT JOIN users u ON u.id = e.owner_id WHERE (e.wedding_id IN (${ph}) OR e.wedding_id IS NULL) AND e.start_at BETWEEN ? AND ?`, ...wids, from, to))
    items.push({ id: e.id, type: 'event', kind: e.kind, title: e.title, wedding_id: e.wedding_id, wedding: e.wedding, start: e.start_at, end: e.end_at || e.start_at, owner: e.owner, owner_id: e.owner_id, location: e.location, depends_on: e.depends_on, editable: true })
  return items.sort((a, b) => (a.start || '').localeCompare(b.start || ''))
}

planner.get('/calendar', wrap(req => {
  const all_ = weddingIdsFor(req.user!)
  const wids = req.query.wedding_id ? all_.filter(id => id === req.query.wedding_id) : all_
  const from = String(req.query.from || new Date(Date.now() - 7 * 864e5).toISOString())
  const to = String(req.query.to || new Date(Date.now() + 60 * 864e5).toISOString())
  const types = req.query.types ? String(req.query.types).split(',') : null
  let items = calendarItems(wids, from, to)
  if (types) items = items.filter(i => types.includes(i.type))
  if (req.query.owner_id) items = items.filter(i => i.owner_id === req.query.owner_id)
  return items
}))

function eventConflicts(e: any, agencyId: string) {
  const out: string[] = []
  const s = e.start_at, en = e.end_at || e.start_at
  if (e.owner_id) {
    for (const x of all(`SELECT * FROM events WHERE owner_id = ? AND id != ? AND start_at < ? AND COALESCE(end_at, start_at) > ?`, e.owner_id, e.id || '', en, s))
      out.push(`Owner is already booked: "${x.title}"`)
    const u = get('SELECT name, unavailable FROM users WHERE id = ?', e.owner_id)
    if ((u?.unavailable || []).some((r: any) => r.from <= s.slice(0, 10) && r.to >= s.slice(0, 10))) out.push(`${u.name} is unavailable that day`)
  }
  if (e.location) for (const x of all(`SELECT * FROM events e JOIN weddings w ON w.id = e.wedding_id WHERE w.agency_id = ? AND e.id != ? AND lower(e.location) = lower(?) AND e.start_at < ? AND COALESCE(e.end_at, e.start_at) > ?`, agencyId, e.id || '', e.location, en, s))
    out.push(`${e.location} is in use by "${x.title}"`)
  for (const dep of e.depends_on || []) {
    const d = get('SELECT * FROM events WHERE id = ?', dep) || get('SELECT title, due_at AS end_at FROM tasks WHERE id = ?', dep)
    if (d && (d.end_at || d.start_at) > s) out.push(`Starts before its dependency "${d.title}" finishes`)
  }
  return out
}
planner.post('/events', wrap(req => {
  const e = req.body
  if (e.wedding_id && !canWedding(req.user!, e.wedding_id)) fail(403, 'Not your wedding')
  const conflicts = eventConflicts(e, req.user!.agency_id)
  if (conflicts.length && !e.override) fail(409, 'Conflict detected', { conflicts })
  const out = insert('events', { ...e, agency_id: req.user!.agency_id, notes: [e.notes, conflicts.length ? `⚠ Saved with warning: ${conflicts.join('; ')}` : ''].filter(Boolean).join('\n') })
  if (out.owner_id && out.owner_id !== req.user!.id) notify({ agency_id: req.user!.agency_id, wedding_id: out.wedding_id, user_id: out.owner_id, kind: 'calendar', title: `New: ${out.title}`, body: fmtTime(out.start_at), link: '/calendar' })
  return out
}))
planner.patch('/events/:id', wrap(req => {
  const cur = get('SELECT * FROM events WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (!cur) fail(404, 'Event not found')
  const next = { ...cur, ...req.body }
  const conflicts = eventConflicts(next, req.user!.agency_id)
  if (conflicts.length && !req.body.override) fail(409, 'Conflict detected', { conflicts })
  const out = update('events', cur.id, req.body)
  if (out.owner_id && (req.body.start_at || req.body.owner_id)) notify({ agency_id: req.user!.agency_id, wedding_id: out.wedding_id, user_id: out.owner_id, kind: 'calendar', title: `Updated: ${out.title}`, body: fmtTime(out.start_at), link: '/calendar' })
  audit(req, 'calendar.updated', 'event', cur.id, { from: cur.start_at, to: out.start_at })
  return out
}))
planner.delete('/events/:id', wrap(req => run('DELETE FROM events WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)))

// =====================================================================
// Tasks & SOP engine
// =====================================================================
planner.get('/tasks', wrap(req => {
  const wids = weddingIdsFor(req.user!)
  const scope = req.query.wedding_id ? wids.filter(id => id === req.query.wedding_id) : wids
  const where = [`(t.wedding_id IN (${scope.map(() => '?').join(',') || "''"}) ${req.query.wedding_id ? '' : 'OR (t.wedding_id IS NULL AND t.created_by = ?)'})`]
  const p: any[] = [...scope, ...(req.query.wedding_id ? [] : [req.user!.id])]
  const f = req.query.filter
  if (f === 'mine' || !isAdmin(req.user!) && !req.query.wedding_id) { where.push('t.owner_id = ?'); p.push(req.user!.id) }
  if (f === 'overdue') { where.push(`t.status != 'done' AND t.due_at < ?`); p.push(now()) }
  if (f === 'blocked') where.push(`t.status = 'blocked'`)
  if (f === 'review') where.push(`t.status = 'review'`)
  if (f === 'open') where.push(`t.status != 'done'`)
  return all(`SELECT t.*, u.name AS owner_name, w.name AS wedding FROM tasks t LEFT JOIN users u ON u.id = t.owner_id LEFT JOIN weddings w ON w.id = t.wedding_id WHERE ${where.join(' AND ')}
    ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'review' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_at`, ...p)
}))
planner.post('/tasks', wrap(req => {
  const b = req.body
  if (b.wedding_id && !canWedding(req.user!, b.wedding_id)) fail(403, 'Not your wedding')
  if (!b.title?.trim()) fail(422, 'Title is required')
  const t = insert('tasks', { ...b, checklist: (b.checklist || []).map((c: any) => typeof c === 'string' ? { text: c, done: false } : c), created_by: req.user!.id, status: 'todo' })
  if (t.owner_id && t.owner_id !== req.user!.id) notify({ agency_id: req.user!.agency_id, wedding_id: t.wedding_id, user_id: t.owner_id, kind: 'task', title: `Assigned: ${t.title}`, link: t.wedding_id ? `/w/${t.wedding_id}/tasks` : '/tasks' })
  audit(req, 'task.created', 'task', t.id)
  return t
}))
function taskFor(req: any) {
  const t = get('SELECT * FROM tasks WHERE id = ?', req.params.id)
  if (!t) fail(404, 'Task not found')
  if (t.wedding_id && !canWedding(req.user!, t.wedding_id)) fail(403, 'Not your wedding')
  return t
}
planner.patch('/tasks/:id', wrap(req => {
  const t = taskFor(req)
  if (req.body.if_updated_at && req.body.if_updated_at !== t.updated_at) fail(409, 'Someone else changed this task — refresh to see their edit', { current: t })
  const out = update('tasks', t.id, req.body)
  if (req.body.owner_id && req.body.owner_id !== t.owner_id) notify({ agency_id: req.user!.agency_id, wedding_id: t.wedding_id, user_id: req.body.owner_id, kind: 'task', title: `Reassigned to you: ${t.title}`, link: t.wedding_id ? `/w/${t.wedding_id}/tasks` : '/tasks' })
  if (req.body.due_at && req.body.due_at !== t.due_at) update('tasks', t.id, { escalated: 0 })
  return out
}))
planner.delete('/tasks/:id', wrap(req => { const t = taskFor(req); remove('tasks', t.id); audit(req, 'task.deleted', 'task', t.id) }))
planner.post('/tasks/:id/action', wrap(req => {
  const t = taskFor(req), a = req.body.action, u = req.user!
  const w = t.wedding_id ? weddingOf(t.wedding_id) : null
  const tell = (userId: string | null, title: string, severity: any = 'info') => userId && notify({ agency_id: u.agency_id, wedding_id: t.wedding_id, user_id: userId, kind: 'task', severity, title, link: t.wedding_id ? `/w/${t.wedding_id}/tasks` : '/tasks' })
  let patch: any = {}
  switch (a) {
    case 'start': {
      const open = (t.depends_on || []).map((id: string) => get('SELECT id, title, status FROM tasks WHERE id = ?', id)).filter((d: any) => d && d.status !== 'done')
      if (open.length && !req.body.override) fail(409, `Waiting on: ${open.map((d: any) => d.title).join(', ')}`, { dependency: true })
      patch = { status: 'in_progress' }; break
    }
    case 'block':
      if (!req.body.reason) fail(422, 'Say what is blocking this task')
      patch = { status: 'blocked', blocked_reason: req.body.reason }
      tell(t.created_by !== u.id ? t.created_by : null, `Blocked: ${t.title}`, 'warning')
      for (const d of t.depends_on || []) { const dep = get('SELECT owner_id, title FROM tasks WHERE id = ?', d); if (dep?.owner_id) tell(dep.owner_id, `Your task "${dep.title}" is blocking "${t.title}"`, 'warning') }
      if (w) notify({ agency_id: u.agency_id, wedding_id: t.wedding_id, kind: 'task', severity: 'warning', title: `Blocked: ${t.title}`, body: req.body.reason, link: `/w/${t.wedding_id}/tasks?filter=blocked` })
      emit('task.blocked', { agency_id: u.agency_id, wedding_id: t.wedding_id, task_id: t.id, reason: req.body.reason })
      break
    case 'unblock': patch = { status: 'in_progress', blocked_reason: null }; break
    case 'complete': {
      const unchecked = (t.checklist || []).filter((c: any) => !c.done)
      if (unchecked.length && !req.body.override) fail(409, `${unchecked.length} checklist item(s) not done`)
      if (t.requires_proof && !req.body.proof && !t.proof) fail(422, 'This task needs proof (photo, note or document) before completion')
      patch = t.requires_proof ? { status: 'review', proof: req.body.proof || t.proof } : { status: 'done', completed_at: now(), proof: req.body.proof || t.proof }
      if (t.requires_proof) tell(t.created_by, `Review needed: ${t.title}`)
      break
    }
    case 'approve': if (!isAdmin(u)) fail(403, 'Only planners can approve'); patch = { status: 'done', completed_at: now(), review_note: req.body.note }; tell(t.owner_id, `Approved: ${t.title}`); break
    case 'rework': if (!isAdmin(u)) fail(403, 'Only planners can return work'); patch = { status: 'in_progress', review_note: req.body.note }; tell(t.owner_id, `Returned for rework: ${t.title}`, 'warning'); break
    case 'reopen': patch = { status: 'todo', completed_at: null }; break
    default: fail(400, 'Unknown action')
  }
  const out = update('tasks', t.id, patch)
  audit(req, `task.${a}`, 'task', t.id, req.body)
  return out
}))

planner.get('/sops', wrap(req => all('SELECT * FROM sops WHERE agency_id = ? ORDER BY name', req.user!.agency_id)))
planner.post('/sops', wrap(req => insert('sops', { ...req.body, agency_id: req.user!.agency_id })))
planner.patch('/sops/:id', wrap(req => update('sops', req.params.id, req.body)))
planner.delete('/sops/:id', wrap(req => run('DELETE FROM sops WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)))
W.post('/sops/:sid/apply', wrap(async req => {
  const { applySop } = await import('./planner.ts')
  const n = applySop(req.params.sid, req.params.wid, req.body.owner_id)
  audit(req, 'sop.applied', 'sop', req.params.sid, { tasks: n })
  return { created: n }
}))

// =====================================================================
// Wedding Day Command Center
// =====================================================================
W.get('/live', wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid)
  const functions = all('SELECT * FROM functions WHERE wedding_id = ? ORDER BY date, start_time, sort', wid)
  const current = functions.find(f => f.id === w.live_function_id) || functions.find(f => f.live_status === 'live') || null
  const fid = current?.id
  const attendees = fid ? all(`SELECT g.id, g.name, g.vip, g.checked_in, r.headcount FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE r.function_id = ? AND r.status = 'attending' ORDER BY g.vip DESC, g.name`, fid) : []
  const vendors = all(`SELECT va.*, v.name, v.kind, v.phone FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.wedding_id = ? AND (va.function_id IS ? OR ? IS NULL) AND va.status != 'cancelled' ORDER BY va.report_at`, wid, fid ?? null, fid ?? null)
  const today = (current?.date || localDate())
  const trips = all(`SELECT t.*, v.label AS vehicle, d.name AS driver, d.phone AS driver_phone FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN vendors d ON d.id = t.driver_vendor_id WHERE t.wedding_id = ? AND t.status != 'suggested' AND substr(t.window_start, 1, 10) = ? ORDER BY t.window_start`, wid, today)
  const incidents = all(`SELECT i.*, u.name AS owner_name, f.name AS function_name FROM incidents i LEFT JOIN users u ON u.id = i.owner_id LEFT JOIN functions f ON f.id = i.function_id WHERE i.wedding_id = ? ORDER BY CASE i.status WHEN 'resolved' THEN 1 ELSE 0 END, CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_at DESC LIMIT 50`, wid)
  const tasks = all(`SELECT t.*, u.name AS owner_name FROM tasks t LEFT JOIN users u ON u.id = t.owner_id WHERE t.wedding_id = ? AND t.status != 'done' AND (t.due_at IS NULL OR substr(t.due_at, 1, 10) <= ?) ORDER BY t.due_at LIMIT 30`, wid, today)
  const rooms = get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) AS checked_in FROM room_assignments WHERE wedding_id = ?`, wid)
  const activity = all(`SELECT * FROM audit_log WHERE wedding_id = ? AND allowed = 1 ORDER BY created_at DESC LIMIT 25`, wid)
  const team = all(`SELECT u.id, u.name, u.phone, u.shift_status, wt.responsibilities FROM wedding_team wt JOIN users u ON u.id = wt.user_id WHERE wt.wedding_id = ?`, wid)
  const vstat = (s: string) => vendors.filter(v => v.live_status === s).length
  return {
    wedding: w, functions, current, attendees, vendors, trips, incidents, tasks, rooms, activity, team,
    stats: {
      expected: attendees.reduce((s, a) => s + (a.headcount || 1), 0), arrived: attendees.filter(a => a.checked_in).reduce((s, a) => s + (a.headcount || 1), 0),
      vendors_ready: vendors.filter(v => ['arrived', 'setup', 'ready', 'completed'].includes(v.live_status)).length, vendors_total: vendors.length, vendors_delayed: vstat('delayed'),
      incidents_open: incidents.filter(i => i.status !== 'resolved').length, critical: incidents.filter(i => i.status !== 'resolved' && i.severity === 'critical').length,
      pickups_active: trips.filter(t => ['en_route', 'confirmed', 'needs_replan'].includes(t.status)).length,
    },
    health: weddingHealth(wid),
  }
}))
W.post('/live/start', wrap(req => {
  const wid = req.params.wid
  const fid = req.body.function_id || all('SELECT id FROM functions WHERE wedding_id = ? AND live_status != \'done\' ORDER BY date, start_time', wid)[0]?.id
  if (!fid) fail(422, 'No functions to run')
  run(`UPDATE functions SET live_status = 'upcoming' WHERE wedding_id = ? AND live_status = 'live'`, wid)
  run(`UPDATE functions SET live_status = 'live' WHERE id = ?`, fid)
  update('weddings', wid, { status: 'live', live_function_id: fid })
  audit(req, 'live.function_started', 'function', fid)
  return { function_id: fid }
}))
W.post('/live/advance', wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid)
  const open = get(`SELECT COUNT(*) n FROM incidents WHERE wedding_id = ? AND function_id = ? AND status != 'resolved' AND severity IN ('critical','high')`, wid, w.live_function_id).n
  if (open && !req.body.override) fail(409, `${open} high-severity incident(s) still open for this function`)
  if (w.live_function_id) run(`UPDATE functions SET live_status = 'done' WHERE id = ?`, w.live_function_id)
  const next = all(`SELECT * FROM functions WHERE wedding_id = ? AND live_status = 'upcoming' ORDER BY date, start_time, sort`, wid)[0]
  if (!next) {
    update('weddings', wid, { live_function_id: null, status: 'completed' })
    audit(req, 'live.wrapped', 'wedding', wid)
    return { wrapped: true, summary: get(`SELECT COUNT(*) AS incidents, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved FROM incidents WHERE wedding_id = ?`, wid) }
  }
  run(`UPDATE functions SET live_status = 'live' WHERE id = ?`, next.id)
  update('weddings', wid, { live_function_id: next.id })
  audit(req, 'live.function_advanced', 'function', next.id)
  return { function_id: next.id }
}))
W.post('/incidents', wrap(req => {
  const w = weddingOf(req.params.wid), b = req.body
  if (!b.title) fail(422, 'Describe the incident')
  const i = insert('incidents', { ...b, wedding_id: w.id, function_id: b.function_id || w.live_function_id, status: 'open', source: b.source || 'team', log: [{ at: now(), by: req.user!.name, text: 'Incident logged' }] })
  if (['critical', 'high'].includes(i.severity)) notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'incident', severity: 'critical', title: `${i.severity.toUpperCase()}: ${i.title}`, body: b.description, link: `/w/${w.id}/live` })
  if (i.owner_id) notify({ agency_id: w.agency_id, wedding_id: w.id, user_id: i.owner_id, kind: 'incident', severity: 'warning', title: `You own: ${i.title}`, link: `/w/${w.id}/live` })
  emit('incident.created', { agency_id: w.agency_id, wedding_id: w.id, incident_id: i.id, severity: i.severity })
  audit(req, 'incident.created', 'incident', i.id, { severity: i.severity })
  return i
}))
W.patch('/incidents/:id', wrap(req => {
  const i = get('SELECT * FROM incidents WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  if (!i) fail(404, 'Incident not found')
  const b = req.body
  const log = [...(i.log || [])]
  if (b.note) log.push({ at: now(), by: req.user!.name, text: b.note })
  if (b.status && b.status !== i.status) log.push({ at: now(), by: req.user!.name, text: `Status → ${b.status}` })
  if (b.owner_id && b.owner_id !== i.owner_id) log.push({ at: now(), by: req.user!.name, text: `Reassigned to ${get('SELECT name FROM users WHERE id = ?', b.owner_id)?.name}` })
  if (b.status === 'resolved' && !b.resolution && !i.resolution) fail(422, 'Add a resolution note to close the incident')
  const out = update('incidents', i.id, { status: b.status, owner_id: b.owner_id, severity: b.severity, resolution: b.resolution, log, resolved_at: b.status === 'resolved' ? now() : undefined })
  audit(req, 'incident.updated', 'incident', i.id, { status: b.status })
  return out
}))
W.post('/guests/:id/checkin', wrap(req => {
  const g = update('guests', req.params.id, { checked_in: req.body.undo ? 0 : 1 })
  audit(req, req.body.undo ? 'guest.checkin_undone' : 'guest.checked_in', 'guest', g.id)
  return g
}))

// =====================================================================
// Media center
// =====================================================================
W.get('/media', wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid)
  const items = all(`SELECT m.*, v.name AS uploader, f.name AS function_name FROM media m LEFT JOIN vendors v ON v.id = m.uploader_vendor_id LEFT JOIN functions f ON f.id = m.function_id WHERE m.wedding_id = ? ORDER BY m.created_at DESC`, wid)
  const photographers = all(`SELECT DISTINCT v.* FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.wedding_id = ? AND v.kind IN ('Photographer','Videographer')`, wid)
    .map(p => ({ ...p, upload_link: linkUrl('vendor', createLink('vendor', { agency_id: w.agency_id, wedding_id: wid, entity_id: p.id })) }))
  const c = (s: string) => items.filter(i => i.status === s).length
  return { items, photographers, approvals: all(`SELECT * FROM approvals WHERE wedding_id = ? AND kind = 'media' ORDER BY created_at DESC`, wid), counts: { total: items.length, pending: c('pending'), in_review: c('in_review'), approved: c('approved'), rejected: c('rejected'), published: c('published') }, host_approval: !!w.host_permissions?.media_approval }
}))
W.post('/media/upload', upload.array('files', 50), wrap(req => {
  const w = weddingOf(req.params.wid)
  return ingestMedia(w, (req.files as Express.Multer.File[]) || [], { function_id: req.body.function_id, vendor_id: null })
}))
export function ingestMedia(w: any, files: Express.Multer.File[], o: { function_id?: string; vendor_id?: string | null }) {
  const out = { accepted: 0, duplicates: 0, rejected: [] as string[] }
  for (const f of files) {
    if (!/^(image|video)\//.test(f.mimetype)) { out.rejected.push(`${f.originalname}: not a photo or video`); fs.rmSync(f.path, { force: true }); continue }
    const s = storeFile(f)
    if (!s) { out.rejected.push(`${f.originalname}: empty or corrupt — retry`); continue }
    if (get('SELECT 1 FROM media WHERE wedding_id = ? AND hash = ?', w.id, s.hash)) { out.duplicates++; fs.rmSync(path.join(UPLOAD_DIR, s.file), { force: true }); continue }
    insert('media', { wedding_id: w.id, function_id: o.function_id || null, uploader_vendor_id: o.vendor_id, file: s.file, original_name: s.original_name, mime: s.mime, size: s.size, hash: s.hash, status: 'pending', approval_owner: w.host_permissions?.media_approval ? 'host' : 'planner' })
    out.accepted++
  }
  if (out.accepted) {
    notify({ agency_id: w.agency_id, wedding_id: w.id, kind: 'media', title: `${out.accepted} new media item(s) uploaded`, link: `/w/${w.id}/media` })
    emit('media.uploaded', { agency_id: w.agency_id, wedding_id: w.id, count: out.accepted, vendor_id: o.vendor_id })
  }
  return out
}
W.post('/media/upload-link', wrap(req => {
  const w = weddingOf(req.params.wid)
  const v = get('SELECT * FROM vendors WHERE id = ?', req.body.vendor_id)
  const link = linkUrl('vendor', createLink('vendor', { agency_id: w.agency_id, wedding_id: w.id, entity_id: v.id }))
  sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'vendor', party_id: v.id, link, body: `Hi ${v.contact || v.name}, here's your secure upload link for ${w.name}: ${link} — uploads resume if your connection drops.` })
  return { link }
}))
W.post('/media/submit-approval', wrap(req => {
  const ids: string[] = req.body.ids
  if (!ids?.length) fail(422, 'Select media to send')
  const owner = req.body.owner || 'host'
  run(`UPDATE media SET status = 'in_review', approval_owner = ? WHERE id IN (${ids.map(() => '?').join(',')}) AND status IN ('pending','rejected')`, owner, ...ids)
  const ap = insert('approvals', { wedding_id: req.params.wid, kind: 'media', title: `${ids.length} photo(s)/video(s) for approval`, data: { media_ids: ids }, approver: owner })
  if (owner === 'host') notifyHosts(req.params.wid, `${ids.length} new photos are waiting for your approval 📸`)
  return ap
}))
W.post('/media/decide', wrap(req => {
  const d: Record<string, string> = req.body.decisions || {}
  for (const [id, s] of Object.entries(d)) run(`UPDATE media SET status = ?, comment = ? WHERE id = ? AND wedding_id = ?`, s, s === 'rejected' ? req.body.comment ?? null : null, id, req.params.wid)
  run(`UPDATE approvals SET status = 'approved', decided_at = ? WHERE wedding_id = ? AND kind = 'media' AND status = 'pending' AND approver = 'planner'`, now(), req.params.wid)
  audit(req, 'media.decided', 'media', null, { count: Object.keys(d).length })
}))
W.post('/media/publish', wrap(req => {
  const w = weddingOf(req.params.wid), ids: string[] = req.body.ids || []
  if (!ids.length) fail(422, 'Select approved media to publish')
  const notApproved = all(`SELECT id FROM media WHERE id IN (${ids.map(() => '?').join(',') || "''"}) AND status != 'approved'`, ...ids)
  if (notApproved.length) fail(409, `${notApproved.length} item(s) are not approved yet`)
  run(`UPDATE media SET status = 'published', album = COALESCE(?, album) WHERE id IN (${ids.map(() => '?').join(',')})`, req.body.album ?? null, ...ids)
  let notified = 0
  if (req.body.notify !== false && (req.body.album || 'public') === 'public') {
    for (const g of all(`SELECT DISTINCT g.* FROM guests g JOIN rsvps r ON r.guest_id = g.id WHERE g.wedding_id = ? AND r.status = 'attending' AND g.phone IS NOT NULL AND (g.is_primary = 1 OR g.household_id IS NULL)`, w.id)) {
      const { text } = renderTemplate(`📸 New photos from {{wedding}} are live! View the gallery: {{link}}`, partyVars('guest', g.id, w))
      sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: 'guest', party_id: g.id, body: text, dedupe_key: `gallery:${g.id}:${now().slice(0, 13)}` }); notified++
    }
  }
  audit(req, 'media.published', 'media', null, { count: ids.length, notified })
  return { published: ids.length, notified }
}))
W.patch('/media/:id', wrap(req => update('media', req.params.id, req.body)))
W.delete('/media/:id', wrap(req => { const m = get('SELECT * FROM media WHERE id = ?', req.params.id); if (m?.file) fs.rmSync(path.join(UPLOAD_DIR, m.file), { force: true }); remove('media', req.params.id) }))
