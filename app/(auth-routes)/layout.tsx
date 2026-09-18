import { getToken } from "@/lib/auth-server";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { DisplayNamePrompt } from "@/components/display-name-prompt";

export default async function GameLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();

  return (
    <div className={"min-h-svh max-h-svh flex items-center justify-center"}>
      <ConvexClientProvider initialToken={token}>
        {children}
        {/* Sits over whatever is on screen when the account has no name yet. */}
        <DisplayNamePrompt />
      </ConvexClientProvider>
    </div>
  );
}
