import { redirect } from "next/navigation";

// Sign-up and sign-in are one page now; deep-link to its sign-up tab.
export default function SignUpPage() {
  redirect("/sign-in?tab=sign-up");
}
