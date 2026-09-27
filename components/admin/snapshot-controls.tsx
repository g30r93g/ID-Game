"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The admin figures are fetched once rather than kept live, so the page says
 * when they were taken and offers a way to take them again.
 */
export function SnapshotControls({
  fetchedAt, loading, failed, onRefresh,
}: {
  fetchedAt: number | undefined;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      {failed ? (
        <span className="text-destructive">Couldn&apos;t load. Try again.</span>
      ) : (
        fetchedAt !== undefined && (
          <span>As of {new Date(fetchedAt).toLocaleTimeString()}</span>
        )
      )}
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={cn(loading && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}
