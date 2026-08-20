// Backfill: verified_id only ever gets awarded going forward, from the
// admin verification-approve action (see PATCH /api/admin/verifications/
// [id]/route.ts). Anyone already verified before the badge system shipped
// (2026-08-20) needs this run once to catch up. Re-running is always safe
// -- the unique constraint on cleaner_badges makes the award a no-op if
// already earned.
//
// Usage: node src/scripts/backfill-verified-id-badges.js
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

async function main() {
  const { data: cleaners, error } = await supabase
    .from('cleaner_profiles')
    .select('id, display_name')
    .eq('verified', true)

  if (error) { console.error(error); process.exit(1) }
  console.log(`Backfilling verified_id badge for ${cleaners.length} already-verified cleaner(s)...`)

  for (const c of cleaners) {
    const { error: awardError } = await supabase
      .from('cleaner_badges')
      .upsert(
        { cleaner_profile_id: c.id, badge_key: 'verified_id', tier: '' },
        { onConflict: 'cleaner_profile_id,badge_key,tier', ignoreDuplicates: true }
      )
    if (awardError) console.error(`  ${c.display_name}:`, awardError.message)
    else console.log(`  ${c.display_name}: OK`)
  }
  console.log('Done.')
}
main()
