'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stage = 'verifying' | 'ready' | 'invalid' | 'success'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('verifying')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let resolved = false

    // Listen for PASSWORD_RECOVERY event fired by supabase-js when the
    // recovery token in the URL (hash or ?code=) is processed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        resolved = true
        setStage('ready')
      }
    })

    // Also check for an existing session (e.g. page refresh after landing).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        resolved = true
        setStage('ready')
      }
    })

    // If nothing resolves within 4s, assume the link is invalid/expired.
    const timeout = setTimeout(() => {
      if (!resolved) setStage('invalid')
    }, 4000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Sign the user out of the recovery session so they log in fresh.
      await supabase.auth.signOut()
      setStage('success')
      setLoading(false)
      setTimeout(() => {
        router.push('/login')
      }, 2500)
    }
  }

  // ---------- SPLASH: verifying ----------
  if (stage === 'verifying') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="flex justify-center mb-6">
              <div className="animate-spin w-12 h-12 border-4 border-brand-gold border-t-transparent rounded-full" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Verifying your reset link
            </h1>
            <p className="text-gray-500">
              Hold tight while we securely confirm your request...
            </p>
          </div>
        </div>
      </main>
    )
  }

  // ---------- SPLASH: invalid / expired ----------
  if (stage === 'invalid') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Reset link invalid or expired
            </h1>
            <p className="text-gray-500 mb-6">
              This password reset link is no longer valid. Please request a new
              one to continue.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              Request new link
            </Link>
            <p className="mt-4 text-sm">
              <Link
                href="/login"
                className="text-brand-cyan hover:text-brand-teal font-medium"
              >
                Back to login
              </Link>
            </p>
          </div>
        </div>
      </main>
    )
  }

  // ---------- SPLASH: success ----------
  if (stage === 'success') {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-10">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Password updated
            </h1>
            <p className="text-gray-500 mb-4">
              Your password has been changed successfully. Redirecting you to
              login...
            </p>
            <Link
              href="/login"
              className="text-brand-cyan hover:text-brand-teal font-medium"
            >
              Go to login now
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ---------- Form: ready ----------
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 bg-brand-cream">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-gold/15 text-brand-gold text-2xl mb-4">
              🔒
            </div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Set a new password
            </h1>
            <p className="text-gray-500">
              Choose a strong password for your Events Malta account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
                placeholder="At least 6 characters"
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
              <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/50 text-brand-dark py-2.5 rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
