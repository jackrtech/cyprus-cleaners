import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Cyprus Cleaners <onboarding@resend.dev>'

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
  return resend.emails.send({ from: FROM, to, subject, html })
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
