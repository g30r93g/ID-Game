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
import {
  clearPasskeyNudge,
  dismissPasskeyNudge,
  isPasskeyNudgeDue,
} from "@/lib/passkey-nudge";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";

// "redirecting" covers the window between a credential being accepted and the
// destination painting. It is not cosmetic: `proxy.ts` gates /game on session
// cookie presence alone, so the route is reachable a beat before the Convex
// client holds a token, and without this the app looks stalled.
type Step = "start" | "otp" | "add-passkey" | "redirecting";
type Mode = "sign-in" | "sign-up";
// Which auth action is in flight. A single boolean can't distinguish "waiting on
// the OS passkey sheet" (which can sit open for many seconds) from "verifying
// your code", so every button would show the same bare spinner.
type AuthAction = null | "passkey" | "send-code" | "verify" | "add-passkey";

const RESEND_SECONDS = 30;

// Codes the passkey client reports when the WebAuthn ceremony itself never
// produced a credential: a dismissed OS sheet arrives as NotAllowedError, which
// SimpleWebAuthn passes through as ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY; an
// aborted ceremony is ERROR_CEREMONY_ABORTED; anything it can't classify falls
// back to AUTH_CANCELLED. The client overwrites the message with "Auth
// cancelled" in every case, so none of them is worth showing as a failure —
// platforms overload NotAllowedError for "you backed out" and "no usable
// credential here" alike, and both want the same next step: email a code.
const WEBAUTHN_NO_CREDENTIAL_CODES = new Set([
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
  "ERROR_CEREMONY_ABORTED",
  "AUTH_CANCELLED",
]);

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
  // Set once a passkey attempt ends without a credential, which flips the email
  // path to be the primary action rather than the secondary one.
  const [passkeyUnavailable, setPasskeyUnavailable] = React.useState(false);
  const [action, setAction] = React.useState<AuthAction>(null);
  const [resendCountdown, setResendCountdown] = React.useState(0);

  // Any action in flight still disables every control, so the existing
  // `disabled={busy}` props keep their meaning.
  const busy = action !== null;

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Conditional-UI passkey autofill: offer stored passkeys from the email
  // field's autocomplete dropdown on supporting browsers.
  //
  // The ceremony can outlive this component and there is no way to abort it from
  // here: `signIn.passkey` never forwards a signal to navigator.credentials.get()
  // (`fetchOptions.signal` reaches only the verify request). That is survivable,
  // because SimpleWebAuthn's WebAuthnAbortService aborts any in-flight ceremony
  // whenever a new one begins — so pressing "Continue with passkey" supersedes
  // this autofill on its own. What it cannot prevent is a late autofill success
  // navigating a component that has already gone away, so `onSuccess` is guarded
  // too, not just the availability check.
  const autofillLive = React.useRef(true);
  React.useEffect(() => {
    autofillLive.current = true;
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential?.isConditionalMediationAvailable
    )
      return;
    void PublicKeyCredential.isConditionalMediationAvailable().then(
      (available) => {
        if (!available || !autofillLive.current) return;
        void authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: {
            onSuccess: () => {
              if (!autofillLive.current) return;
              setStep("redirecting");
              router.push(nextPath);
            },
          },
        });
      },
    );
    return () => {
      autofillLive.current = false;
    };
  }, [router, nextPath]);

  const handlePasskey = async () => {
    setError(null);
    setAction("passkey");
    try {
      const { error } = await authClient.signIn.passkey();
      if (error) {
        // The ceremony produced no credential. Don't shout about it — just lead
        // with the email fallback instead. Only the WebAuthn-layer arm of the
        // error union carries `code`, hence the `in` narrowing.
        const code = "code" in error ? error.code : undefined;
        if (WEBAUTHN_NO_CREDENTIAL_CODES.has(code ?? "")) {
          setPasskeyUnavailable(true);
          return;
        }
        setError(
          error.message ??
            "Passkey sign-in failed. Try emailing yourself a code instead.",
        );
        return;
      }
      setStep("redirecting");
      router.push(nextPath);
    } finally {
      setAction(null);
    }
  };

  const sendCode = async () => {
    setError(null);
    setAction("send-code");
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
      setAction(null);
    }
  };

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    // `required` accepts a field of spaces, and a blank name is exactly what
    // leaves someone showing up as "Unknown Player" later on.
    if (mode === "sign-up" && !name.trim()) {
      setError("Enter the name you want other players to see.");
      return;
    }
    await sendCode();
  };

  const verifyCode = async (value: string) => {
    setError(null);
    setAction("verify");
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
      // Signed in — nudge towards a passkey if they don't have one yet and
      // haven't turned it down recently.
      const { data: passkeys } = await authClient.passkey.listUserPasskeys();
      if ((!passkeys || passkeys.length === 0) && isPasskeyNudgeDue()) {
        setStep("add-passkey");
      } else {
        setStep("redirecting");
        router.push(nextPath);
      }
    } finally {
      setAction(null);
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyCode(code);
  };

  const handleAddPasskey = async () => {
    setError(null);
    setAction("add-passkey");
    try {
      const result = await authClient.passkey.addPasskey();
      if (result?.error) {
        setError(
          result.error.message ?? "Could not create a passkey on this device.",
        );
        return;
      }
      // A passkey exists now; re-arm the prompt in case it is later removed.
      clearPasskeyNudge();
      setStep("redirecting");
      router.push(nextPath);
    } finally {
      setAction(null);
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
              setPasskeyUnavailable(false);
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
                    {passkeyUnavailable
                      ? "No passkey was used on this device. Email yourself a code instead — you can add a passkey afterwards."
                      : "Sign in with your face, fingerprint, or device PIN."}
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
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
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
                        variant={passkeyUnavailable ? "outline" : "default"}
                        disabled={busy}
                        onClick={handlePasskey}
                      >
                        {action === "passkey" ? (
                          <>
                            <Icons.spinner className="mr-2 size-4 animate-spin" />
                            Waiting for your device…
                          </>
                        ) : (
                          <>
                            <Fingerprint className="mr-2 size-4" />
                            Continue with passkey
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant={passkeyUnavailable ? "default" : "outline"}
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
                      {action === "send-code" ? (
                        <>
                          <Icons.spinner className="mr-2 size-4 animate-spin" />
                          Sending…
                        </>
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
                    autoComplete="one-time-code"
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
                    {action === "send-code"
                      ? "Sending…"
                      : "Didn't receive a code? Resend"}
                  </Button>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={busy}>
                  {action === "verify" ? (
                    <>
                      <Icons.spinner className="mr-2 size-4 animate-spin" />
                      Verifying…
                    </>
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
            <CardTitle>Skip the code next time</CardTitle>
            <CardDescription>
              Add a passkey and you&apos;ll sign straight in with your
              fingerprint, face, or device PIN — no waiting on an email, nothing
              to type.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-y-4">
            {error && <p className="block text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <div className="grid w-full gap-y-4">
              <Button type="button" disabled={busy} onClick={handleAddPasskey}>
                {action === "add-passkey" ? (
                  <>
                    <Icons.spinner className="mr-2 size-4 animate-spin" />
                    Waiting for your device…
                  </>
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
                onClick={() => {
                  dismissPasskeyNudge();
                  setStep("redirecting");
                  router.push(nextPath);
                }}
              >
                Maybe later
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {step === "redirecting" && (
        <Card className="w-full sm:w-96">
          <CardHeader>
            <CardTitle>Signing you in…</CardTitle>
            <CardDescription>
              You&apos;re all set — getting your games ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <Icons.spinner className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
