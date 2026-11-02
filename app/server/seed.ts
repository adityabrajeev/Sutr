// CLI: `npm run seed` — wipes the local database and reseeds demo data.
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dirname, 'data')
if (process.argv.includes('--reset')) {
  for (const f of ['sutr.db', 'sutr.db-wal', 'sutr.db-shm']) fs.rmSync(path.join(dir, f), { force: true })
  fs.rmSync(path.join(dir, 'uploads'), { recursive: true, force: true })
}
const { seed } = await import('./seedData.ts')
console.log(seed() ? 'Seeded demo data.' : 'Database already has data — run with --reset to wipe it.')
