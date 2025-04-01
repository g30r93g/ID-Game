"use client";

import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Input} from "@/components/ui/input";
import {LoadingButton} from "@/components/ui/loading-button";
import {ArrowRight} from "lucide-react";
import z from "zod";
import {useAuthActions} from "@convex-dev/auth/react";
import {useRouter} from "next/navigation";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

export default function SignIn() {
  const { signIn } = useAuthActions();
  const { replace } = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  async function onSignInSubmit(values: z.infer<typeof formSchema>) {
    await signIn("password", {
      ...values,
      flow: 'signIn',
      redirectTo: '/game'
    });

    // redirect to game
    replace(`/game`)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSignInSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} className={"bg-white"} type={"email"} autoComplete={"email"} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input {...field} className={"bg-white"} type={"password"} autoComplete={"current-password"} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <LoadingButton
          loading={form.formState.isLoading}
          disabled={form.formState.isLoading}
          className={"float-right"}
        >
          {!form.formState.isLoading && (
            <>
              Sign In
              <ArrowRight />
            </>
          )}
        </LoadingButton>
      </form>
    </Form>
  )
}