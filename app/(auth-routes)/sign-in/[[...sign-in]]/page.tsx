"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Fingerprint } from "lucide-react";

type Step = "start" | "otp" | "add-passkey";

const RESEND_SECONDS = 30;

export default function SignInPage() {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("start");
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
            onSuccess: () => router.push("/game"),
          },
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handlePasskey = async () => {
    setError(null);
    setBusy(true);
    const { error } = await authClient.signIn.passkey();
    setBusy(false);
    if (error) {
      setError(
        error.message ??
          "Passkey sign-in failed. Try emailing yourself a code instead.",
      );
      return;
    }
    router.push("/game");
  };

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "sign-in",
    });
    setBusy(false);
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
  };

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendCode();
  };

  const verifyCode = async (value: string) => {
    setError(null);
    setBusy(true);
    const trimmedName = name.trim();
    const { error } = await authClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: value,
      // Only used when this OTP registers a brand-new account.
      ...(trimmedName ? { name: trimmedName } : {}),
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? "That code didn’t work. Try again or resend.");
      return;
    }
    // Signed in — nudge towards a passkey if they don't have one yet.
    const { data: passkeys } = await authClient.passkey.listUserPasskeys();
    if (!passkeys || passkeys.length === 0) {
      setStep("add-passkey");
    } else {
      router.push("/game");
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyCode(code);
  };

  const handleAddPasskey = async () => {
    setError(null);
    setBusy(true);
    const result = await authClient.passkey.addPasskey();
    setBusy(false);
    if (result?.error) {
      setError(
        result.error.message ?? "Could not create a passkey on this device.",
      );
      return;
    }
    router.push("/game");
  };

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      {step === "start" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleStart}>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Let&apos;s get you playing</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={handlePasskey}
              >
                <Fingerprint className="mr-2 size-4" />
                Continue with passkey
              </Button>
              <p className="flex items-center gap-x-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                or
              </p>
              <div className="space-y-2">
                <Label htmlFor="identifier">Email address</Label>
                <Input
                  id="identifier"
                  type="email"
                  autoComplete="username webauthn"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">
                  Display name{" "}
                  <span className="text-muted-foreground font-normal">
                    (first time playing?)
                  </span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              {error && (
                <p className="block text-sm text-destructive">{error}</p>
              )}
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Email me a code"
                  )}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "otp" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleCodeSubmit}>
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
                onClick={() => router.push("/game")}
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
