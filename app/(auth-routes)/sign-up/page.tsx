import { redirect } from "next/navigation";

// Sign-up and sign-in are one flow now; keep old links working.
export default function SignUpPage() {
  redirect("/sign-in");
}
