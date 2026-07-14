"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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

function CategoryRow({ name, count }: { name: string; count: number }) {
  const [value, setValue] = useState(name);
  const rename = useMutation(api.admin.renameCategory);
  const remove = useMutation(api.admin.deleteCategory);
  const dirty = value.trim().length > 0 && value.trim() !== name;

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

  return (
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
      <DialogContent>
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
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            categories.map((c) => (
              <CategoryRow key={c.name} name={c.name} count={c.count} />
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Renaming updates every scenario in that category. A category can only
          be deleted once no scenarios use it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
