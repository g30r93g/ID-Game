"use client";

import z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NumberField } from "@/components/ui/number-field";
import posthog from "posthog-js";
import { useTransition } from "react";

const formSchema = z.object({
  numberOfRounds: z.number().min(1).default(10),
});

export default function CreateGame() {
  const form = useForm<
    z.input<typeof formSchema>,
    unknown,
    z.output<typeof formSchema>
  >({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numberOfRounds: 10,
    },
  });
  const { replace } = useRouter();
  const createGame = useMutation(api.game.createGame);
  // `replace` returns void, so awaiting it is not an option and `isSubmitting`
  // drops the moment this handler returns — leaving the button idle and
  // clickable while the game page is still being fetched. Driving the
  // navigation through a transition gives us a pending flag that stays true
  // until the new route takes over.
  const [isNavigating, startTransition] = useTransition();

  async function onSubmit({ numberOfRounds }: z.output<typeof formSchema>) {
    try {
      if (posthog) {
        posthog.capture("new_game");
      }

      const game = await createGame({ numberOfRounds });

      if (!game) {
        throw new Error("Game invalid");
      }

      startTransition(() => {
        replace(`/game/${game.joinCode}`);
      });
    } catch (error) {
      console.error(error);
      toast("Error creating game", { description: (error as Error).message });
    }
  }

  // One flag for the whole create-then-navigate journey, so the spinner runs
  // from the click through to the game page rendering.
  const isBusy = form.formState.isSubmitting || isNavigating;

  return (
    <div className={"flex flex-col gap-y-3"}>
      <Form {...form}>
        <form className={"space-y-6"} onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="numberOfRounds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Rounds</FormLabel>
                <FormControl>
                  <NumberField {...field} min={1} max={20} />
                </FormControl>
                <FormDescription>
                  Enter the number of rounds you wish to play, between 1 and 20.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <LoadingButton
            variant={"default"}
            className={"w-full"}
            disabled={isBusy || !form.formState.isValid}
            loading={isBusy}
          >
            {!isBusy && (
              <>
                Create New Game
                <Plus />
              </>
            )}
          </LoadingButton>
        </form>
      </Form>
    </div>
  );
}
