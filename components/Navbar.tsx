'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useState } from 'react'

export default function Navbar() {
  const { user, profile, loading, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="text-xl font-bold text-indigo-600">
            Events Malta
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/events" className="text-gray-600 hover:text-gray-900">
              Browse Events
            </Link>
            {!loading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/events/create"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Post Event
                    </Link>
                    {profile?.role === 'admin' && (
                      <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                        Admin
                      </Link>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                      >
                        <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium">
                          {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                        </div>
                      </button>
                      {menuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1">
                          <Link
                            href="/profile"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setMenuOpen(false)}
                          >
                            My Profile
                          </Link>
                          <Link
                            href="/saved"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setMenuOpen(false)}
                          >
                            Saved Events
                          </Link>
                          <button
                            onClick={() => { signOut(); setMenuOpen(false) }}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                          >
                            Sign Out
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="text-gray-600 hover:text-gray-900">
                      Log In
                    </Link>
                    <Link
                      href="/signup"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-gray-600"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 border-t mt-2 pt-4 space-y-2">
            <Link href="/events" className="block py-2 text-gray-600" onClick={() => setMenuOpen(false)}>
              Browse Events
            </Link>
            {user ? (
              <>
                <Link href="/events/create" className="block py-2 text-indigo-600 font-medium" onClick={() => setMenuOpen(false)}>
                  Post Event
                </Link>
                <Link href="/profile" className="block py-2 text-gray-600" onClick={() => setMenuOpen(false)}>
                  My Profile
                </Link>
                <Link href="/saved" className="block py-2 text-gray-600" onClick={() => setMenuOpen(false)}>
                  Saved Events
                </Link>
                {profile?.role === 'admin' && (
                  <Link href="/admin" className="block py-2 text-gray-600" onClick={() => setMenuOpen(false)}>
                    Admin
                  </Link>
                )}
                <button onClick={() => { signOut(); setMenuOpen(false) }} className="block py-2 text-red-600">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block py-2 text-gray-600" onClick={() => setMenuOpen(false)}>
                  Log In
                </Link>
                <Link href="/signup" className="block py-2 text-indigo-600 font-medium" onClick={() => setMenuOpen(false)}>
                  Sign Up
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
