"use client";

import z from "zod";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {LoadingButton} from "@/components/ui/loading-button";
import {ArrowRight} from "lucide-react";
import {InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot} from "@/components/ui/input-otp";
import {api} from "@/convex/_generated/api";
import {useMutation} from "convex/react";
import {useRouter} from "next/navigation";
import {REGEXP_ONLY_DIGITS_AND_CHARS} from "input-otp";
import {usePostHog} from "posthog-js/react";
import {useState} from "react";

const formSchema = z.object({
  joinCode: z.string().min(6, "Join Code must be 6 characters").max(6, "Join Code must be 6 characters"),
});

export default function JoinGame({ defaultJoinCode }: { defaultJoinCode?: string }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      joinCode: defaultJoinCode,
    }
  });
  const [isLoading, setLoading] = useState<boolean>(false);
  const { replace } = useRouter();
  const posthog = usePostHog()
  const performJoinGame = useMutation(api.game.joinGame);

  async function onSubmit({ joinCode }: z.infer<typeof formSchema>) {
    try {
      setLoading(true);

      if (posthog) {
        posthog.capture('join_game', {joinCode});
      }

      await performJoinGame({ joinCode })

      replace(`/game/${joinCode}`)
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={"flex flex-col gap-y-3"}>
      <Form {...form}>
        <form className={"space-y-6"} onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="joinCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Join Code</FormLabel>
                <FormControl>
                  <InputOTP
                    className={"font-mono"}
                    pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                    inputMode={"text"}
                    maxLength={6}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e.toUpperCase());
                    }}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot className={"font-mono"} index={0} />
                      <InputOTPSlot className={"font-mono"} index={1} />
                      <InputOTPSlot className={"font-mono"} index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot className={"font-mono"} index={3} />
                      <InputOTPSlot className={"font-mono"} index={4} />
                      <InputOTPSlot className={"font-mono"} index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormDescription>
                  Enter the join code to play with your friends.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <LoadingButton
            variant={"default"}
            className={"w-full"}
            disabled={form.formState.isLoading || !form.formState.isValid || isLoading}
            loading={isLoading}
          >
            {!isLoading && (
              <>
                Join
                <ArrowRight />
              </>
            )}
          </LoadingButton>
        </form>
      </Form>
    </div>
  )
}