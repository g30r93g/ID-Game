"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/admin/stat-card";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/admin/metrics";

type GameRow = {
  _id: string;
  _creationTime: number;
  partySize: number;
  totalRounds: number;
  finished: boolean;
  durationMs: number | null;
};

const columns: Column<GameRow>[] = [
  { header: "Party", cell: (g) => g.partySize },
  { header: "Rounds", cell: (g) => g.totalRounds },
  { header: "Finished", cell: (g) => (g.finished ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>) },
  { header: "Duration", cell: (g) => formatDuration(g.durationMs) },
  { header: "Created", cell: (g) => new Date(g._creationTime).toLocaleString() },
];

export default function GamesPage() {
  const [pageSize, setPageSize] = useState(25);
  const [cursors, setCursors] = useState<(string | null)[]>([null]); // stack; index = page
  const [page, setPage] = useState(0);

  const stats = useQuery(api.admin.gameStats, {});
  const data = useQuery(api.admin.listGames, {
    paginationOpts: { numItems: pageSize, cursor: cursors[page] ?? null },
  });

  const rows = (data?.page ?? []) as GameRow[];
  const hasNext = data ? !data.isDone : false;

  const onNext = () => {
    if (!data || data.isDone) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[page + 1] = data.continueCursor;
      return copy;
    });
    setPage((p) => p + 1);
  };

  const resetTo = (n: number) => { setPageSize(n); setCursors([null]); setPage(0); };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Games</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active now" value={stats?.activeNow ?? "—"} />
        <StatCard label="Started (14d)" value={stats?.started14d ?? "—"} />
        <StatCard label="Completed (14d)" value={stats?.completed14d ?? "—"} />
        <StatCard label="Avg length" value={stats ? formatDuration(stats.avgLengthMs) : "—"} />
      </div>
      <AdminDataTable
        columns={columns}
        data={rows}
        isLoading={data === undefined}
        page={page}
        hasNext={hasNext}
        hasPrev={page > 0}
        onNext={onNext}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        pageSize={pageSize}
        onPageSize={resetTo}
      />
    </div>
  );
}
