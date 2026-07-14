"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  description: z.string().trim().min(1, "Scenario text is required"),
  category: z.string().trim().min(1, "Category is required"),
});

export function AddScenarioDialog() {
  const [open, setOpen] = useState(false);
  const create = useMutation(api.admin.createScenario);
  const categories = useQuery(api.admin.scenarioCategoriesForAdmin, {}) ?? [];
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", category: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      await create(values);
      toast.success("Scenario added");
      form.reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add scenario");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add scenario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add scenario</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Scenario text</FormLabel>
                <FormControl><Input placeholder="Most likely to…" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
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
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
