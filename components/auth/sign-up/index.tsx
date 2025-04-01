"use client";

import z from "zod";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {useAuthActions} from "@convex-dev/auth/react";
import {useRouter} from "next/navigation";
import {useMutation} from "convex/react";
import {api} from "@/convex/_generated/api";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Input} from "@/components/ui/input";
import {LoadingButton} from "@/components/ui/loading-button";
import {ArrowRight} from "lucide-react";
import {useEffect, useState} from "react";
import {toast} from "sonner";

const formSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$ %^&*-]).{8,}$/gm)
})

export default function SignUp() {
  const { signIn } = useAuthActions();
  const { replace } = useRouter();
  const addNameToUser = useMutation(api.users.updateUserName)

  const [isSubmitting, setSubmitting] = useState<boolean>(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: ""
    }
  });

  useEffect(() => {
    console.log("form loading state changed", form.formState.isLoading)
  }, [form.formState.isLoading]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setSubmitting(true);
      await signIn("password", { ...values, flow: 'signUp' });

      await addNameToUser({ name: values.name });

      replace(`/game`);
    } catch (error) {
      console.error("Sign-up failed:", error);
      toast('Sign up failed', { description: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} className={"bg-white"} type={"text"} autoComplete={"name"} />
              </FormControl>
              <FormDescription>
                Enter the name you wish to be referred to by.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        /><FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input {...field} className={"bg-white"} type={"email"} autoComplete={"email"} />
            </FormControl>
            <FormDescription>
              You will sign in with this email.
            </FormDescription>
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
                <Input {...field} className={"bg-white"} type={"password"} autoComplete={"new-password"} />
              </FormControl>
              <FormDescription>
                Must be a minimum of 8 characters, have 1 uppercase, 1 number and at least 1 special character.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <LoadingButton
          loading={isSubmitting}
          disabled={isSubmitting || !form.formState.isValid || form.formState.isValidating}
          className={"float-right"}
        >
          {!isSubmitting && (
            <>
              Sign Up
              <ArrowRight />
            </>
          )}
        </LoadingButton>
      </form>
    </Form>
  )
}