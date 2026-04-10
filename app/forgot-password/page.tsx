'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : undefined

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <div className="text-4xl mb-4">📧</div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
              Check your email
            </h1>
            <p className="text-gray-500 mb-4">
              We sent a password reset link to <strong>{email}</strong>. Click
              the link to choose a new password.
            </p>
            <Link
              href="/login"
              className="text-brand-cyan hover:text-brand-teal font-medium"
            >
              Back to login
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">
            Forgot your password?
          </h1>
          <p className="text-gray-500 mb-6">
            Enter your email and we'll send you a link to reset it.
          </p>

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
                placeholder="you@example.com"
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Remembered it?{' '}
            <Link
              href="/login"
              className="text-brand-cyan hover:text-brand-teal font-medium"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
