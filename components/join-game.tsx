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
  const { replace } = useRouter();
  const performJoinGame = useMutation(api.game.joinGame);

  async function onSubmit({ joinCode }: z.infer<typeof formSchema>) {
    try {
      await performJoinGame({ joinCode })

      replace(`/game/${joinCode}`)
    } catch (error) {
      console.error(error);
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
                  <InputOTP maxLength={6} {...field}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
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
            disabled={form.formState.isLoading || !form.formState.isValid}
            loading={form.formState.isLoading}
          >
            {!form.formState.isLoading && (
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