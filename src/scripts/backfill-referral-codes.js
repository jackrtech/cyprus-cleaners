// Backfill: every cleaner_profiles row created before the referral
// migration (2026-08-20) has referral_code = null. New signups always get
// one at creation time (see POST /api/auth/register), so in normal
// operation this only ever needs to run once -- kept committed rather than
// deleted after use since a reseed/reset can reintroduce rows without a
// code, same as backfill-availability-shape.js. Re-running is always safe:
// it only touches rows where referral_code is still null.
//
// Usage: node src/scripts/backfill-referral-codes.js
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')
for (const line of fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  const k = t.slice(0, i).trim()
  const v = t.slice(i + 1).trim()
  if (!process.env[k]) process.env[k] = v
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
function generateReferralCode(length = 7) {
  let code = ''
  for (let i = 0; i < length; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return code
}

async function main() {
  const { data: rows, error } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .is('referral_code', null)

  if (error) { console.error(error); process.exit(1) }
  console.log(`Backfilling referral_code for ${rows.length} cleaner profile(s)...`)

  for (const row of rows) {
    // Retry on the (astronomically unlikely) unique collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: updateError } = await supabase
        .from('cleaner_profiles')
        .update({ referral_code: generateReferralCode() })
        .eq('id', row.id)
      if (!updateError) break
      if (attempt === 2) console.error(`Failed to backfill ${row.id}:`, updateError.message)
    }
  }
  console.log('Done.')
}
main()
