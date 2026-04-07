'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const { user, profile, loading, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hasPending, setHasPending] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', user.id)
      .eq('status', 'pending_review')
      .is('deleted_at', null)
      .then(({ count }) => setHasPending((count ?? 0) > 0))
  }, [user])

  const close = () => setMenuOpen(false)
  const isAdmin = profile?.role === 'admin'

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="text-xl font-bold text-indigo-600">
            Events Malta
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-2">
            {!loading && (
              <>
                {user ? (
                  <>
                    {/* Events dropdown */}
                    <DesktopDropdown label="Events">
                      <DropdownLink href="/events" onClick={close}>Browse Events</DropdownLink>
                      <DropdownLink href="/events/create" onClick={close}>Post Event</DropdownLink>
                      <DropdownLink href="/saved" onClick={close}>Saved Events</DropdownLink>
                      {hasPending && (
                        <DropdownLink href="/profile" onClick={close}>
                          <span className="flex items-center gap-2">
                            Pending Events
                            <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                          </span>
                        </DropdownLink>
                      )}
                    </DesktopDropdown>

                    {/* Admin dropdown */}
                    {isAdmin && (
                      <DesktopDropdown label="Admin">
                        <DropdownLink href="/admin/users" onClick={close}>Users</DropdownLink>
                        <DropdownLink href="/admin" onClick={close}>Pending Events</DropdownLink>
                      </DesktopDropdown>
                    )}

                    {/* Profile avatar + sign out */}
                    <div className="relative ml-2">
                      <button
                        onClick={() => setMenuOpen(menuOpen === 'profile' ? false : 'profile' as any)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                      >
                        <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium">
                          {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                        </div>
                      </button>
                      {menuOpen === 'profile' && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1 z-50">
                          <DropdownLink href="/profile" onClick={close}>My Profile</DropdownLink>
                          <button
                            onClick={() => { signOut(); close() }}
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
                    <Link href="/events" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
                      Browse Events
                    </Link>
                    <Link href="/login" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
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
        {menuOpen && menuOpen !== 'profile' && (
          <div className="md:hidden pb-4 border-t mt-2 pt-4">
            {user ? (
              <>
                {/* Events section */}
                <p className="px-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Events</p>
                <Link href="/events" className="block py-2 pl-3 text-gray-600" onClick={close}>Browse Events</Link>
                <Link href="/events/create" className="block py-2 pl-3 text-gray-600" onClick={close}>Post Event</Link>
                <Link href="/saved" className="block py-2 pl-3 text-gray-600" onClick={close}>Saved Events</Link>
                {hasPending && (
                  <Link href="/profile" className="block py-2 pl-3 text-gray-600" onClick={close}>
                    <span className="flex items-center gap-2">
                      Pending Events
                      <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                    </span>
                  </Link>
                )}

                {/* Admin section */}
                {isAdmin && (
                  <>
                    <div className="border-t my-3" />
                    <p className="px-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Admin</p>
                    <Link href="/admin/users" className="block py-2 pl-3 text-gray-600" onClick={close}>Users</Link>
                    <Link href="/admin" className="block py-2 pl-3 text-gray-600" onClick={close}>Pending Events</Link>
                  </>
                )}

                <div className="border-t my-3" />
                <Link href="/profile" className="block py-2 pl-3 text-gray-600" onClick={close}>My Profile</Link>
                <button onClick={() => { signOut(); close() }} className="block py-2 pl-3 text-red-600">Sign Out</button>
              </>
            ) : (
              <>
                <Link href="/events" className="block py-2 text-gray-600" onClick={close}>Browse Events</Link>
                <Link href="/login" className="block py-2 text-gray-600" onClick={close}>Log In</Link>
                <Link href="/signup" className="block py-2 text-indigo-600 font-medium" onClick={close}>Sign Up</Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

function DesktopDropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
        {label}
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-0 w-52 bg-white rounded-lg shadow-lg border py-1 z-50">
          {children}
        </div>
      )}
    </div>
  )
}

function DropdownLink({ href, onClick, children }: { href: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={onClick}>
      {children}
    </Link>
  )
}
