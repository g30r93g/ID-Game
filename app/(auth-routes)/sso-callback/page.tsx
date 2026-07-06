'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useClerk, useSignIn, useSignUp } from '@clerk/nextjs'
import { Icons } from '@/components/ui/icons'

export default function SSOCallbackPage() {
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const clerk = useClerk()
  const router = useRouter()
  const ranOnce = React.useRef(false)

  React.useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

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

    const reconcile = async () => {
      // A sign-in that has already completed the OAuth handshake.
      if (signInComplete()) {
        await signIn.finalize({ navigate })
        return
      }
      // A sign-up that has already completed.
      if (signUpComplete()) {
        await signUp.finalize({ navigate })
        return
      }
      // The OAuth account matched no existing user: transfer the sign-in to a sign-up.
      if (signIn.isTransferable) {
        const { error } = await signUp.create({ transfer: true })
        if (!error && signUpComplete()) {
          await signUp.finalize({ navigate })
          return
        }
      }
      // The OAuth account matched an existing user: transfer the sign-up to a sign-in.
      if (signUp.isTransferable) {
        const { error } = await signIn.create({ transfer: true })
        if (!error && signInComplete()) {
          await signIn.finalize({ navigate })
          return
        }
      }
      // The identifier already has an active session — set it active.
      const existing = signIn.existingSession ?? signUp.existingSession
      if (existing) {
        await clerk.setActive({ session: existing.sessionId, navigate })
        return
      }
      // Nothing to reconcile: send the user back to sign in.
      router.push('/sign-in')
    }

    void reconcile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
