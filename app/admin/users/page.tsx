"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/admin/stat-card";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";

type UserRow = { id: string; name: string; email: string; createdAt: number };

const columns: Column<UserRow>[] = [
  { header: "Name", cell: (u) => u.name || "—" },
  { header: "Email", cell: (u) => u.email },
  { header: "Joined", cell: (u) => new Date(u.createdAt).toLocaleDateString() },
];

export default function UsersPage() {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const stats = useQuery(api.admin.userStats, {});
  const data = useQuery(api.admin.listUsers, { limit: pageSize, offset: page * pageSize });

  const rows = data?.users ?? [];
  const total = data?.total ?? 0;
  const hasNext = (page + 1) * pageSize < total;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total users" value={stats?.totalUsers ?? "—"} />
        <StatCard label="Active players (14d)" value={stats?.activePlayers14d ?? "—"} />
      </div>
      <AdminDataTable
        columns={columns}
        data={rows}
        isLoading={data === undefined}
        page={page}
        hasNext={hasNext}
        hasPrev={page > 0}
        onNext={() => setPage((p) => p + 1)}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        pageSize={pageSize}
        onPageSize={(n) => { setPageSize(n); setPage(0); }}
      />
    </div>
  );
}
