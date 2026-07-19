// Verifies required environment variables are present before the dev server starts.
// Reads the list of required keys from .env.example and checks process.env
// (loading .env.local manually, since this script runs outside of Next.js).
// Never exits non-zero — this is a warning-only check, not a hard gate.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')

function parseEnvFile(filePath) {
  const result = {}
  if (!fs.existsSync(filePath)) return result

  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    result[key] = value
  }
  return result
}

function main() {
  const requiredKeys = Object.keys(parseEnvFile(ENV_EXAMPLE_PATH))

  if (requiredKeys.length === 0) {
    console.warn('⚠️  Could not read .env.example — skipping environment check.')
    return
  }

  const localValues = parseEnvFile(ENV_LOCAL_PATH)

  let hasMissing = false
  for (const key of requiredKeys) {
    const value = process.env[key] || localValues[key]
    if (!value) {
      hasMissing = true
      console.warn(`⚠️  Missing environment variable: ${key}`)
    }
  }

  if (hasMissing) {
    console.warn('Copy .env.example to .env.local and fill in the values.')
  } else {
    console.log('✅ Environment variables OK')
  }
}

main()
