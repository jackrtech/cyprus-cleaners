// DRAFT — generated as a starting template based on what this codebase
// actually does (see supabase/schema.sql, src/app/api/bookings for the real
// booking/payment/dispute/cancellation state machines this describes). It is
// NOT legal advice. Before publishing:
//   1. Fill in every [PLACEHOLDER] below with real registered-business details.
//   2. Have it reviewed by a lawyer familiar with Cyprus/EU consumer and
//      contract law (this is a two-sided marketplace — get the independent-
//      contractor and liability sections checked especially carefully).
//   3. Keep it in sync — if the booking, payment, cancellation, or dispute
//      logic changes in the API routes, this page needs the matching update.

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '/terms', titleKey: 'termsTitle', descriptionKey: 'termsDescription' })
}

const LAST_UPDATED = '[DATE — set when this is actually published]'

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="text-[18px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-3">{title}</h2>
      <div className="text-[14px] text-[#3F4E4C] dark:text-[#B8C7C5] leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="bg-[#FDF8E1] dark:bg-[#332B0F] text-[#8A6A00] px-1.5 py-0.5 rounded-[4px] font-medium">{children}</span>
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-10 sm:py-14">
      <div className="max-w-[760px] mx-auto">
        <h1 className="text-[28px] sm:text-[32px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-2">Terms of Service</h1>
        <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who we are and what this agreement covers">
          <p>
            Cyprus Cleaners (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates a website that connects
            customers in Cyprus (&ldquo;Customers&rdquo;) with independent cleaning professionals (&ldquo;Cleaners&rdquo;)
            (together, &ldquo;Users&rdquo;, and the service itself, &ldquo;the Service&rdquo;). By creating an account
            or using the Service, you agree to these Terms of Service. If you don&rsquo;t agree, please don&rsquo;t use
            the Service.
          </p>
          <p>
            Cyprus Cleaners is operated by <Placeholder>[LEGAL ENTITY NAME, registration number if applicable]</Placeholder>,
            registered at <Placeholder>[REGISTERED ADDRESS, Cyprus]</Placeholder>. See our{' '}
            <a href="/privacy" className="text-[#19706A] hover:underline font-medium">Privacy Policy</a> for how we
            handle personal data.
          </p>
        </Section>

        <Section title="2. Cyprus Cleaners is a marketplace, not a cleaning company">
          <p>
            Cyprus Cleaners connects Customers and Cleaners — we don&rsquo;t employ Cleaners, supervise their work, or
            provide cleaning services ourselves. Every Cleaner on the Service is an independent contractor who sets
            their own rate, availability, and the areas they serve. We are not a party to the cleaning arrangement
            itself; our role is to facilitate discovery, messaging, booking, and payment.
          </p>
          <p>
            <strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">This means:</strong> Cleaners are solely responsible for the quality,
            manner, and outcome of the cleaning work they perform. Cyprus Cleaners does not guarantee the quality of
            any Cleaner&rsquo;s work, though we do offer a dispute process (see §6) for quality issues on a completed
            booking, and a verification badge for Cleaners who&rsquo;ve submitted ID for review (see §5).
          </p>
        </Section>

        <Section title="3. Accounts">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You must provide accurate information when registering, and keep your account credentials secure.</li>
            <li>You must be at least 18 years old to create an account.</li>
            <li>One account per person. You&rsquo;re responsible for all activity that happens under your account.</li>
            <li>We may suspend or terminate an account that violates these Terms, provides false information, or is used for fraud, harassment, or abuse of another User.</li>
          </ul>
        </Section>

        <Section title="4. Bookings and payment" id="payments">
          <p>A booking on Cyprus Cleaners works like this:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">Requesting</strong> — a Customer requests a booking with a saved payment card. The card is authorised but <strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">not charged</strong> at this point. The Cleaner has 24 hours to confirm or decline.</li>
            <li><strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">Confirming</strong> — if the Cleaner confirms, the Customer&rsquo;s card is charged in full at that moment, at the rate quoted when the booking was requested. This is when payment actually happens — not at completion.</li>
            <li><strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">Declining or no response</strong> — if the Cleaner declines, or doesn&rsquo;t respond within 24 hours, the booking is cancelled automatically and the Customer is never charged.</li>
            <li><strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">Completing</strong> — the Cleaner marks the job complete once the scheduled date has arrived and photo evidence of the completed work has been uploaded.</li>
          </ul>
          <p>
            Payments are processed by Stripe. Cyprus Cleaners does not store your card details — Stripe handles that
            directly. <Placeholder>[If Cyprus Cleaners takes a service/commission fee from the Cleaner&rsquo;s rate,
            describe that fee structure here — not currently modelled in the booking amount, which is charged in full
            at the Cleaner&rsquo;s quoted rate.]</Placeholder>
          </p>
        </Section>

        <Section title="5. Cancellation policy" id="cancellation">
          <p>
            Either Customer or Cleaner can cancel a <strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">requested</strong> or{' '}
            <strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">confirmed</strong> booking before it takes place.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">Cancelling 24 hours or more before the scheduled start time</strong> — if the Customer was already charged, they receive a full refund.</li>
            <li><strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">Cancelling less than 24 hours before the scheduled start time</strong> — no refund is issued. This is a binary cut-off, not a prorated/sliding scale.</li>
            <li>A booking that was only <em>requested</em> (never confirmed/charged) can be cancelled or left to expire with nothing owed either way.</li>
          </ul>
          <p>
            Refunds are processed back to the original payment method via Stripe. If a refund fails on Stripe&rsquo;s
            side, we flag it for manual review and follow up — this does not change your entitlement to the refund.
          </p>
        </Section>

        <Section title="6. Disputes and quality issues" id="disputes">
          <p>
            If a Customer isn&rsquo;t satisfied with completed work, they can file a dispute within{' '}
            <strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">24 hours</strong> of the booking being marked complete. The Cleaner gets
            a chance to respond, and an administrator reviews both sides (including the completion photos) and rules
            within an internal <strong className="text-[#0D1F1E] dark:text-[#ECF3F2]">24-hour service-level target</strong>. Possible
            outcomes: in the Customer&rsquo;s favour (refund), in the Cleaner&rsquo;s favour (no refund), or
            unresolvable (a neutral split decision where the platform made a fair call with the information
            available — not a finding against either party). If a case isn&rsquo;t reviewed within that 24-hour
            target, it is automatically resolved in the Customer&rsquo;s favour with a full refund, as a default
            protection rather than a finding against the Cleaner. Any refund tied to a dispute ruling is processed
            the same way as a cancellation refund.
          </p>
          <p>Disputes are for quality/property claims about a specific completed job — not a substitute for the cancellation process in §5.</p>
        </Section>

        <Section title="7. Cleaner verification">
          <p>
            Cleaners may optionally submit ID for review to earn a verified badge. Verification is a trust signal, not
            a guarantee — see §2. See our Privacy Policy for how ID documents are handled and retained.
          </p>
        </Section>

        <Section title="8. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Use the Service for anything unlawful, fraudulent, or to harm another User.</li>
            <li>Attempt to arrange payment for a booking outside the Service to avoid fees or the protections these Terms provide.</li>
            <li>Harass, threaten, or discriminate against another User.</li>
            <li>Post false, misleading, or defamatory reviews or profile information.</li>
            <li>Attempt to access another User&rsquo;s account or data without authorisation.</li>
          </ul>
        </Section>

        <Section title="9. Limitation of liability">
          <p>
            To the fullest extent permitted by law, Cyprus Cleaners is not liable for the acts, omissions, or
            negligence of any Cleaner or Customer, including damage to property or personal injury arising from a
            booking arranged through the Service. The Service is provided &ldquo;as is&rdquo; without warranties of
            any kind beyond those that cannot be excluded under applicable Cyprus/EU consumer law.
          </p>
          <p>
            <Placeholder>[A lawyer should confirm the exact scope of this limitation against Cyprus consumer-protection
            law before publishing — mandatory statutory rights of Customers as consumers cannot be excluded by
            contract.]</Placeholder>
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            You may stop using the Service and delete your account at any time. We may suspend or terminate access
            for violation of these Terms. Bookings already confirmed at the time of termination are still subject to
            the cancellation policy in §5.
          </p>
        </Section>

        <Section title="11. Governing law">
          <p>
            These Terms are governed by the laws of the Republic of Cyprus. <Placeholder>[Confirm dispute-forum/
            jurisdiction clause with a lawyer — e.g. courts of Cyprus have exclusive jurisdiction, subject to any
            mandatory consumer-protection rules that override a jurisdiction clause for EU consumers.]</Placeholder>
          </p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>
            We may update these Terms from time to time. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above
            when we do, and for material changes we&rsquo;ll take reasonable steps to notify you (e.g. by email or an
            in-app notice) before they take effect.
          </p>
        </Section>

        <Section title="13. Contact us">
          <p>
            Questions about these Terms: <Placeholder>[CONTACT EMAIL]</Placeholder>
            <br />
            <Placeholder>[REGISTERED ADDRESS, Cyprus]</Placeholder>
          </p>
        </Section>
      </div>
    </div>
  )
}
