"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fingerprint, Mail } from "lucide-react";

type Step = "start" | "otp" | "add-passkey";
type Mode = "sign-in" | "sign-up";

const RESEND_SECONDS = 30;

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextPath =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/game";

  const [step, setStep] = React.useState<Step>("start");
  const [mode, setMode] = React.useState<Mode>(
    searchParams.get("tab") === "sign-up" ? "sign-up" : "sign-in",
  );
  // Sign-in tab is passkey-first; the email/OTP fields stay hidden until asked for.
  const [showEmailFlow, setShowEmailFlow] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [resendCountdown, setResendCountdown] = React.useState(0);

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Conditional-UI passkey autofill: offer stored passkeys from the email
  // field's autocomplete dropdown on supporting browsers.
  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential?.isConditionalMediationAvailable
    )
      return;
    let cancelled = false;
    void PublicKeyCredential.isConditionalMediationAvailable().then(
      (available) => {
        if (!available || cancelled) return;
        void authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: {
            onSuccess: () => router.push(nextPath),
          },
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const handlePasskey = async () => {
    setError(null);
    setBusy(true);
    try {
      const { error } = await authClient.signIn.passkey();
      if (error) {
        setError(
          error.message ??
            "Passkey sign-in failed. Try emailing yourself a code instead.",
        );
        return;
      }
      router.push(nextPath);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "sign-in",
      });
      if (error) {
        setError(
          error.message ??
            "Could not send the code. Check the email address and try again.",
        );
        return;
      }
      setCode("");
      setResendCountdown(RESEND_SECONDS);
      setStep("otp");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendCode();
  };

  const verifyCode = async (value: string) => {
    setError(null);
    setBusy(true);
    try {
      const trimmedName = name.trim();
      const { error } = await authClient.signIn.emailOtp({
        email: email.trim().toLowerCase(),
        otp: value,
        // Only used when this OTP registers a brand-new account (sign-up tab).
        ...(mode === "sign-up" && trimmedName ? { name: trimmedName } : {}),
      });
      if (error) {
        setError(
          error.message ?? "That code didn’t work. Try again or resend.",
        );
        return;
      }
      // Signed in — nudge towards a passkey if they don't have one yet.
      const { data: passkeys } = await authClient.passkey.listUserPasskeys();
      if (!passkeys || passkeys.length === 0) {
        setStep("add-passkey");
      } else {
        router.push(nextPath);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyCode(code);
  };

  const handleAddPasskey = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await authClient.passkey.addPasskey();
      if (result?.error) {
        setError(
          result.error.message ?? "Could not create a passkey on this device.",
        );
        return;
      }
      router.push(nextPath);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      {step === "start" && (
        <Card className="w-full sm:w-96">
          <Tabs
            className="contents"
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode);
              setShowEmailFlow(false);
              setError(null);
            }}
          >
            <form className="contents" onSubmit={handleStart}>
              <CardHeader>
                <TabsList className="mb-2 grid w-full grid-cols-2">
                  <TabsTrigger value="sign-in" disabled={busy}>
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger value="sign-up" disabled={busy}>
                    Sign up
                  </TabsTrigger>
                </TabsList>
                <CardTitle>
                  {mode === "sign-in" ? "Welcome back" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "sign-in"
                    ? "Let's get you playing again"
                    : "Let's get you playing"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-y-4">
                {mode === "sign-in" && !showEmailFlow && (
                  <p className="text-sm text-muted-foreground">
                    Sign in with your face, fingerprint, or device PIN.
                  </p>
                )}
                {(mode === "sign-up" || showEmailFlow) && (
                  <div className="space-y-2">
                    <Label htmlFor="identifier">Email address</Label>
                    <Input
                      id="identifier"
                      type="email"
                      autoComplete="username webauthn"
                      autoFocus={mode === "sign-in"}
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                )}
                {mode === "sign-up" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Display name</Label>
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                )}
                {error && (
                  <p className="block text-sm text-destructive">{error}</p>
                )}
              </CardContent>
              <CardFooter>
                <div className="grid w-full gap-y-3">
                  {mode === "sign-in" && !showEmailFlow && (
                    <>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={handlePasskey}
                      >
                        {busy ? (
                          <Icons.spinner className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Fingerprint className="mr-2 size-4" />
                            Continue with passkey
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setShowEmailFlow(true);
                          setError(null);
                        }}
                      >
                        <Mail className="mr-2 size-4" />
                        Email me a code
                      </Button>
                    </>
                  )}
                  {(mode === "sign-up" || showEmailFlow) && (
                    <Button type="submit" disabled={busy}>
                      {busy ? (
                        <Icons.spinner className="size-4 animate-spin" />
                      ) : mode === "sign-up" ? (
                        <>
                          <Mail className="mr-2 size-4" />
                          Email me a code
                        </>
                      ) : (
                        "Send code"
                      )}
                    </Button>
                  )}
                  {mode === "sign-in" && showEmailFlow && (
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      disabled={busy}
                      onClick={() => {
                        setShowEmailFlow(false);
                        setError(null);
                      }}
                    >
                      Use a passkey instead
                    </Button>
                  )}
                </div>
              </CardFooter>
            </form>
          </Tabs>
        </Card>
      )}

      {step === "otp" && (
        <Card className="w-full sm:w-96">
          <form className="contents" onSubmit={handleCodeSubmit}>
            <CardHeader>
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                Enter the sign-in code sent to your email
              </CardDescription>
              <p className="text-sm text-muted-foreground">{email}</p>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <div className="grid items-center justify-center gap-y-2">
                <div className="flex justify-center text-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    disabled={busy}
                    onChange={(value) => {
                      setCode(value);
                      if (value.length === 6) void verifyCode(value);
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
                {error && (
                  <p className="block text-center text-sm text-destructive">
                    {error}
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
                    disabled={busy}
                    onClick={sendCode}
                  >
                    Didn&apos;t receive a code? Resend
                  </Button>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  onClick={() => {
                    setStep("start");
                    setError(null);
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "add-passkey" && (
        <Card className="w-full sm:w-96">
          <CardHeader>
            <CardTitle>Add a passkey</CardTitle>
            <CardDescription>
              Sign in next time with your fingerprint, face, or device PIN — no
              codes needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-y-4">
            {error && <p className="block text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <div className="grid w-full gap-y-4">
              <Button type="button" disabled={busy} onClick={handleAddPasskey}>
                {busy ? (
                  <Icons.spinner className="size-4 animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="mr-2 size-4" />
                    Create passkey
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={() => router.push(nextPath)}
              >
                Maybe later
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
