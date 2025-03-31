"use client";

import {useAuthActions} from "@convex-dev/auth/react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {
  // FaApple,
  FaGoogle
} from "react-icons/fa6";
import {IconType} from "react-icons/lib";
import {Button} from "@/components/ui/button";
import {Separator} from "@/components/ui/separator";
import EmailPasswordAuthMethod from "@/components/auth/email-password";

interface Provider {
  name: string;
  slug: string;
  icon: IconType,
  disabled: boolean;
}

const providers: Provider[] = [
  // {
  //   name: "Apple",
  //   slug: "apple",
  //   icon: FaApple,
  //   disabled: true,
  // },
  {
    name: "Google",
    slug: "google",
    icon: FaGoogle,
    disabled: false,
  }
]

export default function AuthPage() {
  const { signIn } = useAuthActions();

  return (
    <div className={"container min-h-svh max-h-lvh flex items-center justify-center"}>
      <Card className={"w-full md:w-[75%]"}>
        <CardHeader>
          <CardTitle>Identify Yourself</CardTitle>
          <CardDescription>Create an account or sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={"grid grid-cols-1 gap-4 mb-4"}>
            {providers.map(provider => (
              <Button
                key={provider.slug}
                variant={"secondary"}
                size={"lg"}
                onClick={() => void signIn(provider.slug, { redirectTo: "/game" })}
                title={`Sign In with ${provider.name}`}
                disabled={provider.disabled}
                className={provider.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
              >
                <provider.icon className={"size-4"} />
                Sign In With {provider.name}
              </Button>
            ))}
            </div>
          <Separator className={"w-full"} />
          <EmailPasswordAuthMethod />
        </CardContent>
      </Card>
    </div>
  )
}