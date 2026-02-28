import { Shield } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function PrivacyPolicy() {
  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Privacy Policy</h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">Last updated: 28 February 2026</p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-8 max-w-3xl">
          <div className="space-y-8 text-stone-700 dark:text-slate-300">

            <p className="text-sm leading-relaxed">
              Welcome to Shortform News ("Shortform", "we", "our", or "us"). This Privacy Policy explains how we
              collect, use, and protect information when you visit our website at shortform-news.vercel.app (the "Site").
            </p>
            <p className="text-sm leading-relaxed">
              By using the Site, you agree to the practices described in this policy. If you do not agree, please do not
              use the Site.
            </p>

            <Section title="1. Who We Are">
              <p>
                Shortform News is a news aggregation service that collects and summarises publicly available news
                articles from third-party sources. The Site is operated by Shortform News, based in Australia.
              </p>
              <p>
                If you have any questions about this policy, you can contact us at:{' '}
                <a href="mailto:shortformnewsaus@gmail.com" className="text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
                  shortformnewsaus@gmail.com
                </a>
              </p>
            </Section>

            <Section title="2. Information We Collect">
              <p>We collect minimal information. Specifically:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <strong>Usage data:</strong> When you visit the Site, standard server logs and analytics tools may
                  automatically record information such as your IP address, browser type, pages visited, and the time
                  and date of your visit. This data is used only to understand how the Site is being used and to
                  improve it.
                </li>
                <li>
                  <strong>Cookies:</strong> The Site may use cookies for basic functionality (such as remembering your
                  preferences) and for analytics purposes. See Section 5 for more detail.
                </li>
                <li>
                  <strong>No account data:</strong> Shortform does not currently require you to create an account, and
                  we do not collect your name, email address, or other personal details unless you contact us directly.
                </li>
              </ul>
            </Section>

            <Section title="3. How We Use Information">
              <p>
                We use the information we collect to operate and improve the Site, understand how users interact with
                it, and diagnose technical issues. We do not sell, rent, or share your personal information with third
                parties for marketing purposes.
              </p>
            </Section>

            <Section title="4. Third-Party Services">
              <p>
                Shortform uses third-party services to power certain features. These services may collect data
                independently under their own privacy policies:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <strong>News APIs:</strong> Articles are sourced from third-party news APIs. We do not share your
                  personal data with these providers.
                </li>
                <li>
                  <strong>Google AdSense:</strong> We display advertisements provided by Google AdSense. Google may
                  use cookies and other technologies to serve ads based on your prior visits to this or other websites.
                  You can opt out of personalised advertising by visiting{' '}
                  <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Google's Ads Settings
                  </a>
                  . For more information, see{' '}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Google's Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <strong>Hosting:</strong> The Site is hosted on Vercel. Vercel may collect basic request logs as
                  part of their service. See{' '}
                  <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Vercel's Privacy Policy
                  </a>{' '}
                  for details.
                </li>
              </ul>
            </Section>

            <Section title="5. Cookies">
              <p>
                Cookies are small text files stored on your device by your browser. We use them for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <strong>Essential cookies:</strong> Required for the Site to function correctly (e.g. storing your
                  filter preferences).
                </li>
                <li>
                  <strong>Advertising cookies:</strong> Set by Google AdSense to serve relevant advertisements.
                </li>
              </ul>
              <p>
                You can control or disable cookies through your browser settings. Note that disabling cookies may
                affect how the Site works.
              </p>
            </Section>

            <Section title="6. Data Retention">
              <p>
                We do not store personal data beyond what is held in standard server or analytics logs. These logs are
                typically retained for up to 90 days and then deleted or anonymised.
              </p>
            </Section>

            <Section title="7. Your Rights">
              <p>
                Depending on where you are located, you may have rights regarding your personal data, including the
                right to access, correct, or request deletion of data we hold about you. To exercise any of these
                rights, please contact us at{' '}
                <a href="mailto:shortformnewsaus@gmail.com" className="text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
                  shortformnewsaus@gmail.com
                </a>
                .
              </p>
              <p>
                If you are in the European Economic Area (EEA), you have rights under the General Data Protection
                Regulation (GDPR). If you are in California, you may have rights under the California Consumer Privacy
                Act (CCPA). Australian users may also have rights under the Australian Privacy Act 1988.
              </p>
            </Section>

            <Section title="8. Children's Privacy">
              <p>
                The Site is not directed at children under the age of 13. We do not knowingly collect personal
                information from children. If you believe a child has provided us with personal data, please contact
                us and we will delete it promptly.
              </p>
            </Section>

            <Section title="9. Links to Other Websites">
              <p>
                The Site links to original news articles hosted on third-party websites. We are not responsible for
                the privacy practices or content of those sites. We encourage you to review the privacy policies of
                any external sites you visit.
              </p>
            </Section>

            <Section title="10. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we do, we will update the "Last updated"
                date at the top of this page. Continued use of the Site after any changes constitutes your acceptance
                of the revised policy.
              </p>
            </Section>

            <Section title="11. Contact">
              <p>
                If you have any questions or concerns about this Privacy Policy, please contact us at:
              </p>
              <div className="mt-2 p-4 rounded-xl bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-sm space-y-1">
                <p className="font-semibold text-stone-900 dark:text-stone-100">Shortform News Australia</p>
                <p>
                  Email:{' '}
                  <a href="mailto:shortformnewsaus@gmail.com" className="text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
                    shortformnewsaus@gmail.com
                  </a>
                </p>
                <p>Website: shortform-news.vercel.app</p>
              </div>
            </Section>

          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  )
}
