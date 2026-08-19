// Creates a fully-bookable CLEANER test account directly in the database —
// same pattern as create-admin.js, extended to also create the
// cleaner_profiles row (verified, priced, available) so the account is
// immediately usable for testing multi-cleaner bookings without walking
// through onboarding/ID-upload by hand. Local/manual use only.
//
// Usage:
//   node src/scripts/create-test-cleaner.js <email> <password> "<Full Name>" <city>

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

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function main() {
  loadEnvLocal()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env.local.')
    process.exit(1)
  }

  const [email, password, fullName, city] = process.argv.slice(2)
  if (!email || !password || !fullName) {
    console.error('Usage: node src/scripts/create-test-cleaner.js <email> <password> "<Full Name>" <city>')
    process.exit(1)
  }

  const passwordHash = bcrypt.hashSync(password, 12)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: user, error: userError } = await supabase
    .from('users')
    .upsert(
      {
        email: email.trim().toLowerCase(),
        password_hash: passwordHash,
        role: 'CLEANER',
        full_name: fullName,
        email_verified: true,
      },
      { onConflict: 'email' }
    )
    .select('id, email, role')
    .single()

  if (userError) {
    console.error('create-test-cleaner error (users):', userError.message)
    process.exit(1)
  }

  // No unique constraint on cleaner_profiles.user_id, so upsert-by-onConflict
  // isn't available here — find-or-create by hand instead.
  const profileFields = {
    user_id:         user.id,
    slug:            slugify(fullName),
    display_name:    fullName,
    bio:             `Experienced cleaner covering ${city || 'Larnaca'} and nearby areas. Test account for multi-cleaner booking QA.`,
    city:            city || 'Larnaca',
    cities:          [city || 'Larnaca'],
    neighbourhoods:  [],
    hourly_rate_eur: 14,
    services:        ['HOUSE', 'APARTMENT'],
    languages:       ['en'],
    has_transport:   true,
    cleaner_type:    'individual',
    verified:        true,
    verification_status: 'APPROVED',
    status:          'ACTIVE',
    // Broad weekday+weekend availability so overlap with other test
    // cleaners' schedules is easy to find when testing multi-cleaner
    // booking flows.
    availability: {
      mon: { start: 8, end: 18 }, tue: { start: 8, end: 18 }, wed: { start: 8, end: 18 },
      thu: { start: 8, end: 18 }, fri: { start: 8, end: 18 }, sat: { start: 9, end: 15 },
    },
  }

  const { data: existingProfile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: profile, error: profileError } = existingProfile
    ? await supabase.from('cleaner_profiles').update(profileFields).eq('id', existingProfile.id).select('id, slug, display_name').single()
    : await supabase.from('cleaner_profiles').insert(profileFields).select('id, slug, display_name').single()

  if (profileError) {
    console.error('create-test-cleaner error (cleaner_profiles):', profileError.message)
    process.exit(1)
  }

  console.log('Test cleaner ready:', user, profile)
}

main().catch(err => {
  console.error('create-test-cleaner error:', err.message)
  process.exit(1)
})
