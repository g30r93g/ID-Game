"use client";

import z from "zod";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {LoadingButton} from "@/components/ui/loading-button";
import Link from "next/link";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Rating} from "@/components/ui/ratings";
import {useMutation} from "convex/react";
import {api} from "@/convex/_generated/api";
import {useState} from "react";
import {useRouter} from "next/navigation";

const formSchema = z.object({
  rating: z.number().min(1).max(5).default(5),
});

export default function RatingCard({ joinCode }: { joinCode: string }) {
  const submitRating = useMutation(api.game.submitRating);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      rating: 5,
    },
  });
  const { replace } = useRouter();

  async function onSubmit({ rating }: z.infer<typeof formSchema>) {
    try {
      setIsLoading(true);

      await submitRating({ joinCode , rating });

      replace('/game')
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Thanks For Playing!</CardTitle>
        <CardDescription></CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className={"space-y-6"}>
            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rating</FormLabel>
                  <FormControl>
                    <Rating size="lg" max={5} value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Rate the game from 1 to 5 stars. 1 being the worst and 5 being the best.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className={"grid grid-cols-[1fr_2fr] gap-3"}>
              <Link href={"/game"} replace={true}>
                <Button className={"w-full"} variant={"secondary"} type={"button"}>
                  Skip
                </Button>
              </Link>
              <LoadingButton
                className={"w-full"}
                type={"submit"}
                disabled={isLoading || form.formState.isLoading || form.formState.isSubmitting || !form.formState.isValid}
              >
                {!isLoading && "Submit Rating"}
              </LoadingButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}