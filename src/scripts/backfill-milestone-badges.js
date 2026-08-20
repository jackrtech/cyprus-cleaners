// Backfill: cleans_milestone and tenure_milestone badges only ever get
// awarded going forward (on a booking completing, or lazily when a cleaner
// loads their own dashboard) -- see src/lib/badges.ts. Anyone with existing
// completed-job history or tenure from before the badge system shipped
// (2026-08-20) needs this run once to catch up; a plain node script rather
// than importing src/lib/badges.ts since these scripts run outside Next's
// TS/path-alias compilation, same reason create-test-cleaner.js duplicates
// slugify() instead of importing it. Re-running is always safe -- the
// unique constraint on cleaner_badges makes every award a no-op if already
// earned.
//
// Usage: node src/scripts/backfill-milestone-badges.js
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

const CLEANS_MILESTONE_TIERS = [1, 25, 50, 100, 250]
const TENURE_MILESTONE_TIERS = [
  { tier: '1_month', days: 30 },
  { tier: '6_months', days: 182 },
  { tier: '1_year', days: 365 },
]

async function award(cleanerProfileId, badgeKey, tier = '') {
  const { error } = await supabase
    .from('cleaner_badges')
    .upsert(
      { cleaner_profile_id: cleanerProfileId, badge_key: badgeKey, tier },
      { onConflict: 'cleaner_profile_id,badge_key,tier', ignoreDuplicates: true }
    )
  if (error) console.error(`  award(${badgeKey}${tier ? `/${tier}` : ''}) error:`, error.message)
}

async function main() {
  const { data: cleaners, error } = await supabase
    .from('cleaner_profiles')
    .select('id, display_name, total_jobs_count, created_at')
    .eq('status', 'ACTIVE')

  if (error) { console.error(error); process.exit(1) }
  console.log(`Checking milestone badges for ${cleaners.length} active cleaner(s)...`)

  const now = Date.now()
  for (const c of cleaners) {
    const cleansTiers = CLEANS_MILESTONE_TIERS.filter(t => c.total_jobs_count >= t)
    for (const tier of cleansTiers) await award(c.id, 'cleans_milestone', String(tier))

    const ageDays = (now - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000)
    const tenureTiers = TENURE_MILESTONE_TIERS.filter(t => ageDays >= t.days)
    for (const { tier } of tenureTiers) await award(c.id, 'tenure_milestone', tier)

    if (cleansTiers.length || tenureTiers.length) {
      console.log(`  ${c.display_name}: cleans[${cleansTiers.join(',')}] tenure[${tenureTiers.map(t => t.tier).join(',')}]`)
    }
  }
  console.log('Done.')
}
main()
