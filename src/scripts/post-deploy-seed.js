// Runs automatically after every `npm run build` on Vercel (see the
// "postbuild" script in package.json) — reseeds the three real controlled
// accounts on preview deploys only, via POST /api/seed.
//
// Caveat worth knowing: this fires during the BUILD step, before the
// deployment is necessarily serving traffic yet, so the very first request
// can land before the app is actually reachable. Retries with a short delay
// to ride that out, but if it never becomes reachable this logs and exits
// 0 regardless — a flaky reseed must never fail the actual deployment.
// Verify it actually ran by checking the Vercel build log on the next
// preview deploy; if it's unreliable in practice, POST /api/seed by hand
// (or from a Vercel deployment-succeeded webhook instead) is the fallback.

const VERCEL_ENV = process.env.VERCEL_ENV
const SEED_SECRET = process.env.SEED_SECRET
const VERCEL_URL = process.env.VERCEL_URL

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 5000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  if (VERCEL_ENV !== 'preview') {
    console.log(`post-deploy-seed: skipping — VERCEL_ENV is '${VERCEL_ENV ?? 'unset'}', not 'preview'.`)
    return
  }
  if (!SEED_SECRET || !VERCEL_URL) {
    console.log('post-deploy-seed: skipping — SEED_SECRET or VERCEL_URL not set.')
    return
  }

  console.log('post-deploy-seed: preview deploy detected, reseeding jackrowsell/sashanizkaya/admin...')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`https://${VERCEL_URL}/api/seed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SEED_SECRET}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        console.log('post-deploy-seed: done —', data.message ?? 'seeded')
        return
      }
      console.warn(`post-deploy-seed: attempt ${attempt}/${MAX_ATTEMPTS} failed (${res.status}):`, data.error ?? '')
    } catch (err) {
      console.warn(`post-deploy-seed: attempt ${attempt}/${MAX_ATTEMPTS} — deployment not reachable yet:`, err.message)
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
  }

  console.warn('post-deploy-seed: gave up after retries — not failing the build over it. Seed manually if needed.')
}

main().catch(err => {
  console.error('post-deploy-seed: unexpected error (non-fatal):', err)
})
