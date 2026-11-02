import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { all, get, insert, run, update, localDate, UPLOAD_DIR } from './db.ts'
import { hashPassword, createLink } from './core.ts'
import { DEFAULTS } from './engines.ts'

/** Demo password for every seeded staff account. Documented in README.md. */
export const DEMO_PASSWORD = 'sutr-demo-2026'

const day = localDate
const at = (offset: number, time: string) => new Date(`${day(offset)}T${time}:00`).toISOString()
const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString()
let rnd = 7
const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280)
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
let phoneSeq = 0
const phone = () => `+9198${String(20000000 + (phoneSeq++ * 7919) % 79999999).padStart(8, '0')}`

const FIRST = ['Aditi', 'Rahul', 'Sneha', 'Vikram', 'Pooja', 'Karan', 'Nisha', 'Arjun', 'Kavya', 'Rohit', 'Tanvi', 'Siddharth', 'Ira', 'Manish', 'Shreya', 'Aman', 'Diya', 'Neel', 'Ritu', 'Yash', 'Anjali', 'Harsh', 'Meghna', 'Varun', 'Sana', 'Dev', 'Mira', 'Kunal', 'Zara', 'Om']
const LAST_B = ['Kapoor', 'Mehra', 'Bhatia', 'Khanna', 'Sethi', 'Arora', 'Chopra', 'Batra']
const LAST_G = ['Malhotra', 'Iyer', 'Reddy', 'Nair', 'Joshi', 'Desai', 'Shah', 'Verma']
const DIET = ['Vegetarian', 'Jain', 'Vegan', 'Gluten-free', 'No onion/garlic', 'Nut allergy']

function svg(label: string, hue: number, i: number) {
  const name = `seed-${crypto.createHash('md5').update(label + i).digest('hex').slice(0, 12)}.svg`
  const h2 = (hue + 40) % 360
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},62%,58%)"/><stop offset="1" stop-color="hsl(${h2},55%,32%)"/></linearGradient></defs>
<rect width="900" height="600" fill="url(#g)"/>
${Array.from({ length: 9 }, (_, k) => `<circle cx="${(k * 137 + i * 61) % 900}" cy="${(k * 89 + i * 43) % 600}" r="${18 + ((k * 31 + i * 7) % 70)}" fill="hsla(${(hue + k * 12) % 360},90%,85%,0.18)"/>`).join('')}
<text x="48" y="540" font-family="Georgia, serif" font-size="44" fill="rgba(255,255,255,.92)">${label}</text>
<text x="48" y="574" font-family="Arial, sans-serif" font-size="18" letter-spacing="3" fill="rgba(255,255,255,.7)">SUTR SAMPLE · ${String(i + 1).padStart(2, '0')}</text></svg>`
  fs.writeFileSync(path.join(UPLOAD_DIR, name), body)
  return { file: name, size: body.length, hash: crypto.createHash('sha1').update(body).digest('hex') }
}

export function seed() {
  if (get('SELECT 1 FROM agencies')) return false
  const A = insert('agencies', {
    name: 'Saffron Story Weddings', slug: 'saffron-story', city: 'Mumbai', tagline: 'Destination weddings, run like clockwork.',
    about: 'A 12-person planning studio crafting destination weddings across Rajasthan, Goa and Kerala since 2014.',
    branding: { color: '#b4532a', accent: '#e5a43b', logo_text: 'Saffron Story' },
    messaging: { whatsapp_number: '+919820000001', sender_name: 'Saffron Story', email_from: 'hello@saffronstory.example', signature: '— Team Saffron Story' },
    defaults: DEFAULTS, integrations: { whatsapp: { status: 'connected', phone_number_id: 'demo-1029', access_token: 'demo-token' }, email: { status: 'connected', smtp_host: 'smtp.example', from: 'hello@saffronstory.example' } },
    security: { session_hours: 12, require_2fa: false, link_expiry_days: 60 },
  })
  const pw = hashPassword(DEMO_PASSWORD)
  const U = (name: string, email: string, role: string, title: string, permissions = {}, extra: any = {}) =>
    insert('users', { agency_id: A.id, name, email, role, title, permissions, password_hash: pw, status: 'active', phone: phone(), unavailable: [], ...extra })
  const owner = U('Ananya Rao', 'ananya@saffronstory.example', 'owner', 'Founder & Lead Planner')
  const rohan = U('Rohan Mehta', 'rohan@saffronstory.example', 'planner', 'Senior Planner')
  const priya = U('Priya Shah', 'priya@saffronstory.example', 'coordinator', 'Guest Experience Coordinator', { budget: false, documents: true, broadcast: true, analytics: true }, { shift_status: 'on' })
  const kabir = U('Kabir Singh', 'kabir@saffronstory.example', 'coordinator', 'Logistics Coordinator', { documents: true }, { unavailable: [{ from: day(40), to: day(44), reason: 'Leave' }], shift_status: 'on' })
  const neha = U('Neha Pillai', 'neha@saffronstory.example', 'coordinator', 'Vendor Coordinator', { budget: true, documents: true }, {})
  insert('users', { agency_id: A.id, name: 'Farhan Ali', email: 'farhan@saffronstory.example', role: 'coordinator', title: 'Intern', status: 'invited', invite_token: 'demo-invite-farhan', invite_expires: new Date(Date.now() + 5 * 864e5).toISOString(), permissions: {} })

  // ---------- vendors (agency directory) ----------
  const V = (name: string, kind: string, contact: string, city: string, rating: number, jobs: number, on_time: number, ph = phone()) => insert('vendors', { agency_id: A.id, name, kind, contact, phone: ph, city, rating, jobs, on_time })
  const vendors = {
    decor: V('Gulmohar Decor Studio', 'Decorator', 'Sameer', 'Udaipur', 4.7, 22, 20),
    caterer: V('Rasoi Royale Caterers', 'Caterer', 'Chef Bharat', 'Udaipur', 4.6, 31, 27),
    photo: V('Frame & Fable Photography', 'Photographer', 'Leena', 'Mumbai', 4.9, 40, 38),
    video: V('Reel Rituals Films', 'Videographer', 'Ishaan', 'Mumbai', 4.5, 18, 15),
    dj: V('DJ Nitin Beats', 'DJ', 'Nitin', 'Delhi', 4.3, 25, 19),
    mehendi: V('Henna by Hina', 'Mehendi Artist', 'Hina', 'Jaipur', 4.8, 50, 48),
    makeup: V('Glow Studio Makeup', 'Makeup Artist', 'Ritika', 'Udaipur', 4.6, 28, 25),
    pandit: V('Pandit Ramesh Sharma', 'Officiant', 'Ramesh ji', 'Udaipur', 4.9, 60, 59),
    band: V('Dhol Baaje Brass Band', 'Band', 'Lucky', 'Udaipur', 4.1, 20, 14),
    goaDecor: V('Coastal Bloom Events', 'Decorator', 'Anita', 'Goa', 4.5, 15, 13),
    goaCater: V('Sea Salt Kitchen', 'Caterer', 'Chef Rui', 'Goa', 4.4, 19, 17),
    backupDecor: V('Marigold Lane Decor', 'Decorator', 'Tara', 'Udaipur', 4.2, 9, 8),
    d1: V('Suresh Kumar', 'Driver', 'Suresh', 'Udaipur', 4.6, 34, 33),
    d2: V('Imran Khan', 'Driver', 'Imran', 'Udaipur', 4.4, 21, 19),
    d3: V('Joseph Fernandes', 'Driver', 'Joseph', 'Goa', 4.7, 12, 12),
    d4: V('Manoj Yadav', 'Driver', 'Manoj', 'Udaipur', 4.0, 8, 6, '98765'), // invalid number → failure queue demo
  }

  // ---------- catalogue ----------
  const C = (kind: string, name: string, pricing: string, cost: number, price: number, category: string, description: string) => insert('catalogue', { agency_id: A.id, kind, name, pricing, cost, price, category, description })
  ;[
    ['function', 'Haldi', 'fixed', 60000, 95000, 'Functions', 'Morning haldi with floral setup and live dhol'],
    ['function', 'Mehendi', 'fixed', 90000, 145000, 'Functions', 'Afternoon mehendi with artists, lounge seating and chaat counters'],
    ['function', 'Sangeet', 'fixed', 180000, 285000, 'Functions', 'Evening sangeet with stage, choreography coordination and DJ'],
    ['function', 'Wedding Ceremony', 'fixed', 250000, 390000, 'Functions', 'Mandap, baraat and pheras end-to-end'],
    ['function', 'Reception', 'fixed', 200000, 310000, 'Functions', 'Reception with stage, entry and dinner service'],
    ['function', 'Cocktail Night', 'fixed', 120000, 190000, 'Functions', 'Poolside cocktails with live music'],
    ['service', 'Full Planning & Design', 'fixed', 250000, 450000, 'Planning', 'Concept, vendor curation, budgeting and full-team execution'],
    ['service', 'Guest Hospitality Desk', 'per_guest', 450, 900, 'Guests', 'RSVP, WhatsApp concierge and on-ground hospitality'],
    ['service', 'Travel & Pickup Desk', 'per_guest', 600, 1200, 'Logistics', 'Ticket collection, airport pickups and drops'],
    ['service', 'Accommodation Management', 'per_guest', 300, 650, 'Logistics', 'Room blocks, rooming list, check-in desk'],
    ['service', 'Decor Design', 'per_function', 80000, 140000, 'Design', 'Design and styling per function'],
    ['service', 'Wedding Day Command Team', 'per_function', 25000, 45000, 'Execution', 'Dedicated coordinators running the live timeline'],
    ['addon', 'Welcome Hampers', 'per_guest', 900, 1600, 'Add-ons', 'Curated local hampers in each room'],
    ['addon', 'Drone Coverage', 'fixed', 45000, 75000, 'Add-ons', 'Licensed drone pilot for two functions'],
    ['addon', 'Live Band', 'fixed', 120000, 180000, 'Add-ons', '8-piece live band for one function'],
    ['addon', 'Cold Pyro Entry', 'fixed', 35000, 60000, 'Add-ons', 'Cold pyro for couple entry'],
    ['addon', 'Mehendi Artists (×6)', 'fixed', 30000, 54000, 'Add-ons', 'Six artists for 4 hours'],
    ['addon', 'Photo Booth', 'fixed', 28000, 48000, 'Add-ons', 'Instant-print booth with props'],
  ].forEach(r => C(...(r as [string, string, string, number, number, string, string])))

  // ---------- templates ----------
  const T = (name: string, purpose: string, body: string) => insert('templates', { agency_id: A.id, name, purpose, body, variables: [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))] })
  T('RSVP request', 'rsvp', "Hi {{first_name}} 🌸 You're invited to {{wedding}}! Please confirm which functions you'll attend: {{link}}")
  T('RSVP reminder', 'rsvp', 'Hi {{first_name}}, gentle reminder to RSVP for {{wedding}} 🙏 It takes 30 seconds: {{link}}')
  T('Travel request', 'travel', "Hi {{first_name}} ✈️ Please share your travel for {{wedding}} — forward your ticket or open {{link}}. We'll arrange your pickup.")
  T('Room details', 'accommodation', "Hi {{first_name}} 🏨 You're staying at {{hotel}}, room {{room}}. See you soon!")
  T('Pickup confirmation', 'travel', 'Hi {{first_name}}, your pickup is confirmed: {{pickup}}')
  T('Day-of update', 'live', 'Hi {{first_name}} — quick update from {{wedding}}: ')
  T('Thank you', 'closure', 'Thank you for celebrating {{couple}} with us 💛 Photos will be shared here soon: {{link}}')

  // ---------- SOP ----------
  const sop = insert('sops', { agency_id: A.id, name: 'Destination wedding — standard', description: 'Default 45-day run-up for a 3–4 function destination wedding', steps: [
    { title: 'Lock venue contract & room block', days_before: 45, priority: 'high', category: 'venue', requires_proof: true, checklist: ['Signed contract', 'Room block confirmation', 'Deposit receipt'] },
    { title: 'Import guest list & clean duplicates', days_before: 40, category: 'guests', checklist: ['Bride side list', 'Groom side list', 'Households grouped'] },
    { title: 'Launch RSVP', days_before: 35, category: 'rsvp', after: 1 },
    { title: 'Confirm all core vendors', days_before: 30, priority: 'high', category: 'vendors', checklist: ['Decor', 'Catering', 'Photography', 'Music'] },
    { title: 'Collect travel details', days_before: 21, category: 'travel', after: 2 },
    { title: 'Menu tasting with family', days_before: 18, category: 'catering', requires_proof: true },
    { title: 'Generate rooming list & send for host approval', days_before: 14, priority: 'high', category: 'rooms' },
    { title: 'Plan airport pickups', days_before: 7, category: 'travel', after: 4 },
    { title: 'Final run-of-show to all vendors', days_before: 4, priority: 'high', category: 'vendors' },
    { title: 'Welcome hampers in rooms', days_before: 1, category: 'guests', checklist: ['Hampers packed', 'Room list cross-checked'] },
  ] })

  // ---------- automations ----------
  const AU = (name: string, trigger: string, conditions: any[], actions: any[], enabled = 1, extra: any = {}) => insert('automations', { agency_id: A.id, name, trigger, conditions, actions, enabled, version: 1, retries: 2, ...extra })
  AU('Vendor 30+ min late → critical incident', 'vendor.delayed', [{ field: 'minutes', op: 'gt', value: 29 }], [{ type: 'notify_planner', title: 'Critical delay: {{vendor}}', severity: 'critical' }])
  AU('Low-confidence ticket → review task', 'travel.low_confidence', [], [{ type: 'create_task', title: 'Review uploaded ticket', priority: 'medium', owner: 'lead', due_hours: 12 }])
  AU('Vendor no response → follow-up task', 'vendor.no_response', [], [{ type: 'create_task', title: 'Call unresponsive vendor', priority: 'high', owner: 'lead', due_hours: 4 }])
  AU('RSVP received → thank-you message', 'rsvp.submitted', [{ field: 'status', op: 'eq', value: 'attending' }], [{ type: 'send_message', to: 'trigger', body: 'Thank you {{first_name}}! We have your RSVP for {{wedding}} 🎉 Travel details next: {{link}}' }])
  AU('Failed message → fix number task', 'message.failed', [{ field: 'reason', op: 'eq', value: 'invalid_number' }], [{ type: 'create_task', title: 'Fix phone number (message bounced)', owner: 'lead', due_hours: 24 }], 0)
  AU('Proposal accepted → notify owner', 'proposal.accepted', [], [{ type: 'notify_planner', title: 'Proposal won 🎉', severity: 'info' }])
  AU('Host rooming decision → planner alert', 'approval.decided', [{ field: 'kind', op: 'eq', value: 'rooming' }], [{ type: 'notify_planner', title: 'Host responded on rooming ({{status}})' }], 1, { requires_approval: 0 })

  // =====================================================================
  // Wedding builder
  // =====================================================================
  function wedding(o: any) {
    const w = insert('weddings', {
      agency_id: A.id, name: o.name, couple: o.couple, start_date: o.start, end_date: o.end, city: o.city, venue: o.venue, status: o.status,
      guest_estimate: o.guests, budget_total: o.budget, currency: 'INR', source: 'scratch', faq: o.faq,
      settings: { auto_rsvp_reminders: true, whatsapp: true, rsvp_frozen: !!o.frozen },
      host_permissions: { budget: true, guest_edits: true, room_approval: true, media_approval: true, calendar: true },
    })
    const fns = o.functions.map((f: any, i: number) => insert('functions', { ...f, wedding_id: w.id, sort: i }))
    for (const h of o.hosts) insert('hosts', { ...h, wedding_id: w.id, phone: phone() })
    for (const [u, resp] of o.team) insert('wedding_team', { wedding_id: w.id, user_id: u.id, responsibilities: resp })
    return { w, fns }
  }
  function guests(w: any, fns: any[], n: number, opts: { rsvpRate: number; declineRate: number; stayRate: number; invalidPhones?: number }) {
    const made: any[] = []
    let i = 0, invalid = opts.invalidPhones || 0
    while (made.length < n) {
      const side = i % 2 ? 'groom' : 'bride'
      const last = pick(side === 'bride' ? LAST_B : LAST_G)
      const size = 1 + Math.floor(rand() * 4)
      const hh = insert('households', { wedding_id: w.id, name: `${last} Family`, side })
      const vip = rand() < 0.12
      const stays = rand() < opts.stayRate
      const respond = rand() < opts.rsvpRate
      const decline = rand() < opts.declineRate
      for (let k = 0; k < size && made.length < n; k++) {
        const child = k >= 2 && rand() < 0.5
        const g = insert('guests', {
          wedding_id: w.id, household_id: hh.id, name: `${pick(FIRST)} ${last}`, side, relation: k === 0 ? pick(['Uncle', 'Aunt', 'Cousin', 'Friend', 'Colleague', 'Grandparent']) : 'Family',
          phone: child ? null : (k === 0 && invalid-- > 0 ? '98123' : k === 0 || rand() < 0.4 ? phone() : null), age_group: child ? 'child' : 'adult', vip: vip && k === 0 ? 1 : 0,
          accessibility: rand() < 0.04 ? 'Wheelchair access' : null, dietary: rand() < 0.35 ? [pick(DIET)] : [], needs_stay: stays ? 1 : 0,
          stay_from: stays ? day(Math.round((Date.parse(w.start_date) - Date.now()) / 864e5) - 1) : null, stay_to: stays ? w.end_date : null,
          is_primary: k === 0 ? 1 : 0, code: crypto.randomBytes(3).toString('hex').toUpperCase(), tags: vip && k === 0 ? ['VIP'] : [],
        })
        const invited = fns.filter((f, j) => !(j === 0 && side === 'groom' && f.name === 'Haldi') && !(child && f.name === 'Cocktail Night'))
        for (const f of invited) insert('rsvps', {
          wedding_id: w.id, guest_id: g.id, function_id: f.id, status: respond ? (decline ? 'declined' : 'attending') : 'pending', headcount: 1,
          source: respond ? pick(['link', 'link', 'whatsapp', 'manual']) : null, responded_by: respond ? made.find(m => m.household_id === hh.id)?.id || g.id : null,
          reminders: respond ? 0 : Math.floor(rand() * 2), updated_at: respond ? ago(Math.floor(rand() * 300)) : undefined,
        })
        if (k === 0 && g.phone) {
          insert('messages', { agency_id: A.id, wedding_id: w.id, direction: 'out', party_kind: 'guest', party_id: g.id, phone: g.phone, intent: 'rsvp_request', status: g.phone === '98123' ? 'failed' : respond ? 'read' : 'delivered', fail_reason: g.phone === '98123' ? 'invalid_number' : null, body: `Hi ${g.name.split(' ')[0]} 🌸 You're invited to ${w.name}! Please confirm which functions you'll attend.`, created_at: ago(96), sent_at: ago(96) })
        }
        made.push(g)
      }
      i++
    }
    return made
  }

  // ---------- Wedding 1: Udaipur, 10 days out (rich planning state) ----------
  const W1 = wedding({
    name: 'Meera & Aarav · Udaipur', couple: 'Meera Kapoor & Aarav Malhotra', start: day(10), end: day(12), city: 'Udaipur', venue: 'The Leela Palace, Udaipur', status: 'planning', guests: 120, budget: 6500000,
    faq: [
      { q: 'What is the dress code for the Sangeet?', a: 'Indo-western glam — think sequins and jewel tones ✨' },
      { q: 'Is there airport pickup?', a: 'Yes! Share your ticket on this page and we will arrange a pickup from Udaipur (UDR) airport.' },
      { q: 'Can I bring my kids?', a: 'Absolutely — children are welcome at all functions except the Cocktail Night.' },
      { q: 'What is the weather like?', a: 'Pleasant days (26°C) and cool evenings (14°C). Carry a light shawl for the evening functions.' },
    ],
    functions: [
      { name: 'Haldi', date: day(10), start_time: '10:00', end_time: '13:00', venue: 'Lakeside Lawns', address: 'The Leela Palace, Lake Pichola', dress_code: 'Yellow & white', map_url: 'https://maps.google.com/?q=Leela+Palace+Udaipur' },
      { name: 'Mehendi', date: day(10), start_time: '16:00', end_time: '20:00', venue: 'Courtyard', address: 'The Leela Palace', dress_code: 'Greens & florals' },
      { name: 'Sangeet', date: day(11), start_time: '19:30', end_time: '23:59', venue: 'Grand Ballroom', address: 'The Leela Palace', dress_code: 'Indo-western glam' },
      { name: 'Wedding Ceremony', date: day(12), start_time: '17:00', end_time: '21:00', venue: 'Jag Mandir Island', address: 'Lake Pichola (boat from jetty)', dress_code: 'Traditional — pastels' },
      { name: 'Cocktail Night', date: day(12), start_time: '22:00', end_time: '23:59', venue: 'Rooftop Terrace', address: 'The Leela Palace', dress_code: 'Black tie' },
    ],
    hosts: [{ name: 'Sunita Kapoor', relation: "Bride's mother", email: 'sunita.k@example.com' }, { name: 'Vikram Malhotra', relation: "Groom's father", email: 'vikram.m@example.com' }],
    team: [[rohan, ['Lead planner']], [priya, ['Guests & RSVP', 'Hospitality']], [kabir, ['Travel', 'Accommodation']], [neha, ['Vendors']]],
  })
  const g1 = guests(W1.w, W1.fns, 84, { rsvpRate: 0.72, declineRate: 0.12, stayRate: 0.7, invalidPhones: 2 })
  // travel
  const attending1 = g1.filter(g => g.is_primary && get(`SELECT 1 FROM rsvps WHERE guest_id = ? AND status = 'attending'`, g.id))
  const flights = ['6E 2134', 'AI 471', 'UK 617', '6E 5312', 'SG 2931', '6E 6271', 'AI 805', 'QP 1407']
  attending1.forEach((g, i) => {
    const r = i % 7
    if (r === 6) return
    const pax = get(`SELECT COUNT(*) n FROM guests WHERE household_id = ? AND EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = guests.id AND r.status = 'attending')`, g.household_id).n || 1
    if (r === 5) insert('travel', { wedding_id: W1.w.id, guest_id: g.id, status: 'pending', pickup_required: 1, pax, created_at: ago(60) })
    else if (r === 4) insert('travel', { wedding_id: W1.w.id, guest_id: g.id, status: 'review', review_needed: 1, mode: 'flight', number: pick(flights), to_loc: 'UDR', pax, confidence: 0.5, extracted: { confidence: 0.5, raw: 'IndiGo boarding pass (blurry photo)' } })
    else if (r === 3) insert('travel', { wedding_id: W1.w.id, guest_id: g.id, status: 'self', pickup_required: 0, mode: 'car', pax })
    else {
      const slot = [['09:40', 0], ['10:15', 0], ['13:05', 0], ['18:30', 0], ['11:20', -1], ['20:10', -1]][i % 6] as [string, number]
      const f = pick(flights)
      insert('travel', { wedding_id: W1.w.id, guest_id: g.id, status: 'confirmed', mode: 'flight', carrier: { '6E': 'IndiGo', AI: 'Air India', UK: 'Vistara', SG: 'SpiceJet', QP: 'Akasa Air' }[f.slice(0, 2)], number: f, from_loc: pick(['DEL', 'BOM', 'BLR', 'HYD']), to_loc: 'UDR', arrive_at: `${day(10 + slot[1])}T${slot[0]}`, pax, pickup_required: 1, confidence: 1 })
    }
  })
  // vehicles
  insert('vehicles', { wedding_id: W1.w.id, label: 'Innova Crysta #1', kind: 'SUV', capacity: 6, plate: 'RJ27 CA 4410', driver_vendor_id: vendors.d1.id })
  insert('vehicles', { wedding_id: W1.w.id, label: 'Tempo Traveller', kind: 'Tempo Traveller', capacity: 12, plate: 'RJ27 TB 1188', driver_vendor_id: vendors.d2.id })
  insert('vehicles', { wedding_id: W1.w.id, label: 'Dzire Sedan', kind: 'Sedan', capacity: 4, plate: 'RJ27 CD 9021', driver_vendor_id: vendors.d4.id })
  // hotels & rooms
  const h1 = insert('hotels', { wedding_id: W1.w.id, name: 'The Leela Palace', address: 'Lake Pichola, Udaipur', contact: 'Front office +91 294 670 1234', check_in: day(9), check_out: day(13) })
  const h2 = insert('hotels', { wedding_id: W1.w.id, name: 'Trident Udaipur', address: 'Mulla Talai, Udaipur', contact: '+91 294 243 2200', check_in: day(9), check_out: day(13) })
  for (let f = 1; f <= 3; f++) for (let r = 1; r <= 8; r++) insert('rooms', { wedding_id: W1.w.id, hotel_id: h1.id, number: `${f}0${r}`, floor: f, category: r <= 2 ? 'Suite' : r <= 5 ? 'Premier' : 'Deluxe', capacity: r <= 2 ? 3 : 2 + (r % 3 === 0 ? 1 : 0), accessible: f === 1 && r <= 3 ? 1 : 0, available_from: day(9), available_to: day(13) })
  for (let f = 1; f <= 2; f++) for (let r = 1; r <= 8; r++) insert('rooms', { wedding_id: W1.w.id, hotel_id: h2.id, number: `${f}1${r}`, floor: f, category: 'Deluxe', capacity: 3, accessible: f === 1 && r === 1 ? 1 : 0, available_from: day(9), available_to: day(13) })
  // vendors
  const VA = (w: any, v: any, fn: any, role: string, report: string, status: string, deliverables: string[], quote: number, extra: any = {}) =>
    insert('vendor_assignments', { wedding_id: w.id, vendor_id: v.id, function_id: fn?.id, role, report_at: report, report_location: fn?.venue, status, deliverables: deliverables.map(t => ({ text: t, done: false })), quote, confirmed_at: status === 'confirmed' ? ago(48) : null, created_at: ago(status === 'pending' ? 40 : 120), ...extra })
  const [haldi, mehendi, sangeet, ceremony, cocktail] = W1.fns
  VA(W1.w, vendors.decor, sangeet, 'Stage & ballroom decor', at(11, '12:00'), 'confirmed', ['Stage build', 'Floral installs', 'Lighting rig'], 850000)
  VA(W1.w, vendors.decor, ceremony, 'Mandap & island decor', at(12, '09:00'), 'confirmed', ['Mandap', 'Aisle florals', 'Boat jetty styling'], 1200000)
  VA(W1.w, vendors.caterer, sangeet, 'Dinner — 120 pax', at(11, '16:00'), 'confirmed', ['Live counters', 'Jain menu', 'Kids menu'], 780000)
  VA(W1.w, vendors.photo, null, 'Photography — all functions', at(10, '08:30'), 'confirmed', ['Candid team of 3', 'Same-day edit', 'Album 60 sheets'], 650000)
  VA(W1.w, vendors.video, null, 'Cinematic film', at(10, '08:30'), 'pending', ['Teaser in 7 days', 'Film in 45 days'], 420000)
  VA(W1.w, vendors.dj, sangeet, 'DJ & sound', at(11, '17:00'), 'pending', ['Sound check 6 PM', 'Couple entry track'], 180000)
  VA(W1.w, vendors.mehendi, mehendi, 'Bridal + guest mehendi', at(10, '14:00'), 'confirmed', ['Bridal mehendi', '6 guest artists'], 95000)
  VA(W1.w, vendors.pandit, ceremony, 'Pheras', at(12, '16:00'), 'confirmed', ['Samagri list shared'], 51000)
  VA(W1.w, vendors.band, ceremony, 'Baraat band', at(12, '15:30'), 'pending', ['20-piece band', 'Ghodi'], 110000, { reminders: 1, last_reminded_at: ago(30) })
  VA(W1.w, vendors.makeup, ceremony, 'Bridal makeup', at(12, '11:00'), 'confirmed', ['Trial done', 'Family makeup ×4'], 85000)
  // budget
  const BL = (w: any, category: string, label: string, planned: number, vendor?: any) => insert('budget_lines', { wedding_id: w.id, category, label, planned, vendor_id: vendor?.id })
  const lines1 = {
    decor: BL(W1.w, 'Decor', 'Gulmohar Decor (all functions)', 2000000, vendors.decor), food: BL(W1.w, 'Catering', 'Rasoi Royale', 1500000, vendors.caterer),
    venue: BL(W1.w, 'Venue', 'Leela venue hire + room block', 1800000), photo: BL(W1.w, 'Photo & Video', 'Frame & Fable + Reel Rituals', 1000000, vendors.photo),
    music: BL(W1.w, 'Entertainment', 'DJ, band, live acts', 350000), travel: BL(W1.w, 'Transport', 'Pickups & shuttles', 220000), gifts: BL(W1.w, 'Hospitality', 'Hampers & welcome kits', 160000),
  }
  const EX = (w: any, line: any, label: string, amount: number, offset: number, paid = 'paid', vendor?: any, extra: any = {}) => insert('expenses', { wedding_id: w.id, line_id: line.id, label, amount, currency: extra.currency || 'INR', amount_base: extra.base ?? amount, date: day(offset), vendor_id: vendor?.id, payment_status: paid, created_by: rohan.id, ...extra })
  EX(W1.w, lines1.decor, 'Decor advance 50%', 1025000, -30, 'paid', vendors.decor)
  EX(W1.w, lines1.decor, 'Additional florals (family request)', 340000, -6, 'unpaid', vendors.decor)
  EX(W1.w, lines1.decor, 'Jetty lighting upgrade', 760000, -3, 'unpaid', vendors.decor)
  EX(W1.w, lines1.food, 'Catering advance', 700000, -25, 'paid', vendors.caterer)
  EX(W1.w, lines1.venue, 'Venue deposit', 1200000, -60, 'paid')
  EX(W1.w, lines1.photo, 'Photography advance', 325000, -40, 'paid', vendors.photo)
  EX(W1.w, lines1.gifts, 'Hamper boxes (USD import)', 1100, -8, 'paid', undefined, { currency: 'USD', base: 91300 })
  EX(W1.w, lines1.gifts, 'Hamper boxes (USD import)', 1100, -8, 'unpaid', undefined, { currency: 'USD', base: 91300, flagged: 'Possible duplicate of "Hamper boxes (USD import)"' })
  // tasks via SOP + extras
  const sopTasks: string[] = []
  for (const [i, s] of (sop.steps as any[]).entries()) {
    const due = new Date(Date.parse(W1.w.start_date) - s.days_before * 864e5).toISOString().slice(0, 10) + 'T18:00'
    const past = Date.parse(due) < Date.now()
    const owner = [rohan, priya, priya, neha, kabir, rohan, kabir, kabir, neha, priya][i]
    const status = past ? (i === 6 ? 'in_progress' : i === 5 ? 'review' : 'done') : 'todo'
    sopTasks.push(insert('tasks', { wedding_id: W1.w.id, title: s.title, priority: s.priority || 'medium', category: s.category, owner_id: owner.id, due_at: due, status, requires_proof: s.requires_proof ? 1 : 0, proof: status === 'review' ? 'Tasting done — family approved 14 of 16 dishes; photos in Documents' : null, checklist: (s.checklist || []).map((t: string) => ({ text: t, done: status === 'done' })), depends_on: s.after != null && sopTasks[s.after] ? [sopTasks[s.after]] : [], sop_id: sop.id, created_by: rohan.id, completed_at: status === 'done' ? ago(100) : null }).id)
  }
  insert('tasks', { wedding_id: W1.w.id, title: 'Get boat permits for Jag Mandir', priority: 'high', owner_id: kabir.id, due_at: ago(20), status: 'blocked', blocked_reason: 'Lake authority office closed until Monday', category: 'venue', created_by: rohan.id })
  insert('tasks', { wedding_id: W1.w.id, title: 'Confirm Jain menu count with caterer', priority: 'medium', owner_id: neha.id, due_at: ago(5), status: 'in_progress', category: 'catering', created_by: rohan.id })
  insert('tasks', { wedding_id: W1.w.id, title: 'Print welcome signage', priority: 'low', owner_id: priya.id, due_at: at(7, '17:00'), status: 'todo', checklist: [{ text: 'Proof approved', done: false }, { text: 'Print order placed', done: false }], created_by: rohan.id })
  // calendar events
  insert('events', { wedding_id: W1.w.id, agency_id: A.id, title: 'Final walkthrough with venue', kind: 'meeting', start_at: at(8, '11:00'), end_at: at(8, '13:00'), owner_id: rohan.id, location: 'The Leela Palace' })
  insert('events', { wedding_id: W1.w.id, agency_id: A.id, title: 'Family call — rooming review', kind: 'call', start_at: at(2, '18:00'), end_at: at(2, '18:30'), owner_id: kabir.id })
  // comms: a failed + inbound unclear + host message
  const someGuest = g1.find(g => g.phone && g.phone !== '98123')!
  insert('messages', { agency_id: A.id, wedding_id: W1.w.id, direction: 'in', party_kind: 'guest', party_id: someGuest.id, phone: someGuest.phone, body: 'Hi, can my parents stay one extra night after the wedding? Will pay separately', status: 'received', intent: 'unclear', assigned_to: priya.id, created_at: ago(3) })
  insert('messages', { agency_id: A.id, wedding_id: W1.w.id, direction: 'in', party_kind: 'vendor', party_id: vendors.dj.id, body: 'Need the stage dimensions before I confirm', status: 'received', intent: 'unclear', created_at: ago(6) })
  insert('campaigns', { wedding_id: W1.w.id, kind: 'rsvp', name: 'RSVP request', body: 'RSVP request', status: 'sent', created_by: rohan.id, created_at: ago(96), audience: { type: 'guests' } })
  // requests from host
  const host1 = get('SELECT * FROM hosts WHERE wedding_id = ? LIMIT 1', W1.w.id)
  insert('requests', { wedding_id: W1.w.id, kind: 'wishlist', from_kind: 'host', from_id: host1.id, title: 'Shehnai during pheras', body: 'Meera would love live shehnai during the pheras if possible.' })
  insert('requests', { wedding_id: W1.w.id, kind: 'concierge', from_kind: 'host', from_id: host1.id, title: 'Spa slots for elders', body: '3 spa appointments for the grandmothers on the Haldi morning.' })
  // approvals: a budget decision pending
  insert('approvals', { wedding_id: W1.w.id, kind: 'budget', title: 'Decor: approve revised spend', description: 'Jetty lighting upgrade and extra florals take decor to ₹21.25L vs ₹20L planned (+6%).', entity_id: lines1.decor.id, approver: 'host', data: { planned: 2000000, actual: 2125000 } })
  insert('approvals', { wedding_id: W1.w.id, kind: 'decision', title: 'Sangeet entry: cold pyro or floral shower?', description: 'Cold pyro needs venue sign-off (+₹60k). Floral shower is included.', approver: 'host', data: { options: ['Cold pyro', 'Floral shower'] } })
  // docs
  const writeDoc = (w: any, name: string, category: string, text: string, host_visible = 0) => {
    const file = `seed-${crypto.randomBytes(5).toString('hex')}.txt`
    fs.writeFileSync(path.join(UPLOAD_DIR, file), text)
    return insert('documents', { agency_id: A.id, wedding_id: w?.id, name, category, file, mime: 'text/plain', size: text.length, text, uploaded_by: rohan.id, host_visible, tags: [category.toLowerCase()] })
  }
  writeDoc(W1.w, 'Leela venue contract.txt', 'Contract', 'Venue hire agreement between The Leela Palace Udaipur and Saffron Story Weddings. Room block of 40 rooms from check-in to check-out. Cancellation within 30 days forfeits 50% deposit.')
  writeDoc(W1.w, 'Run of show v3.txt', 'Run of show', 'Haldi 10:00 Lakeside Lawns · Mehendi 16:00 Courtyard · Sangeet 19:30 Ballroom · Wedding 17:00 Jag Mandir (boats from 15:45) · Cocktails 22:00 Rooftop', 1)
  writeDoc(W1.w, 'Menu — Sangeet.txt', 'Catering', 'Live counters: chaat, pasta, tandoor. Jain station separate. Dessert: jalebi rabri, kulfi cart.', 1)
  writeDoc(null, 'Vendor master rate card 2026.txt', 'Rate card', 'Decor per function ₹80k–₹2.5L · Catering ₹2,800–₹6,500 per plate · Photography ₹3.5L–₹9L')

  // ---------- Wedding 2: Goa, live today ----------
  const W2 = wedding({
    name: 'Zoya & Kabir · Goa', couple: 'Zoya Fernandes & Kabir Sethi', start: day(0), end: day(1), city: 'Goa', venue: 'W Goa, Vagator', status: 'live', guests: 60, budget: 3200000, frozen: true,
    faq: [{ q: 'Beach dress code?', a: 'Barefoot-friendly! Light linens and flats for the beach ceremony.' }, { q: 'Is the venue wheelchair accessible?', a: 'Yes — boardwalk ramps go all the way to the ceremony deck.' }],
    functions: [
      { name: 'Haldi by the Pool', date: day(0), start_time: '09:00', end_time: '11:30', venue: 'Pool Deck', dress_code: 'Yellow', live_status: 'done' },
      { name: 'Beach Wedding', date: day(0), start_time: '16:30', end_time: '19:30', venue: 'Vagator Beach Deck', dress_code: 'Pastel linens', live_status: 'live' },
      { name: 'After-party', date: day(0), start_time: '21:00', end_time: '23:59', venue: 'Rockpool Bar', dress_code: 'Party' },
      { name: 'Farewell Brunch', date: day(1), start_time: '11:00', end_time: '14:00', venue: 'Spice Traders', dress_code: 'Casual' },
    ],
    hosts: [{ name: 'Maria Fernandes', relation: "Bride's mother", email: 'maria.f@example.com' }],
    team: [[owner, ['Lead planner']], [priya, ['Guests']], [kabir, ['Travel']]],
  })
  update('weddings', W2.w.id, { live_function_id: W2.fns[1].id })
  const g2 = guests(W2.w, W2.fns, 46, { rsvpRate: 0.95, declineRate: 0.06, stayRate: 0.8 })
  g2.filter((_, i) => i % 3 !== 0).forEach(g => run('UPDATE guests SET checked_in = 1 WHERE id = ?', g.id))
  const vg = insert('vehicles', { wedding_id: W2.w.id, label: 'Tempo Traveller (Goa)', kind: 'Tempo Traveller', capacity: 12, plate: 'GA03 T 4471', driver_vendor_id: vendors.d3.id })
  const goaArr = g2.filter(g => g.is_primary).slice(0, 6)
  const travels2 = goaArr.map((g, i) => insert('travel', { wedding_id: W2.w.id, guest_id: g.id, status: 'confirmed', mode: 'flight', number: ['6E 431', 'AI 683', '6E 2205', 'UK 885', '6E 431', 'QP 1121'][i], from_loc: 'BOM', to_loc: 'GOX', arrive_at: `${day(0)}T${['12:10', '12:40', '13:05', '13:20', '12:10', '14:55'][i]}`, pax: 2, pickup_required: 1, delay_min: i === 5 ? 50 : 0, live_status: i < 2 ? 'dropped' : i === 5 ? 'delayed' : 'waiting', status_note: null }))
  const trip2 = insert('trips', { wedding_id: W2.w.id, vehicle_id: vg.id, driver_vendor_id: vendors.d3.id, location: 'GOX', window_start: at(0, '12:10'), window_end: at(0, '13:20'), pax: 10, status: 'en_route', drop_location: 'W Goa', suggested_kind: 'Tempo Traveller',
    stops: travels2.slice(0, 5).map((t, i) => ({ travel_id: t.id, guest_id: t.guest_id, name: goaArr[i].name, pax: 2, arrive_at: t.arrive_at, number: t.number, status: i < 2 ? 'dropped' : 'waiting' })) })
  travels2.slice(0, 5).forEach(t => run('UPDATE travel SET trip_id = ? WHERE id = ?', trip2.id, t.id))
  const gh = insert('hotels', { wedding_id: W2.w.id, name: 'W Goa', address: 'Vagator Beach, Goa', check_in: day(-1), check_out: day(2) })
  const goaRooms = Array.from({ length: 18 }, (_, i) => insert('rooms', { wedding_id: W2.w.id, hotel_id: gh.id, number: `${200 + i}`, floor: 2, category: i < 3 ? 'Suite' : 'Wonderful Room', capacity: 3, accessible: i === 0 ? 1 : 0, available_from: day(-1), available_to: day(2) }))
  const stay2 = g2.filter(g => g.needs_stay)
  stay2.forEach((g, i) => insert('room_assignments', { wedding_id: W2.w.id, room_id: goaRooms[Math.floor(i / 3) % goaRooms.length].id, guest_id: g.id, status: i % 4 === 3 ? 'final' : 'checked_in', checked_in_at: ago(20) }))
  const [, beach] = W2.fns
  VA(W2.w, vendors.goaDecor, beach, 'Beach deck decor', at(0, '10:00'), 'confirmed', ['Arch & florals', 'Aisle lanterns'], 420000, { live_status: 'ready', arrived_at: ago(6) })
  VA(W2.w, vendors.goaCater, beach, 'Sundowner dinner', at(0, '15:00'), 'confirmed', ['Seafood station', 'Veg mezze'], 380000, { live_status: 'delayed', delay_min: 40 })
  VA(W2.w, vendors.photo, null, 'Photography', at(0, '08:30'), 'confirmed', ['Candid ×2', 'Drone'], 450000, { live_status: 'arrived', arrived_at: ago(9) })
  VA(W2.w, vendors.dj, W2.fns[2], 'After-party DJ', at(0, '20:00'), 'confirmed', ['Sound check 8 PM'], 120000, { live_status: 'en_route' })
  insert('incidents', { wedding_id: W2.w.id, function_id: beach.id, title: 'Sea Salt Kitchen delayed 40 min', description: 'Truck stuck near Anjuna market; ETA 4:20 PM. Dinner service will start late.', severity: 'high', owner_id: kabir.id, status: 'in_progress', source: 'vendor', log: [{ at: ago(1), text: 'Auto-created from vendor delay report' }, { at: ago(0.5), by: 'Kabir Singh', text: 'Asked venue F&B to stage welcome drinks for an extra 30 min' }] })
  insert('incidents', { wedding_id: W2.w.id, function_id: beach.id, title: 'Wind knocking over aisle lanterns', severity: 'medium', owner_id: priya.id, status: 'open', source: 'team', log: [{ at: ago(0.3), by: 'Priya Shah', text: 'Incident logged' }] })
  insert('incidents', { wedding_id: W2.w.id, function_id: W2.fns[0].id, title: 'Haldi colour stains on pool tiles', severity: 'low', status: 'resolved', resolution: 'Housekeeping cleaned before noon', log: [{ at: ago(6), text: 'Incident logged' }] })
  insert('tasks', { wedding_id: W2.w.id, title: 'Sunset ceremony cue sheet to DJ & pandit', priority: 'high', owner_id: owner.id, due_at: at(0, '15:30'), status: 'in_progress' })
  insert('tasks', { wedding_id: W2.w.id, title: 'Shuttle 4:00 PM from hotel lobby to beach deck', priority: 'high', owner_id: kabir.id, due_at: at(0, '16:00'), status: 'todo' })
  BL(W2.w, 'Decor', 'Coastal Bloom', 450000, vendors.goaDecor); BL(W2.w, 'Catering', 'Sea Salt Kitchen', 400000, vendors.goaCater)
  // photographer uploads pending approval
  const goaMedia = ['Haldi splash', 'Pool deck florals', 'Groom squad', 'Mother of the bride', 'Haldi laughs', 'Sunlit portraits'].map((label, i) => {
    const s = svg(label, 40 + i * 8, i)
    return insert('media', { wedding_id: W2.w.id, function_id: W2.fns[0].id, uploader_vendor_id: vendors.photo.id, file: s.file, original_name: `${label}.svg`, mime: 'image/svg+xml', size: s.size, hash: s.hash, status: i < 4 ? 'in_review' : 'pending', approval_owner: 'host' })
  })
  insert('approvals', { wedding_id: W2.w.id, kind: 'media', title: '4 Haldi photos for approval', approver: 'host', data: { media_ids: goaMedia.slice(0, 4).map(m => m.id) } })

  // ---------- Wedding 3: Jaipur, completed (portfolio source) ----------
  const W3 = wedding({
    name: 'Ishita & Dev · Jaipur', couple: 'Ishita Verma & Dev Khanna', start: day(-62), end: day(-60), city: 'Jaipur', venue: 'Rambagh Palace', status: 'completed', guests: 220, budget: 9000000, faq: [],
    functions: [
      { name: 'Mehendi', date: day(-62), start_time: '15:00', venue: 'Mughal Gardens', live_status: 'done' },
      { name: 'Sangeet', date: day(-61), start_time: '19:00', venue: 'Durbar Hall', live_status: 'done' },
      { name: 'Wedding', date: day(-60), start_time: '18:00', venue: 'Rambagh Lawns', live_status: 'done' },
    ],
    hosts: [{ name: 'Rekha Verma', relation: "Bride's mother", email: 'rekha.v@example.com' }],
    team: [[owner, ['Lead planner']], [neha, ['Vendors']]],
  })
  guests(W3.w, W3.fns, 30, { rsvpRate: 1, declineRate: 0.1, stayRate: 0.5 })
  const jaipurMedia = ['Palace mandap', 'Rose-petal aisle', 'Sangeet stage', 'Mehendi swings', 'Varmala', 'Pheras at dusk', 'Couple portrait', 'Reception dinner'].map((label, i) => {
    const s = svg(label, 330 + i * 9, i + 10)
    return insert('media', { wedding_id: W3.w.id, function_id: W3.fns[Math.min(2, Math.floor(i / 3))].id, uploader_vendor_id: vendors.photo.id, file: s.file, original_name: `${label}.svg`, mime: 'image/svg+xml', size: s.size, hash: s.hash, status: 'published', album: 'public' })
  })
  const cs = insert('case_studies', { agency_id: A.id, wedding_id: W3.w.id, title: 'A pink-city palace wedding for 220', summary: 'Three days at Rambagh Palace: a garden mehendi, a Durbar Hall sangeet and a dusk ceremony on the lawns — with 140 out-of-town guests, 46 airport pickups and zero missed connections.', services: ['Full Planning & Design', 'Travel & Pickup Desk', 'Guest Hospitality Desk'], media_ids: jaipurMedia.slice(0, 6).map(m => m.id), consent: 'granted', status: 'published' })
  insert('testimonials', { agency_id: A.id, wedding_id: W3.w.id, case_study_id: cs.id, author: 'Rekha Verma', body: 'We did not lift a finger. Every guest was picked up, every room was ready, and the WhatsApp updates meant no one called us once. Saffron Story is magic.', rating: 5, status: 'published' })
  for (const [i, n] of [['Ishita & Dev — Jaipur', 'Planning for 220 guests across three days was seamless.'], ['Tanya & Raghav — Kochi', 'The backwater sangeet was beyond anything we imagined.']].entries()) if (i === 1) insert('testimonials', { agency_id: A.id, author: 'Tanya Menon', body: n[1], rating: 5, status: 'published' })

  // ---------- Wedding 4: Delhi, early planning ----------
  const W4 = wedding({
    name: 'Riya & Arjun · Delhi', couple: 'Riya Bhatia & Arjun Iyer', start: day(95), end: day(96), city: 'New Delhi', venue: 'The Oberoi, New Delhi', status: 'planning', guests: 300, budget: 7500000, faq: [],
    functions: [{ name: 'Sangeet', date: day(95), start_time: '19:00', venue: 'Oberoi Ballroom' }, { name: 'Wedding', date: day(96), start_time: '19:00', venue: 'Oberoi Lawns' }],
    hosts: [{ name: 'Anil Bhatia', relation: "Bride's father", email: 'anil.b@example.com' }],
    team: [[rohan, ['Lead planner']], [kabir, ['Logistics']]],
  })
  guests(W4.w, W4.fns, 18, { rsvpRate: 0, declineRate: 0, stayRate: 0.2 })
  insert('tasks', { wedding_id: W4.w.id, title: 'Shortlist three decor concepts', priority: 'medium', owner_id: rohan.id, due_at: at(14, '18:00'), status: 'todo' })

  // ---------- Leads & proposals ----------
  const cat = all('SELECT * FROM catalogue WHERE agency_id = ?', A.id)
  const byName = (n: string) => cat.find(c => c.name === n)!
  const priced = (names: string[], guests: number) => {
    const fnCount = names.filter(n => byName(n).kind === 'function').length || 1
    return names.map(n => { const c = byName(n); const q = c.pricing === 'per_guest' ? guests : c.pricing === 'per_function' ? fnCount : 1; return { catalogue_id: c.id, kind: c.kind, category: c.category, name: c.name, pricing: c.pricing, unit: c.price, qty: q, amount: c.price * q, cost: c.cost * q } })
  }
  const lead = (o: any, names: string[], status: string, pstatus: string, extra: any = {}) => {
    const l = insert('leads', { agency_id: A.id, name: o.name, phone: phone(), email: o.email, source: o.source, status, wedding_date: o.date, destination: o.dest, guest_count: o.guests, notes: o.notes, updated_at: ago(o.ago || 5) })
    const items = priced(names, o.guests)
    const subtotal = items.reduce((s, i) => s + i.amount, 0), cost = items.reduce((s, i) => s + i.cost, 0)
    const total = Math.round(subtotal * (1 - (extra.discount || 0) / 100))
    insert('proposals', { agency_id: A.id, lead_id: l.id, version: extra.version || 1, status: pstatus, selections: { ids: items.map(i => i.catalogue_id) }, items, guest_count: o.guests, destination: o.dest, wedding_date: o.date, discount: extra.discount || 0, subtotal, cost, total, comment: extra.comment, sent_at: pstatus === 'sent' || pstatus === 'revision_requested' ? ago(30) : null, expires_at: pstatus === 'sent' ? new Date(Date.now() + 9 * 864e5).toISOString() : null })
    return l
  }
  lead({ name: 'Sanya Kapoor', email: 'sanya@example.com', source: 'Instagram', date: day(150), dest: 'Jaipur', guests: 180, notes: 'Wants a pink-city palace vibe like Ishita & Dev', ago: 2 }, ['Mehendi', 'Sangeet', 'Wedding Ceremony', 'Full Planning & Design', 'Guest Hospitality Desk', 'Travel & Pickup Desk', 'Decor Design', 'Drone Coverage'], 'proposal_sent', 'sent', { discount: 5 })
  lead({ name: 'Aditya & Naina', email: 'naina@example.com', source: 'Referral (Rekha Verma)', date: day(210), dest: 'Kerala backwaters', guests: 120, ago: 20 }, ['Haldi', 'Sangeet', 'Wedding Ceremony', 'Reception', 'Full Planning & Design', 'Accommodation Management', 'Live Band'], 'revision', 'revision_requested', { comment: 'Can we drop the reception and add a cocktail night instead? Also budget is closer to ₹45L.' })
  lead({ name: 'Mehak Arora', email: 'mehak@example.com', source: 'Portfolio enquiry', date: day(120), dest: 'Goa', guests: 90, ago: 50 }, [], 'new', 'configuring')

  // ---------- Notifications (morning brief texture) ----------
  insert('notifications', { agency_id: A.id, wedding_id: W2.w.id, kind: 'vendor', severity: 'critical', title: 'Sea Salt Kitchen running 40 min late', body: 'Beach Wedding dinner service affected', link: `/w/${W2.w.id}/live`, created_at: ago(1) })
  insert('notifications', { agency_id: A.id, wedding_id: W1.w.id, kind: 'travel', severity: 'warning', title: 'Tickets need review', body: 'Low OCR confidence on uploaded boarding passes', link: `/w/${W1.w.id}/travel?tab=review`, created_at: ago(4) })
  insert('notifications', { agency_id: A.id, kind: 'proposal', title: 'Aditya & Naina requested changes', body: 'Drop reception, add cocktail night', link: '/proposals', created_at: ago(20) })

  // ---------- Audit texture ----------
  for (const [action, name] of [['auth.login', 'Ananya Rao'], ['rsvp.launched', 'Rohan Mehta'], ['vendor.assigned', 'Neha Pillai'], ['permission.denied', 'Priya Shah']])
    insert('audit_log', { agency_id: A.id, wedding_id: W1.w.id, actor_kind: 'user', actor_name: name, action, allowed: action === 'permission.denied' ? 0 : 1, detail: action === 'permission.denied' ? '"budget"' : null, created_at: ago(Math.random() * 48) })

  // pre-create links so the demo hub can list them
  for (const h of all('SELECT * FROM hosts')) createLink('host', { agency_id: A.id, wedding_id: h.wedding_id, entity_id: h.id })
  return true
}
