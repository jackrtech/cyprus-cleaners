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

// ─── 1. New introduction → cleaner ───────────────────────────────────────────

export async function sendNewIntroEmail({
  cleanerEmail, cleanerLocale, customerName, message, dashboardUrl,
}: {
  cleanerEmail:  string
  cleanerLocale: string | null
  customerName:  string
  message:       string
  dashboardUrl:  string
}) {
  const isEl = cleanerLocale === 'el'

  const subject = isEl
    ? 'Έχετε νέο αίτημα επικοινωνίας'
    : 'You have a new introduction request'

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Νέο αίτημα επικοινωνίας</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;">Ο/Η <strong>${customerName}</strong> θέλει να επικοινωνήσει μαζί σας:</p>
       <blockquote style="border-left:3px solid #19706A;margin:16px 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;font-style:italic;line-height:1.6;">${message}</blockquote>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:0;">Συνδεθείτε στον πίνακα ελέγχου για να αποδεχτείτε ή να απορρίψετε το αίτημα.</p>
       ${cta('Προβολή αιτήματος', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">New introduction request</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>${customerName}</strong> sent you a message:</p>
       <blockquote style="border-left:3px solid #19706A;margin:16px 0;padding:12px 16px;background:#F7FAF9;color:#0D1F1E;font-size:14px;font-style:italic;line-height:1.6;">${message}</blockquote>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:0;">Log in to your dashboard to approve or decline this request.</p>
       ${cta('View request', dashboardUrl)}`)

  return sendEmail({ to: cleanerEmail, subject, html })
}

// ─── 2. Intro approved → customer ────────────────────────────────────────────

export async function sendIntroApprovedEmail({
  customerEmail, customerLocale, cleanerName, cleanerPhone, cleanerEmail: cleanerEmailAddr, dashboardUrl,
}: {
  customerEmail:  string
  customerLocale: string | null
  cleanerName:    string
  cleanerPhone:   string | null
  cleanerEmail:   string | null
  dashboardUrl:   string
}) {
  const isEl = customerLocale === 'el'

  const subject = isEl ? 'Το αίτημά σας εγκρίθηκε' : 'Your introduction was approved'

  const contactRows = [
    cleanerPhone
      ? `<p style="margin:6px 0;color:#0D1F1E;font-size:14px;">&#128222; ${cleanerPhone}</p>`
      : '',
    cleanerEmailAddr
      ? `<p style="margin:6px 0;color:#0D1F1E;font-size:14px;">&#9993; ${cleanerEmailAddr}</p>`
      : '',
  ].join('')

  const contactBlock = contactRows
    ? `<div style="background:#F7FAF9;border:1px solid #E0EDEC;border-radius:8px;padding:16px;margin:16px 0;">${contactRows}</div>`
    : ''

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Το αίτημά σας εγκρίθηκε!</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Ο/Η <strong>${cleanerName}</strong> αποδέχτηκε το αίτημά σας. Τα στοιχεία επικοινωνίας:</p>
       ${contactBlock}
       ${cta('Προβολή στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Your introduction was approved!</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;"><strong>${cleanerName}</strong> accepted your request. Here are their contact details:</p>
       ${contactBlock}
       ${cta('View in dashboard', dashboardUrl)}`)

  return sendEmail({ to: customerEmail, subject, html })
}

// ─── 3. Intro declined → customer ────────────────────────────────────────────

export async function sendIntroDeclinedEmail({
  customerEmail, customerLocale, cleanerName, dashboardUrl,
}: {
  customerEmail:  string
  customerLocale: string | null
  cleanerName:    string
  dashboardUrl:   string
}) {
  const isEl = customerLocale === 'el'

  const subject = isEl
    ? `Ενημέρωση για το αίτημά σας προς ${cleanerName}`
    : `Update on your introduction to ${cleanerName}`

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Ενημέρωση αιτήματος</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 16px;">Ο/Η <strong>${cleanerName}</strong> δεν είναι διαθέσιμος/η αυτή τη στιγμή. Ελέγξτε άλλους καθαριστές.</p>
       ${cta('Περιηγηθείτε σε καθαριστές', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Introduction update</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 16px;"><strong>${cleanerName}</strong> is not available right now. Browse other cleaners.</p>
       ${cta('Browse cleaners', dashboardUrl)}`)

  return sendEmail({ to: customerEmail, subject, html })
}

// ─── 4. New booking request → cleaner ────────────────────────────────────────

export async function sendNewBookingRequestEmail({
  cleanerEmail, cleanerLocale, customerName, date, startTime, durationHours, dashboardUrl,
}: {
  cleanerEmail:  string
  cleanerLocale: string | null
  customerName:  string
  date:          string // ISO date
  startTime:     string // HH:MM
  durationHours: number
  dashboardUrl:  string
}) {
  const isEl = cleanerLocale === 'el'

  const formattedDate = new Intl.DateTimeFormat(isEl ? 'el-GR' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))

  const subject = isEl ? 'Νέο αίτημα κράτησης' : 'New booking request'

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Νέο αίτημα κράτησης</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;">Ο/Η <strong>${customerName}</strong> ζήτησε κράτηση:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} στις ${startTime} · ${durationHours} ώρες</p>
       <p style="color:#6B8886;font-size:13px;line-height:1.5;margin:16px 0 0;">Έχετε 24 ώρες για να απαντήσετε.</p>
       ${cta('Προβολή αιτήματος', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">New booking request</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>${customerName}</strong> requested a booking:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} at ${startTime} · ${durationHours}h</p>
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

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Η κράτηση επιβεβαιώθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;">Ο/Η <strong>${cleanerName}</strong> επιβεβαίωσε την κράτησή σας:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} στις ${startTime} · ${durationHours} ώρες</p>
       ${cta('Προβολή στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Booking confirmed</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>${cleanerName}</strong> confirmed your booking:</p>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">${formattedDate} at ${startTime} · ${durationHours}h</p>
       ${cta('View in dashboard', dashboardUrl)}`)

  return sendEmail({ to: customerEmail, subject, html })
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

  const html = layout(isEl
    ? `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Η εργασία ολοκληρώθηκε</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Ο/Η <strong>${cleanerName}</strong> σήμανε την κράτησή σας ως ολοκληρωμένη. Ρίξτε μια ματιά στις φωτογραφίες και αφήστε μια κριτική.</p>
       ${cta('Προβολή στον πίνακα ελέγχου', dashboardUrl)}`
    : `<h2 style="color:#19706A;font-size:20px;font-weight:600;margin:0 0 16px;">Job complete</h2>
       <p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;"><strong>${cleanerName}</strong> marked your booking complete. Take a look at the photos and leave a review.</p>
       ${cta('View in dashboard', dashboardUrl)}`)

  return sendEmail({ to: customerEmail, subject, html })
}
