import type { Metadata } from 'next';

// Public route: it sits outside the (dashboard) group, whose layout is what
// redirects unauthenticated visitors. App Store and Play both require this URL
// to be reachable without logging in.
export const metadata: Metadata = {
  title: 'Privacy Policy — Inspiro IAS Academy',
  description:
    'How the Inspiro IAS Academy app and platform collect, use, share and protect your personal data.',
};

const UPDATED = '15 August 2026';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-xl font-semibold text-slate-100 mt-10 mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

function Row({ what, why }: { what: string; why: string }) {
  return (
    <tr className="border-b border-white/5 align-top">
      <td className="py-2.5 pr-4 text-slate-200">{what}</td>
      <td className="py-2.5 text-slate-400">{why}</td>
    </tr>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0B0E1A] px-5 py-12 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="border-b border-white/10 pb-6">
          <p className="text-sm font-medium text-violet-300">Inspiro IAS Academy</p>
          <h1 className="font-display text-3xl font-bold text-slate-50 mt-1">Privacy Policy</h1>
          <p className="text-sm text-slate-400 mt-2">Last updated: {UPDATED}</p>
        </header>

        <Section id="intro" title="1. Who we are">
          <p>
            This policy explains how <strong>Inspiro</strong> (&ldquo;Inspiro&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;), which operates Inspiro IAS Academy, handles
            personal data in the Inspiro mobile app and its administrative platform.
          </p>
          <p>
            Registered address: OS 3 GCDA Complex, Marine Drive, Cochin, Ernakulam, Kerala, India.
            <br />
            Contact:{' '}
            <a href="mailto:inspiro.build@gmail.com" className="text-violet-300 hover:underline">
              inspiro.build@gmail.com
            </a>
            .
          </p>
          <p>
            It applies to students who use the app and to staff who use the admin panel. By using
            the app you agree to this policy.
          </p>
        </Section>

        <Section id="collect" title="2. What we collect">
          <p>We collect only what the service needs to work. In practice, that is:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4 font-semibold text-slate-200">Data</th>
                  <th className="py-2 font-semibold text-slate-200">Why we hold it</th>
                </tr>
              </thead>
              <tbody>
                <Row what="Mobile number" why="Required. It identifies your account and receives the one-time password used to sign in." />
                <Row what="Name, and email if you give one" why="To identify you to your batch and mentors, and to send account email such as password resets." />
                <Row what="Password (stored only as a cryptographic hash)" why="For the email and password sign-in option. We never store the password itself and cannot read it." />
                <Row what="Target exam, profile photo" why="To tailor course recommendations and show you in your batch." />
                <Row what="Enquiry details: parent name, city, state, WhatsApp number, counsellor notes" why="Only when you enquire about admission, so an admission counsellor can follow up." />
                <Row what="Identity or eligibility documents you upload" why="Only where a course or batch requires verification before access is granted." />
                <Row what="Learning activity: lessons completed, exam attempts and your answers, attendance, study streaks, XP and leaderboard position" why="To show your progress, mark attendance, rank leaderboards and generate your study plan." />
                <Row what="Doubts you ask the AI tutor" why="To generate an answer, and to let a human mentor step in when the AI is not confident." />
                <Row what="Payment records: amount, method, and the UPI reference you enter" why="To reconcile fees against your admission. See section 5." />
                <Row what="Device push token and platform (iOS/Android)" why="To deliver class reminders and result alerts. Removed when you sign out." />
                <Row what="Microphone audio during a live class" why="Only while a live class is open and only if you unmute. See section 4." />
                <Row what="For staff accounts: IP address and a log of administrative actions" why="Security and accountability — so changes to student records can be traced." />
              </tbody>
            </table>
          </div>
          <p className="text-slate-400">
            We do not track your location, read your contacts, photos or messages, and we do not
            run advertising or third-party analytics or tracking software in the app.
          </p>
        </Section>

        <Section id="use" title="3. How we use it">
          <p>We use your data to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>create your account and sign you in;</li>
            <li>give you access to the courses and batches you are enrolled in;</li>
            <li>run exams, record results, and show progress and leaderboards;</li>
            <li>answer your doubts and build your personalised study plan;</li>
            <li>run live classes and mark attendance;</li>
            <li>track fees due and payments received;</li>
            <li>send you notifications about classes, tests and your account;</li>
            <li>keep the service secure and investigate misuse.</li>
          </ul>
          <p>
            We do not sell your personal data, and we do not share it for anyone else&rsquo;s
            advertising.
          </p>
        </Section>

        <Section id="live" title="4. Live classes and recordings">
          <p>
            The app asks for microphone access only for live classes, and only when you choose to
            speak. Video and audio are carried by Agora, our live-class provider.
          </p>
          <p>
            A live class may be recorded so students who missed it can watch later. If a class is
            being recorded you will be told at the time. Recordings may include your voice, and
            your video if you turn a camera on.
          </p>
        </Section>

        <Section id="payments" title="5. Payments">
          <p>
            Fees are paid by UPI. You pay from your own UPI app using a QR code or payment request,
            and then tell us the reference number. Our staff confirm the payment against the
            academy&rsquo;s bank records.
          </p>
          <p>
            <strong>
              We never see or store your card number, bank account number, UPI PIN or any other
              payment credential.
            </strong>{' '}
            We store only the amount, the method, the reference you give us, and whether the fee is
            paid.
          </p>
        </Section>

        <Section id="ai" title="6. Artificial intelligence">
          <p>Two features use AI, and it is worth being precise about what leaves our systems:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Doubt solving.</strong> The text of your question and the relevant course
              material are sent to our AI provider (Groq) to generate an answer. Your name, mobile
              number and account identifier are <em>not</em> sent with it.
            </li>
            <li>
              <strong>Study coach.</strong> Only aggregate figures — subject-wise average scores,
              attempt counts, study streak and lessons completed — are sent to generate your weekly
              plan. No identifying information is included.
            </li>
          </ul>
          <p>
            AI answers can be wrong. They are study aids, not authoritative sources, and a mentor
            reviews doubts the AI is not confident about.
          </p>
        </Section>

        <Section id="share" title="7. Who else processes your data">
          <p>
            We use a small number of service providers. They process data only to provide their
            service to us:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Neon</strong> — database hosting.</li>
            <li><strong>Hostinger</strong> — application server hosting.</li>
            <li><strong>Vercel</strong> — hosting for the staff admin panel.</li>
            <li><strong>MSG91 / Twilio</strong> — sending sign-in one-time passwords by SMS.</li>
            <li><strong>Resend</strong> — sending account emails such as password resets.</li>
            <li><strong>Google Firebase Cloud Messaging</strong> — delivering push notifications.</li>
            <li><strong>Agora</strong> — live class audio and video.</li>
            <li><strong>Bunny Stream</strong> — delivering course videos.</li>
            <li><strong>Groq</strong> — AI doubt answers and study plans, as described in section 6.</li>
          </ul>
          <p>
            We also disclose data where the law requires it, or to protect the rights and safety of
            our students and staff.
          </p>
          <p>
            Some of these providers operate servers outside India, so your data may be processed
            abroad.
          </p>
        </Section>

        <Section id="retention" title="8. How long we keep it">
          <p>
            We keep your account and learning records for as long as your account is active, and
            afterwards only where we must — for example, fee and admission records that we are
            required to retain for accounting and tax purposes.
          </p>
          <p>
            Sign-in sessions expire automatically. Your push notification token is deleted when you
            sign out.
          </p>
        </Section>

        <Section id="rights" title="9. Your rights">
          <p>
            Under the Digital Personal Data Protection Act, 2023, you may ask us to give you a copy
            of your data, correct anything inaccurate, or delete your account and data where we are
            not required to keep it. You may also withdraw consent.
          </p>
          <p>
            To make a request, contact us at{' '}
            <a href="mailto:inspiro.build@gmail.com" className="text-violet-300 hover:underline">inspiro.build@gmail.com</a>. We may need to verify
            your identity before acting, so that nobody else can make a request in your name.
          </p>
        </Section>

        <Section id="children" title="10. Students under 18">
          <p>
            Civil services aspirants include people under 18. If you are under 18, a parent or
            guardian must consent to your use of the app, and we may ask for confirmation of that
            consent before your account is fully activated.
          </p>
          <p>
            We do not use children&rsquo;s data for advertising, profiling or behavioural tracking.
          </p>
        </Section>

        <Section id="security" title="11. Security">
          <p>
            All traffic between the app and our servers is encrypted in transit. Passwords are
            stored only as salted hashes. Staff access is restricted by role, and administrative
            actions on student records are logged.
          </p>
          <p>
            No system is perfectly secure. If a breach affects your data, we will notify you and the
            Data Protection Board as the law requires.
          </p>
        </Section>

        <Section id="grievance" title="12. Grievance Officer">
          <p>
            In accordance with the Information Technology Act, 2000 and the rules made under it,
            complaints about how your data is handled may be sent to:
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-slate-200">
            <p><strong>Shafeeq</strong></p>
            <p className="text-slate-400">Grievance Officer, Inspiro IAS Academy</p>
            <p className="text-slate-400"><a href="mailto:ict.uvaisalungal@gmail.com" className="text-violet-300 hover:underline">ict.uvaisalungal@gmail.com</a></p>
            <p className="text-slate-400">OS 3 GCDA Complex, Marine Drive, Cochin, Ernakulam, Kerala, India</p>
          </div>
          <p>We aim to acknowledge complaints within 24 hours and resolve them within 15 days.</p>
        </Section>

        <Section id="changes" title="13. Changes to this policy">
          <p>
            If we change how we handle your data we will update this page and change the date at the
            top. Significant changes will be notified in the app.
          </p>
        </Section>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-slate-500">
          <p>Inspiro IAS Academy · Built by Bizence Solutions</p>
        </footer>
      </div>
    </main>
  );
}
