import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 py-12">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Privacy Notice & POPIA Compliance Statement</h1>
      <div className="prose prose-sm sm:prose dark:prose-invert space-y-6">
        <p className="text-muted-foreground">
          <strong>Effective Date:</strong> 21 August 2026 | <strong>Last Updated:</strong> 21 August 2026
        </p>

        <section>
          <h2 className="text-xl font-semibold mb-2">1. Responsible Party & Overview</h2>
          <p>
            StudentOS ("we", "us", or "our") operates the digital study management platform. We are committed to protecting the privacy and personal information of our users ("you" or "Data Subject") in strict accordance with the <strong>Protection of Personal Information Act 4 of 2013 ("POPIA")</strong> of South Africa.
          </p>
          <p>
            This Processing Notice explains how we collect, store, process, transfer, and delete your personal information when you use our platform, mobile interfaces, and associated AI services.
          </p>
          <p>
            <strong>Information Officer Contact:</strong><br />
            Email: <a href="mailto:support@studentos.app" className="underline">support@studentos.app</a><br />
            Website: <a href="https://studentos.app" className="underline">https://studentos.app</a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. Personal Information We Collect</h2>
          <p>We process personal information provided directly by you or generated through your usage of StudentOS:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Personally Identifiable Information (PII):</strong> Full name, email address, profile avatar, institution name, and account credentials.</li>
            <li><strong>Academic Records & Study Content:</strong> Enrolled courses, subject modules, assignment titles, deadlines, study notes, quiz responses, exam dates, priority scores, and uploaded study attachments (e.g. PDFs, documents, images).</li>
            <li><strong>Financial & Budget Data:</strong> Student income records, monthly allowance amounts, spending entries, budget categories, and subscription billing history.</li>
            <li><strong>Technical & Usage Information:</strong> IP address, device type, browser specifications, login activity, system logs, and session cookies.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. Purpose and Lawful Basis for Processing</h2>
          <p>In accordance with Section 11 of POPIA, we process your personal information based on your explicit consent, performance of our contract with you, and our legitimate operational interests to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provision, personalize, and maintain your StudentOS account and study dashboard.</li>
            <li>Enable AI-driven features, including study coaching, automated schedule synthesis, summary generation, and quiz creation.</li>
            <li>Process subscription upgrades, renewals, and merchant transactions via our payment processor.</li>
            <li>Send essential account notifications, security alerts, and study reminders.</li>
            <li>Comply with South African statutory, accounting, and regulatory obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Third-Party Operators & Service Providers</h2>
          <p>We engage trusted third-party service providers ("Operators" under POPIA) to support platform infrastructure, payment processing, and artificial intelligence capabilities:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Supabase Inc.:</strong> Cloud database, user authentication, and secure attachment storage provider. Stores application state, user profiles, and encrypted database records.
            </li>
            <li>
              <strong>Google LLC (Google Gemini AI):</strong> Provider of natural language processing and artificial intelligence models for study coaching, note synthesis, and assignment planning.
            </li>
            <li>
              <strong>Paystack Payments Limited:</strong> Authorized payment gateway operator processing recurring South African Rand (ZAR) subscription billing and credit/debit card transactions. Card details are processed directly by Paystack under PCI-DSS compliance and are never stored on StudentOS servers.
            </li>
            <li>
              <strong>Vercel Inc.:</strong> Hosting infrastructure and content delivery network powering the StudentOS frontend application.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. Transborder Data Flow Notice (POPIA Section 72)</h2>
          <p>
            By using StudentOS and interacting with AI-powered features, you explicitly acknowledge and agree that your personal information, prompt text, study notes, and uploaded attachments leave the Republic of South Africa and are transferred to cross-border servers in foreign jurisdictions (including the United States and European Union) hosted by Google LLC, Supabase Inc., and Vercel Inc.
          </p>
          <p>
            In compliance with Section 72 of POPIA, all transborder transfers are subject to binding contracts ensuring foreign operators provide an adequate level of data protection substantially similar to POPIA safeguards.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. Data Retention & Deletion Requests (POPIA Section 24)</h2>
          <p>
            We retain personal information only for as long as necessary to fulfill the purposes for which it was collected or to satisfy statutory legal requirements.
          </p>
          <p>
            Under Section 24 of POPIA, you have the right to request access to, correction of, or permanent deletion of your personal information held by StudentOS:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>You may delete your account directly through the Account Settings page within the app.</li>
            <li>You may submit a formal deletion or correction request by emailing our Information Officer at <a href="mailto:support@studentos.app" className="underline">support@studentos.app</a>.</li>
          </ul>
          <p>
            Upon receipt of a verified deletion request, we will permanently purge your user profile, academic records, budget logs, and associated cloud attachments within 30 days, save for records required to be retained by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">7. Data Subject Rights</h2>
          <p>Under POPIA, you maintain the following rights regarding your personal information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Right to be notified that your personal information is being collected.</li>
            <li>Right to request access to your personal records.</li>
            <li>Right to request correction, destruction, or deletion of inaccurate, irrelevant, excessive, or unlawfully obtained information.</li>
            <li>Right to object on reasonable grounds to the processing of your personal information.</li>
            <li>Right to withdraw consent previously granted for processing.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">8. Complaints to the Information Regulator</h2>
          <p>
            If you believe that your personal information has been processed in violation of POPIA or if you are dissatisfied with our response to a privacy query, you have the right to lodge a complaint directly with the South African Information Regulator:
          </p>
          <div className="bg-muted p-4 rounded-lg text-xs sm:text-sm space-y-1 my-3 border">
            <p className="font-semibold">The Information Regulator (South Africa)</p>
            <p><strong>Physical Address:</strong> JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001</p>
            <p><strong>Postal Address:</strong> P.O Box 31533, Braamfontein, Johannesburg, 2017</p>
            <p><strong>General Enquiries:</strong> <a href="mailto:enquiries@inforegulator.org.za" className="underline">enquiries@inforegulator.org.za</a></p>
            <p><strong>POPIA Complaints:</strong> <a href="mailto:complaints.IR@inforegulator.org.za" className="underline">complaints.IR@inforegulator.org.za</a></p>
            <p><strong>Website:</strong> <a href="https://inforegulator.org.za/" target="_blank" rel="noopener noreferrer" className="underline">https://inforegulator.org.za/</a></p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">9. Updates to This Notice</h2>
          <p>
            We reserve the right to modify this Privacy Policy at any time. Any changes will be posted on this page with an updated revision date. Continued use of StudentOS after updates constitutes acceptance of the revised notice.
          </p>
        </section>
      </div>
    </div>
  );
}
