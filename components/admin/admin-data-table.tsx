"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Applied to body cells only. */
  className?: string;
  /** Applied to the header cell only (body `className` is not leaked here, so
   *  the header keeps its default vertical centering). */
  headerClassName?: string;
};

export function AdminDataTable<T>({
  columns, data, isLoading, page, hasNext, hasPrev, onNext, onPrev, pageSize, onPageSize,
}: {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  pageSize: number;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={c.headerClassName}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.header}><Skeleton className="h-4 w-24" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No results.
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.header} className={c.className}>{c.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev}>Previous</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>Next</Button>
        </div>
      </div>
    </div>
  );
}
