'use client'

// Handles two flows that both land here with a token in the URL hash:
//
//   type=recovery  – password-reset email (existing forgot-password flow)
//                    → after success: sign out + redirect to /login
//
//   type=invite    – admin sent an invite
//                    → after success: stay signed in + redirect to homepage

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stage = 'verifying' | 'ready' | 'invalid' | 'success'
type Flow  = 'invite' | 'recovery'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('verifying')
  const [flow, setFlow]   = useState<Flow>('recovery')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let resolved = false

    // Detect invite vs recovery from the URL hash before Supabase strips it.
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.includes('type=invite')) setFlow('invite')
    }

    // Supabase fires PASSWORD_RECOVERY for reset links, SIGNED_IN for invites.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session && !resolved) {
        resolved = true
        setStage('ready')
      }
    })

    // Also handle page refresh where session already exists.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !resolved) {
        resolved = true
        setStage('ready')
      }
    })

    // If nothing resolves within 5 s the link is invalid or already used.
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

    if (flow === 'invite') {
      // Stay signed in — send straight to the homepage.
      setTimeout(() => router.push('/'), 2000)
    } else {
      // Sign out so the user logs in fresh with their new password.
      await supabase.auth.signOut()
      setTimeout(() => router.push('/login'), 2500)
    }
  }

  // ── Verifying ────────────────────────────────────────────────────────────────
  if (stage === 'verifying') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="flex justify-center mb-6">
              <div className="animate-spin w-12 h-12 border-4 border-brand-gold border-t-transparent rounded-full" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              {flow === 'invite' ? 'Confirming your invite…' : 'Verifying your reset link…'}
            </h1>
            <p className="text-gray-500">Hold tight while we securely confirm your request.</p>
          </div>
        </div>
      </main>
    )
  }

  // ── Invalid / expired ─────────────────────────────────────────────────────────
  if (stage === 'invalid') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Link invalid or expired
            </h1>
            <p className="text-gray-500 mb-6">
              {flow === 'invite'
                ? 'This invite link has already been used or is no longer valid. Contact an admin to resend it.'
                : 'This password reset link is no longer valid. Please request a new one.'}
            </p>
            <Link
              href={flow === 'invite' ? '/login' : '/forgot-password'}
              className="inline-block bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {flow === 'invite' ? 'Go to login' : 'Request new link'}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="text-5xl mb-4">{flow === 'invite' ? '🎉' : '✅'}</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              {flow === 'invite' ? "You're all set!" : 'Password updated'}
            </h1>
            <p className="text-gray-500 mb-4">
              {flow === 'invite'
                ? 'Your account is ready. Taking you to the homepage…'
                : 'Your password has been changed. Redirecting you to login…'}
            </p>
            <Link
              href={flow === 'invite' ? '/' : '/login'}
              className="text-brand-cyan hover:text-brand-teal font-medium text-sm"
            >
              {flow === 'invite' ? 'Go now →' : 'Go to login now'}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ── Set-password form ─────────────────────────────────────────────────────────
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-gold/15 text-2xl mb-4">
              {flow === 'invite' ? '🎟️' : '🔒'}
            </div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              {flow === 'invite' ? 'Welcome to Events Malta!' : 'Set a new password'}
            </h1>
            <p className="text-gray-500 text-sm">
              {flow === 'invite'
                ? "You've been invited. Set a password to activate your account."
                : 'Choose a strong password for your Events Malta account.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {flow === 'invite' ? 'Password' : 'New Password'}
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
              {loading
                ? (flow === 'invite' ? 'Creating account…' : 'Updating…')
                : (flow === 'invite' ? 'Set Password & Continue' : 'Update Password')}
            </button>
          </form>

          {flow === 'invite' && (
            <p className="mt-5 text-center text-xs text-gray-400">
              Already have an account?{' '}
              <Link href="/login" className="text-brand-cyan hover:text-brand-teal font-medium">
                Log in
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
