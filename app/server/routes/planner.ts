import { Router } from 'express'
import { all, get, insert, update, remove, run, tx, uid, now, localDate } from '../db.ts'
import {
  auth, wrap, fail, can, isAdmin, requirePerm, weddingScope, weddingIdsFor, canWedding, audit, notify, emit,
  createSession, verifyPassword, hashPassword, createLink, linkUrl, PERMISSION_KEYS,
} from '../core.ts'
import {
  morningBrief, weddingHealth, findDuplicates, suggestHouseholds, renderTemplate, partyVars, sendMessage, deliver,
  routeInbound, decideApproval, agencyDefaults, weddingOf,
} from '../engines.ts'
import * as engines from '../engines.ts'

export const planner = Router()
const W = Router({ mergeParams: true }) // /weddings/:wid/*

// =====================================================================
// Auth
// =====================================================================
planner.post('/auth/login', wrap(req => {
  const { email, password } = req.body || {}
  const u = get('SELECT * FROM users WHERE lower(email) = lower(?)', email || '')
  if (!u || !verifyPassword(password || '', u.password_hash)) {
    audit(null, 'auth.failed', 'user', u?.id, { email }, false, { kind: 'anonymous', agency_id: u?.agency_id })
    fail(401, 'Incorrect email or password')
  }
  if (u.status === 'invited') fail(403, 'Accept your invitation first — check your email for the invite link')
  if (u.status !== 'active') fail(403, 'This account is suspended. Contact your agency owner.')
  const token = createSession(u.id, get('SELECT security FROM agencies WHERE id = ?', u.agency_id)?.security?.session_hours || 12)
  audit(null, 'auth.login', 'user', u.id, null, true, { kind: u.role, id: u.id, name: u.name, agency_id: u.agency_id })
  return { token }
}))

planner.get('/auth/invite/:token', wrap(req => {
  const u = get('SELECT id, name, email, role, invite_expires, status FROM users WHERE invite_token = ?', req.params.token)
  if (!u) fail(404, 'This invite is invalid or has already been used')
  if (u.invite_expires < now()) fail(410, 'This invite has expired. Ask your agency owner to resend it.')
  return { name: u.name, email: u.email, role: u.role, agency: get('SELECT a.name FROM agencies a JOIN users x ON x.agency_id = a.id WHERE x.id = ?', u.id)?.name }
}))

planner.post('/auth/invite/:token', wrap(req => {
  const u = get('SELECT * FROM users WHERE invite_token = ?', req.params.token)
  if (!u) fail(404, 'This invite is invalid or has already been used')
  if (u.invite_expires < now()) fail(410, 'This invite has expired')
  if (!req.body?.password || req.body.password.length < 8) fail(400, 'Password must be at least 8 characters')
  update('users', u.id, { password_hash: hashPassword(req.body.password), status: 'active', invite_token: null })
  audit(null, 'team.invite_accepted', 'user', u.id, null, true, { kind: u.role, id: u.id, name: u.name, agency_id: u.agency_id })
  return { token: createSession(u.id) }
}))

planner.use(auth)

planner.post('/auth/logout', wrap(req => { run('DELETE FROM sessions WHERE id = ?', (req.headers.authorization || '').slice(7)) }))

planner.get('/auth/me', wrap(req => {
  const u = req.user!
  const agency = get('SELECT id, name, slug, tagline, city, branding FROM agencies WHERE id = ?', u.agency_id)
  const ids = weddingIdsFor(u)
  const weddings = ids.length ? all(`SELECT id, name, couple, start_date, end_date, status, city FROM weddings WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY start_date`, ...ids) : []
  const caps = Object.fromEntries(['settings', 'team', 'proposals', 'portfolio.edit', ...Object.keys(PERMISSION_KEYS)].map(k => [k, can(u, k)]))
  return { user: u, agency, weddings, can: caps, admin: isAdmin(u) }
}))

planner.patch('/auth/me', wrap(req => {
  const { name, phone, password, shift_status, unavailable } = req.body
  const patch: any = { name, phone, shift_status, unavailable }
  if (password) { if (password.length < 8) fail(400, 'Password must be at least 8 characters'); patch.password_hash = hashPassword(password) }
  Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k])
  update('users', req.user!.id, patch)
  return { ok: true }
}))

// =====================================================================
// Agency workspace
// =====================================================================
planner.get('/brief', wrap(req => morningBrief(req.user, weddingIdsFor(req.user!))))

planner.get('/notifications', wrap(req => {
  const ids = weddingIdsFor(req.user!)
  return all(`SELECT * FROM notifications WHERE agency_id = ? AND (user_id IS NULL OR user_id = ?) AND (wedding_id IS NULL OR wedding_id IN (${ids.map(() => '?').join(',') || "''"}))
    ORDER BY created_at DESC LIMIT 60`, req.user!.agency_id, req.user!.id, ...ids)
}))
planner.post('/notifications/read', wrap(req => {
  if (req.body?.id) run('UPDATE notifications SET read = 1 WHERE id = ? AND agency_id = ?', req.body.id, req.user!.agency_id)
  else run('UPDATE notifications SET read = 1 WHERE agency_id = ? AND (user_id IS NULL OR user_id = ?)', req.user!.agency_id, req.user!.id)
}))

// Coordinator "My shift": what this person needs to do now, across only their assigned weddings.
planner.get('/shift', wrap(req => {
  const u = req.user!
  const ids = weddingIdsFor(u)
  const ph = ids.map(() => '?').join(',') || "''"
  const today = localDate()
  const endOfDay = `${today}T23:59:59`
  const weddings = ids.length ? all(`SELECT w.id, w.name, w.couple, w.start_date, w.end_date, w.city, w.venue, w.status, w.live_function_id,
      (SELECT responsibilities FROM wedding_team wt WHERE wt.wedding_id = w.id AND wt.user_id = ?) AS responsibilities
    FROM weddings w WHERE w.id IN (${ph}) AND w.status IN ('planning','live') ORDER BY w.start_date`, u.id, ...ids)
    .map(w => ({ ...w, responsibilities: w.responsibilities || [] })) : []
  const functions = all(`SELECT f.*, w.name AS wedding FROM functions f JOIN weddings w ON w.id = f.wedding_id WHERE f.wedding_id IN (${ph}) AND f.date = ? ORDER BY f.start_time`, ...ids, today)
  const tasks = all(`SELECT t.*, w.name AS wedding FROM tasks t LEFT JOIN weddings w ON w.id = t.wedding_id
    WHERE t.owner_id = ? AND t.status != 'done' AND (t.due_at IS NULL OR t.due_at <= ?) ORDER BY CASE WHEN t.due_at < ? THEN 0 ELSE 1 END, t.due_at LIMIT 20`, u.id, endOfDay, now())
  const later = get(`SELECT COUNT(*) n FROM tasks WHERE owner_id = ? AND status != 'done' AND due_at > ?`, u.id, endOfDay).n
  const incidents = all(`SELECT i.*, w.name AS wedding, f.name AS function_name FROM incidents i JOIN weddings w ON w.id = i.wedding_id LEFT JOIN functions f ON f.id = i.function_id
    WHERE i.wedding_id IN (${ph}) AND i.status != 'resolved' AND (i.owner_id = ? OR i.owner_id IS NULL) ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`, ...ids, u.id)
  const vendors = all(`SELECT va.id, va.wedding_id, va.status, va.live_status, va.delay_min, va.report_at, v.name, v.kind, v.phone, w.name AS wedding FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id JOIN weddings w ON w.id = va.wedding_id
    WHERE va.wedding_id IN (${ph}) AND va.status != 'cancelled' AND (va.live_status = 'delayed' OR (va.status = 'pending' AND va.report_at <= ?)) ORDER BY va.report_at`, ...ids, new Date(Date.now() + 3 * 864e5).toISOString())
  const inbox = get(`SELECT COUNT(*) n FROM messages WHERE wedding_id IN (${ph}) AND direction = 'in' AND handled = 0 AND (assigned_to = ? OR assigned_to IS NULL)`, ...ids, u.id).n
  const nextEvent = get(`SELECT e.*, w.name AS wedding FROM events e LEFT JOIN weddings w ON w.id = e.wedding_id WHERE e.owner_id = ? AND e.start_at > ? ORDER BY e.start_at LIMIT 1`, u.id, now())

  let now_: any = null
  const live = weddings.find(w => w.status === 'live' && w.live_function_id)
  if (live) {
    const f = get('SELECT * FROM functions WHERE id = ?', live.live_function_id)
    const expected = get(`SELECT COALESCE(SUM(headcount),0) n FROM rsvps WHERE function_id = ? AND status = 'attending'`, f.id).n
    const arrived = get(`SELECT COALESCE(SUM(r.headcount),0) n FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE r.function_id = ? AND r.status = 'attending' AND g.checked_in = 1`, f.id).n
    now_ = { kind: 'live', wedding_id: live.id, wedding: live.name, function: f.name, venue: f.venue, end_time: f.end_time, arrived, expected, incidents: incidents.filter(i => i.wedding_id === live.id).length }
  } else if (tasks.find(t => t.due_at && t.due_at < now())) {
    const t = tasks.find(t => t.due_at && t.due_at < now())
    now_ = { kind: 'overdue', task: t }
  } else {
    const nextFn = functions.find(f => (f.start_time || '00:00') >= new Date().toTimeString().slice(0, 5))
    const fnAt = nextFn ? new Date(`${nextFn.date}T${nextFn.start_time || '00:00'}`).toISOString() : null
    if (nextEvent && (!fnAt || nextEvent.start_at < fnAt)) now_ = { kind: 'event', title: nextEvent.title, at: nextEvent.start_at, where: nextEvent.location, wedding: nextEvent.wedding }
    else if (nextFn) now_ = { kind: 'function', title: nextFn.name, at: fnAt, where: nextFn.venue, wedding: nextFn.wedding, wedding_id: nextFn.wedding_id }
    else if (weddings[0]) now_ = { kind: 'countdown', wedding: weddings[0].name, wedding_id: weddings[0].id, date: weddings[0].start_date, venue: weddings[0].venue }
  }
  return { user: { name: u.name }, today, now: now_, weddings, functions, tasks, later_tasks: later, incidents, vendors, inbox }
}))

planner.get('/search', wrap(req => {
  const q = `%${String(req.query.q || '').trim()}%`
  if (q.length < 4) return []
  const ids = weddingIdsFor(req.user!)
  const ph = ids.map(() => '?').join(',') || "''"
  return [
    ...all(`SELECT id, name AS title, couple AS sub, 'wedding' AS kind, id AS wedding_id FROM weddings WHERE id IN (${ph}) AND (name LIKE ? OR couple LIKE ?) LIMIT 5`, ...ids, q, q),
    ...all(`SELECT g.id, g.name AS title, w.name AS sub, 'guest' AS kind, g.wedding_id FROM guests g JOIN weddings w ON w.id = g.wedding_id WHERE g.wedding_id IN (${ph}) AND (g.name LIKE ? OR g.phone LIKE ?) LIMIT 8`, ...ids, q, q),
    ...all(`SELECT id, name AS title, kind AS sub, 'vendor' AS kind, NULL AS wedding_id FROM vendors WHERE agency_id = ? AND name LIKE ? LIMIT 5`, req.user!.agency_id, q),
    ...all(`SELECT id, name AS title, category AS sub, 'document' AS kind, wedding_id FROM documents WHERE agency_id = ? AND (wedding_id IS NULL OR wedding_id IN (${ph})) AND (name LIKE ? OR text LIKE ?) LIMIT 5`, req.user!.agency_id, ...ids, q, q),
  ]
}))

// =====================================================================
// Weddings
// =====================================================================
planner.get('/weddings', wrap(req => {
  const ids = weddingIdsFor(req.user!)
  if (!ids.length) return []
  return all(`SELECT w.*, (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id) AS guest_count FROM weddings w WHERE w.id IN (${ids.map(() => '?').join(',')}) ORDER BY w.start_date`, ...ids)
    .map(w => { const h = weddingHealth(w.id)!; return { ...w, score: h.score, days_out: h.days_out, critical: h.queue.filter(i => i.severity === 'critical').length, top: h.queue[0] || null } })
}))

function validateWedding(b: any, agencyId: string, excludeId?: string) {
  const errors: string[] = [], conflicts: { kind: string; message: string }[] = []
  if (!b.name?.trim()) errors.push('Wedding name is required')
  if (!b.start_date) errors.push('Start date is required')
  if (b.end_date && b.start_date && b.end_date < b.start_date) errors.push('End date is before start date')
  for (const f of b.functions || []) {
    if (!f.name) errors.push('Every function needs a name')
    if (f.date && b.start_date && (f.date < b.start_date || (b.end_date && f.date > b.end_date))) errors.push(`${f.name} (${f.date}) falls outside the wedding dates`)
  }
  for (const h of b.hosts || []) if (h.phone && !/^\+?\d{10,15}$/.test(h.phone.replace(/[\s-]/g, ''))) errors.push(`Host ${h.name}: phone number looks invalid`)
  if (b.start_date) {
    const end = b.end_date || b.start_date
    const overlapping = all(`SELECT * FROM weddings WHERE agency_id = ? AND id != ? AND status != 'archived' AND start_date <= ? AND COALESCE(end_date, start_date) >= ?`, agencyId, excludeId || '', end, b.start_date)
    for (const uidv of b.team || []) {
      const u = get('SELECT name, unavailable FROM users WHERE id = ?', uidv)
      if ((u?.unavailable || []).some((r: any) => r.from <= end && r.to >= b.start_date)) conflicts.push({ kind: 'team', message: `${u.name} is marked unavailable during these dates` })
      for (const w of overlapping) if (get('SELECT 1 FROM wedding_team WHERE wedding_id = ? AND user_id = ?', w.id, uidv)) conflicts.push({ kind: 'team', message: `${u?.name} is already on ${w.name} (${w.start_date})` })
    }
    for (const w of overlapping) if (b.venue && w.venue && w.venue.toLowerCase() === b.venue.toLowerCase()) conflicts.push({ kind: 'venue', message: `${w.venue} is already booked for ${w.name}` })
  }
  return { errors, conflicts }
}

planner.post('/weddings', requirePerm('createWedding'), wrap(req => {
  const u = req.user!, b = req.body
  // Pre-fill from source (template / clone / proposal) before validation
  if (b.method === 'clone' && b.clone_from) {
    if (!canWedding(u, b.clone_from)) fail(403, 'Cannot clone a wedding you cannot access')
    const src = weddingOf(b.clone_from), copy: string[] = b.copy || []
    if (copy.includes('functions') && !b.functions?.length) b.functions = all('SELECT name, start_time, end_time, venue, dress_code, notes FROM functions WHERE wedding_id = ? ORDER BY sort', src.id)
    if (copy.includes('faq')) b.faq = src.faq
    b._copy = copy; b._src = src.id
  }
  if (b.method === 'proposal' && b.proposal_id) {
    const p = get('SELECT * FROM proposals WHERE id = ? AND agency_id = ?', b.proposal_id, u.agency_id)
    if (!p || p.status !== 'accepted') fail(400, 'Only accepted proposals can be converted')
    const lead = get('SELECT * FROM leads WHERE id = ?', p.lead_id)
    b.name ||= `${lead.name} Wedding`; b.start_date ||= p.wedding_date; b.city ||= p.destination; b.guest_estimate ||= p.guest_count
    b.functions ||= (p.items || []).filter((i: any) => i.kind === 'function').map((i: any) => ({ name: i.name }))
    b.budget_lines ||= (p.items || []).map((i: any) => ({ category: i.kind === 'function' ? i.name : i.category || i.name, label: i.name, planned: i.amount }))
    b.hosts ||= [{ name: lead.name, phone: lead.phone, email: lead.email, relation: 'Client' }]
  }
  const v = validateWedding(b, u.agency_id)
  if (b.dry_run) return v
  if (v.errors.length) fail(422, 'Please fix the highlighted fields', v)
  if (v.conflicts.length && !b.override) fail(409, 'Scheduling conflicts found', v)
  const w = tx(() => {
    const w = insert('weddings', {
      agency_id: u.agency_id, name: b.name.trim(), couple: b.couple, start_date: b.start_date, end_date: b.end_date || b.start_date,
      city: b.city, venue: b.venue, guest_estimate: b.guest_estimate, budget_total: b.budget_total, currency: b.currency || 'INR',
      source: b.method || 'scratch', template: b.template, proposal_id: b.proposal_id, faq: b.faq || [],
      settings: { auto_rsvp_reminders: b.auto_reminders ?? true, whatsapp: b.whatsapp ?? true, email: b.email ?? false, rsvp_frozen: false },
      host_permissions: { budget: !!b.host_budget, guest_edits: !!b.host_guest_edits, room_approval: b.host_room_approval ?? true, media_approval: b.host_media_approval ?? true, calendar: true },
    })
    ;(b.functions || []).forEach((f: any, i: number) => insert('functions', { ...f, id: undefined, wedding_id: w.id, sort: i, date: f.date || b.start_date }))
    for (const h of b.hosts || []) insert('hosts', { ...h, wedding_id: w.id })
    for (const t of b.team || []) insert('wedding_team', { wedding_id: w.id, user_id: t, responsibilities: [] })
    if (!isAdmin(u) && !(b.team || []).includes(u.id)) insert('wedding_team', { wedding_id: w.id, user_id: u.id, responsibilities: ['Lead'] })
    for (const l of b.budget_lines || []) insert('budget_lines', { ...l, wedding_id: w.id })
    if (b._copy?.includes('budget')) for (const l of all('SELECT category, label, planned FROM budget_lines WHERE wedding_id = ?', b._src)) insert('budget_lines', { ...l, wedding_id: w.id })
    if (b._copy?.includes('vendors')) for (const a of all('SELECT vendor_id, role, deliverables, quote FROM vendor_assignments WHERE wedding_id = ?', b._src)) insert('vendor_assignments', { ...a, wedding_id: w.id })
    if (b._copy?.includes('tasks')) for (const t of all('SELECT title, description, priority, checklist, category FROM tasks WHERE wedding_id = ?', b._src)) insert('tasks', { ...t, wedding_id: w.id, status: 'todo' })
    if (b.sop_id) applySop(b.sop_id, w.id)
    if (b.proposal_id) {
      const p = get('SELECT lead_id FROM proposals WHERE id = ?', b.proposal_id)
      update('leads', p.lead_id, { status: 'won', wedding_id: w.id })
    }
    return w
  })
  audit(req, 'wedding.created', 'wedding', w.id, { method: b.method, overrides: v.conflicts.length ? v.conflicts : undefined })
  return w
}))

export function applySop(sopId: string, wid: string, ownerId?: string) {
  const sop = get('SELECT * FROM sops WHERE id = ?', sopId)
  const w = weddingOf(wid)
  const ids: string[] = []
  for (const s of sop?.steps || []) {
    const due = w.start_date ? new Date(Date.parse(w.start_date) - (s.days_before || 0) * 864e5).toISOString().slice(0, 10) + 'T18:00' : null
    ids.push(insert('tasks', { wedding_id: wid, title: s.title, description: s.description, priority: s.priority || 'medium', category: s.category, checklist: (s.checklist || []).map((t: string) => ({ text: t, done: false })), requires_proof: s.requires_proof ? 1 : 0, due_at: due, owner_id: ownerId, sop_id: sopId, depends_on: s.after != null && ids[s.after] ? [ids[s.after]] : [] }).id)
  }
  return ids.length
}

planner.post('/weddings/validate', wrap(req => validateWedding(req.body, req.user!.agency_id, req.body.id)))

planner.use('/weddings/:wid', weddingScope, W)

W.get('/', wrap(req => {
  const wid = req.params.wid
  const w = weddingOf(wid)
  return {
    ...w,
    functions: all('SELECT * FROM functions WHERE wedding_id = ? ORDER BY date, start_time, sort', wid),
    hosts: all('SELECT * FROM hosts WHERE wedding_id = ?', wid).map(h => ({ ...h, link: linkUrl('host', createLink('host', { agency_id: w.agency_id, wedding_id: wid, entity_id: h.id })) })),
    team: all('SELECT u.id, u.name, u.title, u.role, u.phone, u.shift_status, wt.responsibilities FROM wedding_team wt JOIN users u ON u.id = wt.user_id WHERE wt.wedding_id = ?', wid),
    health: weddingHealth(wid),
    counts: {
      guests: get('SELECT COUNT(*) n FROM guests WHERE wedding_id = ?', wid).n,
      attending: get(`SELECT COUNT(DISTINCT guest_id) n FROM rsvps WHERE wedding_id = ? AND status = 'attending'`, wid).n,
      vendors: get('SELECT COUNT(*) n FROM vendor_assignments WHERE wedding_id = ?', wid).n,
      open_tasks: get(`SELECT COUNT(*) n FROM tasks WHERE wedding_id = ? AND status != 'done'`, wid).n,
    },
  }
}))

W.patch('/', wrap(req => {
  const b = req.body
  if (b.start_date || b.end_date) {
    const w = weddingOf(req.params.wid)
    const v = validateWedding({ ...w, ...b, functions: [] }, req.user!.agency_id, w.id)
    if (v.errors.length) fail(422, v.errors[0], v)
  }
  const out = update('weddings', req.params.wid, b)
  audit(req, 'wedding.updated', 'wedding', req.params.wid, Object.keys(b))
  return out
}))

W.post('/archive', wrap(req => {
  const wid = req.params.wid
  const n = (sql: string) => get(sql, wid)?.n || 0
  const blockers = [
    [n(`SELECT COUNT(*) n FROM tasks WHERE wedding_id = ? AND status != 'done'`), 'open task(s)'],
    [n(`SELECT COUNT(*) n FROM incidents WHERE wedding_id = ? AND status != 'resolved'`), 'unresolved incident(s)'],
    [n(`SELECT COUNT(*) n FROM expenses WHERE wedding_id = ? AND payment_status != 'paid'`), 'unpaid expense(s)'],
    [n(`SELECT COUNT(*) n FROM media WHERE wedding_id = ? AND status = 'pending'`), 'media item(s) awaiting approval'],
    [n(`SELECT COUNT(*) n FROM testimonials WHERE wedding_id = ? AND status = 'requested'`), 'pending testimonial(s)'],
  ].filter(([c]) => c).map(([c, l]) => `${c} ${l}`)
  if (blockers.length && !req.body?.force) fail(409, 'Wedding has open items', { blockers })
  update('weddings', wid, { status: req.body?.status || 'completed' })
  audit(req, 'wedding.archived', 'wedding', wid, { blockers })
}))

W.get('/health', wrap(req => weddingHealth(req.params.wid)))

// functions & hosts
W.post('/functions', wrap(req => insert('functions', { ...req.body, wedding_id: req.params.wid })))
W.patch('/functions/:id', wrap(req => update('functions', req.params.id, req.body)))
W.delete('/functions/:id', wrap(req => {
  const used = get(`SELECT COUNT(*) n FROM rsvps WHERE function_id = ? AND status = 'attending'`, req.params.id).n
  if (used && !req.query.force) fail(409, `${used} guest(s) have RSVP'd for this function. Delete anyway?`)
  run('DELETE FROM rsvps WHERE function_id = ?', req.params.id); remove('functions', req.params.id)
  audit(req, 'function.deleted', 'function', req.params.id)
}))
W.post('/hosts', wrap(req => insert('hosts', { ...req.body, wedding_id: req.params.wid })))
W.patch('/hosts/:id', wrap(req => update('hosts', req.params.id, req.body)))
W.delete('/hosts/:id', wrap(req => { remove('hosts', req.params.id); run(`UPDATE links SET revoked = 1 WHERE kind = 'host' AND entity_id = ?`, req.params.id) }))

// team assignment
W.post('/team', requirePerm('team'), wrap(req => {
  const w = weddingOf(req.params.wid)
  const u = get('SELECT * FROM users WHERE id = ? AND agency_id = ?', req.body.user_id, req.user!.agency_id)
  if (!u) fail(404, 'User not found')
  const clash = (u.unavailable || []).filter((r: any) => r.from <= (w.end_date || w.start_date) && r.to >= w.start_date)
  if (clash.length && !req.body.override) fail(409, `${u.name} is unavailable ${clash.map((c: any) => `${c.from}→${c.to}`).join(', ')}`)
  const out = get('SELECT * FROM wedding_team WHERE wedding_id = ? AND user_id = ?', w.id, u.id)
    ? run('UPDATE wedding_team SET responsibilities = ? WHERE wedding_id = ? AND user_id = ?', JSON.stringify(req.body.responsibilities || []), w.id, u.id)
    : insert('wedding_team', { wedding_id: w.id, user_id: u.id, responsibilities: req.body.responsibilities || [] })
  notify({ agency_id: w.agency_id, wedding_id: w.id, user_id: u.id, kind: 'team', title: `You were assigned to ${w.name}`, link: `/w/${w.id}` })
  audit(req, 'team.assigned', 'user', u.id, { wedding: w.id, override: clash.length > 0 })
  return out
}))
W.delete('/team/:uid', requirePerm('team'), wrap(req => run('DELETE FROM wedding_team WHERE wedding_id = ? AND user_id = ?', req.params.wid, req.params.uid)))

// approvals & host requests
W.get('/approvals', wrap(req => all('SELECT * FROM approvals WHERE wedding_id = ? ORDER BY created_at DESC', req.params.wid)))
W.post('/approvals', wrap(req => {
  const a = insert('approvals', { ...req.body, wedding_id: req.params.wid, status: 'pending', approver: req.body.approver || 'host' })
  if (a.approver === 'host') notifyHosts(req.params.wid, `Decision needed: ${a.title}`)
  return a
}))
W.post('/approvals/:id/decide', wrap(req => {
  const ap = get('SELECT * FROM approvals WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  if (!ap) fail(404, 'Approval not found')
  if (ap.approver === 'host' && !isAdmin(req.user!)) fail(403, 'Only the host or an agency admin can decide this')
  const out = decideApproval(ap.id, req.body.status, req.body.comment, { kind: req.user!.role, id: req.user!.id, name: req.user!.name, agency_id: req.user!.agency_id, wedding_id: req.params.wid })
  if (ap.kind === 'automation' && req.body.status === 'approved') engines.executeRun(ap.data.run_id)
  else if (ap.kind === 'automation') run(`UPDATE automation_runs SET status = 'rejected' WHERE id = ?`, ap.data?.run_id)
  return out
}))

W.get('/requests', wrap(req => all('SELECT * FROM requests WHERE wedding_id = ? ORDER BY created_at DESC', req.params.wid)))
W.patch('/requests/:id', wrap(req => {
  const r = update('requests', req.params.id, req.body)
  if (req.body.response && r.from_kind === 'host') sendMessage({ agency_id: req.user!.agency_id, wedding_id: req.params.wid, party_kind: 'host', party_id: r.from_id, body: `Update on "${r.title}": ${req.body.response}` })
  return r
}))

export function notifyHosts(wid: string, title: string) {
  const w = weddingOf(wid)
  for (const h of all('SELECT * FROM hosts WHERE wedding_id = ?', wid)) {
    const link = linkUrl('host', createLink('host', { agency_id: w.agency_id, wedding_id: wid, entity_id: h.id }))
    sendMessage({ agency_id: w.agency_id, wedding_id: wid, party_kind: 'host', party_id: h.id, body: `${title}\nReview here: ${link}`, link, dedupe_key: `host:${h.id}:${title}` })
  }
}

// =====================================================================
// Guest operations
// =====================================================================
const guestCode = () => uid().replace(/[-_]/g, 'x').slice(0, 6).toUpperCase()

export function ensureRsvps(wid: string, guestId: string, functionIds: string[] | 'all') {
  const fns = functionIds === 'all' ? all('SELECT id FROM functions WHERE wedding_id = ?', wid).map(f => f.id) : functionIds
  run(`DELETE FROM rsvps WHERE guest_id = ? AND status = 'pending' AND function_id NOT IN (${fns.map(() => '?').join(',') || "''"})`, guestId, ...fns)
  for (const f of fns) if (!get('SELECT 1 FROM rsvps WHERE guest_id = ? AND function_id = ?', guestId, f)) insert('rsvps', { wedding_id: wid, guest_id: guestId, function_id: f, status: 'pending', headcount: 1 })
  run('UPDATE guests SET functions = ? WHERE id = ?', JSON.stringify(fns), guestId)
}

W.get('/guests', wrap(req => {
  const wid = req.params.wid
  const guests = all(`SELECT g.*, h.name AS household, h.side AS household_side,
      (SELECT status FROM travel t WHERE t.guest_id = g.id AND direction = 'arrival') AS travel_status,
      (SELECT r.number || ' · ' || ho.name FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id JOIN hotels ho ON ho.id = r.hotel_id WHERE ra.guest_id = g.id) AS room,
      (SELECT status FROM room_assignments WHERE guest_id = g.id) AS room_status
    FROM guests g LEFT JOIN households h ON h.id = g.household_id WHERE g.wedding_id = ? ORDER BY h.name, g.is_primary DESC, g.name`, wid)
  const rs = all('SELECT guest_id, function_id, status, headcount FROM rsvps WHERE wedding_id = ?', wid)
  const by = new Map<string, any[]>()
  for (const r of rs) by.set(r.guest_id, [...(by.get(r.guest_id) || []), r])
  return guests.map(g => {
    const list = by.get(g.id) || []
    const missing = [!g.phone && g.age_group !== 'child' && 'phone', !list.length && 'functions', g.needs_stay && !g.stay_from && 'stay dates'].filter(Boolean)
    return { ...g, rsvps: list, missing }
  })
}))

W.get('/households', wrap(req => all('SELECT h.*, (SELECT COUNT(*) FROM guests g WHERE g.household_id = h.id) AS members FROM households h WHERE wedding_id = ? ORDER BY name', req.params.wid)))
W.post('/households', wrap(req => insert('households', { ...req.body, wedding_id: req.params.wid })))
W.patch('/households/:id', wrap(req => update('households', req.params.id, req.body)))
W.get('/households/suggest', wrap(req => suggestHouseholds(req.params.wid)))
W.post('/households/apply', wrap(req => tx(() => {
  for (const g of req.body.groups || []) {
    const h = insert('households', { wedding_id: req.params.wid, name: g.name, side: g.side })
    g.guest_ids.forEach((id: string, i: number) => run('UPDATE guests SET household_id = ?, is_primary = ? WHERE id = ? AND wedding_id = ?', h.id, i === 0 ? 1 : 0, id, req.params.wid))
  }
  return { ok: true }
})))

function createGuest(wid: string, b: any, req: any) {
  let household_id = b.household_id
  if (!household_id && b.household) {
    household_id = get('SELECT id FROM households WHERE wedding_id = ? AND lower(name) = lower(?)', wid, b.household)?.id
      || insert('households', { wedding_id: wid, name: b.household, side: b.side }).id
  }
  const g = insert('guests', {
    ...b, id: undefined, wedding_id: wid, household_id, code: guestCode(), vip: b.vip ? 1 : 0, needs_stay: b.needs_stay ? 1 : 0,
    is_primary: household_id ? (get('SELECT COUNT(*) n FROM guests WHERE household_id = ?', household_id).n === 0 ? 1 : 0) : 1,
    phone: b.phone ? String(b.phone).replace(/[\s-]/g, '') : null, tags: b.tags || [],
  })
  ensureRsvps(wid, g.id, b.functions?.length ? b.functions : 'all')
  const w = weddingOf(wid)
  emit('guest.created', { agency_id: w.agency_id, wedding_id: wid, guest_id: g.id, vip: g.vip, side: g.side })
  return g
}

W.post('/guests', wrap(req => {
  const b = req.body
  if (!b.name?.trim()) fail(422, 'Name is required')
  if (b.phone && !/^\+?\d{10,15}$/.test(String(b.phone).replace(/[\s-]/g, ''))) fail(422, 'Phone number looks invalid (10–15 digits, optional +)')
  const w = weddingOf(req.params.wid)
  if (w.settings?.rsvp_frozen && !b.force) fail(409, 'RSVP is frozen — adding a late guest changes final headcounts. Add anyway?', { late: true })
  const dups = findDuplicates(req.params.wid, [{ name: b.name, phone: b.phone, household: b.household }])
  if (dups.length && !b.force) fail(409, 'Possible duplicate guest', { duplicates: dups.map(d => ({ reason: d.reason, existing: d.b })) })
  const g = createGuest(req.params.wid, b, req)
  audit(req, 'guest.created', 'guest', g.id, { late: !!w.settings?.rsvp_frozen })
  return g
}))

W.patch('/guests/:id', wrap(req => {
  const b = { ...req.body }
  if (b.phone) b.phone = String(b.phone).replace(/[\s-]/g, '')
  if (b.functions) { ensureRsvps(req.params.wid, req.params.id, b.functions); delete b.functions }
  const g = update('guests', req.params.id, b)
  audit(req, 'guest.updated', 'guest', g.id, Object.keys(b))
  return g
}))

W.post('/guests/bulk', wrap(req => tx(() => {
  const { ids, patch } = req.body
  for (const id of ids) {
    const p = { ...patch }
    if (p.functions) { ensureRsvps(req.params.wid, id, p.functions); delete p.functions }
    if (p.add_tag) { const g = get('SELECT tags FROM guests WHERE id = ?', id); p.tags = [...new Set([...(g.tags || []), p.add_tag])]; delete p.add_tag }
    if (Object.keys(p).length) update('guests', id, p)
  }
  audit(req, 'guest.bulk_update', 'guest', null, { count: ids.length, fields: Object.keys(patch) })
  return { updated: ids.length }
})))

W.delete('/guests/:id', requirePerm('guestsDelete'), wrap(req => tx(() => {
  const g = get('SELECT * FROM guests WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  if (!g) fail(404, 'Guest not found')
  const responded = get(`SELECT COUNT(*) n FROM rsvps WHERE guest_id = ? AND status != 'pending'`, g.id).n
  for (const t of ['rsvps', 'travel', 'room_assignments']) run(`DELETE FROM ${t} WHERE guest_id = ?`, g.id)
  run(`UPDATE links SET revoked = 1 WHERE kind = 'guest' AND entity_id = ?`, g.id)
  remove('guests', g.id)
  audit(req, 'guest.deleted', 'guest', g.id, { name: g.name, had_rsvp: responded > 0 })
  return { ok: true, had_rsvp: responded > 0 }
})))

W.get('/guests/duplicates', wrap(req => findDuplicates(req.params.wid)))
W.post('/guests/merge', wrap(req => tx(() => {
  const { keep_id, merge_id } = req.body
  const a = get('SELECT * FROM guests WHERE id = ?', keep_id), b = get('SELECT * FROM guests WHERE id = ?', merge_id)
  if (!a || !b || a.wedding_id !== req.params.wid || b.wedding_id !== req.params.wid) fail(404, 'Guests not found')
  update('guests', a.id, { phone: a.phone || b.phone, email: a.email || b.email, household_id: a.household_id || b.household_id, vip: a.vip || b.vip, tags: [...new Set([...(a.tags || []), ...(b.tags || [])])], notes: [a.notes, b.notes].filter(Boolean).join('\n') || null })
  for (const r of all('SELECT * FROM rsvps WHERE guest_id = ?', b.id)) {
    const mine = get('SELECT * FROM rsvps WHERE guest_id = ? AND function_id = ?', a.id, r.function_id)
    if (!mine) run('UPDATE rsvps SET guest_id = ? WHERE id = ?', a.id, r.id)
    else { if (mine.status === 'pending' && r.status !== 'pending') update('rsvps', mine.id, { status: r.status, headcount: r.headcount }); remove('rsvps', r.id) }
  }
  run('UPDATE travel SET guest_id = ? WHERE guest_id = ? AND NOT EXISTS (SELECT 1 FROM travel WHERE guest_id = ?)', a.id, b.id, a.id)
  for (const t of ['travel', 'room_assignments']) run(`DELETE FROM ${t} WHERE guest_id = ?`, b.id)
  run(`UPDATE links SET revoked = 1 WHERE kind = 'guest' AND entity_id = ?`, b.id)
  remove('guests', b.id)
  audit(req, 'guest.merged', 'guest', a.id, { merged: b.name })
  return get('SELECT * FROM guests WHERE id = ?', a.id)
})))

// ---------- CSV / Excel import ----------
const REQUIRED = ['name']
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'full name', 'guest', 'guest name'], phone: ['phone', 'mobile', 'whatsapp', 'contact', 'number', 'phone number'],
  email: ['email', 'e-mail', 'mail'], side: ['side', 'bride/groom', 'family side'], household: ['household', 'family', 'group', 'family name'],
  relation: ['relation', 'relationship'], age_group: ['age', 'age group', 'adult/child'], vip: ['vip'], needs_stay: ['stay', 'needs stay', 'hotel', 'accommodation'],
  accessibility: ['accessibility', 'special needs', 'wheelchair'], functions: ['functions', 'events', 'invited to'], dietary: ['dietary', 'diet', 'food'],
}
W.post('/guests/import/preview', wrap(req => {
  const rows: Record<string, string>[] = req.body.rows || []
  const headers = Object.keys(rows[0] || {})
  const mapping: Record<string, string> = req.body.mapping || Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, al]) => [field, headers.find(h => al.includes(h.trim().toLowerCase())) || '']).filter(([, h]) => h))
  const fns = all('SELECT id, name FROM functions WHERE wedding_id = ?', req.params.wid)
  const mapped = rows.map((r, i) => {
    const o: any = { _row: i + 2 }
    for (const [f, h] of Object.entries(mapping)) if (h) o[f] = (r[h] ?? '').toString().trim()
    const errors: string[] = []
    for (const f of REQUIRED) if (!o[f]) errors.push(`Missing ${f}`)
    if (o.phone) { o.phone = o.phone.replace(/[\s\-()]/g, ''); if (!/^\+?\d{10,15}$/.test(o.phone)) errors.push(`Invalid phone "${o.phone}"`) }
    if (o.email && !/^\S+@\S+\.\S+$/.test(o.email)) errors.push(`Invalid email "${o.email}"`)
    if (o.side) { const s = o.side.toLowerCase(); o.side = s.startsWith('b') ? 'bride' : s.startsWith('g') ? 'groom' : (errors.push(`Unknown side "${o.side}"`), o.side) }
    o.vip = /^(y|yes|true|1|vip)$/i.test(o.vip || '')
    o.needs_stay = /^(y|yes|true|1)$/i.test(o.needs_stay || '')
    if (o.age_group) o.age_group = /child|kid|minor/i.test(o.age_group) ? 'child' : 'adult'
    if (o.functions) {
      const names = o.functions.split(/[,;|]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
      const ids = names.map((n: string) => fns.find(f => f.name.toLowerCase() === n)?.id)
      if (ids.some((x: any) => !x)) errors.push(`Unknown function(s): ${names.filter((_: any, j: number) => !ids[j]).join(', ')}`)
      o.functions = ids.filter(Boolean)
    }
    if (o.dietary) o.dietary = o.dietary.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
    return { ...o, _errors: errors }
  })
  // in-file duplicates
  const seen = new Map<string, number>()
  for (const m of mapped) {
    const k = `${(m.name || '').toLowerCase().replace(/\s/g, '')}:${(m.phone || '').slice(-10)}`
    if (seen.has(k)) m._errors.push(`Duplicate of row ${seen.get(k)} in this file`); else seen.set(k, m._row)
  }
  const dups = findDuplicates(req.params.wid, mapped.filter(m => !m._errors.length))
  return {
    headers, mapping, fields: Object.keys(FIELD_ALIASES), rows: mapped,
    valid: mapped.filter(m => !m._errors.length).length, invalid: mapped.filter(m => m._errors.length).length,
    duplicates: dups.map(d => ({ row: d.a._row, name: d.a.name, existing: { id: d.b.id, name: d.b.name, phone: d.b.phone }, reason: d.reason })),
  }
}))

W.post('/guests/import/commit', wrap(req => tx(() => {
  const { rows, resolutions = {} } = req.body as { rows: any[]; resolutions: Record<string, 'merge' | 'keep' | 'ignore'> }
  let created = 0, merged = 0, skipped = 0
  for (const r of rows) {
    if (r._errors?.length) { skipped++; continue }
    const res = resolutions[r._row]
    if (res === 'ignore') { skipped++; continue }
    if (res === 'merge' && r._dup_id) {
      const e = get('SELECT * FROM guests WHERE id = ?', r._dup_id)
      update('guests', e.id, { phone: e.phone || r.phone, email: e.email || r.email, vip: e.vip || (r.vip ? 1 : 0), needs_stay: e.needs_stay || (r.needs_stay ? 1 : 0) })
      merged++; continue
    }
    createGuest(req.params.wid, r, req); created++
  }
  audit(req, 'guest.imported', 'guest', null, { created, merged, skipped })
  return { created, merged, skipped }
})))

W.post('/guests/copy-from', wrap(req => tx(() => {
  const src = req.body.source_wedding_id
  if (!canWedding(req.user!, src)) fail(403, 'No access to source wedding')
  const ids: string[] | undefined = req.body.guest_ids
  const list = all('SELECT g.*, h.name AS household FROM guests g LEFT JOIN households h ON h.id = g.household_id WHERE g.wedding_id = ?', src).filter(g => !ids || ids.includes(g.id))
  let n = 0
  for (const g of list) {
    if (findDuplicates(req.params.wid, [{ name: g.name, phone: g.phone }]).length) continue
    createGuest(req.params.wid, { name: g.name, phone: g.phone, email: g.email, side: g.side, relation: g.relation, household: g.household, age_group: g.age_group, vip: g.vip, accessibility: g.accessibility, dietary: g.dietary }, req); n++
  }
  return { created: n, skipped: list.length - n }
})))

W.get('/guests/:id/link', wrap(req => {
  const g = get('SELECT * FROM guests WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  return { url: engines.guestLink(g) }
}))

// =====================================================================
// RSVP operations
// =====================================================================
W.get('/rsvp', wrap(req => {
  const wid = req.params.wid
  const fns = all('SELECT * FROM functions WHERE wedding_id = ? ORDER BY date, start_time', wid)
  const by = all(`SELECT function_id, status, COUNT(*) AS n, SUM(CASE WHEN status = 'attending' THEN headcount ELSE 0 END) AS heads FROM rsvps WHERE wedding_id = ? GROUP BY function_id, status`, wid)
  const functions = fns.map(f => {
    const rows = by.filter(b => b.function_id === f.id)
    const c = (s: string) => rows.find(r => r.status === s)?.n || 0
    return { ...f, invited: rows.reduce((s, r) => s + r.n, 0), attending: c('attending'), declined: c('declined'), pending: c('pending'), maybe: c('maybe'), headcount: rows.find(r => r.status === 'attending')?.heads || 0 }
  })
  const list = all(`SELECT g.id, g.name, g.phone, g.vip, g.side, g.household_id, h.name AS household, g.dietary,
      (SELECT MAX(reminders) FROM rsvps r WHERE r.guest_id = g.id) AS reminders,
      (SELECT COUNT(*) FROM messages m WHERE m.party_kind = 'guest' AND m.party_id = g.id AND m.intent = 'rsvp_request') AS requested
    FROM guests g LEFT JOIN households h ON h.id = g.household_id WHERE g.wedding_id = ? ORDER BY h.name, g.name`, wid)
  const rs = all('SELECT * FROM rsvps WHERE wedding_id = ?', wid)
  const guests = list.map(g => ({ ...g, rsvps: Object.fromEntries(rs.filter(r => r.guest_id === g.id).map(r => [r.function_id, { status: r.status, headcount: r.headcount, source: r.source }])) }))
  // household conflict: two members of the same household gave different answers for the same function through different responders
  const conflicts: any[] = []
  const hh = new Map<string, any[]>()
  for (const g of guests) if (g.household_id) hh.set(g.household_id, [...(hh.get(g.household_id) || []), g])
  for (const [, members] of hh) for (const f of fns) {
    const answers = members.map(m => m.rsvps[f.id]).filter(Boolean).filter((r: any) => r.status !== 'pending')
    const responders = new Set(rs.filter(r => r.function_id === f.id && members.some(m => m.id === r.guest_id) && r.status !== 'pending').map(r => r.responded_by))
    if (responders.size > 1 && new Set(answers.map((a: any) => a.status)).size > 1) conflicts.push({ household: members[0].household, function: f.name, function_id: f.id, members: members.map(m => ({ id: m.id, name: m.name, status: m.rsvps[f.id]?.status })) })
  }
  const dietary: Record<string, number> = {}
  for (const g of guests) if (Object.values(g.rsvps).some((r: any) => r.status === 'attending')) for (const d of g.dietary || []) dietary[d] = (dietary[d] || 0) + 1
  return { functions, guests, conflicts, dietary, frozen: !!weddingOf(wid).settings?.rsvp_frozen }
}))

W.post('/rsvp/launch', wrap(req => {
  const wid = req.params.wid, w = weddingOf(wid)
  const body = req.body.body || `Hi {{first_name}} 🌸 You're invited to {{wedding}}! Please confirm which functions you'll attend: {{link}}`
  const targets = all(`SELECT DISTINCT g.* FROM guests g JOIN rsvps r ON r.guest_id = g.id WHERE g.wedding_id = ? AND r.status = 'pending'
    AND (g.household_id IS NULL OR g.is_primary = 1 OR g.phone IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.party_kind = 'guest' AND m.party_id = g.id AND m.intent = 'rsvp_request' AND m.status != 'failed')`, wid)
    .filter(g => req.body.guest_ids ? req.body.guest_ids.includes(g.id) : true)
  let sent = 0, failed = 0
  const c = insert('campaigns', { wedding_id: wid, kind: 'rsvp', name: 'RSVP request', body, status: 'sent', created_by: req.user!.id, audience: { type: 'guests', filter: { rsvp_status: 'pending' } } })
  for (const g of targets) {
    if (!g.phone) continue
    const { text } = renderTemplate(body, partyVars('guest', g.id, w))
    const m = sendMessage({ agency_id: w.agency_id, wedding_id: wid, party_kind: 'guest', party_id: g.id, body: text, intent: 'rsvp_request', campaign_id: c.id, link: engines.guestLink(g) })
    m.status === 'failed' ? failed++ : sent++
  }
  audit(req, 'rsvp.launched', 'campaign', c.id, { sent, failed })
  return { sent, failed, skipped_no_phone: targets.filter(g => !g.phone).length }
}))

W.post('/rsvp/manual', wrap(req => {
  const { guest_id, function_id, status, headcount } = req.body
  const w = weddingOf(req.params.wid)
  if (w.settings?.rsvp_frozen && !req.body.force) fail(409, 'RSVP is frozen. Changing this will alter final headcounts — confirm to proceed.')
  const r = get('SELECT * FROM rsvps WHERE guest_id = ? AND function_id = ?', guest_id, function_id)
  const out = r ? update('rsvps', r.id, { status, headcount: headcount ?? r.headcount, source: 'manual', responded_by: req.user!.id })
    : insert('rsvps', { wedding_id: w.id, guest_id, function_id, status, headcount: headcount ?? 1, source: 'manual', responded_by: req.user!.id })
  emit('rsvp.submitted', { agency_id: w.agency_id, wedding_id: w.id, guest_id, status, source: 'manual' })
  audit(req, 'rsvp.manual', 'rsvp', out.id, { status, after_freeze: !!w.settings?.rsvp_frozen })
  return out
}))

W.post('/rsvp/freeze', wrap(req => {
  const w = weddingOf(req.params.wid)
  update('weddings', w.id, { settings: { ...(w.settings || {}), rsvp_frozen: !!req.body.frozen } })
  audit(req, req.body.frozen ? 'rsvp.frozen' : 'rsvp.unfrozen', 'wedding', w.id)
}))

W.post('/rsvp/walk-in', wrap(req => {
  const g = createGuest(req.params.wid, { ...req.body, tags: ['walk-in'], functions: [req.body.function_id] }, req)
  run(`UPDATE rsvps SET status = 'attending', source = 'walk-in', headcount = ? WHERE guest_id = ?`, req.body.headcount || 1, g.id)
  run('UPDATE guests SET checked_in = 1 WHERE id = ?', g.id)
  audit(req, 'rsvp.walk_in', 'guest', g.id)
  return g
}))

// =====================================================================
// Communication Center
// =====================================================================
planner.get('/templates', wrap(req => all('SELECT * FROM templates WHERE agency_id = ? ORDER BY purpose, name', req.user!.agency_id)))
planner.post('/templates', wrap(req => insert('templates', { ...req.body, agency_id: req.user!.agency_id, variables: [...new Set([...String(req.body.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))] })))
planner.patch('/templates/:id', wrap(req => update('templates', req.params.id, { ...req.body, variables: req.body.body ? [...new Set([...String(req.body.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))] : undefined })))
planner.delete('/templates/:id', wrap(req => run('DELETE FROM templates WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)))

function audience(wid: string, a: any): { kind: string; id: string; name: string }[] {
  if (!a) return []
  if (a.type === 'hosts') return all('SELECT id, name FROM hosts WHERE wedding_id = ?', wid).map(h => ({ kind: 'host', ...h }))
  if (a.type === 'vendors') return all(`SELECT DISTINCT v.id, v.name FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.wedding_id = ? AND va.status != 'cancelled' ${a.filter?.function_id ? 'AND va.function_id = ?' : ''}`, wid, ...(a.filter?.function_id ? [a.filter.function_id] : [])).map(v => ({ kind: 'vendor', ...v }))
  if (a.type === 'direct') return (a.ids || []).map((id: string) => ({ kind: a.party_kind || 'guest', id, name: '' }))
  const f = a.filter || {}
  const where: string[] = ['g.wedding_id = ?'], p: any[] = [wid]
  if (f.side) { where.push('g.side = ?'); p.push(f.side) }
  if (f.vip) where.push('g.vip = 1')
  if (f.needs_stay) where.push('g.needs_stay = 1')
  if (f.tag) { where.push('g.tags LIKE ?'); p.push(`%"${f.tag}"%`) }
  if (f.function_id || f.rsvp_status) {
    where.push(`EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id ${f.function_id ? 'AND r.function_id = ?' : ''} ${f.rsvp_status ? 'AND r.status = ?' : ''})`)
    if (f.function_id) p.push(f.function_id); if (f.rsvp_status) p.push(f.rsvp_status)
  }
  if (f.travel_pending) where.push(`EXISTS (SELECT 1 FROM travel t WHERE t.guest_id = g.id AND t.status = 'pending')`)
  if (f.has_pickup) where.push(`EXISTS (SELECT 1 FROM travel t JOIN trips x ON x.id = t.trip_id WHERE t.guest_id = g.id AND x.status != 'suggested')`)
  if (f.has_room) where.push(`EXISTS (SELECT 1 FROM room_assignments ra WHERE ra.guest_id = g.id AND ra.status IN ('final','checked_in'))`)
  // households receive one message via the primary contact unless the member has their own number
  return all(`SELECT g.id, g.name FROM guests g WHERE ${where.join(' AND ')} AND g.phone IS NOT NULL AND g.phone != ''`, ...p).map(g => ({ kind: 'guest', ...g }))
}

W.post('/comms/preview', wrap(req => {
  const w = weddingOf(req.params.wid)
  const body = req.body.template_id ? get('SELECT body FROM templates WHERE id = ?', req.body.template_id)?.body : req.body.body
  if (!body) fail(422, 'Write a message or choose a template')
  const rec = audience(w.id, req.body.audience)
  const samples = rec.slice(0, 3).map(r => ({ to: r.name, ...renderTemplate(body, partyVars(r.kind, r.id, w)) }))
  const missing = new Set<string>()
  for (const r of rec) for (const m of renderTemplate(body, partyVars(r.kind, r.id, w)).missing) missing.add(m)
  const quiet = agencyDefaults(w.agency_id).quiet_hours
  const hhmm = new Date().toTimeString().slice(0, 5)
  return { recipients: rec.length, samples, missing: [...missing], quiet_hours: hhmm >= quiet.start || hhmm < quiet.end }
}))

W.post('/comms/send', wrap(req => {
  const w = weddingOf(req.params.wid), b = req.body
  if (b.kind === 'broadcast' && !can(req.user!, 'broadcast')) { audit(req, 'permission.denied', 'broadcast', null, null, false); fail(403, 'Your role does not allow broadcasts') }
  const body = b.template_id ? get('SELECT body FROM templates WHERE id = ?', b.template_id)?.body : b.body
  if (!body) fail(422, 'Message body is empty')
  const rec = audience(w.id, b.audience)
  if (!rec.length) fail(422, 'No recipients match this audience (guests need a phone number)')
  const c = insert('campaigns', { wedding_id: w.id, kind: b.kind || 'broadcast', name: b.name || body.slice(0, 40), audience: b.audience, template_id: b.template_id, body, scheduled_at: b.scheduled_at, status: b.scheduled_at ? 'scheduled' : 'sent', steps: b.steps || [], created_by: req.user!.id })
  let sent = 0, failed = 0, dup = 0
  const sendAll = (text: string, at: string | null, step: number) => {
    for (const r of rec) {
      const v = partyVars(r.kind, r.id, w)
      const m = sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: r.kind, party_id: r.id, body: renderTemplate(text, v).text, campaign_id: c.id, scheduled_at: at, link: v.link, dedupe_key: `c:${c.id}:${step}:${r.id}` })
      if (m.duplicate) dup++; else if (m.status === 'failed') failed++; else sent++
    }
  }
  sendAll(body, b.scheduled_at || null, 0)
  ;(b.steps || []).forEach((s: any, i: number) => sendAll(s.body, new Date(Date.parse(b.scheduled_at || now()) + (s.offset_hours || 24) * 3600e3).toISOString(), i + 1))
  audit(req, `comms.${b.kind || 'broadcast'}`, 'campaign', c.id, { recipients: rec.length, sent, failed })
  return { campaign: c, recipients: rec.length, sent, failed, duplicates_skipped: dup }
}))

W.get('/campaigns', wrap(req => all(`SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id) AS total,
  (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('delivered','read')) AS delivered,
  (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status = 'read') AS read,
  (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status = 'failed') AS failed,
  (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status = 'queued') AS queued
  FROM campaigns c WHERE wedding_id = ? ORDER BY created_at DESC`, req.params.wid)))

W.post('/campaigns/:id/cancel', wrap(req => {
  const n = run(`UPDATE messages SET status = 'cancelled' WHERE campaign_id = ? AND status = 'queued'`, req.params.id).changes
  update('campaigns', req.params.id, { status: 'cancelled' })
  return { cancelled: n }
}))

const partyName = `CASE m.party_kind WHEN 'guest' THEN (SELECT name FROM guests WHERE id = m.party_id) WHEN 'vendor' THEN (SELECT name FROM vendors WHERE id = m.party_id)
  WHEN 'host' THEN (SELECT name FROM hosts WHERE id = m.party_id) ELSE m.party_kind END`
W.get('/messages', wrap(req => {
  const tab = req.query.tab
  const where = tab === 'failures' ? `AND m.status = 'failed' AND m.handled = 0` : tab === 'inbox' ? `AND m.direction = 'in'` : ''
  const party = req.query.party_id ? 'AND m.party_id = ?' : ''
  return all(`SELECT m.*, ${partyName} AS party_name FROM messages m WHERE m.wedding_id = ? ${where} ${party} ORDER BY m.created_at DESC LIMIT 300`, req.params.wid, ...(req.query.party_id ? [req.query.party_id] : []))
}))
W.get('/messages/thread/:kind/:id', wrap(req => all(`SELECT m.*, ${partyName} AS party_name FROM messages m WHERE m.wedding_id = ? AND m.party_kind = ? AND m.party_id = ? ORDER BY m.created_at`, req.params.wid, req.params.kind, req.params.id)))
W.post('/messages/:id/retry', wrap(req => {
  const m = get('SELECT * FROM messages WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid)
  if (req.body?.phone) {
    const t = ({ guest: 'guests', vendor: 'vendors', host: 'hosts' } as any)[m.party_kind]
    run(`UPDATE ${t} SET phone = ? WHERE id = ?`, req.body.phone.replace(/[\s-]/g, ''), m.party_id)
    run('UPDATE messages SET phone = ? WHERE id = ?', req.body.phone.replace(/[\s-]/g, ''), m.id)
  }
  run(`UPDATE messages SET status = 'queued' WHERE id = ?`, m.id)
  return deliver(m.id)
}))
W.post('/messages/:id/resolve', wrap(req => { run('UPDATE messages SET handled = 1 WHERE id = ? AND wedding_id = ?', req.params.id, req.params.wid); audit(req, 'message.resolved', 'message', req.params.id, req.body) }))
W.post('/messages/reply', wrap(req => {
  const w = weddingOf(req.params.wid)
  if (req.body.reply_to) run('UPDATE messages SET handled = 1 WHERE id = ?', req.body.reply_to)
  return sendMessage({ agency_id: w.agency_id, wedding_id: w.id, party_kind: req.body.party_kind, party_id: req.body.party_id, body: req.body.body })
}))
W.post('/messages/simulate-inbound', wrap(req => {
  const w = weddingOf(req.params.wid)
  return routeInbound({ agency_id: w.agency_id, wedding_id: w.id, party_kind: req.body.party_kind, party_id: req.body.party_id, body: req.body.body })
}))

export { W as weddingRouter }
