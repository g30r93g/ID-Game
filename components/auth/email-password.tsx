import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import SignUp from "@/components/auth/sign-up";
import SignIn from "@/components/auth/sign-in";

export default function EmailPasswordAuthMethod() {

  return (
    <div className={"mt-4 p-4 rounded-lg"}>
      <Tabs defaultValue="signIn" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signIn">Sign In</TabsTrigger>
          <TabsTrigger value="signUp">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="signIn">
          <SignIn />
        </TabsContent>
        <TabsContent value="signUp">
          <SignUp />
        </TabsContent>
      </Tabs>
    </div>
  )
}