'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/ui/icons'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

type Step = 'start' | 'choose-strategy' | 'verifications'
type Strategy = 'password' | 'email_code'

const RESEND_SECONDS = 30

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const router = useRouter()

  const [step, setStep] = React.useState<Step>('start')
  const [strategy, setStrategy] = React.useState<Strategy>('email_code')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [code, setCode] = React.useState('')
  const [resendCountdown, setResendCountdown] = React.useState(0)
  const [googleLoading, setGoogleLoading] = React.useState(false)

  const isBusy = fetchStatus === 'fetching'

  React.useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setInterval(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCountdown])

  // The navigate callback param type, derived from the installed types without a
  // direct import (only @clerk/nextjs is resolvable from the app).
  type NavigateParams = Parameters<
    NonNullable<NonNullable<Parameters<typeof signIn.finalize>[0]>['navigate']>
  >[0]

  const navigate = ({ session, decorateUrl }: NavigateParams) => {
    // Pending session tasks (e.g. MFA setup, org selection) are handled by Clerk.
    if (session?.currentTask) return
    const url = decorateUrl('/game')
    if (url.startsWith('http')) {
      window.location.href = url
    } else {
      router.push(url)
    }
  }

  const finalizeIfComplete = async () => {
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate })
    }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    const { error } = await signIn.sso({
      strategy: 'oauth_google',
      redirectUrl: '/game',
      redirectCallbackUrl: '/sso-callback',
    })
    // On success the browser is redirected to Google, so we only reach here on error.
    if (error) setGoogleLoading(false)
  }

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault()
    const { error } = await signIn.create({ identifier: email, signUpIfMissing: true })
    if (!error) setStep('choose-strategy')
  }

  const chooseEmailCode = async () => {
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email })
    if (!error) {
      setStrategy('email_code')
      setCode('')
      setResendCountdown(RESEND_SECONDS)
      setStep('verifications')
    }
  }

  const choosePassword = () => {
    setStrategy('password')
    setPassword('')
    setStep('verifications')
  }

  const resendEmailCode = async () => {
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email })
    if (!error) setResendCountdown(RESEND_SECONDS)
  }

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await signIn.password({ identifier: email, password })
    await finalizeIfComplete()
  }

  const verifyEmailCode = async (value: string) => {
    await signIn.emailCode.verifyCode({ code: value })
    await finalizeIfComplete()
  }

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await verifyEmailCode(code)
  }

  const goBackToStart = async () => {
    await signIn.reset()
    setStep('start')
    setPassword('')
    setCode('')
  }

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      {step === 'start' && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleStart}>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Let&apos;s get you playing again</CardDescription>
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
              <div className="space-y-2">
                <Label htmlFor="identifier">Email address</Label>
                <Input
                  id="identifier"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {errors.fields.identifier && (
                  <p className="block text-sm text-destructive">
                    {errors.fields.identifier.message}
                  </p>
                )}
              </div>
              {errors.global && errors.global.length > 0 && (
                <p className="block text-sm text-destructive">{errors.global[0].message}</p>
              )}
              {/* Clerk bot protection (required when signUpIfMissing triggers a transfer). */}
              <div id="clerk-captcha" className="empty:hidden" />
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? <Icons.spinner className="size-4 animate-spin" /> : 'Continue'}
                </Button>
                <Button variant="link" size="sm" asChild>
                  <Link href="/sign-up">Don&apos;t have an account? Sign up</Link>
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === 'choose-strategy' && (
        <Card className="w-full sm:w-96">
          <CardHeader>
            <CardTitle>Use another method</CardTitle>
            <CardDescription>
              Facing issues? You can use any of these methods to sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-y-4">
            <Button
              type="button"
              variant="link"
              disabled={isBusy}
              onClick={chooseEmailCode}
            >
              Email code
            </Button>
            <Button
              type="button"
              variant="link"
              disabled={isBusy}
              onClick={choosePassword}
            >
              Password
            </Button>
          </CardContent>
          <CardFooter>
            <div className="grid w-full gap-y-4">
              <Button type="button" disabled={isBusy} onClick={goBackToStart}>
                Go back
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {step === 'verifications' && strategy === 'password' && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handlePasswordSubmit}>
            <CardHeader>
              <CardTitle>Enter your password</CardTitle>
              <CardDescription>Enter the password linked to your account</CardDescription>
              <p className="text-sm text-muted-foreground">Welcome back {email}</p>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
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
                <p className="block text-sm text-destructive">{errors.global[0].message}</p>
              )}
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? <Icons.spinner className="size-4 animate-spin" /> : 'Continue'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  onClick={() => setStep('choose-strategy')}
                >
                  Use another method
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === 'verifications' && strategy === 'email_code' && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleCodeSubmit}>
            <CardHeader>
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                Enter the verification code sent to your email
              </CardDescription>
              <p className="text-sm text-muted-foreground">Welcome back {email}</p>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <div className="grid items-center justify-center gap-y-2">
                <div className="flex justify-center text-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(value) => {
                      setCode(value)
                      if (value.length === 6) void verifyEmailCode(value)
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
                  {isBusy ? <Icons.spinner className="size-4 animate-spin" /> : 'Continue'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  onClick={() => setStep('choose-strategy')}
                >
                  Use another method
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  )
}
