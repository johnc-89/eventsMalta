import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Events Malta collects, uses, and protects your data.',
}

const LAST_UPDATED = '4 May 2026'

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/" className="text-brand-cyan hover:text-brand-teal text-sm mb-6 inline-block">
        ← Back to home
      </Link>
      <h1 className="text-3xl sm:text-4xl font-heading font-bold text-brand-dark mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">1. Who we are</h2>
          <p>
            Events Malta (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates <strong>eventsmalta.org</strong>, a public events
            discovery platform for Malta and Gozo. This policy explains what personal data we collect when you visit
            the site or create an account, why we collect it, and what your rights are under the Maltese Data
            Protection Act and the EU General Data Protection Regulation (GDPR).
          </p>
          <p>For privacy-related questions, contact us at <a href="mailto:admin@eventsmalta.org" className="text-brand-cyan hover:text-brand-teal">admin@eventsmalta.org</a>.</p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">2. What we collect</h2>
          <p>We collect the minimum data needed to run the service:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account data</strong> — email address, optional display name and avatar, account creation date.</li>
            <li><strong>Authentication metadata</strong> — if you sign in with Google, we receive your name and email from Google. We do not receive your password.</li>
            <li><strong>Event submissions</strong> — content you submit when posting an event (title, description, location, images, ticket information).</li>
            <li><strong>Saved events</strong> — the events you bookmark, linked to your account.</li>
            <li><strong>Technical data</strong> — IP address, browser type, and pages visited, collected by our hosting provider for security and uptime purposes.</li>
          </ul>
          <p>We do <strong>not</strong> collect payment information, location data beyond what you submit, or data from third-party trackers.</p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">3. Why we collect it (legal basis)</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Contract</strong> — to provide the account, event-posting, and saved-events features you sign up for.</li>
            <li><strong>Legitimate interest</strong> — to keep the service secure, prevent abuse, and improve content moderation.</li>
            <li><strong>Consent</strong> — for any optional features such as email notifications about your events.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">4. Who we share it with</h2>
          <p>We use a small number of service providers (data processors) to operate the site. They access only what they need and are contractually bound to protect your data:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Supabase</strong> — database and authentication hosting (EU data centres available).</li>
            <li><strong>Vercel</strong> — application hosting and global content delivery.</li>
            <li><strong>Resend</strong> — transactional email delivery (review confirmations, status updates).</li>
            <li><strong>Google</strong> — only if you choose &ldquo;Sign in with Google&rdquo;.</li>
          </ul>
          <p>We do not sell your personal data. We do not share it with advertisers.</p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">5. Cookies and storage</h2>
          <p>
            We use a single first-party authentication token stored in your browser&rsquo;s local storage to keep you
            logged in. We do not use marketing or analytics cookies. We do not run third-party trackers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">6. How long we keep it</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Account data — for as long as your account exists, plus up to 30 days after deletion in encrypted backups.</li>
            <li>Event data — published events stay live until they have ended; rejected or unpublished drafts are removed within 90 days.</li>
            <li>Server logs — up to 30 days, then automatically purged.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">7. Your rights</h2>
          <p>Under the GDPR you have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your account and data (right to be forgotten)</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict our processing</li>
            <li>Lodge a complaint with the Office of the Information and Data Protection Commissioner (Malta) — <a href="https://idpc.org.mt" target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:text-brand-teal">idpc.org.mt</a></li>
          </ul>
          <p>Email <a href="mailto:admin@eventsmalta.org" className="text-brand-cyan hover:text-brand-teal">admin@eventsmalta.org</a> with any of these requests and we will respond within 30 days.</p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">8. Children</h2>
          <p>
            Events Malta is not directed at children under 16. If you believe a child has created an account, contact
            us and we will remove it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">9. Changes to this policy</h2>
          <p>
            We may update this policy as the service evolves. Material changes will be announced on the site at least
            14 days before they take effect. The date at the top of this page reflects the latest revision.
          </p>
        </section>
      </div>
    </main>
  )
}
