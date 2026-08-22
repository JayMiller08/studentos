import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 py-12">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <div className="prose prose-sm sm:prose dark:prose-invert space-y-6">
        <p className="text-muted-foreground">
          <strong>Effective Date:</strong> 21 August 2026 | <strong>Last Updated:</strong> 21 August 2026
        </p>

        <section>
          <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>
            Welcome to <strong>StudentOS</strong> ("we", "us", "our", or "Platform"). By registering an account, accessing, or using our website, application services, or AI study tools (collectively, the "Services"), you ("User", "Student", or "you") agree to be bound by these Terms of Service ("Terms") and our <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>
          <p>
            If you do not agree to these Terms, you must not access or use the Services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. Description of Services</h2>
          <p>StudentOS provides a comprehensive digital study management platform designed for high school and tertiary students. Core platform capabilities include:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Academic & Task Management:</strong> Module scheduling, assignment priority calculation, exam countdown timers, and calendar integration.</li>
            <li><strong>AI Study Assistance:</strong> Interactive study coaching, automated study plan synthesis, note summarization, and custom quiz generation powered by Google Gemini AI.</li>
            <li><strong>Productivity & Focus Tools:</strong> Pomodoro focus timers, habit trackers, ambient soundscapes, and gamification rewards (XP, streaks, badges).</li>
            <li><strong>Student Budget Tracking:</strong> Income, allowance, and expense tracking tailored for student finance management.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. Account Registration & Security</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Eligibility:</strong> You must be at least 13 years of age to create an account. If you are under 18 years of age, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf.</li>
            <li><strong>Account Accuracy:</strong> You agree to provide accurate, current, and complete profile information during registration and keep your account details updated.</li>
            <li><strong>Credential Security:</strong> You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You must immediately notify us of any unauthorized access at <a href="mailto:support@studentos.app" className="underline">support@studentos.app</a>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Subscriptions, Payments & Paystack Processing</h2>
          <p>StudentOS offers free (Basic) access as well as premium paid subscription tiers (<strong>Student Pro</strong> and <strong>Student Elite</strong>).</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Pricing & Currency:</strong> Subscription fees are priced and billed in <strong>South African Rand (ZAR)</strong>:
              <ul className="list-circle pl-6 mt-1 space-y-1">
                <li><strong>Student Pro:</strong> R49 / month (incl. VAT where applicable).</li>
                <li><strong>Student Elite:</strong> R99 / month (incl. VAT where applicable).</li>
              </ul>
              Pricing is subject to change with at least 30 days' advance written notice to active subscribers.
            </li>
            <li>
              <strong>Payment Processing via Paystack:</strong> Subscription payments are securely processed by our third-party merchant gateway, <strong>Paystack Payments Limited</strong>. By subscribing, you authorize Paystack to charge your designated credit or debit card on a recurring monthly basis until cancellation. StudentOS does not store full credit card numbers on its servers.
            </li>
            <li>
              <strong>Automatic Renewal & Cancellation:</strong> Subscriptions renew automatically each billing cycle. You may cancel your subscription at any time via the <strong>Billing Settings</strong> page in the application. Upon cancellation, your subscription remains active until the end of the current paid billing period.
            </li>
            <li>
              <strong>Refund Policy:</strong> Payments are non-refundable except where mandated by the South African Consumer Protection Act 68 of 2008 (CPA) or in cases of verified billing errors caused by platform malfunction.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. AI Features & Academic Integrity Disclaimer</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>AI Assistance Notice:</strong> AI features rely on third-party large language models provided by <strong>Google LLC (Google Gemini)</strong>. Outputs are provided for educational assistance and study organization on an "as-is" basis.
            </li>
            <li>
              <strong>Academic Integrity:</strong> StudentOS is designed to assist study organization and comprehension. You are strictly prohibited from using StudentOS AI tools to engage in academic dishonesty, plagiarism, contract cheating, or violations of your academic institution's code of conduct.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. User Content & Intellectual Property</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Your Ownership:</strong> You retain full ownership of all study materials, documents, assignment details, budget logs, and text uploaded to StudentOS ("User Content").
            </li>
            <li>
              <strong>License to Platform:</strong> You grant StudentOS a non-exclusive, worldwide, royalty-free license to store, transmit, format, and display your User Content solely to deliver and operate the Services for you.
            </li>
            <li>
              <strong>Platform Rights:</strong> The StudentOS interface, visual design, codebase, algorithms, logos, and trademarks are the exclusive property of StudentOS. You may not copy, reverse engineer, or redistribute platform assets without prior written consent.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">7. Data Privacy & Transborder Processing</h2>
          <p>
            Your privacy is governed by our <Link to="/privacy" className="underline">Privacy Policy</Link>, which complies with the Protection of Personal Information Act 4 of 2013 ("POPIA"). By using StudentOS, you acknowledge that backend data is hosted on <strong>Supabase Inc.</strong>, web services on <strong>Vercel Inc.</strong>, payment authorization on <strong>Paystack Payments Limited</strong>, and AI processing on <strong>Google LLC</strong> infrastructure, which involves transborder data flows outside South Africa. You retain rights under POPIA Section 24 to request data access or deletion via <a href="mailto:support@studentos.app" className="underline">support@studentos.app</a> or complain to the South African Information Regulator.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">8. Acceptable Use Policy</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the Services for any unlawful purpose or in violation of local or international regulations.</li>
            <li>Upload malicious code, viruses, or harmful files.</li>
            <li>Attempt to gain unauthorized access to backend databases, serverless functions, or other user accounts.</li>
            <li>Scrape, harvest, or extract data from StudentOS interfaces through automated software.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by South African law, StudentOS and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of academic standing, grades, data, or revenue resulting from your use of or inability to use the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">10. Governing Law & Jurisdiction</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the <strong>Republic of South Africa</strong>. Any legal action or dispute arising from these Terms shall be submitted to the exclusive jurisdiction of the courts of South Africa.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">11. Contact Details</h2>
          <p>For questions or support regarding these Terms of Service, please contact us:</p>
          <p>
            <strong>StudentOS Support & Legal Team</strong><br />
            Email: <a href="mailto:support@studentos.app" className="underline">support@studentos.app</a><br />
            Website: <a href="https://studentos.app/terms" className="underline">https://studentos.app/terms</a>
          </p>
        </section>
      </div>
    </div>
  );
}
