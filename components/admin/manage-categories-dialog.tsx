"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { RiGrokAiFill } from "react-icons/ri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function CategoryRow({
  name,
  count,
  brief,
}: {
  name: string;
  count: number;
  brief: string;
}) {
  const [value, setValue] = useState(name);
  const [expanded, setExpanded] = useState(false);
  const [briefValue, setBriefValue] = useState(brief);
  const [drafting, setDrafting] = useState(false);
  const rename = useMutation(api.admin.renameCategory);
  const remove = useMutation(api.admin.deleteCategory);
  const saveBrief = useMutation(api.admin.setCategoryBrief);
  const dirty = value.trim().length > 0 && value.trim() !== name;
  const briefDirty = briefValue.trim() !== brief.trim();

  const onRename = async () => {
    try {
      await rename({ from: name, to: value.trim() });
      toast.success("Category renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      setValue(name);
    }
  };

  const onDelete = async () => {
    try {
      await remove({ name });
      toast.success("Category deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onDraft = async () => {
    setDrafting(true);
    try {
      const res = await fetch("/api/admin/generate-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: name, hint: briefValue }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const { brief: drafted } = (await res.json()) as { brief: string };
      setBriefValue(drafted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const onSaveBrief = async () => {
    try {
      await saveBrief({ name, brief: briefValue });
      toast.success("Brief saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8"
        />
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {count}
        </Badge>
        <Button size="sm" variant="outline" disabled={!dirty} onClick={onRename}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => setExpanded((e) => !e)}
        >
          {brief.trim() ? "Brief ✓" : "Brief"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          disabled={count > 0}
          title={count > 0 ? `Used by ${count} scenario(s)` : "Delete category"}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          <textarea
            value={briefValue}
            onChange={(e) => setBriefValue(e.target.value)}
            placeholder="Style brief: tone, spice level, length, example lines…"
            rows={4}
            className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onDraft}
              disabled={drafting}
            >
              {drafting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Drafting…
                </>
              ) : (
                <>
                  <RiGrokAiFill className="size-4" /> Draft with Grok
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSaveBrief}
              disabled={!briefDirty}
            >
              Save brief
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ManageCategoriesDialog() {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const categories = useQuery(api.admin.listCategoriesWithCounts, {}) ?? [];
  const create = useMutation(api.admin.createCategory);

  const onAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await create({ name });
      setNewName("");
      toast.success("Category added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Manage categories</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="New category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
          />
          <Button onClick={onAdd} disabled={!newName.trim()}>
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            categories.map((c) => (
              <CategoryRow
                key={c.name}
                name={c.name}
                count={c.count}
                brief={c.brief}
              />
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Renaming updates every scenario in that category. Delete is blocked
          while scenarios use it. A category&apos;s <strong>brief</strong> steers
          AI generation for that category — draft one with Grok, then edit.
        </p>
      </DialogContent>
    </Dialog>
  );
}
