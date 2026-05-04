import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of Events Malta.',
}

const LAST_UPDATED = '4 May 2026'

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/" className="text-brand-cyan hover:text-brand-teal text-sm mb-6 inline-block">
        ← Back to home
      </Link>
      <h1 className="text-3xl sm:text-4xl font-heading font-bold text-brand-dark mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">1. About these terms</h2>
          <p>
            These terms govern your use of <strong>eventsmalta.org</strong> (the &ldquo;Service&rdquo;), operated by
            Events Malta (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or submitting an event, you
            agree to these terms. If you do not agree, please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">2. What the Service is</h2>
          <p>
            Events Malta is a free public listing platform for events taking place in Malta and Gozo. We do not
            organise the events ourselves, sell tickets, or process payments. Each event is submitted by a third-party
            organiser and links out to that organiser&rsquo;s ticketing or information page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">3. Accounts</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>You must be at least 16 years old to create an account.</li>
            <li>You are responsible for keeping your login credentials secure and for all activity under your account.</li>
            <li>One person, one account. Do not impersonate another person or organisation.</li>
            <li>We may suspend or close accounts that violate these terms or that submit repeated misleading content.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">4. Submitting events</h2>
          <p>When you post an event, you confirm that:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>You are the organiser or have explicit permission from the organiser to publicise the event.</li>
            <li>The information is accurate, lawful, and not misleading.</li>
            <li>Any image or media you upload is owned by you or licensed for this purpose.</li>
            <li>The event takes place in Malta or Gozo and is open to the public (private/invite-only events are not permitted).</li>
          </ul>
          <p>
            All submissions are reviewed by our team before going live. We may edit, reject, or remove any submission
            at our discretion, including (but not limited to) misleading, illegal, hateful, or low-quality content.
            Trusted uploaders may be granted faster review at our discretion and may be revoked at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">5. Content ownership and licence</h2>
          <p>
            You retain full ownership of content you submit. By posting, you grant Events Malta a worldwide,
            non-exclusive, royalty-free licence to display, distribute, resize, and promote the content as part of
            the Service (including in social shares, search engine previews, and the site&rsquo;s sitemap and feeds).
            This licence ends when the content is removed.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">6. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Submit illegal, defamatory, hateful, or sexually explicit content</li>
            <li>Use the Service to spam, scrape data, or run automated bots without our permission</li>
            <li>Attempt to bypass moderation, security, or rate-limit controls</li>
            <li>Impersonate another person, business, or venue</li>
            <li>Submit events that promote scams, illegal substances, or anything that breaches Maltese law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">7. Tickets, prices, and external links</h2>
          <p>
            Ticket purchases happen on third-party sites linked from event listings. We are not party to those
            transactions and take no responsibility for ticket availability, refunds, or the accuracy of pricing on
            external sites. Always verify the event organiser&rsquo;s legitimacy before purchasing.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">8. Disclaimer</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo;. We do our best to keep listings accurate but cannot
            guarantee that an event will take place as described, that venue or pricing details remain current, or
            that the Service will be uninterrupted or error-free.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">9. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Events Malta is not liable for any indirect, incidental, or
            consequential losses arising from your use of the Service or from attending an event you discovered
            through it. Nothing in these terms limits your statutory consumer rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">10. Termination</h2>
          <p>
            You can delete your account at any time by emailing <a href="mailto:admin@eventsmalta.org" className="text-brand-cyan hover:text-brand-teal">admin@eventsmalta.org</a>. We
            may suspend or terminate accounts that violate these terms. On termination, your published events may be
            removed and your personal data deleted as described in the <Link href="/privacy" className="text-brand-cyan hover:text-brand-teal">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">11. Changes</h2>
          <p>
            We may update these terms from time to time. Material changes will be announced on the site at least
            14 days before they take effect. Continued use of the Service after that date means you accept the new
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">12. Governing law</h2>
          <p>
            These terms are governed by the laws of Malta. Any disputes will be handled by the competent courts of
            Malta.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-heading font-bold text-brand-dark mt-6 mb-2">13. Contact</h2>
          <p>
            Questions about these terms? Email <a href="mailto:admin@eventsmalta.org" className="text-brand-cyan hover:text-brand-teal">admin@eventsmalta.org</a>.
          </p>
        </section>
      </div>
    </main>
  )
}
