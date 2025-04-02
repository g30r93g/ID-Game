import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="text-3xl font-mono font-bold mb-4">Privacy Policy</h1>
      <h2 className="text-xl font-mono font-semibold mt-6">1. Introduction</h2>
      <p>Your privacy is important to us whilst you use The ID Game (&quot;Game&quot;, &quot;Service&quot;). This privacy policy explains how we collect, use, and protect your information.</p>
      <p>By playing the Game, you agree to the following Terms. If you do not agree to the Terms, please do not use the Game.</p>
      <p>The Game is intended for fun, and its content is not to be extracted for gain, financial or otherwise.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">2. Information We Collect</h2>
      <ul className={"list-disc ml-8"}>
        <li><strong>Personal Information:</strong> When you sign up, we may collect your name, email address, and other necessary details. Authentication is managed by Clerk, which may collect additional personal data as per their policies.</li>
        <li><strong>Usage Data:</strong> We collect data about how you use the Service, such as interactions and preferences. This data is stored in Convex.</li>
        <li><strong>Cookies and Tracking: </strong> We may use cookies and similar technologies to enable and enhance your experience whilst using the Game. Clerk may also use cookies to manage authentication sessions.</li>
      </ul>
      <h2 className="text-xl font-mono font-semibold mt-6">3. How We Use Your Information</h2>
      <ul className={"list-disc ml-8"}>
        <li>To enable, provide and improve the Service.</li>
        <li>To authenticate users and manage sessions through Clerk.</li>
        <li>For future improvements to the Service.</li>
        <li>To store and retrieve data securely using Convex.</li>
        <li>To ensure compliance with legal requirements.</li>
    </ul>
      <h2 className="text-xl font-mono font-semibold mt-6">4. Data Sharing</h2>
      <strong>We do not, and will not, sell your data.</strong>
      <p>We may from time to time be required to comply with statutory requirements in your jurisdiction, which will result in us sharing your data with the necessary authorities.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">5. Data Security</h2>
      <p>
        We implement industry-standard security measures to protect your data.
        Whilst no method of transmission is 100% secure, we take every precaution to ensure your data is not accessed by unauthorised parties.
      </p>
      <p>
        Clerk and Convex provide measures within their softwares to address data security.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">6. Your Rights</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, update, or delete your personal data.
        Requests related to authentication data should be directed to Clerk,
        while requests related to stored application data should be directed to us at <Link href={"mailto:support@id-game.com?subject=Personal Data"} className="font-bold underline">support@id-game.com</Link>.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">7. Changes to This Policy</h2>
      <p>We may update this Privacy Policy. Continued use of the Service after changes constitutes acceptance of the new policy.</p>
      <h2 className="text-xl font-mono font-semibold mt-6">8. Contact Us</h2>
      <p>If you have any questions about these Terms, please contact us at <Link href={"mailto:support@id-game.com?subject=TOS"} className="font-bold underline">support@id-game.com</Link>.</p>
      <p className="mt-6">For details about our privacy policy, please refer to our <Link href="/privacy" className="font-bold underline">Privacy Policy</Link>.</p>
    </>
  )
}