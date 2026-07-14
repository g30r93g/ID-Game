"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const schema = z.object({
  description: z.string().trim().min(1, "Scenario text is required"),
  category: z.string().trim().min(1, "Category is required"),
});

type Candidate = { description: string; include: boolean };

export function AddScenarioDialog() {
  const [open, setOpen] = useState(false);
  const create = useMutation(api.admin.createScenario);
  const createBulk = useMutation(api.admin.createScenarios);
  const generate = useAction(api.scenarioAI.generateScenarios);
  const categories = useQuery(api.admin.scenarioCategoriesForAdmin, {}) ?? [];

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", category: "" },
  });

  // AI generation state
  const [instructions, setInstructions] = useState("");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      await create(values);
      toast.success("Scenario added");
      form.resetField("description");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add scenario");
    }
  };

  const onGenerate = async () => {
    const category = form.getValues("category").trim();
    if (!category) {
      toast.error("Pick a category first");
      return;
    }
    setGenerating(true);
    try {
      const result = await generate({ instructions, category, count });
      setCandidates(result.map((r) => ({ description: r.description, include: true })));
      if (result.length === 0) toast.message("Grok returned no scenarios");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const onAddCandidates = async () => {
    const category = form.getValues("category").trim();
    const chosen = candidates.filter((c) => c.include && c.description.trim());
    if (!category || chosen.length === 0) return;
    try {
      const { created } = await createBulk({
        scenarios: chosen.map((c) => ({
          description: c.description.trim(),
          category,
        })),
      });
      toast.success(`Added ${created} scenario${created === 1 ? "" : "s"}`);
      setCandidates([]);
      setInstructions("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add scenarios");
    }
  };

  const selectedCount = candidates.filter((c) => c.include).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add scenario</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add scenario</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scenario text</FormLabel>
                  <FormControl>
                    <Input placeholder="Most likely to…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Save
            </Button>
          </form>
        </Form>

        <Separator />

        {/* AI generation (xAI Grok) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Generate with Grok</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Uses the Category selected above. Generated scenarios are shown below
            for review before adding.
          </p>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Meta-prompt / guidance for the batch (tone, theme, spice level)…"
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="gen-count">
              How many
            </label>
            <Input
              id="gen-count"
              type="number"
              min={1}
              max={25}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(1, Math.min(25, Number(e.target.value) || 1)),
                )
              }
              className="h-8 w-20"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Generate
                </>
              )}
            </Button>
          </div>

          {candidates.length > 0 && (
            <div className="space-y-2">
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {candidates.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.include}
                      onChange={(e) =>
                        setCandidates((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, include: e.target.checked } : p,
                          ),
                        )
                      }
                      className="size-4 shrink-0"
                    />
                    <Input
                      value={c.description}
                      onChange={(e) =>
                        setCandidates((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, description: e.target.value } : p,
                          ),
                        )
                      }
                      className="h-8"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      onClick={() =>
                        setCandidates((prev) => prev.filter((_, j) => j !== i))
                      }
                      title="Discard"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                onClick={onAddCandidates}
                disabled={selectedCount === 0}
              >
                Add {selectedCount} scenario{selectedCount === 1 ? "" : "s"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
