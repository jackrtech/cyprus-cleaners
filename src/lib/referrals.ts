// Referral code generation for cleaners — a short, URL-friendly, unique-ish
// code shared as /get-started?ref=<code>. Not cryptographically important
// (it's not a secret, just an identifier), so a short random string is
// enough; the DB's unique constraint on cleaner_profiles.referral_code is
// the real backstop against collisions.

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/O/1/l/i — avoids visually-ambiguous codes in a shared link

export function generateReferralCode(length = 7): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return code
}
