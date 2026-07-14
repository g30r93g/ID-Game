import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
  if (!user || user.role !== "admin") notFound();

  return (
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
  );
}
