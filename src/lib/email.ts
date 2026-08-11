import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM_EMAIL
  ? `Cyprus Cleaners <${process.env.RESEND_FROM_EMAIL}>`
  : 'Cyprus Cleaners <onboarding@resend.dev>'

function layout(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7FAF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E0EDEC;">
    <div style="background:#19706A;padding:20px 32px;">
      <span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:-0.3px;">Cyprus Cleaners</span>
    </div>
    <div style="padding:32px;">
      ${body}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #E0EDEC;text-align:center;">
      <p style="margin:0;color:#6B8886;font-size:12px;">© 2025 Cyprus Cleaners</p>
    </div>
  </div>
</body>
</html>`
}

function cta(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#19706A;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`
}

// User-supplied text (names, messages, addresses) gets interpolated straight
// into these HTML email bodies — escape it first so a display name or chat
// message can't inject markup/links into someone else's inbox.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Base send ────────────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  // While RESEND_FROM_EMAIL's domain isn't verified with Resend, sends from the
  // sandbox address onboarding@resend.dev are silently dropped for any
  // recipient other than the account's own signup email. RESEND_TEST_EMAIL
  // redirects every send to one known-good address so the flows are still
  // testable — remove it (or verify the domain) before going live.
  const recipient = process.env.RESEND_TEST_EMAIL || to
  return resend.emails.send({ from: FROM, to: recipient, subject, html })
}

// ─── 0. Email verification ───────────────────────────────────────────────────

export async function sendVerificationEmail({
  to, token, locale,
}: {
  to:     string
  token:  string
  locale: string
}) {
  const isEl = locale === 'el'

  const subject = isEl
    ? 'Επαληθεύστε τον λογαριασμό σας'
    : 'Verify your Cyprus Cleaners account'

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`

  const html = layout(
    `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Welcome to Cyprus Cleaners!</h2>
     <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Please verify your email address to get started.</p>
     ${cta('Verify email', verifyUrl)}
     <p style="color:#6B8886;font-size:12px;line-height:1.5;margin:16px 0 0;">This link expires in 24 hours.</p>`
  )

  return sendEmail({ to, subject, html })
}

// ─── 0b. Password reset ───────────────────────────────────────────────────────

export async function sendPasswordResetEmail({
  to, token, locale,
}: {
  to:     string
  token:  string
  locale: string
}) {
  const isEl = locale === 'el'

  const subject = isEl
    ? 'Επαναφορά κωδικού Cyprus Cleaners'
    : 'Reset your Cyprus Cleaners password'

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`

  const html = layout(
    `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Reset your password</h2>
     <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">We received a request to reset your password.</p>
     ${cta('Reset password', resetUrl)}
     <p style="color:#6B8886;font-size:12px;line-height:1.5;margin:16px 0 0;">This link expires in 1 hour.</p>
     <p style="color:#6B8886;font-size:12px;line-height:1.5;margin:8px 0 0;">If you didn't request this, you can safely ignore this email.</p>`
  )

  return sendEmail({ to, subject, html })
}

// ─── 1. New message → the other party's first notification for a thread ─────

export async function sendNewMessageEmail({
  recipientEmail, recipientLocale, senderName, message, dashboardUrl,
}: {
  recipientEmail:  string
  recipientLocale: string | null
  senderName:      string
  message:         string
  dashboardUrl:    string
}) {
  const isEl = recipientLocale === 'el'

  const subject = isEl
    ? 'Έχετε νέο μήνυμα'
    : 'You have a new message'

  const safeSenderName = escapeHtml(senderName)
  const safeMessage    = escapeHtml(message)

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Νέο μήνυμα</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;">Ο/Η <strong>${safeSenderName}</strong> σας έστειλε μήνυμα:</p>
       <blockquote style="border-left:3px solid #19706A;margin:16px 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;font-style:italic;line-height:1.6;">${safeMessage}</blockquote>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:0;">Συνδεθείτε στον πίνακα ελέγχου για να απαντήσετε.</p>
       ${cta('Προβολή μηνύματος', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">You have a new message</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>${safeSenderName}</strong> sent you a message:</p>
       <blockquote style="border-left:3px solid #19706A;margin:16px 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;font-style:italic;line-height:1.6;">${safeMessage}</blockquote>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:0;">Log in to your dashboard to reply.</p>
       ${cta('View message', dashboardUrl)}`)

  return sendEmail({ to: recipientEmail, subject, html })
}

// ─── 4. New booking request → cleaner ────────────────────────────────────────

export async function sendNewBookingRequestEmail({
  cleanerEmail, cleanerLocale, customerName, date, startTime, durationHours, address, dashboardUrl,
}: {
  cleanerEmail:  string
  cleanerLocale: string | null
  customerName:  string
  date:          string // ISO date
  startTime:     string // HH:MM
  durationHours: number
  address:       string
  dashboardUrl:  string
}) {
  const isEl = cleanerLocale === 'el'

  const formattedDate = new Intl.DateTimeFormat(isEl ? 'el-GR' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))

  const subject = isEl ? 'Νέο αίτημα κράτησης' : 'New booking request'

  const safeCustomerName = escapeHtml(customerName)
  const safeAddress      = escapeHtml(address)

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Νέο αίτημα κράτησης</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;">Ο/Η <strong>${safeCustomerName}</strong> ζήτησε κράτηση:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} στις ${startTime} · ${durationHours} ώρες</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:8px 0 0;">📍 ${safeAddress}</p>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:16px 0 0;">Έχετε 24 ώρες για να απαντήσετε.</p>
       ${cta('Προβολή αιτήματος', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">New booking request</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>${safeCustomerName}</strong> requested a booking:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} at ${startTime} · ${durationHours}h</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:8px 0 0;">📍 ${safeAddress}</p>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:16px 0 0;">You have 24 hours to respond.</p>
       ${cta('View request', dashboardUrl)}`)

  return sendEmail({ to: cleanerEmail, subject, html })
}

// ─── 5. Booking confirmed → customer ─────────────────────────────────────────

export async function sendBookingConfirmedEmail({
  customerEmail, customerLocale, cleanerName, date, startTime, durationHours, dashboardUrl,
}: {
  customerEmail: string
  customerLocale: string | null
  cleanerName:   string
  date:          string // ISO date
  startTime:     string // HH:MM
  durationHours: number
  dashboardUrl:  string
}) {
  const isEl = customerLocale === 'el'

  const formattedDate = new Intl.DateTimeFormat(isEl ? 'el-GR' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))

  const subject = isEl
    ? `Η κράτησή σας με ${cleanerName} επιβεβαιώθηκε`
    : `Your booking with ${cleanerName} is confirmed`

  const safeCleanerName = escapeHtml(cleanerName)

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Η κράτηση επιβεβαιώθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;">Ο/Η <strong>${safeCleanerName}</strong> επιβεβαίωσε την κράτησή σας:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} στις ${startTime} · ${durationHours} ώρες</p>
       ${cta('Προβολή στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Booking confirmed</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>${safeCleanerName}</strong> confirmed your booking:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} at ${startTime} · ${durationHours}h</p>
       ${cta('View in dashboard', dashboardUrl)}`)

  return sendEmail({ to: customerEmail, subject, html })
}

// ─── 5b. ID verification approved → cleaner ──────────────────────────────────

export async function sendVerificationApprovedEmail({
  to, locale, dashboardUrl,
}: {
  to:           string
  locale:       string | null
  dashboardUrl: string
}) {
  const isEl = locale === 'el'

  const subject = isEl ? 'Η ταυτότητά σας επαληθεύτηκε' : 'Your ID has been verified'

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Επαλήθευση εγκρίθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Η ταυτότητά σας ελέγχθηκε και εγκρίθηκε — το προφίλ σας φέρει πλέον το σήμα επαλήθευσης.</p>
       ${cta('Προβολή προφίλ', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Verification approved</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Your ID has been reviewed and approved — your profile now shows the verified badge.</p>
       ${cta('View profile', dashboardUrl)}`)

  return sendEmail({ to, subject, html })
}

// ─── 5c. ID verification rejected → cleaner ──────────────────────────────────

export async function sendVerificationRejectedEmail({
  to, locale, note, dashboardUrl,
}: {
  to:           string
  locale:       string | null
  note:         string | null
  dashboardUrl: string
}) {
  const isEl = locale === 'el'

  const subject = isEl ? 'Δεν ήταν δυνατή η επαλήθευση της ταυτότητάς σας' : 'We couldn\'t verify your ID'

  const safeNote = note ? escapeHtml(note) : null

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Η επαλήθευση δεν εγκρίθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Δεν μπορέσαμε να επαληθεύσουμε την ταυτότητά σας με τα έγγραφα που υποβάλατε. Μπορείτε να υποβάλετε νέα έγγραφα όποτε θέλετε.</p>
       ${safeNote ? `<blockquote style="border-left:3px solid #19706A;margin:16px 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;line-height:1.6;">${safeNote}</blockquote>` : ''}
       ${cta('Μετάβαση στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Verification not approved</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">We weren't able to verify your ID from the documents submitted. You're welcome to submit new documents at any time.</p>
       ${safeNote ? `<blockquote style="border-left:3px solid #19706A;margin:16px 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;line-height:1.6;">${safeNote}</blockquote>` : ''}
       ${cta('Go to dashboard', dashboardUrl)}`)

  return sendEmail({ to, subject, html })
}

// ─── 5d. Dispute resolved → both parties ─────────────────────────────────────
// Sent once per party (customer and cleaner), each from their own
// perspective — outcome is 'WON' if the admin ruled in that recipient's
// favor, 'LOST' otherwise. Same admin note goes to both sides.

export async function sendDisputeResolvedEmail({
  to, locale, outcome, note, dashboardUrl,
}: {
  to:           string
  locale:       string | null
  outcome:      'WON' | 'LOST'
  note:         string | null
  dashboardUrl: string
}) {
  const isEl = locale === 'el'

  const subject = isEl ? 'Ενημέρωση για τη διαφορά σας' : 'Update on your dispute'

  const safeNote = note ? escapeHtml(note) : null

  const outcomeLineEl = outcome === 'WON'
    ? 'Μετά από έλεγχο, η διαφορά επιλύθηκε υπέρ σας.'
    : 'Μετά από έλεγχο, η διαφορά επιλύθηκε υπέρ του άλλου μέρους.'
  const outcomeLineEn = outcome === 'WON'
    ? 'After review, the dispute was resolved in your favor.'
    : 'After review, the dispute was resolved in favor of the other party.'

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Η διαφορά επιλύθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${outcomeLineEl}</p>
       ${safeNote ? `<p style="color:#6B8886;font-size:13px;line-height:1.5;margin:12px 0 0;">Σημείωση από τη διαχείριση:</p>
       <blockquote style="border-left:3px solid #19706A;margin:8px 0 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;line-height:1.6;">${safeNote}</blockquote>` : ''}
       ${cta('Μετάβαση στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Dispute resolved</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${outcomeLineEn}</p>
       ${safeNote ? `<p style="color:#6B8886;font-size:13px;line-height:1.5;margin:12px 0 0;">Note from admin:</p>
       <blockquote style="border-left:3px solid #19706A;margin:8px 0 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;line-height:1.6;">${safeNote}</blockquote>` : ''}
       ${cta('Go to dashboard', dashboardUrl)}`)

  return sendEmail({ to, subject, html })
}

// ─── 6. Booking completed → customer ─────────────────────────────────────────

export async function sendBookingCompletedEmail({
  customerEmail, customerLocale, cleanerName, dashboardUrl,
}: {
  customerEmail:  string
  customerLocale: string | null
  cleanerName:    string
  dashboardUrl:   string
}) {
  const isEl = customerLocale === 'el'

  const subject = isEl
    ? `Η κράτησή σας με ${cleanerName} ολοκληρώθηκε`
    : `Your booking with ${cleanerName} is complete`

  const safeCleanerName = escapeHtml(cleanerName)

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Η εργασία ολοκληρώθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Ο/Η <strong>${safeCleanerName}</strong> σήμανε την κράτησή σας ως ολοκληρωμένη. Ρίξτε μια ματιά στις φωτογραφίες και αφήστε μια κριτική.</p>
       ${cta('Προβολή στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Job complete</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;"><strong>${safeCleanerName}</strong> marked your booking complete. Take a look at the photos and leave a review.</p>
       ${cta('View in dashboard', dashboardUrl)}`)

  return sendEmail({ to: customerEmail, subject, html })
}
