import { CookieSettingsButton } from "@/components/cookie-settings-button";
import { SiteFooter } from "@/components/site-footer";
import { CONSENT_COOKIE } from "@/lib/consent";
import { pageOpenGraph } from "@/lib/metadata";
import type { Metadata } from "next";
import Link from "next/link";

const description = "What The ID Game collects, why, and how it is protected.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: pageOpenGraph({
    path: "/privacy",
    title: "Privacy Policy",
    description,
  }),
};

// Everything the Game stores in or reads from your browser. Better Auth's
// cookie names gain a `__Secure-` prefix over HTTPS. Keep this in step with
// the banner's categories (components/cookie-banner.tsx) and bump
// CONSENT_VERSION in lib/consent.ts when a new optional item is added.
const COOKIES: {
  name: string;
  purpose: string;
  duration: string;
  category: "Strictly necessary" | "Functional" | "Analytics";
}[] = [
  {
    name: "better-auth.session_token",
    purpose: "Keeps you signed in, to your account or as a guest.",
    duration: "7 days, renewed while you play",
    category: "Strictly necessary",
  },
  {
    name: "better-auth.convex_jwt",
    purpose: "A short-lived pass our server uses to load your games.",
    duration: "15 minutes",
    category: "Strictly necessary",
  },
  {
    name: "better-auth.better-auth-passkey",
    purpose: "Holds a one-time check while you sign in with, or add, a passkey.",
    duration: "5 minutes",
    category: "Strictly necessary",
  },
  {
    name: "better-auth.message (local storage)",
    purpose: "Tells your other open tabs when you sign in or out.",
    duration: "Until you next sign in or out",
    category: "Strictly necessary",
  },
  {
    name: CONSENT_COOKIE,
    purpose: "Remembers your cookie choices.",
    duration: "6 months",
    category: "Strictly necessary",
  },
  {
    name: "theme (local storage)",
    purpose:
      "Your light or dark mode choice, only if you pick one. Otherwise the Game follows your device's setting and nothing is stored.",
    duration: "Until you clear it",
    category: "Strictly necessary",
  },
  {
    name: "maintenance-bypass",
    purpose:
      "Lets our team use the Game while it is closed for maintenance. Only set from a private link; players never get it.",
    duration: "Until you close your browser",
    category: "Strictly necessary",
  },
  {
    name: "id-game:remembered-account (local storage)",
    purpose:
      "Remembers that an account has signed in on this device, and its first name, so an invite link can offer to sign you back in.",
    duration: "Until you withdraw consent or clear site data",
    category: "Functional",
  },
  {
    name: "id-game:passkey-nudge-dismissed-at (local storage)",
    purpose:
      "Remembers when you chose “Maybe later” on the passkey prompt, so it waits 14 days before asking again.",
    duration: "Until you withdraw consent or add a passkey",
    category: "Functional",
  },
  {
    name: "ph_<project key>_posthog (cookie and local storage)",
    purpose:
      "PostHog's random ID for this browser, and details of the current visit, so page views and events can be counted and grouped.",
    duration: "1 year",
    category: "Analytics",
  },
  {
    name: "ph_<project key>_window_id and similar (session storage)",
    purpose: "Tells your browser tabs apart within a visit.",
    duration: "Until you close the tab",
    category: "Analytics",
  },
  {
    name: "__ph_opt_in_out_<project key> (local storage)",
    purpose: "PostHog's own record that you have allowed analytics.",
    duration: "Until you withdraw consent",
    category: "Analytics",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="text-3xl font-mono font-bold mb-4">Privacy Policy</h1>
      <h2 className="text-xl font-mono font-semibold mt-6">1. Introduction</h2>
      <p>
        Your privacy is important to us whilst you use The ID Game
        (&quot;Game&quot;, &quot;Service&quot;). This privacy policy explains
        how we collect, use, and protect your information.
      </p>
      <p>
        By playing the Game, you agree to the following Terms. If you do not
        agree to the Terms, please do not use the Game.
      </p>
      <p>
        The Game is intended for fun, and its content is not to be extracted for
        gain, financial or otherwise.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">
        2. Information We Collect
      </h2>
      <ul className={"list-disc ml-8"}>
        <li>
          <strong>Personal Information:</strong> When you sign up, we may
          collect your name, email address, and other necessary details.
          Authentication is managed by Better Auth and stored in our database; sign-in codes are delivered by Resend.
        </li>
        <li>
          <strong>Usage Data:</strong> We collect data about how you use the
          Service, such as interactions and preferences. This data is stored in
          Convex.
        </li>
        <li>
          <strong>Cookies and Tracking: </strong> We require the use of cookies to manage
          authentication sessions. These cannot be turned off. We optionally ask for additional
          cookies for telemetry which is recorded to PostHog. These cookies enable us to track page views
          and user interactions. See{" "}
          <Link href="#cookies" className="font-bold underline">
            Cookies and Similar Technologies
          </Link>{" "}
          below for the full list.
        </li>
      </ul>
      <h2 className="text-xl font-mono font-semibold mt-6">
        3. How We Use Your Information
      </h2>
      <ul className={"list-disc ml-8"}>
        <li>To enable, provide and improve the Service.</li>
        <li>To authenticate users and manage sessions.</li>
        <li>For future improvements to the Service.</li>
        <li>To store and retrieve data securely using Convex.</li>
        <li>To ensure compliance with legal requirements.</li>
      </ul>
      <h2
        id="cookies"
        className="text-xl font-mono font-semibold mt-6 scroll-mt-4"
      >
        4. Cookies and Similar Technologies
      </h2>
      <p>
        Cookies are small files a website stores in your browser. We also use
        your browser&apos;s local storage and session storage, which work in a
        similar way. We only use the ones marked &quot;Strictly
        necessary&quot; without asking: the Game can&apos;t work without
        them. We only use the others if you say yes in the cookie banner, and
        each optional category starts switched off.
      </p>
      <ul className={"list-disc ml-8"}>
        <li>
          <strong>Strictly necessary</strong> keep you signed in and secure,
          and remember your cookie choices.
        </li>
        <li>
          <strong>Functional</strong> remember a couple of things on this
          device to save you time. Without them, an invite link won&apos;t
          greet you by name, and the passkey reminder may come back sooner.
        </li>
        <li>
          <strong>Analytics</strong> let PostHog record page views, clicks
          and errors, so we can see how the Game is used and what to fix. Its
          data is sent to PostHog&apos;s EU servers through our own domain
          (the <code>/ingest</code> address). If you allow analytics while
          signed in, it is linked to your account.
        </li>
      </ul>
      {/* A plain table rather than components/ui/table, which is a client
          component and would add JavaScript to a page that needs none. */}
      <div className="mt-4 w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 pr-4 font-medium">Duration</th>
              <th className="py-2 font-medium">Category</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((cookie) => (
              <tr key={cookie.name} className="border-b align-top">
                <td className="py-2 pr-4 font-mono text-xs wrap-anywhere min-w-32">
                  {cookie.name}
                </td>
                <td className="py-2 pr-4 min-w-48">{cookie.purpose}</td>
                <td className="py-2 pr-4 min-w-28">{cookie.duration}</td>
                <td className="py-2">{cookie.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4">
        <strong>Changing your mind:</strong> you can change or withdraw your
        choices at any time from{" "}
        <CookieSettingsButton className="font-bold underline cursor-pointer">
          Cookie settings
        </CookieSettingsButton>
        , which is also at the bottom of each public page and in the bar at
        the top of the game. Withdrawing deletes what the category had stored
        on your device. Your choice is kept for six months, after which we ask
        again. You can also delete cookies and site data in your browser&apos;s
        settings.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">5. Data Sharing</h2>
      <strong>We do not, and will not, sell your data.</strong>
      <p>
        We may from time to time be required to comply with statutory
        requirements in your jurisdiction, which will result in us sharing your
        data with the necessary authorities.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">6. Data Security</h2>
      <p>
        We implement industry-standard security measures to protect your data.
        Whilst no method of transmission is 100% secure, we take every
        precaution to ensure your data is not accessed by unauthorised parties and perform regular
        security audits to check our systems are secure.
      </p>
      <p>
        Convex and Resend provide measures within their software to address data
        security.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">7. Your Rights</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, update,
        or delete your personal data. Requests related to authentication data can be made directly to us, while requests related to stored
        application data should be directed to us at{" "}
        <Link
          href={"mailto:support@id-game.com?subject=Personal Data"}
          className="font-bold underline"
        >
          support@id-game.com
        </Link>
        .
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">
        8. Changes to This Policy
      </h2>
      <p>
        We may update this Privacy Policy. Continued use of the Service after
        changes constitutes acceptance of the new policy.
      </p>
      <h2 className="text-xl font-mono font-semibold mt-6">9. Contact Us</h2>
      <p>
        If you have any questions about these Terms, please contact us at{" "}
        <Link
          href={"mailto:support@id-game.com?subject=TOS"}
          className="font-bold underline"
        >
          support@id-game.com
        </Link>
        .
      </p>
      <p className="mt-6">
        For details about our privacy policy, please refer to our{" "}
        <Link href="/privacy" className="font-bold underline">
          Privacy Policy
        </Link>
        .
      </p>
      <SiteFooter className="mt-8" />
    </>
  );
}
