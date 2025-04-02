"use client";

export default function SignUp() {
  // const { replace } = useRouter();
  // const addNameToUser = useMutation(api.users.updateUserName)
  //
  // const [isSubmitting, setSubmitting] = useState<boolean>(false);
  // const form = useForm<z.infer<typeof formSchema>>({
  //   resolver: zodResolver(formSchema),
  //   defaultValues: {
  //     name: "",
  //     email: "",
  //     password: ""
  //   }
  // });
  //
  // async function onSubmit({ name, email, password }: z.infer<typeof formSchema>) {
  //   setSubmitting(true);
  //
  //   // Convert values to FormData
  //   const formData = new FormData();
  //
  //   formData.set("email", email.toLowerCase().trim());
  //   formData.set("password", password);
  //   formData.set("name", name);
  //   formData.set("flow", 'signUp');
  //
  //   await signIn("password", formData);
  //
  //   signIn("password", formData)
  //     .catch((error) => {
  //       setSubmitting(false);
  //       console.error("Sign-up failed:", error);
  //       toast('Sign up failed', { description: (error as Error).message });
  //     })
  // }
  //
  // return (
  //   <Form {...form}>
  //     <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
  //       <FormField
  //         control={form.control}
  //         name="name"
  //         render={({ field }) => (
  //           <FormItem>
  //             <FormLabel>Name</FormLabel>
  //             <FormControl>
  //               <Input {...field} className={"bg-white"} type={"text"} autoComplete={"name"} />
  //             </FormControl>
  //             <FormDescription>
  //               Enter the name you wish to be referred to by.
  //             </FormDescription>
  //             <FormMessage />
  //           </FormItem>
  //         )}
  //       /><FormField
  //       control={form.control}
  //       name="email"
  //       render={({ field }) => (
  //         <FormItem>
  //           <FormLabel>Email</FormLabel>
  //           <FormControl>
  //             <Input {...field} className={"bg-white"} type={"email"} autoComplete={"email"} />
  //           </FormControl>
  //           <FormDescription>
  //             You will sign in with this email.
  //           </FormDescription>
  //           <FormMessage />
  //         </FormItem>
  //       )}
  //     />
  //       <FormField
  //         control={form.control}
  //         name="password"
  //         render={({ field }) => (
  //           <FormItem>
  //             <FormLabel>Password</FormLabel>
  //             <FormControl>
  //               <Input {...field} className={"bg-white"} type={"password"} autoComplete={"new-password"} />
  //             </FormControl>
  //             <FormDescription>
  //               Must be a minimum of 8 characters, have 1 uppercase, 1 number and at least 1 special character.
  //             </FormDescription>
  //             <FormMessage />
  //           </FormItem>
  //         )}
  //       />
  //       <LoadingButton
  //         loading={isSubmitting}
  //         disabled={isSubmitting || !form.formState.isValid || form.formState.isValidating}
  //         className={"float-right"}
  //       >
  //         {!isSubmitting && (
  //           <>
  //             Sign Up
  //             <ArrowRight />
  //           </>
  //         )}
  //       </LoadingButton>
  //     </form>
  //   </Form>
  // )

  return <p>Sign Up</p>
}