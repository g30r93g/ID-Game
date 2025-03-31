"use client";

import z from "zod";
import {useAuthActions} from "@convex-dev/auth/react";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Input} from "@/components/ui/input";
import {LoadingButton} from "@/components/ui/loading-button";
import {ArrowRight} from "lucide-react";
import {useRouter} from "next/navigation";
import {useMutation} from "convex/react";
import {api} from "@/convex/_generated/api";

const signInFormSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

const signUpFormSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string().regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$ %^&*-]).{8,}$/gm)
})

export default function EmailPasswordAuthMethod() {
  const { signIn } = useAuthActions();
  const { replace } = useRouter();
  const addNameToUser = useMutation(api.users.updateUserName)

  const signInForm = useForm<z.infer<typeof signInFormSchema>>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });
  const signUpForm = useForm<z.infer<typeof signUpFormSchema>>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: ""
    }
  })

  async function onSignInSubmit(values: z.infer<typeof signInFormSchema>) {
    console.log("onSignInSubmit", values);

    await signIn("password", {
      ...values,
      flow: 'signIn'
    });

    // redirect to game
    replace(`/game`)
  }

  async function onSignUpSubmit(values: z.infer<typeof signUpFormSchema>) {
    console.log("onSignUpSubmit", values);

    await signIn("password", {
      ...values,
      flow: 'signUp'
    });

    // ensure name is set on user
    await addNameToUser({ name: values.name })

    // redirect to game
    replace(`/game`)
  }

  const SignInTabContent = (
    <Form {...signInForm}>
      <form onSubmit={signInForm.handleSubmit(onSignInSubmit)} className="space-y-6">
        <FormField
          control={signInForm.control}
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
          control={signInForm.control}
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
          loading={signInForm.formState.isLoading}
          disabled={signInForm.formState.isLoading}
          type="submit"
          className={"float-right"}
        >
          {!signInForm.formState.isLoading && (
            <>
              Sign In
              <ArrowRight />
            </>
          )}
          <ArrowRight />
        </LoadingButton>
      </form>
    </Form>
  )

  const SignUpTabContent = (
    <Form {...signUpForm}>
      <form onSubmit={signUpForm.handleSubmit(onSignUpSubmit)} className="space-y-6">
        <FormField
          control={signUpForm.control}
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
        control={signUpForm.control}
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
          control={signUpForm.control}
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
          loading={signUpForm.formState.isLoading}
          disabled={signUpForm.formState.isLoading}
          type="submit"
          className={"float-right"}
        >
          {!signUpForm.formState.isLoading && (
            <>
              Sign Up
              <ArrowRight />
            </>
          )}
        </LoadingButton>
      </form>
    </Form>
  )

  return (
    <div className={"mt-4 p-4 rounded-lg bg-neutral-50/50"}>
      <Tabs defaultValue="signIn" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signIn">Sign In</TabsTrigger>
          <TabsTrigger value="signUp">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="signIn">{SignInTabContent}</TabsContent>
        <TabsContent value="signUp">{SignUpTabContent}</TabsContent>
      </Tabs>
    </div>
  )
}