import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import EmailPasswordAuthMethod from "@/components/auth/email-password";

export default function AuthPage() {
  return (
    <div className={"container min-h-svh max-h-lvh flex items-center justify-center"}>
      <Card className={"w-full md:w-[75%]"}>
        <CardHeader>
          <CardTitle>Identify Yourself</CardTitle>
          <CardDescription>Create an account or sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={"grid grid-cols-1 gap-4 mb-4"}>

          </div>
          <Separator className={"w-full"} />
          <EmailPasswordAuthMethod />
        </CardContent>
      </Card>
    </div>
  )
}