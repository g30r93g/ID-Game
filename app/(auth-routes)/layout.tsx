import { getSessionToken } from "@/lib/auth-server";
import { env } from "@/app/env";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { PostHogIdentity } from "@/providers/PostHogIdentity";
import { DisplayNamePrompt } from "@/components/display-name-prompt";
import { RememberAccount } from "@/components/remember-account";
import { Toaster } from "@/components/ui/sonner";

export default async function GameLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Signed-out visitors (most of /sign-in) have no session cookie, so they
  // skip the token lookup entirely.
  const token = await getSessionToken();

  return (
    <div className={"min-h-svh max-h-svh flex items-center justify-center"}>
      <ConvexClientProvider initialToken={token}>
        {children}
        {/* Sits over whatever is on screen when the account has no name yet. */}
        <DisplayNamePrompt />
        <RememberAccount />
      </ConvexClientProvider>
      {/* Production only, like PostHogProvider in the root layout. */}
      {env.NODE_ENV === "production" && <PostHogIdentity />}
      <Toaster />
    </div>
  );
}
