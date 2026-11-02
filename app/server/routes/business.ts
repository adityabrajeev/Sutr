import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { all, get, insert, update, remove, run, tx, now, UPLOAD_DIR } from '../db.ts'
import { wrap, fail, requirePerm, audit, notify, emit, createLink, linkUrl, weddingIdsFor, canWedding, isAdmin, can, PERMISSION_KEYS } from '../core.ts'
import { sendMessage, agencyDefaults, weddingOf, TRIGGERS, ACTIONS, testAutomation, tick, DEFAULTS } from '../engines.ts'
import { planner, notifyHosts } from './planner.ts'
import { upload, storeFile } from './ops.ts'

// =====================================================================
// Proposal builder / Make Your Own Wedding
// =====================================================================
planner.get('/catalogue', wrap(req => all('SELECT * FROM catalogue WHERE agency_id = ? ORDER BY kind, category, name', req.user!.agency_id)))
planner.post('/catalogue', requirePerm('proposals'), wrap(req => insert('catalogue', { ...req.body, agency_id: req.user!.agency_id })))
planner.patch('/catalogue/:id', requirePerm('proposals'), wrap(req => update('catalogue', req.params.id, req.body)))
planner.delete('/catalogue/:id', requirePerm('proposals'), wrap(req => run('UPDATE catalogue SET active = 0 WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)))

/** Price a selection against the catalogue. Shared by the prospect configurator and the planner editor. */
export function priceSelections(agencyId: string, sel: { ids: string[]; guest_count?: number }) {
  const cat = all('SELECT * FROM catalogue WHERE agency_id = ? AND active = 1', agencyId)
  const chosen = cat.filter(c => sel.ids.includes(c.id))
  const nFns = chosen.filter(c => c.kind === 'function').length || 1
  const guests = Math.max(1, +(sel.guest_count || 100))
  const mult = (c: any) => c.pricing === 'per_guest' ? guests : c.pricing === 'per_function' ? nFns : 1
  return chosen.map(c => ({ catalogue_id: c.id, kind: c.kind, category: c.category, name: c.name, pricing: c.pricing, unit: c.price, qty: mult(c), amount: Math.round(c.price * mult(c)), cost: Math.round(c.cost * mult(c)) }))
}
export function totals(items: any[], discount = 0) {
  const subtotal = items.reduce((s, i) => s + i.amount, 0), cost = items.reduce((s, i) => s + (i.cost || 0), 0)
  const total = Math.round(subtotal * (1 - (discount || 0) / 100))
  return { subtotal, cost, total, margin_pct: total ? Math.round((1 - cost / total) * 100) : 0 }
}

planner.get('/leads', requirePerm('proposals'), wrap(req => all(`SELECT l.*, p.id AS proposal_id, p.version, p.status AS proposal_status, p.total, p.expires_at FROM leads l
  LEFT JOIN proposals p ON p.id = (SELECT id FROM proposals WHERE lead_id = l.id ORDER BY version DESC LIMIT 1) WHERE l.agency_id = ? ORDER BY l.updated_at DESC`, req.user!.agency_id)))
planner.post('/leads', requirePerm('proposals'), wrap(req => {
  const b = req.body
  if (!b.name) fail(422, 'Prospect name is required')
  const l = insert('leads', { ...b, agency_id: req.user!.agency_id, status: 'new', source: b.source || 'manual' })
  insert('proposals', { agency_id: l.agency_id, lead_id: l.id, version: 1, status: 'configuring', guest_count: b.guest_count, destination: b.destination, wedding_date: b.wedding_date, selections: { ids: [] }, items: [] })
  audit(req, 'lead.created', 'lead', l.id)
  return l
}))
planner.get('/leads/:id', requirePerm('proposals'), wrap(req => {
  const l = get('SELECT * FROM leads WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (!l) fail(404, 'Lead not found')
  const proposals = all('SELECT * FROM proposals WHERE lead_id = ? ORDER BY version DESC', l.id).map(p => ({ ...p, ...totals(p.items || [], p.discount) }))
  return { ...l, proposals, link: linkUrl('prospect', createLink('prospect', { agency_id: l.agency_id, entity_id: l.id })) }
}))
planner.patch('/leads/:id', requirePerm('proposals'), wrap(req => { audit(req, 'lead.updated', 'lead', req.params.id, req.body); return update('leads', req.params.id, req.body) }))
planner.post('/leads/:id/send-link', requirePerm('proposals'), wrap(req => {
  const l = get('SELECT * FROM leads WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  const ag = get('SELECT name FROM agencies WHERE id = ?', l.agency_id)
  const link = linkUrl('prospect', createLink('prospect', { agency_id: l.agency_id, entity_id: l.id }))
  return sendMessage({ agency_id: l.agency_id, party_kind: 'lead', party_id: l.id, link, body: `Hi ${l.name.split(' ')[0]}! ${ag.name} here 💐 Design your celebration — pick functions, services and add-ons, and see an instant estimate: ${link}` })
}))
planner.patch('/proposals/:id', requirePerm('proposals'), wrap(req => {
  const p = get('SELECT * FROM proposals WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (!p) fail(404, 'Proposal not found')
  if (['accepted', 'declined'].includes(p.status) && !req.body.force) fail(409, `This proposal is already ${p.status}. Create a new version to change scope.`)
  const b = req.body
  if (b.discount > 15 && req.user!.role !== 'owner') { audit(req, 'permission.denied', 'proposal.discount', p.id, { discount: b.discount }, false); fail(403, 'Discounts above 15% need the agency owner') }
  const items = b.items ?? p.items
  const patch: any = { ...b, items, ...totals(items, b.discount ?? p.discount) }
  delete patch.margin_pct; delete patch.force
  return update('proposals', p.id, patch)
}))
planner.post('/proposals/:id/reprice', requirePerm('proposals'), wrap(req => {
  const p = get('SELECT * FROM proposals WHERE id = ?', req.params.id)
  const items = priceSelections(p.agency_id, { ids: p.selections?.ids || [], guest_count: p.guest_count })
  return update('proposals', p.id, { items, ...totals(items, p.discount) })
}))
planner.post('/proposals/:id/send', requirePerm('proposals'), wrap(req => {
  const p = get('SELECT * FROM proposals WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (!p.items?.length) fail(422, 'Add at least one line item')
  const out = update('proposals', p.id, { status: 'sent', sent_at: now(), expires_at: new Date(Date.now() + (req.body.valid_days || 14) * 864e5).toISOString() })
  update('leads', p.lead_id, { status: 'proposal_sent' })
  const l = get('SELECT * FROM leads WHERE id = ?', p.lead_id)
  const link = linkUrl('prospect', createLink('prospect', { agency_id: l.agency_id, entity_id: l.id }))
  sendMessage({ agency_id: l.agency_id, party_kind: 'lead', party_id: l.id, link, body: `Your proposal (v${p.version}) is ready ✨ Review, comment or accept here: ${link}` })
  audit(req, 'proposal.sent', 'proposal', p.id, { total: out.total })
  return out
}))
planner.post('/proposals/:id/new-version', requirePerm('proposals'), wrap(req => {
  const p = get('SELECT * FROM proposals WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  const maxV = get('SELECT MAX(version) v FROM proposals WHERE lead_id = ?', p.lead_id).v
  run(`UPDATE proposals SET status = 'superseded' WHERE lead_id = ? AND status IN ('sent','revision_requested','configuring','draft')`, p.lead_id)
  const n = insert('proposals', { ...p, id: undefined, version: maxV + 1, status: 'draft', sent_at: null, decided_at: null, comment: null, created_at: undefined })
  update('leads', p.lead_id, { status: 'revision' })
  return n
}))

// =====================================================================
// Portfolio & testimonials
// =====================================================================
planner.get('/portfolio', wrap(req => {
  const a = req.user!.agency_id
  return {
    case_studies: all('SELECT cs.*, w.name AS wedding, w.couple, w.start_date, w.city FROM case_studies cs LEFT JOIN weddings w ON w.id = cs.wedding_id WHERE cs.agency_id = ? ORDER BY cs.updated_at DESC', a),
    testimonials: all('SELECT t.*, w.name AS wedding FROM testimonials t LEFT JOIN weddings w ON w.id = t.wedding_id WHERE t.agency_id = ? ORDER BY t.created_at DESC', a),
    completed: all(`SELECT w.id, w.name, w.couple, w.start_date, (SELECT COUNT(*) FROM media m WHERE m.wedding_id = w.id AND m.status = 'published') AS media FROM weddings w WHERE agency_id = ? AND status IN ('completed','archived','live') ORDER BY start_date DESC`, a),
    slug: get('SELECT slug FROM agencies WHERE id = ?', a).slug,
  }
}))
planner.get('/portfolio/media/:wid', wrap(req => {
  if (!canWedding(req.user!, req.params.wid)) fail(403, 'Not your wedding')
  return all(`SELECT id, file, mime, function_id FROM media WHERE wedding_id = ? AND status IN ('published','approved') AND album = 'public'`, req.params.wid)
}))
planner.post('/case-studies', requirePerm('portfolio.edit'), wrap(req => insert('case_studies', { ...req.body, agency_id: req.user!.agency_id, status: 'draft', consent: 'not_requested' })))
planner.patch('/case-studies/:id', requirePerm('portfolio.edit'), wrap(req => update('case_studies', req.params.id, req.body)))
planner.delete('/case-studies/:id', requirePerm('portfolio.edit'), wrap(req => run('DELETE FROM case_studies WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)))
planner.post('/case-studies/:id/request-consent', requirePerm('portfolio.edit'), wrap(req => {
  const cs = get('SELECT * FROM case_studies WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (!cs.wedding_id) fail(422, 'Link the case study to a wedding first')
  update('case_studies', cs.id, { consent: 'requested' })
  const ap = insert('approvals', { wedding_id: cs.wedding_id, kind: 'case_study', title: `Feature your wedding in our portfolio?`, description: cs.summary, entity_id: cs.id, data: { media_ids: cs.media_ids, title: cs.title }, approver: 'host' })
  notifyHosts(cs.wedding_id, 'May we feature your wedding in our portfolio? 💛')
  return ap
}))
planner.post('/case-studies/:id/publish', requirePerm('portfolio.edit'), wrap(req => {
  const cs = get('SELECT * FROM case_studies WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (cs.consent !== 'granted' && !req.body.consent_not_required) fail(409, cs.consent === 'declined' ? 'The host declined — keep this private or change the assets' : 'Client consent is required before publishing')
  audit(req, 'portfolio.published', 'case_study', cs.id)
  return update('case_studies', cs.id, { status: req.body.unpublish ? 'draft' : 'published' })
}))
planner.post('/testimonials/request', requirePerm('portfolio.edit'), wrap(req => {
  const w = weddingOf(req.body.wedding_id)
  if (!w || w.agency_id !== req.user!.agency_id) fail(404, 'Wedding not found')
  const t = insert('testimonials', { agency_id: w.agency_id, wedding_id: w.id, case_study_id: req.body.case_study_id, status: 'requested' })
  notifyHosts(w.id, 'We loved planning your wedding — would you share a few words about the experience? 🙏')
  return t
}))
planner.patch('/testimonials/:id', requirePerm('portfolio.edit'), wrap(req => update('testimonials', req.params.id, req.body)))

// =====================================================================
// Analytics
// =====================================================================
planner.get('/analytics', wrap(req => {
  const u = req.user!
  if (!isAdmin(u) && !can(u, 'analytics')) { audit(req, 'permission.denied', 'analytics', null, null, false); fail(403, 'Analytics is not enabled for your role') }
  const all_ = weddingIdsFor(u)
  const ids = req.query.wedding_id ? all_.filter(i => i === req.query.wedding_id) : all_
  if (!ids.length) return { insufficient: true, guidance: 'No weddings in scope yet.' }
  const ph = ids.map(() => '?').join(',')
  const from = String(req.query.from || '2000-01-01'), to = String(req.query.to || '2999-12-31')
  const n = (sql: string, ...p: any[]) => get(sql, ...p)?.n ?? 0
  const rsvp = get(`SELECT COUNT(*) total, SUM(status != 'pending') responded, SUM(status = 'attending') attending, SUM(source = 'whatsapp') via_wa, SUM(reminders > 0 AND status != 'pending') after_reminder FROM rsvps WHERE wedding_id IN (${ph})`, ...ids)
  const msgs = get(`SELECT COUNT(*) total, SUM(status IN ('delivered','read')) delivered, SUM(status = 'read') read, SUM(status = 'failed') failed FROM messages WHERE wedding_id IN (${ph}) AND direction = 'out' AND created_at BETWEEN ? AND ?`, ...ids, from, to + 'T23:59')
  const failReasons = all(`SELECT fail_reason AS reason, COUNT(*) n FROM messages WHERE wedding_id IN (${ph}) AND status = 'failed' GROUP BY fail_reason`, ...ids)
  const inbound = get(`SELECT COUNT(*) total, SUM(intent != 'unclear') auto FROM messages WHERE wedding_id IN (${ph}) AND direction = 'in'`, ...ids)
  const travel = get(`SELECT COUNT(*) total, SUM(status = 'confirmed') confirmed, SUM(review_needed = 1 OR status = 'review') review, AVG(confidence) conf, SUM(delay_min > 0) delayed FROM travel WHERE wedding_id IN (${ph})`, ...ids)
  const vendors = get(`SELECT COUNT(*) total, SUM(status IN ('confirmed','completed')) confirmed, SUM(status = 'cancelled') cancelled, SUM(live_status = 'delayed' OR delay_min > 0) delayed, AVG(delay_min) avg_delay FROM vendor_assignments WHERE wedding_id IN (${ph})`, ...ids)
  const vendorPerf = all(`SELECT v.name, v.kind, v.jobs, v.on_time, CASE WHEN v.jobs > 0 THEN ROUND(100.0 * v.on_time / v.jobs) END AS on_time_pct, v.rating, COUNT(va.id) AS assignments, SUM(va.delay_min > 0) AS delays
    FROM vendors v JOIN vendor_assignments va ON va.vendor_id = v.id WHERE va.wedding_id IN (${ph}) GROUP BY v.id ORDER BY assignments DESC LIMIT 12`, ...ids)
  const tasks = get(`SELECT COUNT(*) total, SUM(status = 'done') done, SUM(status != 'done' AND due_at < ?) overdue, SUM(status = 'blocked') blocked, SUM(escalated = 1) escalated FROM tasks WHERE wedding_id IN (${ph})`, now(), ...ids)
  const byOwner = all(`SELECT u.name, COUNT(*) total, SUM(t.status = 'done') done, SUM(t.status != 'done' AND t.due_at < ?) overdue FROM tasks t JOIN users u ON u.id = t.owner_id WHERE t.wedding_id IN (${ph}) GROUP BY u.id ORDER BY total DESC`, now(), ...ids)
  const budget = all(`SELECT w.id, w.name, (SELECT COALESCE(SUM(planned),0) FROM budget_lines WHERE wedding_id = w.id) AS planned, (SELECT COALESCE(SUM(amount_base),0) FROM expenses WHERE wedding_id = w.id) AS actual FROM weddings w WHERE w.id IN (${ph})`, ...ids)
  const budgetCats = all(`SELECT bl.category, SUM(bl.planned) AS planned, COALESCE(SUM((SELECT SUM(amount_base) FROM expenses e WHERE e.line_id = bl.id)),0) AS actual FROM budget_lines bl WHERE bl.wedding_id IN (${ph}) GROUP BY bl.category ORDER BY planned DESC`, ...ids)
  const incidents = all(`SELECT severity, COUNT(*) n, SUM(status = 'resolved') resolved FROM incidents WHERE wedding_id IN (${ph}) GROUP BY severity`, ...ids)
  const perWedding = ids.map(id => {
    const w = weddingOf(id)
    return { id, name: w.name, start_date: w.start_date, status: w.status, guests: n('SELECT COUNT(*) n FROM guests WHERE wedding_id = ?', id),
      rsvp_rate: Math.round(100 * n(`SELECT COUNT(*) n FROM rsvps WHERE wedding_id = ? AND status != 'pending'`, id) / Math.max(1, n('SELECT COUNT(*) n FROM rsvps WHERE wedding_id = ?', id))),
      task_done: Math.round(100 * n(`SELECT COUNT(*) n FROM tasks WHERE wedding_id = ? AND status = 'done'`, id) / Math.max(1, n('SELECT COUNT(*) n FROM tasks WHERE wedding_id = ?', id))) }
  })
  const daily = all(`SELECT substr(updated_at, 1, 10) AS day, COUNT(*) n FROM rsvps WHERE wedding_id IN (${ph}) AND status != 'pending' GROUP BY day ORDER BY day DESC LIMIT 21`, ...ids).reverse()
  const sales = isAdmin(u) && !req.query.wedding_id ? {
    leads: get(`SELECT COUNT(*) total, SUM(status = 'won') won, SUM(status = 'lost') lost, SUM(status IN ('new','proposal_sent','revision')) open FROM leads WHERE agency_id = ?`, u.agency_id),
    pipeline: get(`SELECT COALESCE(SUM(p.total),0) n FROM proposals p JOIN leads l ON l.id = p.lead_id WHERE l.agency_id = ? AND p.status IN ('sent','revision_requested')`, u.agency_id).n,
    won_value: get(`SELECT COALESCE(SUM(p.total),0) n FROM proposals p WHERE p.agency_id = ? AND p.status = 'accepted'`, u.agency_id).n,
  } : null
  const exceptions: { title: string; module: string; wedding_id?: string }[] = []
  if (msgs.total && msgs.failed / msgs.total > 0.05) exceptions.push({ title: `${Math.round(msgs.failed / msgs.total * 100)}% of messages failed — mostly ${failReasons.sort((a, b) => b.n - a.n)[0]?.reason?.replace('_', ' ')}`, module: 'comms?tab=failures' })
  if (travel.total && travel.review / travel.total > 0.2) exceptions.push({ title: `${travel.review} ticket(s) needed manual review`, module: 'travel?tab=review' })
  if (tasks.overdue) exceptions.push({ title: `${tasks.overdue} overdue task(s)`, module: 'tasks?filter=overdue' })
  for (const b of budget) if (b.planned && b.actual > b.planned * 1.05) exceptions.push({ title: `${b.name} is ${Math.round((b.actual / b.planned - 1) * 100)}% over budget`, module: 'budget', wedding_id: b.id })
  const reliable = (rsvp.total || 0) + (msgs.total || 0) + (tasks.total || 0) >= 10
  return { scope: req.query.wedding_id ? 'wedding' : 'agency', insufficient: !reliable, guidance: reliable ? null : 'Add guests, send RSVPs and create tasks — metrics appear once there are at least 10 operational records.',
    rsvp, msgs, fail_reasons: failReasons, inbound, travel, vendors, vendor_perf: vendorPerf, tasks, by_owner: byOwner, budget, budget_cats: budgetCats, incidents, per_wedding: perWedding, daily, sales, exceptions }
}))

// =====================================================================
// Team management
// =====================================================================
planner.get('/team', wrap(req => ({
  members: all(`SELECT u.id, u.name, u.email, u.phone, u.role, u.title, u.status, u.permissions, u.unavailable, u.shift_status, u.invite_expires, u.created_at,
    (SELECT COUNT(*) FROM wedding_team wt WHERE wt.user_id = u.id) AS weddings,
    (SELECT COUNT(*) FROM tasks t WHERE t.owner_id = u.id AND t.status != 'done') AS open_tasks FROM users u WHERE agency_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'planner' THEN 1 ELSE 2 END, name`, req.user!.agency_id),
  assignments: all(`SELECT wt.*, w.name AS wedding, w.start_date, w.end_date FROM wedding_team wt JOIN weddings w ON w.id = wt.wedding_id WHERE w.agency_id = ? AND w.status != 'archived'`, req.user!.agency_id),
  permission_keys: PERMISSION_KEYS,
})))
planner.post('/team/invite', requirePerm('team'), wrap(req => {
  const b = req.body
  if (!b.email || !/^\S+@\S+\.\S+$/.test(b.email)) fail(422, 'Enter a valid email')
  const existing = get('SELECT * FROM users WHERE lower(email) = lower(?)', b.email)
  if (existing && existing.agency_id !== req.user!.agency_id) fail(409, 'This email belongs to a user in another agency. Multi-agency accounts are not supported yet.')
  if (existing) fail(409, existing.status === 'invited' ? 'Already invited — use Resend' : 'This person is already on your team')
  if (b.role === 'owner') fail(422, 'There can only be one owner')
  const token = crypto.randomBytes(18).toString('base64url')
  const u = insert('users', { agency_id: req.user!.agency_id, name: b.name || b.email.split('@')[0], email: b.email.toLowerCase(), phone: b.phone, role: b.role || 'coordinator', title: b.title, permissions: b.permissions || {}, status: 'invited', invite_token: token, invite_expires: new Date(Date.now() + 7 * 864e5).toISOString() })
  sendMessage({ agency_id: u.agency_id, party_kind: 'user', party_id: u.id, channel: 'email', link: `/invite/${token}`, body: `${req.user!.name} invited you to join ${get('SELECT name FROM agencies WHERE id = ?', u.agency_id).name} on SUTR. Accept: /invite/${token}` })
  audit(req, 'team.invited', 'user', u.id, { role: u.role })
  return { ...u, invite_link: `/invite/${token}` }
}))
planner.post('/team/:id/resend', requirePerm('team'), wrap(req => {
  const token = crypto.randomBytes(18).toString('base64url')
  const u = update('users', req.params.id, { invite_token: token, invite_expires: new Date(Date.now() + 7 * 864e5).toISOString() })
  sendMessage({ agency_id: u.agency_id, party_kind: 'user', party_id: u.id, channel: 'email', body: `Reminder: accept your SUTR invite: /invite/${token}` })
  return { invite_link: `/invite/${token}` }
}))
planner.post('/team/:id/revoke', requirePerm('team'), wrap(req => {
  const u = get('SELECT * FROM users WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (u.status !== 'invited') fail(409, 'Only pending invites can be revoked')
  remove('users', u.id); audit(req, 'team.invite_revoked', 'user', u.id)
}))
planner.patch('/team/:id', wrap(req => {
  const me = req.user!, b = req.body
  const u = get('SELECT * FROM users WHERE id = ? AND agency_id = ?', req.params.id, me.agency_id)
  if (!u) fail(404, 'Member not found')
  const self = u.id === me.id
  if (!self && !can(me, 'team')) { audit(req, 'permission.denied', 'team', u.id, null, false); fail(403, 'Only admins can change other members') }
  if (self && (b.role || b.permissions || b.status) && !isAdmin(me)) fail(403, 'You cannot change your own role or permissions')
  if (u.role === 'owner' && (b.role || b.status) && me.id !== u.id) fail(403, 'The owner account cannot be changed')
  if (b.status === 'deactivated' || b.status === 'suspended') {
    const openTasks = get(`SELECT COUNT(*) n FROM tasks WHERE owner_id = ? AND status != 'done'`, u.id).n
    const weds = get('SELECT COUNT(*) n FROM wedding_team WHERE user_id = ?', u.id).n
    if ((openTasks || weds) && b.status === 'deactivated') {
      if (!b.reassign_to) fail(409, `${u.name} owns ${openTasks} open task(s) on ${weds} wedding(s). Choose who takes over.`, { open_tasks: openTasks, weddings: weds })
      tx(() => {
        run(`UPDATE tasks SET owner_id = ? WHERE owner_id = ? AND status != 'done'`, b.reassign_to, u.id)
        run(`UPDATE incidents SET owner_id = ? WHERE owner_id = ? AND status != 'resolved'`, b.reassign_to, u.id)
        for (const wt of all('SELECT * FROM wedding_team WHERE user_id = ?', u.id)) {
          if (!get('SELECT 1 FROM wedding_team WHERE wedding_id = ? AND user_id = ?', wt.wedding_id, b.reassign_to)) insert('wedding_team', { wedding_id: wt.wedding_id, user_id: b.reassign_to, responsibilities: wt.responsibilities })
          remove('wedding_team', wt.id)
        }
      })
      notify({ agency_id: me.agency_id, user_id: b.reassign_to, kind: 'team', title: `You took over ${u.name}'s work`, body: `${openTasks} task(s), ${weds} wedding(s)` })
    }
    run('DELETE FROM sessions WHERE user_id = ?', u.id)
  }
  const patch: any = { name: b.name, phone: b.phone, title: b.title, role: b.role, permissions: b.permissions, status: b.status, unavailable: b.unavailable, shift_status: b.shift_status }
  Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k])
  const out = update('users', u.id, patch)
  audit(req, 'team.updated', 'user', u.id, Object.keys(patch))
  return { ...out, password_hash: undefined, invite_token: undefined }
}))

// =====================================================================
// Document center
// =====================================================================
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|heic)|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|msword|vnd\.ms-excel|json))$/
planner.get('/documents', wrap(req => {
  const ids = weddingIdsFor(req.user!)
  const where = [`d.agency_id = ?`, `(d.wedding_id IS NULL OR d.wedding_id IN (${ids.map(() => '?').join(',') || "''"}))`, `d.id = (SELECT id FROM documents x WHERE COALESCE(x.parent_id, x.id) = COALESCE(d.parent_id, d.id) ORDER BY version DESC LIMIT 1)`]
  const p: any[] = [req.user!.agency_id, ...ids]
  if (req.query.wedding_id) { where.push('d.wedding_id = ?'); p.push(req.query.wedding_id) }
  if (req.query.category) { where.push('d.category = ?'); p.push(req.query.category) }
  if (req.query.q) { where.push('(d.name LIKE ? OR d.text LIKE ? OR d.tags LIKE ?)'); const q = `%${req.query.q}%`; p.push(q, q, q) }
  return all(`SELECT d.*, w.name AS wedding, u.name AS uploader, (SELECT COUNT(*) FROM documents x WHERE COALESCE(x.parent_id, x.id) = COALESCE(d.parent_id, d.id)) AS versions
    FROM documents d LEFT JOIN weddings w ON w.id = d.wedding_id LEFT JOIN users u ON u.id = d.uploaded_by WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT 300`, ...p).map(d => ({ ...d, text: d.text ? d.text.slice(0, 200) : null }))
}))
planner.post('/documents', requirePerm('documents'), upload.single('file'), wrap(req => {
  const f = req.file
  if (!f) fail(422, 'Choose a file')
  if (!ALLOWED.test(f!.mimetype)) { fs.rmSync(f!.path, { force: true }); fail(415, `Unsupported file type (${f!.mimetype}). Upload PDF, image, Word, Excel, CSV or text.`) }
  if (/\.(exe|bat|cmd|sh|js|msi|scr)$/i.test(f!.originalname)) { fs.rmSync(f!.path, { force: true }); fail(415, 'Executable files are blocked') }
  const b = req.body
  if (b.wedding_id && !canWedding(req.user!, b.wedding_id)) fail(403, 'Not your wedding')
  const s = storeFile(f!)
  if (!s) fail(422, 'File is empty or corrupt')
  const prev = get(`SELECT * FROM documents WHERE agency_id = ? AND name = ? AND wedding_id IS ? AND entity_id IS ? ORDER BY version DESC LIMIT 1`, req.user!.agency_id, s!.original_name, b.wedding_id || null, b.entity_id || null)
  const d = insert('documents', { agency_id: req.user!.agency_id, wedding_id: b.wedding_id || null, entity_kind: b.entity_kind || null, entity_id: b.entity_id || null, category: b.category || 'General', name: s!.original_name, file: s!.file, mime: s!.mime, size: s!.size, text: s!.text, tags: b.tags ? String(b.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [], host_visible: b.host_visible === 'true' || b.host_visible === '1' ? 1 : 0, version: prev ? prev.version + 1 : 1, parent_id: prev ? (prev.parent_id || prev.id) : null, uploaded_by: req.user!.id })
  audit(req, prev ? 'document.new_version' : 'document.uploaded', 'document', d.id, { version: d.version })
  return d
}))
planner.get('/documents/:id/versions', wrap(req => {
  const d = get('SELECT * FROM documents WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  return all('SELECT d.*, u.name AS uploader FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE COALESCE(d.parent_id, d.id) = ? ORDER BY version DESC', d.parent_id || d.id)
}))
planner.patch('/documents/:id', requirePerm('documents'), wrap(req => update('documents', req.params.id, req.body)))
planner.delete('/documents/:id', requirePerm('documents'), wrap(req => {
  const d = get('SELECT * FROM documents WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  if (!d) fail(404, 'Not found')
  for (const v of all('SELECT * FROM documents WHERE COALESCE(parent_id, id) = ?', d.parent_id || d.id)) { if (v.file) fs.rmSync(path.join(UPLOAD_DIR, v.file), { force: true }); remove('documents', v.id) }
  run(`UPDATE links SET revoked = 1 WHERE kind = 'share' AND entity_id = ?`, d.id)
  audit(req, 'document.deleted', 'document', d.id, { name: d.name })
}))
planner.post('/documents/:id/share', requirePerm('documents'), wrap(req => {
  const d = get('SELECT * FROM documents WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  const { recipient_kind, recipient_id, days = 7 } = req.body
  let ok = false
  if (recipient_kind === 'host') ok = !!get('SELECT 1 FROM hosts WHERE id = ? AND wedding_id = ?', recipient_id, d.wedding_id)
  if (recipient_kind === 'vendor') ok = !!get('SELECT 1 FROM vendor_assignments WHERE vendor_id = ? AND wedding_id = ?', recipient_id, d.wedding_id)
  if (recipient_kind === 'guest') ok = d.entity_kind === 'guest' && d.entity_id === recipient_id
  if (!ok) { audit(req, 'document.share_blocked', 'document', d.id, { recipient_kind, recipient_id }, false); fail(403, 'That recipient is not authorized for this document (not on this wedding, or not the file owner)') }
  const token = createLink('share', { agency_id: d.agency_id, wedding_id: d.wedding_id, entity_id: d.id, scope: { recipient_kind, recipient_id }, days })
  const url = linkUrl('share', token)
  sendMessage({ agency_id: d.agency_id, wedding_id: d.wedding_id, party_kind: recipient_kind, party_id: recipient_id, link: url, body: `A document was shared with you: ${d.name} (link expires in ${days} days): ${url}` })
  audit(req, 'document.shared', 'document', d.id, { recipient_kind, days })
  return { url, expires_in_days: days }
}))

// =====================================================================
// Automation hub
// =====================================================================
planner.get('/automations', wrap(req => ({
  rules: all(`SELECT a.*, w.name AS wedding, (SELECT status FROM automation_runs r WHERE r.automation_id = a.id ORDER BY created_at DESC LIMIT 1) AS last_status FROM automations a LEFT JOIN weddings w ON w.id = a.wedding_id WHERE a.agency_id = ? ORDER BY a.enabled DESC, a.name`, req.user!.agency_id),
  runs: all(`SELECT r.*, a.name FROM automation_runs r JOIN automations a ON a.id = r.automation_id WHERE a.agency_id = ? ORDER BY r.created_at DESC LIMIT 80`, req.user!.agency_id),
  triggers: TRIGGERS, actions: ACTIONS, can_edit: can(req.user!, 'automationEdit'),
})))
planner.post('/automations', requirePerm('automationEdit'), wrap(req => insert('automations', { ...req.body, agency_id: req.user!.agency_id, enabled: 0, version: 1 })))
planner.patch('/automations/:id', requirePerm('automationEdit'), wrap(req => {
  const a = get('SELECT * FROM automations WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id)
  const content = ['trigger', 'conditions', 'actions', 'delay_min', 'requires_approval', 'retries'].some(k => k in req.body)
  if (req.body.enabled && !a.enabled) {
    const t = testAutomation({ ...a, ...req.body })
    if (!t.ok) fail(422, 'Fix the configuration before enabling', t)
  }
  const out = update('automations', a.id, { ...req.body, version: content ? a.version + 1 : a.version })
  audit(req, 'automation.updated', 'automation', a.id, { enabled: out.enabled, version: out.version })
  return out
}))
planner.delete('/automations/:id', requirePerm('automationEdit'), wrap(req => { run('DELETE FROM automations WHERE id = ? AND agency_id = ?', req.params.id, req.user!.agency_id); run('DELETE FROM automation_runs WHERE automation_id = ?', req.params.id) }))
planner.post('/automations/test', wrap(req => testAutomation(req.body)))
planner.post('/system/tick', wrap(req => ({ log: tick({ force: !!req.body?.force, agency_id: req.user!.agency_id }) })))

// =====================================================================
// Settings & administration
// =====================================================================
planner.get('/settings', requirePerm('settings'), wrap(req => {
  const a = get('SELECT * FROM agencies WHERE id = ?', req.user!.agency_id)
  return { ...a, defaults: { ...DEFAULTS, ...(a.defaults || {}) }, permission_keys: PERMISSION_KEYS }
}))
planner.patch('/settings', requirePerm('settings'), wrap(req => {
  const a = get('SELECT * FROM agencies WHERE id = ?', req.user!.agency_id)
  const { section, data } = req.body
  const allowed = ['profile', 'branding', 'messaging', 'defaults', 'integrations', 'security']
  if (!allowed.includes(section)) fail(400, 'Unknown section')
  if (section === 'profile') {
    if (data.slug && !/^[a-z0-9-]{3,40}$/.test(data.slug)) fail(422, 'Slug must be 3–40 lowercase letters, numbers or dashes')
    if (data.slug && get('SELECT 1 FROM agencies WHERE slug = ? AND id != ?', data.slug, a.id)) fail(409, 'That URL is taken')
    update('agencies', a.id, { name: data.name, slug: data.slug, tagline: data.tagline, about: data.about, city: data.city })
  } else {
    if (section === 'defaults') {
      if (data.rsvp_reminder_hours !== undefined && !(+data.rsvp_reminder_hours >= 1)) fail(422, 'Reminder interval must be at least 1 hour')
      if (data.budget_variance_pct !== undefined && !(+data.budget_variance_pct >= 0)) fail(422, 'Variance threshold cannot be negative')
    }
    update('agencies', a.id, { [section]: { ...(a[section] || {}), ...data } })
  }
  audit(req, `settings.${section}`, 'agency', a.id, Object.keys(data || {}))
  return get('SELECT * FROM agencies WHERE id = ?', a.id)
}))
planner.post('/settings/integrations/:key/test', requirePerm('settings'), wrap(req => {
  const a = get('SELECT * FROM agencies WHERE id = ?', req.user!.agency_id)
  const cfg = { ...(a.integrations?.[req.params.key] || {}), ...(req.body || {}) }
  const need: Record<string, string[]> = { whatsapp: ['phone_number_id', 'access_token'], email: ['smtp_host', 'from'], google_calendar: ['calendar_id'], storage: ['bucket'] }
  const missing = (need[req.params.key] || []).filter(k => !cfg[k])
  const ok = !missing.length && cfg.status !== 'outage'
  update('agencies', a.id, { integrations: { ...(a.integrations || {}), [req.params.key]: { ...cfg, status: ok ? 'connected' : cfg.status === 'outage' ? 'outage' : 'error', tested_at: now() } } })
  audit(req, 'settings.integration_test', 'integration', req.params.key, { ok })
  if (!ok) fail(422, missing.length ? `Missing: ${missing.join(', ')}` : 'Provider reported an outage — messages will queue and retry')
  return { ok: true }
}))
planner.get('/audit', requirePerm('settings'), wrap(req => {
  const where = ['agency_id = ?'], p: any[] = [req.user!.agency_id]
  if (req.query.wedding_id) { where.push('wedding_id = ?'); p.push(req.query.wedding_id) }
  if (req.query.denied) where.push('allowed = 0')
  if (req.query.q) { where.push('(action LIKE ? OR actor_name LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`) }
  return all(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`, ...p)
}))
planner.get('/settings/export', requirePerm('settings'), wrap(req => {
  const a = req.user!.agency_id
  const ws = all('SELECT id FROM weddings WHERE agency_id = ?', a).map(w => w.id)
  const ph = ws.map(() => '?').join(',') || "''"
  audit(req, 'settings.data_export', 'agency', a)
  return {
    exported_at: now(), agency: get('SELECT id, name, slug, city FROM agencies WHERE id = ?', a),
    weddings: all(`SELECT * FROM weddings WHERE agency_id = ?`, a),
    guests: all(`SELECT * FROM guests WHERE wedding_id IN (${ph})`, ...ws), rsvps: all(`SELECT * FROM rsvps WHERE wedding_id IN (${ph})`, ...ws),
    vendors: all('SELECT * FROM vendors WHERE agency_id = ?', a), tasks: all(`SELECT * FROM tasks WHERE wedding_id IN (${ph})`, ...ws),
    expenses: all(`SELECT * FROM expenses WHERE wedding_id IN (${ph})`, ...ws),
  }
}))
planner.post('/settings/delete-wedding', requirePerm('settings'), wrap(req => {
  const w = weddingOf(req.body.wedding_id)
  if (!w || w.agency_id !== req.user!.agency_id) fail(404, 'Wedding not found')
  if (req.body.confirm !== w.name) fail(422, `Type the wedding name exactly ("${w.name}") to confirm`)
  if (req.user!.role !== 'owner') fail(403, 'Only the agency owner can permanently delete a wedding')
  tx(() => {
    for (const t of ['rsvps', 'travel', 'trips', 'vehicles', 'room_assignments', 'rooms', 'hotels', 'vendor_assignments', 'budget_lines', 'expenses', 'tasks', 'events', 'incidents', 'media', 'approvals', 'requests', 'campaigns', 'messages', 'guests', 'households', 'functions', 'hosts', 'wedding_team', 'notifications'])
      run(`DELETE FROM ${t} WHERE wedding_id = ?`, w.id)
    run('UPDATE links SET revoked = 1 WHERE wedding_id = ?', w.id)
    remove('weddings', w.id)
  })
  audit(req, 'wedding.deleted', 'wedding', w.id, { name: w.name })
}))
