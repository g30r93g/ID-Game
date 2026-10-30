"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/admin/stat-card";
import { SnapshotControls } from "@/components/admin/snapshot-controls";
import { useOneShotQuery } from "@/lib/admin/use-one-shot-query";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Rating } from "@/components/ui/ratings";
import { formatRating } from "@/lib/admin/metrics";

type RatingRow = {
  _id: string;
  _creationTime: number;
  rating: number;
  userId: string;
  playerName: string | null;
  joinCode: string | null;
};

const columns: Column<RatingRow>[] = [
  {
    header: "Rating",
    cell: (r) => (
      <span className="inline-flex items-center gap-2">
        <Rating value={r.rating} size="sm" className="pointer-events-none" />
        <span className="tabular-nums text-muted-foreground">{r.rating}</span>
      </span>
    ),
  },
  { header: "Player", cell: (r) => r.playerName ?? <span className="font-mono text-muted-foreground">{r.userId}</span> },
  { header: "Game", cell: (r) => <span className="font-mono">{r.joinCode ?? "—"}</span> },
  { header: "Submitted", cell: (r) => new Date(r._creationTime).toLocaleString() },
];

function Distribution({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = counts[stars - 1] ?? 0;
          return (
            <div key={stars} className="flex items-center gap-3 text-sm">
              <span className="w-8 tabular-nums">{stars} ★</span>
              <div className="h-2 flex-1 rounded bg-muted">
                <div className="h-2 rounded bg-foreground" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="w-10 text-right tabular-nums text-muted-foreground">{n}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function RatingsPage() {
  const [pageSize, setPageSize] = useState(25);
  const [cursors, setCursors] = useState<(string | null)[]>([null]); // stack; index = page
  const [page, setPage] = useState(0);

  // Fetched once, not subscribed: see `useOneShotQuery`.
  const statsQuery = useOneShotQuery(api.admin.ratingStats, {});
  const listQuery = useOneShotQuery(api.admin.listRatings, {
    paginationOpts: { numItems: pageSize, cursor: cursors[page] ?? null },
  });
  const stats = statsQuery.data;
  const data = listQuery.data;

  const rows = (data?.page ?? []) as RatingRow[];
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ratings</h1>
        <SnapshotControls
          fetchedAt={statsQuery.fetchedAt}
          loading={statsQuery.loading || listQuery.loading}
          failed={statsQuery.error !== undefined || listQuery.error !== undefined}
          onRefresh={() => { statsQuery.refresh(); listQuery.refresh(); }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Average" value={stats ? formatRating(stats.average) : "—"} />
        <StatCard label="Total ratings" value={stats?.total ?? "—"} />
        <StatCard label="Average (14d)" value={stats ? formatRating(stats.average14d) : "—"} />
        <StatCard label="Ratings (14d)" value={stats?.ratings14d ?? "—"} />
      </div>
      {stats && <Distribution counts={stats.distribution} />}
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
