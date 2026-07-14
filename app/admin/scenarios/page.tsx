"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { AddScenarioDialog } from "@/components/admin/add-scenario-dialog";
import { ManageCategoriesDialog } from "@/components/admin/manage-categories-dialog";
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
  {
    header: "Scenario",
    cell: (s) => s.description,
    className: "align-top whitespace-normal break-words min-w-[280px] max-w-[560px]",
  },
  {
    header: "Category",
    cell: (s) => <Badge variant="secondary">{s.category}</Badge>,
    className: "align-top",
  },
  { header: "Times selected", cell: (s) => s.timesSelected, className: "align-top" },
  {
    header: "Introduced",
    cell: (s) => new Date(s._creationTime).toLocaleDateString(),
    className: "align-top whitespace-nowrap",
  },
];

const ALL = "all";

const SORT_LABELS: Record<ScenarioSort, string> = {
  "popular-desc": "Most popular",
  "popular-asc": "Least popular",
  newest: "Newest",
  oldest: "Oldest",
};

export default function ScenariosPage() {
  const [sort, setSort] = useState<ScenarioSort>("popular-desc");
  const [category, setCategory] = useState<string>(ALL);
  const [pageSize, setPageSize] = useState(25);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);

  const categories = useQuery(api.admin.scenarioCategoriesForAdmin, {}) ?? [];

  const data = useQuery(api.admin.listScenarios, {
    sort,
    category: category === ALL ? undefined : category,
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
        <div className="flex items-center gap-2">
          <ManageCategoriesDialog />
          <AddScenarioDialog />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Category</span>
          <Select value={category} onValueChange={(v) => { setCategory(v); reset(); }}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
