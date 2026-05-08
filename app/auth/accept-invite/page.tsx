'use client'

// Splash page for invited users.
// Supabase sends invite emails with a link that contains an access_token.
// When the user lands here, supabase-js automatically exchanges that token
// and fires a SIGNED_IN event — the user is authenticated but has no password
// yet. We collect their desired password, call updateUser(), then send them
// to the homepage (they stay signed in).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stage = 'verifying' | 'ready' | 'invalid' | 'success'

export default function AcceptInvitePage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('verifying')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let resolved = false

    // Supabase processes the #access_token hash from the invite link and fires
    // SIGNED_IN. We then know the session is live and can show the form.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session && !resolved) {
        resolved = true
        setEmail(session.user.email ?? '')
        setStage('ready')
      }
    })

    // Also handle the case where the user refreshes: session already exists.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !resolved) {
        resolved = true
        setEmail(data.session.user.email ?? '')
        setStage('ready')
      }
    })

    // If no token resolves within 5 s, the link is invalid or already used.
    const timeout = setTimeout(() => {
      if (!resolved) setStage('invalid')
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setStage('success')
    setLoading(false)
    // User is already signed in — send them straight to the homepage.
    setTimeout(() => router.push('/'), 2000)
  }

  // ── Verifying ───────────────────────────────────────────────────────────────
  if (stage === 'verifying') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="flex justify-center mb-6">
              <div className="animate-spin w-12 h-12 border-4 border-brand-gold border-t-transparent rounded-full" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Confirming your invite…
            </h1>
            <p className="text-gray-500">
              Hold tight while we verify your invitation link.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // ── Invalid / expired ────────────────────────────────────────────────────────
  if (stage === 'invalid') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Invite link invalid or expired
            </h1>
            <p className="text-gray-500 mb-6">
              This invite link has already been used or is no longer valid.
              Contact an admin to request a new one.
            </p>
            <Link
              href="/login"
              className="inline-block bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              Go to login
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              You're all set!
            </h1>
            <p className="text-gray-500 mb-4">
              Your account is ready. Taking you to the homepage…
            </p>
            <Link href="/" className="text-brand-cyan hover:text-brand-teal font-medium text-sm">
              Go now →
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ── Set-password form ────────────────────────────────────────────────────────
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-gold/15 text-3xl mb-4">
              🎟️
            </div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-1">
              Welcome to Events Malta!
            </h1>
            {email && (
              <p className="text-sm text-gray-400 mb-2">{email}</p>
            )}
            <p className="text-gray-500 text-sm">
              You've been invited. Set a password to activate your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
                placeholder="Repeat your password"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/50 text-brand-dark py-2.5 rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Creating account…' : 'Set Password & Continue'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-cyan hover:text-brand-teal font-medium">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
