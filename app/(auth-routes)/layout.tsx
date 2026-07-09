import { getToken } from "@/lib/auth-server";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";

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
      </ConvexClientProvider>
    </div>
  );
}
