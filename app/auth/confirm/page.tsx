'use client'

// app/auth/confirm — the link in the sign-in code email (LEAD1 L2, Oct 2026). The email carries
// {{ .SiteURL }}/auth/confirm?token_hash=…&type=email (docs/review/design-lead1.md section 10, step 6), so a visitor who
// clicks rather than typing the code is signed in here, on any device, by verifyOtp({ token_hash, type }) in the
// browser. The same steps as /auth/callback (lib/auth/completeSignIn.ts), so a template that sends the fragment form
// instead also works.
//
// ?pending=<id> may be present (the free calculation held for this email, LEAD1 L3). It is not used here yet: the
// claim is L3, and it finds the calculation by the verified email, not by this id. For now the page verifies and lands
// on the calculator.

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { completeSignIn } from '../../../lib/auth/completeSignIn'
import { CONFIRM_LANDING } from '../../../lib/auth/linkAction'
import AuthLinkStatus from '../AuthLinkStatus'

export default function AuthConfirmPage() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void completeSignIn(window.location.href, supabase.auth).then(result => {
      if (result.ok) window.location.replace(CONFIRM_LANDING)
      else setMessage(result.message)
    })
  }, [])

  return <AuthLinkStatus message={message} />
}
