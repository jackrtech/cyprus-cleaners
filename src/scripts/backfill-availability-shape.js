// One-off backfill: cleaner_profiles.availability rows still carrying the
// pre-2026-08-18 shape ({"weekdays": true, "weekends": true, "evenings":
// false} — a flat object of coarse boolean tags) into the current
// WeeklyAvailability shape ({"mon": {"start": 9, "end": 17}, ...}), see
// src/lib/availability.ts. The 2026-08-18 fix (commit bd66f47) corrected the
// read/write code paths going forward but never backfilled existing rows —
// found 2026-08-19 while building multi-cleaner availability matching
// (src/lib/availability.ts's isCleanerAvailableAt), which is the first code
// to actually gate an action on this field: every mock cleaner was reading
// as permanently unavailable as a result.
//
// Mapping: weekdays true -> mon-fri get hours; weekends true -> sat-sun get
// hours; evenings true extends whichever days are set to end at 20:00
// instead of 17:00. Only touches rows that still look like the old shape
// (no recognized day key present) — a real WeeklyAvailability row (any of
// mon/tue/wed/thu/fri/sat/sun present) is left untouched.
//
// Usage: node src/scripts/backfill-availability-shape.js [--dry-run]

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKEND_DAYS = ['sat', 'sun']

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

function isOldShape(availability) {
  if (!availability || typeof availability !== 'object' || Array.isArray(availability)) return false
  const hasAnyDayKey = DAYS.some(d => d in availability)
  const hasAnyTagKey = 'weekdays' in availability || 'weekends' in availability || 'evenings' in availability
  return !hasAnyDayKey && hasAnyTagKey
}

function convertToWeeklyAvailability(old) {
  const end = old.evenings ? 20 : 17
  const next = {}
  if (old.weekdays) for (const d of WEEKDAY_DAYS) next[d] = { start: 9, end }
  if (old.weekends) for (const d of WEEKEND_DAYS) next[d] = { start: 9, end }
  return next
}

async function main() {
  loadEnvLocal()
  const dryRun = process.argv.includes('--dry-run')

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env.local.')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: rows, error } = await supabase
    .from('cleaner_profiles')
    .select('id, slug, display_name, availability')
    .not('availability', 'is', null)

  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  const stale = rows.filter(r => isOldShape(r.availability))
  console.log(`${rows.length} profiles have non-null availability; ${stale.length} are still the old shape.`)

  for (const row of stale) {
    const next = convertToWeeklyAvailability(row.availability)
    console.log(`${dryRun ? '[dry-run] ' : ''}${row.slug}: ${JSON.stringify(row.availability)} -> ${JSON.stringify(next)}`)
    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('cleaner_profiles')
        .update({ availability: next })
        .eq('id', row.id)
      if (updateError) console.error(`  update failed for ${row.slug}:`, updateError.message)
    }
  }

  console.log(dryRun ? 'Dry run complete — no writes made.' : `Backfilled ${stale.length} profile(s).`)
}

main().catch(err => {
  console.error('backfill-availability-shape error:', err.message)
  process.exit(1)
})
