import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <>
      <h1 className="text-3xl font-mono font-bold mb-4">Terms of Service</h1>
      <h2 className="text-xl font-mono font-semibold mt-6">1. Introduction</h2>
      <p>Welcome to The ID Game (&quot;game&quot;, &quot;Service&quot;), operated by g30r93g.dev (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;).
        By accessing or using our Service, you agree to comply with and be bound by these Terms of Service (&quot;Terms&quot;).</p>
      <p>By playing the Game, you agree to the following Terms. If you do not agree to the Terms, please do not use the Game.</p>
      <p>The Game is intended for fun, and its content is not to be extracted for gain, financial or otherwise.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">2. Your Responsibilities</h2>
      <p>As a user, you:</p>
      <ul className={"list-disc ml-8"}>
        <li>agree to use the game only for lawful purposes.</li>
        <li>must not attempt to disrupt, exploit, or gain unauthorised access to, nor interfere with the programming of the Game.</li>
      </ul>
      <p>We reserve the right to suspend or terminate accounts should we suspect violations of the Terms.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">3. 3rd Party Services</h2>
      <p>We use 3rd parties to provide the Service and enable the functionality provided.</p>
      <ul className={"list-disc ml-8"}>
        <li>Authentication is handled by Clerk, and access to your account is subject to Clerk’s authentication policies.</li>
        <li>Data storage and processing are managed using Convex, and you acknowledge that your data is stored securely in a database managed by them.</li>
        <li>We use PostHog to collect user analytics, which helps us understand how the Game is used and improve the experience. PostHog may collect anonymized usage data in accordance with their <Link href="https://posthog.com/privacy" className="font-bold underline">Privacy Policy</Link>.</li>
      </ul>
      <h2 className="text-xl font-mono font-semibold mt-6">4. User Content</h2>
      <p>The content you submit to the Service is owned by you, the end user.</p>
      <p>By submitting content, you grant us a non-exclusive, worldwide, royalty-free license to use, store,
        and display your content as necessary to operate the Game.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">5. Disclaimers and Limitation of Liability</h2>
      <p>The Service is provided &quot;as is&quot; without warranties of any kind.</p>
      <p>We are not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">6. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">7. Contact Us</h2>
      <p>If you have any questions about these Terms, please contact us at <Link href={"mailto:support@id-game.com?subject=TOS"} className="font-bold underline">support@id-game.com</Link>.</p>
      <p className="mt-6">For details about our privacy policy, please refer to our <Link href="/privacy" className="font-bold underline">Privacy Policy</Link>.</p>
    </>
  )
}