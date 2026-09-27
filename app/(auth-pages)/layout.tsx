import { env } from "@/app/env";
import { PostHogIdentity } from "@/providers/PostHogIdentity";
import { SiteFooter } from "@/components/site-footer";

// Signed-out pages that talk to Better Auth only: /sign-in. Unlike
// (auth-routes) there is no Convex client, token lookup or display-name
// prompt, so the pages here can be static. The sign-in page needs none of
// them: it uses authClient directly, and every way out of it is a full
// document load into (auth-routes), which sets all of that up.
export default function AuthPagesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={"min-h-svh max-h-svh flex flex-col"}>
      <div className={"flex flex-1 min-h-0 items-center justify-center"}>
        {children}
      </div>
      <SiteFooter />
      {/* Sign-out lands on /sign-in, and this is what resets PostHog's
          identity there. Production only, like PostHogProvider. */}
      {env.NODE_ENV === "production" && <PostHogIdentity />}
    </div>
  );
}
