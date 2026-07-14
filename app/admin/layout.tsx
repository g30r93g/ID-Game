import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchAuthQuery, getToken } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
  if (!user || user.role !== "admin") notFound();

  // The admin pages are client components that call `useQuery`, so they need a
  // ConvexClientProvider in the tree. /admin sits outside the (auth-routes)
  // group (which mounts its own provider), so wrap the admin subtree here and
  // seed it with the auth token so the admin queries run authenticated.
  const token = await getToken();

  return (
    <ConvexClientProvider initialToken={token}>
      <div className="min-h-screen">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <span className="font-mono text-lg">ID Game · Admin</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin/users" className="hover:underline">Users</Link>
              <Link href="/admin/games" className="hover:underline">Games</Link>
              <Link href="/admin/scenarios" className="hover:underline">Scenarios</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </ConvexClientProvider>
  );
}
