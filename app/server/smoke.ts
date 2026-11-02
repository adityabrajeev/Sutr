// End-to-end API smoke test across every persona. Run against a freshly seeded server:
//   npm run seed && npm run dev:api   (in one terminal)
//   npx tsx server/smoke.ts           (in another)
export {}
const BASE = process.env.SUTR_URL || 'http://127.0.0.1:4000'
const PASSWORD = 'sutr-demo-2026'
let fails = 0, passes = 0

async function call(method: string, path: string, body?: any, token?: string, expect = 200) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j: any = await r.json().catch(() => ({}))
  const ok = Array.isArray(expect) ? expect.includes(r.status) : r.status === expect
  if (ok) passes++
  else { fails++; console.log(`✗ ${method} ${path} → ${r.status} (expected ${expect}) ${j.error || ''}`) }
  return j
}
const step = (s: string) => console.log(`\n— ${s}`)
async function upload(path: string, files: { name: string; type: string; body: string }[], fields: Record<string, string> = {}, token?: string) {
  const fd = new FormData()
  for (const f of files) fd.append(files.length > 1 || path.endsWith('/media') || path.includes('media/upload') ? 'files' : 'file', new Blob([f.body], { type: f.type }), f.name)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  const r = await fetch(BASE + path, { method: 'POST', body: fd, headers: token ? { authorization: `Bearer ${token}` } : {} })
  const j: any = await r.json().catch(() => ({}))
  if (r.ok) passes++; else { fails++; console.log(`✗ upload ${path} → ${r.status} ${j.error}`) }
  return j
}

step('Planner signs in, reads the Morning Brief')
const login = (email: string) => call('POST', '/api/auth/login', { email, password: PASSWORD })
await call('POST', '/api/auth/login', { email: 'ananya@saffronstory.example', password: 'wrong' }, undefined, 401)
const owner = (await login('ananya@saffronstory.example')).token
const me = await call('GET', '/api/auth/me', null, owner)
const brief = await call('GET', '/api/brief', null, owner)
console.log(`  ${brief.summary}`)
const weddings = await call('GET', '/api/weddings', null, owner)
const udaipur = weddings.find((w: any) => w.city === 'Udaipur'), goa = weddings.find((w: any) => w.city === 'Goa'), delhi = weddings.find((w: any) => w.city === 'New Delhi')
const W = (p: string, wid = udaipur.id) => `/api/weddings/${wid}${p}`

step('Create wedding: validation, conflicts, publish')
await call('POST', '/api/weddings', { name: '', start_date: '' }, owner, 422)
const team = await call('GET', '/api/team', null, owner)
const kabir = team.members.find((m: any) => m.name === 'Kabir Singh')
const fortyOne = new Date(Date.now() + 41 * 864e5).toISOString().slice(0, 10)
await call('POST', '/api/weddings', { name: 'Test conflict', start_date: fortyOne, team: [kabir.id], functions: [{ name: 'Wedding', date: fortyOne }] }, owner, 409)
const created = await call('POST', '/api/weddings', { name: 'Smoke Test Wedding', start_date: fortyOne, team: [kabir.id], override: true, functions: [{ name: 'Wedding', date: fortyOne }], hosts: [{ name: 'Test Host', phone: '+919811112222' }], sop_id: (await call('GET', '/api/sops', null, owner))[0].id }, owner)
const w2 = await call('GET', `/api/weddings/${created.id}`, null, owner)
console.log(`  created with ${w2.counts.open_tasks} SOP tasks`)

step('Guest ops: add, duplicate detection, CSV import, households')
const g = await call('POST', W('/guests'), { name: 'Smoke Guest', phone: '+919900011122', side: 'bride', needs_stay: true, vip: true }, owner)
await call('POST', W('/guests'), { name: 'Smoke Guest', phone: '+919900011122' }, owner, 409)
const prev = await call('POST', W('/guests/import/preview'), { rows: [{ Name: 'Import One', Mobile: '9988776655', Side: 'Groom', Family: 'Import Family' }, { Name: 'Bad Phone', Mobile: '12', Side: 'Bride' }, { Name: '', Mobile: '9988776600' }] }, owner)
console.log(`  preview: ${prev.valid} valid / ${prev.invalid} invalid`)
await call('POST', W('/guests/import/commit'), { rows: prev.rows }, owner)
await call('GET', W('/households/suggest'), null, owner)
await call('GET', W('/guests/duplicates'), null, owner)

step('RSVP + comms: launch, preview, broadcast, failure queue, inbound routing')
await call('POST', W('/rsvp/launch'), {}, owner)
const preview = await call('POST', W('/comms/preview'), { audience: { type: 'guests', filter: { vip: true } }, body: 'Hi {{first_name}}, see you at {{wedding}} — {{room}}' }, owner)
console.log(`  preview recipients ${preview.recipients}, missing vars: ${preview.missing.join(',')}`)
await call('POST', W('/comms/send'), { kind: 'broadcast', audience: { type: 'guests', filter: { vip: true } }, body: 'Hi {{first_name}} — boats leave the jetty at 3:45 PM sharp ⛵' }, owner)
const failures = await call('GET', W('/messages?tab=failures'), null, owner)
console.log(`  ${failures.length} failed message(s) in queue`)
if (failures[0]) await call('POST', W(`/messages/${failures[0].id}/retry`), { phone: '+919812345670' }, owner)
const inb = await call('POST', W('/messages/simulate-inbound'), { party_kind: 'guest', party_id: g.id, body: 'Yes we are coming!' }, owner)
console.log(`  inbound → ${inb.intent}: ${inb.action}`)
const rsvp = await call('GET', W('/rsvp'), null, owner)
console.log(`  ${rsvp.functions.map((f: any) => `${f.name} ${f.attending}/${f.invited}`).join(' · ')}`)

step('Guest link: RSVP, ticket OCR, FAQ')
const gl = (await call('GET', W(`/guests/${g.id}/link`), null, owner)).url.split('/').pop()
const gb = await call('GET', `/api/l/g/${gl}`)
await call('POST', `/api/l/g/${gl}/rsvp`, { responses: gb.rsvps.map((r: any) => ({ guest_id: r.guest_id, function_id: r.function_id, status: 'attending', headcount: 2 })), dietary: { [g.id]: ['Jain'] } })
const t = await upload(`/api/l/g/${gl}/travel/ticket`, [{ name: 'boarding.txt', type: 'text/plain', body: 'IndiGo 6E 2134 DEL to UDR 22 Nov 2026 Departs 07:10 Arrives 09:40 2 Adults' }])
console.log(`  OCR confidence ${t.extraction?.confidence} → ${t.travel?.status}`)
const faq = await call('POST', `/api/l/g/${gl}/faq`, { question: 'What should I wear to the sangeet?' })
console.log(`  FAQ: ${faq.answer?.slice(0, 60)}`)
await call('GET', '/api/l/g/not-a-token', null, undefined, 404)

step('Travel: cluster pickups, confirm trip, driver link updates')
const trips = await call('POST', W('/travel/cluster'), {}, owner)
console.log(`  ${trips.length} suggested trip(s)`)
const tv = await call('GET', W('/travel'), null, owner)
const trip = tv.trips.find((x: any) => x.status === 'suggested')
const vehicle = tv.vehicles.find((v: any) => v.capacity >= (trip?.pax || 1) && v.driver_vendor_id)
if (trip && vehicle) {
  await call('PATCH', W(`/trips/${trip.id}`), { status: 'confirmed', vehicle_id: vehicle.id }, owner)
  const dl = (await call('GET', '/api/demo')).weddings.find((x: any) => x.id === udaipur.id)
  const token = (await call('GET', W('/messages'), null, owner)).find((m: any) => m.party_kind === 'vendor' && m.party_id === vehicle.driver_vendor_id && m.link)?.link?.split('/').pop()
  if (token) {
    const vb = await call('GET', `/api/l/v/${token}`)
    const tr = vb.trips[0]
    if (tr) await call('POST', `/api/l/v/${token}/trips/${tr.id}/stop`, { travel_id: tr.stops[0].travel_id, status: 'picked_up' })
  }
  void dl
}

step('Accommodation: suggest, conflicts, host approval, finalize')
const sug = await call('POST', W('/rooms/suggest'), {}, owner)
console.log(`  placed ${sug.placed}, unplaced ${sug.unplaced.length}`)
const rooms = await call('GET', W('/rooms'), null, owner)
console.log(`  conflicts: ${rooms.conflicts.length}`)
const ap = await call('POST', W('/rooms/submit-approval'), { override: true }, owner)
const demo = await call('GET', '/api/demo')
const hostTok = demo.weddings.find((x: any) => x.id === udaipur.id).hosts[0].token
const hb = await call('GET', `/api/l/h/${hostTok}`)
console.log(`  host sees ${hb.approvals.filter((a: any) => a.status === 'pending').length} pending approval(s)`)
await call('POST', `/api/l/h/${hostTok}/approvals/${ap.id}`, { status: 'changes_requested' }, undefined, 422)
await call('POST', `/api/l/h/${hostTok}/approvals/${ap.id}`, { status: 'approved' })
const fin = await call('POST', W('/rooms/finalize'), {}, owner)
console.log(`  finalized ${fin.finalized}, notified ${fin.notified}`)
await call('POST', `/api/l/h/${hostTok}/requests`, { kind: 'concierge', title: 'Extra chairs for elders', body: 'At the Haldi' })

step('Vendors: assign w/ double-booking check, vendor link confirm + delay → incident')
const vendors = await call('GET', '/api/vendors', null, owner)
const dj = vendors.find((v: any) => v.kind === 'DJ')
const va = (await call('GET', W('/vendors'), null, owner)).find((x: any) => x.vendor_id === dj.id)
await call('POST', W('/vendors/assign'), { vendor_id: dj.id, report_at: va.report_at, role: 'Second stage' }, owner, 409)
const vtok = (await call('GET', W('/messages'), null, owner)).find((m: any) => m.party_id === dj.id && m.link)?.link?.split('/').pop()
  || (await call('POST', W(`/vendor-assignments/${va.id}/remind`), {}, owner)).link?.split('/').pop()
await call('POST', `/api/l/v/${vtok}/assignments/${va.id}/status`, { action: 'confirm' })
await call('POST', `/api/l/v/${vtok}/assignments/${va.id}/status`, { action: 'delay', minutes: 45 })
const impact = await call('GET', W(`/vendor-assignments/${va.id}/impact`), null, owner)
console.log(`  delay impact: ${impact.summary}`)

step('Budget: expense, duplicate flag, FX, host decision')
const bud = await call('GET', W('/budget'), null, owner)
const line = bud.lines[0]
await call('POST', W('/budget/expenses'), { line_id: line.id, label: 'Smoke expense', amount: 1000, currency: 'USD' }, owner)
const dupe = await call('POST', W('/budget/expenses'), { line_id: line.id, label: 'Smoke expense', amount: 1000, currency: 'USD' }, owner)
console.log(`  duplicate flagged: ${!!dupe.flagged}`)
await call('POST', W('/budget/expenses'), { amount: -5 }, owner, 422)

step('Calendar + tasks: conflicts, dependencies, proof, escalation')
const cal = await call('GET', `/api/calendar?wedding_id=${udaipur.id}`, null, owner)
console.log(`  ${cal.length} calendar item(s)`)
const ev = await call('POST', '/api/events', { wedding_id: udaipur.id, title: 'Vendor huddle', start_at: new Date(Date.now() + 2 * 864e5).toISOString(), end_at: new Date(Date.now() + 2 * 864e5 + 3600e3).toISOString(), owner_id: kabir.id }, owner)
await call('POST', '/api/events', { wedding_id: udaipur.id, title: 'Overlap', start_at: ev.start_at, end_at: ev.end_at, owner_id: kabir.id }, owner, 409)
const task = await call('POST', '/api/tasks', { wedding_id: udaipur.id, title: 'Proof task', requires_proof: 1, checklist: ['one'] }, owner)
await call('POST', `/api/tasks/${task.id}/action`, { action: 'complete' }, owner, 409)
await call('PATCH', `/api/tasks/${task.id}`, { checklist: [{ text: 'one', done: true }] }, owner)
await call('POST', `/api/tasks/${task.id}/action`, { action: 'complete' }, owner, 422)
await call('POST', `/api/tasks/${task.id}/action`, { action: 'complete', proof: 'photo attached' }, owner)
await call('POST', `/api/tasks/${task.id}/action`, { action: 'approve' }, owner)
const tickLog = await call('POST', '/api/system/tick', { force: true }, owner)
console.log(`  reminder engine: ${tickLog.log.length} action(s)`)

step('Command center: live board, incident lifecycle, advance')
const live = await call('GET', W('/live', goa.id), null, owner)
console.log(`  ${live.current?.name}: ${live.stats.arrived}/${live.stats.expected} arrived · ${live.stats.incidents_open} open incident(s)`)
const inc = await call('POST', W('/incidents', goa.id), { title: 'Generator flicker', severity: 'critical' }, owner)
await call('PATCH', W(`/incidents/${inc.id}`, goa.id), { status: 'resolved' }, owner, 422)
await call('PATCH', W(`/incidents/${inc.id}`, goa.id), { status: 'resolved', resolution: 'Backup generator switched on' }, owner)

step('Media: photographer upload, host per-item approval, publish → guest gallery')
const goaPhoto = (await call('GET', W('/media', goa.id), null, owner)).photographers[0]
const ptok = goaPhoto.upload_link.split('/').pop()
const up = await upload(`/api/l/v/${ptok}/media`, [{ name: 'a.svg', type: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' }, { name: 'bad.txt', type: 'text/plain', body: 'nope' }])
console.log(`  accepted ${up.accepted}, rejected ${up.rejected?.length}`)
const goaHost = demo.weddings.find((x: any) => x.id === goa.id).hosts[0].token
const ghb = await call('GET', `/api/l/h/${goaHost}`)
const mAp = ghb.approvals.find((a: any) => a.kind === 'media' && a.status === 'pending')
await call('POST', `/api/l/h/${goaHost}/approvals/${mAp.id}`, { decisions: Object.fromEntries(mAp.data.media_ids.map((id: string, i: number) => [id, i === 0 ? 'rejected' : 'approved'])), comment: 'Not this one' })
const media = await call('GET', W('/media', goa.id), null, owner)
const approved = media.items.filter((m: any) => m.status === 'approved').map((m: any) => m.id)
const pub = await call('POST', W('/media/publish', goa.id), { ids: approved }, owner)
console.log(`  published ${pub.published}, notified ${pub.notified} guest(s)`)

step('Proposal: prospect configures → planner sends → prospect accepts → convert to wedding')
const lead = await call('POST', '/api/leads', { name: 'Smoke Prospect', phone: '+919876500000', guest_count: 150, destination: 'Udaipur' }, owner)
const ld = await call('GET', `/api/leads/${lead.id}`, null, owner)
const ptoken = ld.link.split('/').pop()
const pb = await call('GET', `/api/l/p/${ptoken}`)
const ids = [pb.catalogue.find((c: any) => c.kind === 'function').id, pb.catalogue.find((c: any) => c.kind === 'service').id, pb.catalogue.find((c: any) => c.kind === 'addon').id]
const conf = await call('POST', `/api/l/p/${ptoken}/configure`, { ids, guest_count: 150, destination: 'Udaipur', wedding_date: fortyOne, submit: true })
console.log(`  estimate ₹${conf.estimate?.total}`)
const prop = (await call('GET', `/api/leads/${lead.id}`, null, owner)).proposals[0]
console.log(`  planner sees margin ${prop.margin_pct}%`)
const priya = (await login('priya@saffronstory.example')).token
await call('PATCH', `/api/proposals/${prop.id}`, { discount: 20 }, priya, 403)
await call('PATCH', `/api/proposals/${prop.id}`, { discount: 20 }, (await login('rohan@saffronstory.example')).token, 403)
await call('POST', `/api/proposals/${prop.id}/send`, {}, owner)
await call('POST', `/api/l/p/${ptoken}/decision`, { decision: 'accept' })
const conv = await call('POST', '/api/weddings', { method: 'proposal', proposal_id: prop.id, override: true }, owner)
console.log(`  converted → ${conv.name}`)

step('Permissions: coordinator scope')
const priyaMe = await call('GET', '/api/auth/me', null, priya)
console.log(`  Priya sees ${priyaMe.weddings.length} wedding(s)`)
await call('GET', W('/', delhi.id), null, priya, 403)
await call('GET', W('/budget'), null, priya, 403)
await call('GET', '/api/settings', null, priya, 403)
await call('GET', '/api/analytics', null, priya)

step('Team, documents, automation, settings, analytics')
const inv = await call('POST', '/api/team/invite', { email: 'new.coord@example.com', name: 'New Coord', role: 'coordinator' }, owner)
await call('GET', `/api/auth/invite/${inv.invite_link.split('/').pop()}`)
await call('POST', `/api/auth/invite/${inv.invite_link.split('/').pop()}`, { password: 'longenough1' })
await call('PATCH', `/api/team/${kabir.id}`, { status: 'deactivated' }, owner, 409)
await upload('/api/documents', [{ name: 'contract.txt', type: 'text/plain', body: 'Contract text v1' }], { wedding_id: udaipur.id, category: 'Contract' }, owner)
const doc2 = await upload('/api/documents', [{ name: 'contract.txt', type: 'text/plain', body: 'Contract text v2' }], { wedding_id: udaipur.id, category: 'Contract' }, owner)
console.log(`  document version ${doc2.version}`)
const docs = await call('GET', `/api/documents?q=contract`, null, owner)
await call('POST', `/api/documents/${doc2.id}/share`, { recipient_kind: 'vendor', recipient_id: vendors.find((v: any) => v.city === 'Goa').id }, owner, 403)
void docs
const autos = await call('GET', '/api/automations', null, owner)
console.log(`  ${autos.rules.length} automations, ${autos.runs.length} runs logged`)
await call('POST', '/api/automations/test', { trigger: 'task.overdue', actions: [{ type: 'create_task' }] }, owner)
await call('POST', '/api/settings/integrations/google_calendar/test', {}, owner, 422)
const an = await call('GET', '/api/analytics', null, owner)
console.log(`  analytics: RSVP ${an.rsvp.responded}/${an.rsvp.total}, delivery ${an.msgs.delivered}/${an.msgs.total}, ${an.exceptions.length} exception(s)`)
await call('GET', '/api/audit?denied=1', null, owner)
await call('GET', '/api/l/public/portfolio/saffron-story')

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
