// Creates an ADMIN user directly in the database. Local/manual use only —
// there is no HTTP endpoint for this, by design (see supabase/schema.sql's
// commented-out seed example). Run once per admin account you need.
//
// Usage:
//   node src/scripts/create-admin.js <email> <password> "<Full Name>"

const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const { createClient } = require('@supabase/supabase-js')

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

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env.local.')
    process.exit(1)
  }

  const [email, password, fullName] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Usage: node src/scripts/create-admin.js <email> <password> "<Full Name>"')
    process.exit(1)
  }

  const passwordHash = bcrypt.hashSync(password, 12)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        email: email.trim().toLowerCase(),
        password_hash: passwordHash,
        role: 'ADMIN',
        full_name: fullName || 'Admin',
        email_verified: true,
      },
      { onConflict: 'email' }
    )
    .select('id, email, role')
    .single()

  if (error) {
    console.error('create-admin error:', error.message)
    process.exit(1)
  }
  console.log('Admin user ready:', data)
}

main().catch(err => {
  console.error('create-admin error:', err.message)
  process.exit(1)
})
