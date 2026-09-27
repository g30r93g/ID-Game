"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/admin/stat-card";
import { SnapshotControls } from "@/components/admin/snapshot-controls";
import { useOneShotQuery } from "@/lib/admin/use-one-shot-query";
import { Badge } from "@/components/ui/badge";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";

type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  isGuest: boolean;
};

const columns: Column<UserRow>[] = [
  {
    header: "Name",
    cell: (u) => (
      <span className="inline-flex items-center gap-2">
        {u.name || "—"}
        {u.isGuest && <Badge variant="outline">Guest</Badge>}
      </span>
    ),
  },
  // A guest's address is a generated placeholder on a reserved domain.
  { header: "Email", cell: (u) => (u.isGuest ? "—" : u.email) },
  { header: "Joined", cell: (u) => new Date(u.createdAt).toLocaleDateString() },
];

export default function UsersPage() {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  // Fetched once, not subscribed: see `useOneShotQuery`.
  const statsQuery = useOneShotQuery(api.admin.userStats, {});
  const listQuery = useOneShotQuery(api.admin.listUsers, { limit: pageSize, offset: page * pageSize });
  const stats = statsQuery.data;
  const data = listQuery.data;

  const rows = data?.users ?? [];
  const total = data?.total ?? 0;
  const hasNext = (page + 1) * pageSize < total;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <SnapshotControls
          fetchedAt={statsQuery.fetchedAt}
          loading={statsQuery.loading || listQuery.loading}
          failed={statsQuery.error !== undefined || listQuery.error !== undefined}
          onRefresh={() => { statsQuery.refresh(); listQuery.refresh(); }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Accounts" value={stats?.totalUsers ?? "—"} />
        <StatCard label="Guests" value={stats?.guests ?? "—"} />
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
