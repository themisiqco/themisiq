'use client'

// app/auth/callback — finishes a sign-in from an email link, IN THE BROWSER (LEAD1 L2, Oct 2026).
//
// ⚠️ THIS WAS A ROUTE HANDLER THAT DID NOTHING. It exchanged ?code= with createServerClient(), a service-role client,
// so any session it made stayed on the server; the app keeps its session in the browser. Sign-up confirmations and the
// purchase email's first sign-in link (app/api/webhooks/stripe/route.ts, admin.generateLink with
// redirectTo /auth/callback?next=/dashboard) worked only because their tokens arrive in the URL fragment, which the
// redirect preserved. This page handles the fragment, ?code= and ?token_hash= where the session belongs, through
// lib/auth/linkAction.ts (the decision) and lib/auth/completeSignIn.ts (the steps), both unit-tested.
//
// Reads window.location in an effect rather than useSearchParams, so the page needs no Suspense boundary.

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { completeSignIn } from '../../../lib/auth/completeSignIn'
import { safeNext } from '../../../lib/auth/linkAction'
import AuthLinkStatus from '../AuthLinkStatus'

export default function AuthCallbackPage() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const href = window.location.href
    const next = safeNext(new URL(href).searchParams.get('next'))
    void completeSignIn(href, supabase.auth).then(result => {
      if (result.ok) window.location.replace(next)
      else setMessage(result.message)
    })
  }, [])

  return <AuthLinkStatus message={message} />
}
