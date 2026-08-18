import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendContactSubmissionAlertEmail, sendContactSubmissionConfirmationEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const NAME_MAX = 100
const MESSAGE_MAX = 2000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Deliberately public — no session required. General inquiries can come
// from someone who doesn't have (or doesn't want) an account yet, e.g. a
// prospective cleaner asking a question before registering. Separate from
// disputes (a claim against a specific completed booking, requires an
// account) and in-app chat (an existing thread between two matched parties).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name: string = typeof body.name === 'string' ? body.name.trim() : ''
  const email: string = typeof body.email === 'string' ? body.email.trim() : ''
  const message: string = typeof body.message === 'string' ? body.message.trim() : ''

  if (!name || name.length > NAME_MAX) {
    return NextResponse.json({ error: `Name is required and must be ${NAME_MAX} characters or fewer` }, { status: 400 })
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }
  if (!message || message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: `A message is required and must be ${MESSAGE_MAX} characters or fewer` }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('contact_submissions')
    .insert({ name, email: email.toLowerCase(), message })
    .select('id, created_at')
    .single()

  if (error || !data) {
    console.error('Contact submission insert error:', error)
    return NextResponse.json({ error: 'Failed to send your message — please try again' }, { status: 500 })
  }

  // Both emails are best-effort — a Resend hiccup shouldn't fail the
  // submission itself, since it's already safely stored.
  try {
    await sendContactSubmissionAlertEmail({
      name,
      email,
      message,
      adminUrl: `${BASE_URL}/admin/contact`,
    })
  } catch (emailErr) {
    console.error('Email send error (contact alert):', emailErr)
  }

  try {
    await sendContactSubmissionConfirmationEmail({ to: email })
  } catch (emailErr) {
    console.error('Email send error (contact confirmation):', emailErr)
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
