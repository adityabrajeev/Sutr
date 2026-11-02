import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { UPLOAD_DIR, all, get } from './db.ts'
import { HttpError, isAdmin, createLink, linkUrl } from './core.ts'
import { tick } from './engines.ts'
import { links } from './routes/links.ts'
import { planner } from './routes/planner.ts'
import './routes/ops.ts'
import './routes/business.ts'
import { seed } from './seedData.ts'

if (seed()) console.log('[sutr] seeded demo data')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '5mb' }))

app.use('/files', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }))
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Demo hub: lists every persona entry point so the whole product can be explored locally.
app.get('/api/demo', (_req, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.SUTR_DEMO) return res.status(404).end()
  const a = get('SELECT id, name, slug FROM agencies LIMIT 1')
  const link = (kind: string, entity: string, wedding?: string) => get('SELECT token FROM links WHERE kind = ? AND entity_id = ? AND (? IS NULL OR wedding_id = ?) AND revoked = 0', kind, entity, wedding ?? null, wedding ?? null)?.token
  const weddings = all('SELECT id, name, status, start_date FROM weddings ORDER BY start_date')
  res.json({
    agency: a,
    staff: all(`SELECT name, email, role, title, status FROM users WHERE status IN ('active','invited') ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'planner' THEN 1 ELSE 2 END`),
    weddings: weddings.map(w => ({
      ...w,
      hosts: all('SELECT id, name, relation FROM hosts WHERE wedding_id = ?', w.id).map(h => ({ ...h, token: link('host', h.id, w.id) })),
      guests: all(`SELECT id, name FROM guests WHERE wedding_id = ? AND is_primary = 1 AND phone IS NOT NULL ORDER BY vip DESC, name LIMIT 4`, w.id),
      vendors: all(`SELECT DISTINCT v.id, v.name, v.kind FROM vendor_assignments va JOIN vendors v ON v.id = va.vendor_id WHERE va.wedding_id = ? UNION SELECT DISTINCT v.id, v.name, v.kind FROM trips t JOIN vendors v ON v.id = t.driver_vendor_id WHERE t.wedding_id = ? LIMIT 6`, w.id, w.id),
    })),
    leads: all('SELECT id, name, status FROM leads ORDER BY updated_at DESC'),
  })
})

app.get('/api/l/demo-mint', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.SUTR_DEMO) return res.status(404).end()
  const { kind, id, wedding } = req.query as Record<string, string>
  if (!['guest', 'vendor', 'prospect', 'host'].includes(kind)) return res.status(400).json({ error: 'bad kind' })
  const a = get('SELECT id FROM agencies LIMIT 1')
  res.json({ url: linkUrl(kind, createLink(kind, { agency_id: a.id, wedding_id: wedding || null, entity_id: id })) })
})
app.use('/api/l', links)
app.use('/api', planner)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, detail: err.detail })
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is larger than 50 MB' })
  if (err?.status === 404 && err?.expose) return res.status(404).json({ error: 'File not found' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side. Please retry.' })
})

const dist = path.resolve(import.meta.dirname, '../dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Reminder engine / scheduler
setInterval(() => { try { tick() } catch (e) { console.error('[tick]', e) } }, 60_000)

const port = +(process.env.PORT || 4000)
app.listen(port, '127.0.0.1', () => console.log(`[sutr] API on http://127.0.0.1:${port}`))

export { isAdmin }
