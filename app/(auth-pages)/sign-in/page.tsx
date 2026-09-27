import { Suspense } from "react";
import { SignInCard } from "./sign-in-card";

// A thin server page so /sign-in prerenders as a static shell. SignInCard
// reads `?next=` and `?tab=` with useSearchParams, which a static route can
// only do on the client, below a Suspense boundary.
//
// It is a plain route rather than the optional catch-all Clerk needed: a
// dynamic segment can't build as fully static, and nothing links to a
// subpath any more (next.config.ts sends old ones here).
export default function SignInPage() {
  return (
    <Suspense>
      <SignInCard />
    </Suspense>
  );
}
