"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { AddScenarioDialog } from "@/components/admin/add-scenario-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ScenarioSort } from "@/lib/admin/metrics";

type ScenarioRow = {
  _id: string;
  _creationTime: number;
  description: string;
  category: string;
  timesSelected: number;
};

const columns: Column<ScenarioRow>[] = [
  { header: "Scenario", cell: (s) => s.description, className: "max-w-md" },
  { header: "Category", cell: (s) => <Badge variant="secondary">{s.category}</Badge> },
  { header: "Times selected", cell: (s) => s.timesSelected },
  { header: "Introduced", cell: (s) => new Date(s._creationTime).toLocaleDateString() },
];

const SORT_LABELS: Record<ScenarioSort, string> = {
  "popular-desc": "Most popular",
  "popular-asc": "Least popular",
  newest: "Newest",
  oldest: "Oldest",
};

export default function ScenariosPage() {
  const [sort, setSort] = useState<ScenarioSort>("popular-desc");
  const [pageSize, setPageSize] = useState(25);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);

  const data = useQuery(api.admin.listScenarios, {
    sort,
    paginationOpts: { numItems: pageSize, cursor: cursors[page] ?? null },
  });

  const rows = (data?.page ?? []) as ScenarioRow[];
  const hasNext = data ? !data.isDone : false;

  const reset = () => { setCursors([null]); setPage(0); };
  const onNext = () => {
    if (!data || data.isDone) return;
    setCursors((prev) => { const c = [...prev]; c[page + 1] = data.continueCursor; return c; });
    setPage((p) => p + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scenarios</h1>
        <AddScenarioDialog />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort</span>
        <Select value={sort} onValueChange={(v) => { setSort(v as ScenarioSort); reset(); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as ScenarioSort[]).map((k) => (
              <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        onPageSize={(n) => { setPageSize(n); reset(); }}
      />
    </div>
  );
}
