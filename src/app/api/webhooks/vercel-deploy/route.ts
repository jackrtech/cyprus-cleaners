import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'
import { sendAdminAlertEmail } from '@/lib/email'

// Register this endpoint manually in the Vercel dashboard — Project Settings
// → Webhooks → Add Webhook → {deployment URL}/api/webhooks/vercel-deploy,
// event: "deployment.error" only. Vercel generates the signing secret at
// that point; put it in VERCEL_WEBHOOK_SECRET. Without it this route 400s on
// every delivery — same shape as the Stripe webhook's own secret check.
//
// Added 2026-08-19 after a bad vercel.json (cron schedule exceeding the
// Hobby plan's once-daily limit) silently blocked every deployment for ~7h,
// caught only because deployments visibly stopped and someone happened to
// notice (see FLOWS.md's cron section, commit a21cfb1). This is the
// backstop so that class of failure pages admin within minutes instead.
//
// Signature verification per Vercel's docs: raw body HMAC-SHA1 (not SHA-256
// -- Vercel uses SHA-1 here specifically) with the webhook secret,
// hex-encoded, sent as the `x-vercel-signature` header.
function isValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf   = Buffer.from(signature, 'hex')
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)
}

interface VercelDeploymentErrorPayload {
  type: string
  payload?: {
    // `deployment.name` is the project name (matches the deployment URL),
    // not `project.name` -- Vercel's payload only gives an id under `project`.
    deployment?: { name?: string }
    links?:      { deployment?: string; project?: string }
    target?:     string | null
  }
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = headers().get('x-vercel-signature')
  const secret    = process.env.VERCEL_WEBHOOK_SECRET

  if (!secret) {
    console.error('Vercel deploy webhook: VERCEL_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }
  if (!isValidSignature(body, signature, secret)) {
    console.error('Vercel deploy webhook: signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: VercelDeploymentErrorPayload
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (event.type !== 'deployment.error') {
    return NextResponse.json({ received: true })
  }

  const deployment = event.payload?.deployment
  const links      = event.payload?.links
  const target     = event.payload?.target ?? 'unknown'
  const projectName = deployment?.name ?? 'cyprus-cleaners'

  try {
    await sendAdminAlertEmail({
      subject:  `Deployment failed — ${projectName} (${target})`,
      heading:  'A Vercel deployment failed',
      bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Project <strong>${projectName}</strong>, target <strong>${target}</strong> failed to deploy.${links?.deployment ? ` <a href="${links.deployment}">View the build log</a>.` : ''} Until this is fixed, no code changes (including further fixes) will go live.</p>`,
    })
  } catch (alertErr) {
    console.error('Vercel deploy-failed admin alert error:', alertErr)
  }

  return NextResponse.json({ received: true })
}
