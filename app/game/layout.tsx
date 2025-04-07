import {env} from "@/app/env";
import {ConvexClerkClientProvider} from "@/providers/ConvexClerkClientProvider";
import {ClerkProvider} from "@clerk/nextjs";

export default function GameLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={"min-h-svh max-h-lvh flex items-center justify-center"}>
      <ClerkProvider publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} dynamic>
        <ConvexClerkClientProvider>
          {children}
        </ConvexClerkClientProvider>
      </ClerkProvider>
    </div>
  )
}