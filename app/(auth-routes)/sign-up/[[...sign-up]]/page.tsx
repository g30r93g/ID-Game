"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type Step = "start" | "continue" | "verifications";

const RESEND_SECONDS = 30;

export default function SignUpPage() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("start");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [code, setCode] = React.useState("");
  const [resendCountdown, setResendCountdown] = React.useState(0);
  const [googleLoading, setGoogleLoading] = React.useState(false);

  const isBusy = fetchStatus === "fetching";

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // The navigate callback param type, derived from the installed types without a
  // direct import (only @clerk/nextjs is resolvable from the app).
  type NavigateParams = Parameters<
    NonNullable<NonNullable<Parameters<typeof signUp.finalize>[0]>["navigate"]>
  >[0];

  const navigate = ({ session, decorateUrl }: NavigateParams) => {
    if (session?.currentTask) return;
    const url = decorateUrl("/game");
    if (url.startsWith("http")) {
      window.location.href = url;
    } else {
      router.push(url);
    }
  };

  // Advance the flow based on the current sign-up status: collect any missing
  // fields (e.g. username if the instance requires it), verify email, or finalize.
  const advance = async () => {
    if (signUp.status === "complete") {
      await signUp.finalize({ navigate });
      return;
    }
    if (signUp.missingFields.includes("username")) {
      setStep("continue");
      return;
    }
    if (signUp.unverifiedFields.includes("email_address")) {
      const { error } = await signUp.verifications.sendEmailCode();
      if (!error) {
        setCode("");
        setResendCountdown(RESEND_SECONDS);
        setStep("verifications");
      }
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await signUp.sso({
      strategy: "oauth_google",
      redirectUrl: "/game",
      redirectCallbackUrl: "/sso-callback",
    });
    if (error) setGoogleLoading(false);
  };

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    const { error } = await signUp.password({
      emailAddress: email,
      password,
      firstName,
      lastName,
    });
    if (!error) await advance();
  };

  const handleContinue = async (event: React.FormEvent) => {
    event.preventDefault();
    const { error } = await signUp.update({ username });
    if (!error) await advance();
  };

  const verifyEmailCode = async (value: string) => {
    const { error } = await signUp.verifications.verifyEmailCode({
      code: value,
    });
    // Mirror handleStart/handleContinue: on success, hand off to advance() so a
    // still-outstanding requirement (e.g. a required username) moves the flow
    // forward instead of dead-ending. advance() finalizes when complete.
    if (!error) await advance();
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyEmailCode(code);
  };

  const resendEmailCode = async () => {
    const { error } = await signUp.verifications.sendEmailCode();
    if (!error) setResendCountdown(RESEND_SECONDS);
  };

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      {step === "start" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleStart}>
            <CardHeader>
              <CardTitle>Create your account</CardTitle>
              <CardDescription>
                Welcome! Please fill in the details to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={isBusy || googleLoading}
                onClick={handleGoogle}
              >
                {googleLoading ? (
                  <Icons.spinner className="size-4 animate-spin" />
                ) : (
                  <>
                    <Icons.google className="mr-2 size-4" />
                    Google
                  </>
                )}
              </Button>
              <p className="flex items-center gap-x-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                or
              </p>
              <div className="grid grid-cols-2 gap-x-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                  {errors.fields.firstName && (
                    <p className="block text-sm text-destructive">
                      {errors.fields.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                  {errors.fields.lastName && (
                    <p className="block text-sm text-destructive">
                      {errors.fields.lastName.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emailAddress">Email address</Label>
                <Input
                  id="emailAddress"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {errors.fields.emailAddress && (
                  <p className="block text-sm text-destructive">
                    {errors.fields.emailAddress.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {errors.fields.password && (
                  <p className="block text-sm text-destructive">
                    {errors.fields.password.message}
                  </p>
                )}
              </div>
              {errors.global && errors.global.length > 0 && (
                <p className="block text-sm text-destructive">
                  {errors.global[0].message}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                {/* Clerk bot sign-up protection (CAPTCHA). Required by default. */}
                <div id="clerk-captcha" className="empty:hidden" />
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </Button>
                <Button variant="link" size="sm" asChild>
                  <Link href="/sign-in">Already have an account? Sign in</Link>
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "continue" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleContinue}>
            <CardHeader>
              <CardTitle>Continue registration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                {errors.fields.username && (
                  <p className="block text-sm text-destructive">
                    {errors.fields.username.message}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "verifications" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleCodeSubmit}>
            <CardHeader>
              <CardTitle>Verify your email</CardTitle>
              <CardDescription>
                Enter the verification code sent to your email address
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <div className="grid items-center justify-center gap-y-2">
                <div className="flex justify-center text-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(value) => {
                      setCode(value);
                      if (value.length === 6) void verifyEmailCode(value);
                    }}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {errors.fields.code && (
                  <p className="block text-center text-sm text-destructive">
                    {errors.fields.code.message}
                  </p>
                )}
                {errors.global && errors.global.length > 0 && (
                  <p className="block text-center text-sm text-destructive">
                    {errors.global[0].message}
                  </p>
                )}
                {resendCountdown > 0 ? (
                  <Button variant="link" size="sm" type="button" disabled>
                    Didn&apos;t receive a code? Resend (
                    <span className="tabular-nums">{resendCountdown}</span>)
                  </Button>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    type="button"
                    disabled={isBusy}
                    onClick={resendEmailCode}
                  >
                    Didn&apos;t receive a code? Resend
                  </Button>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
