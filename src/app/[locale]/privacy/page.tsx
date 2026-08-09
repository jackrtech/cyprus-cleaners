// DRAFT — generated as a starting template based on what this codebase
// actually does (see supabase/schema.sql and src/lib/email for the data
// flows this describes). It is NOT legal advice. Before publishing:
//   1. Fill in every [PLACEHOLDER] below with real registered-business details.
//   2. Have it reviewed by a lawyer familiar with Cyprus/EU data protection
//      law (GDPR + the Cyprus Commissioner for Personal Data Protection).
//   3. Keep it in sync — if you add Stripe, analytics, or new data fields
//      to schema.sql, this page needs the matching update.

import Footer from '@/components/Footer'

const LAST_UPDATED = '[DATE — set when this is actually published]'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[18px] font-medium text-[#0D1F1E] mb-3">{title}</h2>
      <div className="text-[14px] text-[#3F4E4C] leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="bg-[#FDF8E1] text-[#8A6A00] px-1.5 py-0.5 rounded-[4px] font-medium">{children}</span>
}

export default function PrivacyPolicyPage() {
  return (
    <>
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-10 sm:py-14">
      <div className="max-w-[760px] mx-auto">
        <h1 className="text-[28px] sm:text-[32px] font-medium text-[#0D1F1E] mb-2">Privacy Policy</h1>
        <p className="text-[13px] text-[#6B8886] mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who we are">
          <p>
            Cyprus Cleaners (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates a website and service that
            connects customers in Cyprus with independent cleaners (&ldquo;the Service&rdquo;). This policy explains
            what personal data we collect through the Service, why, and what rights you have over it.
          </p>
          <p>
            Cyprus Cleaners is operated by <Placeholder>[LEGAL ENTITY NAME, registration number if applicable]</Placeholder>,
            registered at <Placeholder>[REGISTERED ADDRESS, Cyprus]</Placeholder>. For any question about this
            policy or your data, contact us at <Placeholder>[CONTACT EMAIL]</Placeholder>.
          </p>
        </Section>

        <Section title="2. Data we collect">
          <p><strong className="text-[#0D1F1E]">Account data</strong> — when you register, we collect your email address, full name, a hashed password (we never store your password in plain text), your phone number if you provide one, and whether you signed up as a customer or a cleaner.</p>
          <p><strong className="text-[#0D1F1E]">Cleaner profile data</strong> — if you register as a cleaner, additionally: a public display name, a bio, a profile photo, the cities and languages you serve, your hourly rate, gender (used only to render grammatically correct text in Greek and is optional), availability, and whether you operate as an individual or a company.</p>
          <p><strong className="text-[#0D1F1E]">Introductions &amp; messages</strong> — the text of introduction requests and chat messages you send through the Service, and any photos you choose to attach to a chat message.</p>
          <p><strong className="text-[#0D1F1E]">Booking data</strong> — details you provide when requesting or confirming a cleaning: bedrooms, bathrooms, cleaning type, date, time, duration, and any notes. We do not currently collect a street address for bookings — logistics are arranged between customer and cleaner directly in chat.</p>
          <p><strong className="text-[#0D1F1E]">Completion &amp; review photos</strong> — cleaners may upload photos of completed jobs; customers may leave a star rating and written review after a booking is marked complete.</p>
          <p><strong className="text-[#0D1F1E]">Payment data</strong> — the Service does not currently process payments or store any payment card details. <Placeholder>[Update this section if/when in-app payment via Stripe or another processor is introduced — describe what Stripe collects and link to Stripe&rsquo;s own privacy policy.]</Placeholder></p>
          <p><strong className="text-[#0D1F1E]">Technical data</strong> — a session cookie that keeps you signed in, and your language preference (English/Greek). We do not currently use analytics, advertising, or third-party tracking cookies.</p>
        </Section>

        <Section title="3. How we use your data">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To create and secure your account, and verify your email address.</li>
            <li>To operate the core marketplace: showing cleaner profiles to customers, delivering introduction requests, enabling chat once a cleaner approves an introduction, and processing booking requests.</li>
            <li>To send you transactional emails — e.g. a new introduction request, an approval/decline notice, or an email verification link — via our email delivery provider, Resend.</li>
            <li>To translate customer reviews between English and Greek using DeepL, so cleaners and customers can read reviews in their preferred language.</li>
            <li>To maintain trust and safety on the platform — e.g. displaying verified-cleaner status, ratings, and completed-job counts.</li>
            <li>To comply with legal obligations and to respond to lawful requests from public authorities.</li>
          </ul>
        </Section>

        <Section title="4. Legal basis for processing (GDPR)">
          <p>Where the EU General Data Protection Regulation applies, we rely on:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-[#0D1F1E]">Contract</strong> — processing needed to create your account and provide the Service you&rsquo;ve signed up for (e.g. introductions, chat, bookings).</li>
            <li><strong className="text-[#0D1F1E]">Legitimate interest</strong> — securing the platform, preventing abuse, and improving the Service.</li>
            <li><strong className="text-[#0D1F1E]">Consent</strong> — for optional data such as your profile photo or gender field, which you can withdraw at any time by editing or removing it from your profile.</li>
            <li><strong className="text-[#0D1F1E]">Legal obligation</strong> — where we&rsquo;re required to retain or disclose data by law.</li>
          </ul>
        </Section>

        <Section title="5. Who we share data with">
          <p>We do not sell your personal data. We share data with the following processors, each solely to help us run the Service:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-[#0D1F1E]">Supabase</strong> — our database, authentication infrastructure, and file storage provider (profile photos, chat photos, booking-completion photos are stored privately and served via time-limited signed links, not public URLs).</li>
            <li><strong className="text-[#0D1F1E]">Resend</strong> — delivers transactional emails (verification, introduction notifications) on our behalf; your email address and the relevant email content are shared with them for this purpose only.</li>
            <li><strong className="text-[#0D1F1E]">DeepL</strong> — receives review text to generate a translated version; it does not receive your name or account details alongside it.</li>
          </ul>
          <p>
            Other customers and cleaners see the profile information you make public (e.g. a cleaner&rsquo;s display name, bio,
            city, rating), and see chat messages within a conversation they&rsquo;re part of. We never share your private
            contact details (email, phone) with the other party automatically — that only happens if you choose to share it
            yourself within a chat message.
          </p>
          <p>
            <Placeholder>[If any processor stores data outside the EU/EEA (this is common for US-based providers), add a
            paragraph here naming the safeguard used — e.g. Standard Contractual Clauses — once confirmed with each
            provider&rsquo;s current data processing agreement.]</Placeholder>
          </p>
        </Section>

        <Section title="6. Data retention">
          <p>
            We keep your account data for as long as your account is active. If you delete your account, we delete or
            anonymize your personal data within <Placeholder>[X days — set a real retention window]</Placeholder>,
            except where we&rsquo;re required to retain certain records for longer (e.g. for tax, accounting, or dispute
            resolution purposes).
          </p>
        </Section>

        <Section title="7. Security">
          <p>
            Passwords are hashed (never stored in plain text). Photos are stored in private buckets and only ever served
            through short-lived signed URLs, not public links. All traffic to the Service is encrypted in transit (HTTPS).
            No method of storage or transmission is 100% secure, and we can&rsquo;t guarantee absolute security — but we
            work to protect your data using industry-standard practices.
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>If the GDPR applies to you, you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate data (most profile fields can be edited directly in your dashboard).</li>
            <li>Request deletion of your data (&ldquo;right to be forgotten&rdquo;).</li>
            <li>Object to or restrict certain processing.</li>
            <li>Receive your data in a portable format.</li>
            <li>Withdraw consent at any time, where processing is based on consent.</li>
            <li>Lodge a complaint with the Cyprus Commissioner for Personal Data Protection, or your local supervisory authority.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <Placeholder>[CONTACT EMAIL]</Placeholder>.</p>
        </Section>

        <Section title="9. Children's privacy">
          <p>The Service is not directed at, and we do not knowingly collect data from, anyone under 18.</p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            We may update this policy from time to time. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above when we
            do, and for material changes we&rsquo;ll take reasonable steps to notify you (e.g. by email or an in-app notice).
          </p>
        </Section>

        <Section title="11. Contact us">
          <p>
            Questions about this policy or your data: <Placeholder>[CONTACT EMAIL]</Placeholder>
            <br />
            <Placeholder>[REGISTERED ADDRESS, Cyprus]</Placeholder>
          </p>
        </Section>
      </div>
    </div>
    <Footer />
    </>
  )
}
