// Runs a raw SQL statement (or .sql file) directly against the Supabase Postgres
// database via DATABASE_URL, for schema changes that can't go through the
// supabase-js REST client (which only supports DML on existing tables, not DDL).
//
// Usage:
//   node src/scripts/run-sql.js "alter table reviews add column foo text;"
//   node src/scripts/run-sql.js path/to/migration.sql

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return
  const lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env.local (Supabase dashboard → Project Settings → Database → Connection string).')
    process.exit(1)
  }

  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node src/scripts/run-sql.js "<sql>" | node src/scripts/run-sql.js <path-to.sql>')
    process.exit(1)
  }

  const sql = arg.endsWith('.sql') && fs.existsSync(arg)
    ? fs.readFileSync(arg, 'utf8')
    : arg

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    const result = await client.query(sql)
    const results = Array.isArray(result) ? result : [result]
    for (const r of results) {
      console.log(`${r.command ?? 'OK'} — ${r.rowCount ?? 0} row(s) affected`)
      if (r.rows?.length) console.table(r.rows)
    }
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error('SQL error:', err.message)
  process.exit(1)
})
