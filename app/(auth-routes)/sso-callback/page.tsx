'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useClerk, useSignIn, useSignUp } from '@clerk/nextjs'
import { Icons } from '@/components/ui/icons'

export default function SSOCallbackPage() {
  const { signIn, fetchStatus: signInFetch, errors: signInErrors } = useSignIn()
  const { signUp, fetchStatus: signUpFetch, errors: signUpErrors } = useSignUp()
  const clerk = useClerk()
  const router = useRouter()
  // Guards only the TERMINAL action (finalize / setActive / redirect). It is
  // deliberately NOT wrapped around the whole effect: clerk-js hydrates the
  // OAuth callback asynchronously, so the first tick(s) after mount can be empty
  // and must NOT permanently give up — the effect re-runs as the resources
  // settle and finalizes exactly once.
  const ranOnce = React.useRef(false)
  const loaded = clerk.loaded

  React.useEffect(() => {
    // Do nothing until clerk-js has finished loading; reading resource state
    // before this point yields the pre-hydration (empty) values.
    if (!loaded) return
    // A terminal action has already been taken — nothing left to reconcile.
    if (ranOnce.current) return

    const navigate = ({
      session,
      decorateUrl,
    }: Parameters<
      NonNullable<NonNullable<Parameters<typeof signIn.finalize>[0]>['navigate']>
    >[0]) => {
      if (session?.currentTask) return
      const url = decorateUrl('/game')
      if (url.startsWith('http')) {
        window.location.href = url
      } else {
        router.push(url)
      }
    }

    // Read status through closures so control-flow narrowing from an earlier
    // `status === 'complete'` guard does not carry over past an `await` that
    // mutates the resource (the status genuinely changes after a transfer).
    const signInComplete = () => signIn.status === 'complete'
    const signUpComplete = () => signUp.status === 'complete'

    // A definitive, non-actionable error surfaced by the last fetch of either
    // resource — as opposed to an empty pre-hydration tick where these are null.
    const hasError = (errors: typeof signInErrors | typeof signUpErrors) =>
      Boolean((errors.raw && errors.raw.length > 0) || (errors.global && errors.global.length > 0))

    const reconcile = async () => {
      // A sign-in that has already completed the OAuth handshake.
      if (signInComplete()) {
        ranOnce.current = true
        await signIn.finalize({ navigate })
        return
      }
      // A sign-up that has already completed.
      if (signUpComplete()) {
        ranOnce.current = true
        await signUp.finalize({ navigate })
        return
      }
      // The OAuth account matched no existing user: transfer the sign-in to a sign-up.
      if (signIn.isTransferable) {
        ranOnce.current = true
        const { error } = await signUp.create({ transfer: true })
        if (!error && signUpComplete()) await signUp.finalize({ navigate })
        return
      }
      // The OAuth account matched an existing user: transfer the sign-up to a sign-in.
      if (signUp.isTransferable) {
        ranOnce.current = true
        const { error } = await signIn.create({ transfer: true })
        if (!error && signInComplete()) await signIn.finalize({ navigate })
        return
      }
      // The identifier already has an active session — set it active.
      const existing = signIn.existingSession ?? signUp.existingSession
      if (existing) {
        ranOnce.current = true
        await clerk.setActive({ session: existing.sessionId, navigate })
        return
      }
      // Nothing actionable on this tick. Only fall back to /sign-in once Clerk
      // has settled (no fetch in flight) AND the callback produced a definitive
      // error. Otherwise the resources are still hydrating from the OAuth
      // exchange, and this effect re-runs (its deps include the resource state)
      // when they update — so an empty pre-hydration tick never triggers the
      // redirect and Google OAuth cannot silently break.
      const settled = signInFetch === 'idle' && signUpFetch === 'idle'
      if (settled && (hasError(signInErrors) || hasError(signUpErrors))) {
        ranOnce.current = true
        router.push('/sign-in')
      }
    }

    void reconcile()
  }, [
    loaded,
    signIn,
    signUp,
    signInFetch,
    signUpFetch,
    signInErrors,
    signUpErrors,
    clerk,
    router,
  ])

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      <div className="flex flex-col items-center gap-y-4">
        <Icons.spinner className="size-6 animate-spin" />
        <p className="text-sm text-muted-foreground">Completing sign in&hellip;</p>
      </div>
      {/* Clerk bot protection, in case a transfer to sign-up requires CAPTCHA. */}
      <div id="clerk-captcha" className="empty:hidden" />
    </div>
  )
}
