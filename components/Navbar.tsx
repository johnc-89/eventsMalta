'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const { user, profile, loading, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState<string | false>(false)
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
  const isAdmin    = profile?.role === 'admin' || profile?.role === 'super_admin'
  const isSuperAdmin = profile?.role === 'super_admin'
  const isSuspended  = !!profile?.suspended_at

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo.png" alt="Events Malta" width={160} height={32} priority />
          </Link>

          {/* ── Desktop nav ── */}
          <div className="hidden md:flex items-center gap-2">
            {!loading && (
              <>
                {user ? (
                  <>
                    {/* Saved events — heart icon (first item) */}
                    <Link
                      href="/saved"
                      aria-label="Saved events"
                      className="p-2 text-gray-500 hover:text-brand-burgundy transition-colors"
                    >
                      <HeartIcon />
                    </Link>

                    {/* Events dropdown */}
                    <DesktopDropdown label="Events">
                      {!isSuspended && (
                        <DropdownLink href="/events/create" onClick={close}>Create Event</DropdownLink>
                      )}
                      <DropdownLink href="/my-events" onClick={close}>
                        <span className="flex items-center gap-2">
                          My Events
                          {hasPending && (
                            <span className="w-2 h-2 bg-brand-gold rounded-full flex-shrink-0" />
                          )}
                        </span>
                      </DropdownLink>
                    </DesktopDropdown>

                    {/* Admin dropdown */}
                    {isAdmin && (
                      <DesktopDropdown label="Admin">
                        <DropdownHeader>Event Management</DropdownHeader>
                        <DropdownLink href="/admin" onClick={close} indent>Approve Events</DropdownLink>
                        <DropdownLink href="/admin/duplicates" onClick={close} indent>Find Duplicates</DropdownLink>
                        <DropdownLink href="/admin/tags"  onClick={close} indent>Tags</DropdownLink>
                        {isSuperAdmin && (
                          <DropdownLink href="/admin/sources" onClick={close} indent>Sources</DropdownLink>
                        )}

                        <DropdownHeader>Site Management</DropdownHeader>
                        <DropdownLink href="/admin/users" onClick={close} indent>Users</DropdownLink>
                        <DropdownLink href="/admin/analytics" onClick={close} indent>Analytics</DropdownLink>
                        {isSuperAdmin && (
                          <>
                            <DropdownLink href="/admin/site"    onClick={close} indent>Site Editor</DropdownLink>
                            <DropdownLink href="/admin/crm"     onClick={close} indent>Leads</DropdownLink>
                          </>
                        )}
                      </DesktopDropdown>
                    )}

                    {/* Profile avatar */}
                    <div className="relative ml-1">
                      <button
                        onClick={() => setMenuOpen(menuOpen === 'profile' ? false : 'profile')}
                        className="flex items-center gap-2 text-brand-dark hover:text-brand-gold transition-colors"
                      >
                        <div className="w-8 h-8 bg-brand-gold/15 text-brand-gold rounded-full flex items-center justify-center text-sm font-bold">
                          {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                        </div>
                      </button>
                      {menuOpen === 'profile' && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1 z-50">
                          <DropdownLink href="/profile" onClick={close}>My Profile</DropdownLink>
                          <button
                            onClick={() => { signOut(); close() }}
                            className="block w-full text-left px-4 py-2 text-sm text-brand-burgundy hover:bg-gray-50"
                          >
                            Sign Out
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Link href="/events" className="text-brand-dark hover:text-brand-gold px-3 py-2 text-sm font-medium transition-colors">
                      Browse Events
                    </Link>
                    <Link href="/login" className="text-brand-dark hover:text-brand-gold px-3 py-2 text-sm font-medium transition-colors">
                      Log In
                    </Link>
                    <Link
                      href="/signup"
                      className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            className="md:hidden text-brand-dark"
            onClick={() => setMenuOpen(menuOpen ? false : 'mobile')}
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

        {/* ── Mobile menu ── */}
        {menuOpen && menuOpen !== 'profile' && (
          <div className="md:hidden pb-4 border-t mt-2 pt-4">
            {user ? (
              <>
                <Link href="/saved" className="block py-2 pl-3 text-brand-dark flex items-center gap-2" onClick={close}>
                  <HeartIcon className="w-4 h-4" /> Saved Events
                </Link>
                <p className="px-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2">Events</p>
                {!isSuspended && (
                  <Link href="/events/create" className="block py-2 pl-3 text-brand-dark" onClick={close}>Create Event</Link>
                )}
                <Link href="/my-events" className="block py-2 pl-3 text-brand-dark" onClick={close}>
                  <span className="flex items-center gap-2">
                    My Events
                    {hasPending && <span className="w-2 h-2 bg-brand-gold rounded-full" />}
                  </span>
                </Link>

                {isAdmin && (
                  <>
                    <div className="border-t my-3" />
                    <p className="px-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Admin</p>
                    <p className="px-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-1">Event Management</p>
                    <Link href="/admin" className="block py-2 pl-6 text-brand-dark" onClick={close}>Approve Events</Link>
                    <Link href="/admin/duplicates" className="block py-2 pl-6 text-brand-dark" onClick={close}>Find Duplicates</Link>
                    <Link href="/admin/tags"    className="block py-2 pl-6 text-brand-dark" onClick={close}>Tags</Link>
                    {isSuperAdmin && (
                      <Link href="/admin/sources" className="block py-2 pl-6 text-brand-dark" onClick={close}>Sources</Link>
                    )}
                    <p className="px-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-1">Site Management</p>
                    <Link href="/admin/users"   className="block py-2 pl-6 text-brand-dark" onClick={close}>Users</Link>
                    <Link href="/admin/analytics" className="block py-2 pl-6 text-brand-dark" onClick={close}>Analytics</Link>
                    {isSuperAdmin && (
                      <>
                        <Link href="/admin/site"    className="block py-2 pl-6 text-brand-dark" onClick={close}>Site Editor</Link>
                        <Link href="/admin/crm"     className="block py-2 pl-6 text-brand-dark" onClick={close}>Leads</Link>
                      </>
                    )}
                  </>
                )}

                <div className="border-t my-3" />
                <Link href="/profile" className="block py-2 pl-3 text-brand-dark" onClick={close}>My Profile</Link>
                <button onClick={() => { signOut(); close() }} className="block py-2 pl-3 text-brand-burgundy">Sign Out</button>
              </>
            ) : (
              <>
                <Link href="/events"  className="block py-2 text-brand-dark" onClick={close}>Browse Events</Link>
                <Link href="/login"   className="block py-2 text-brand-dark" onClick={close}>Log In</Link>
                <Link href="/signup"  className="block py-2 text-brand-gold font-semibold" onClick={close}>Sign Up</Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

function HeartIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      />
    </svg>
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
      <button className="flex items-center gap-1 text-brand-dark hover:text-brand-gold px-3 py-2 text-sm font-medium transition-colors">
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

function DropdownLink({
  href, onClick, children, indent,
}: { href: string; onClick?: () => void; children: React.ReactNode; indent?: boolean }) {
  return (
    <Link
      href={href}
      className={`block py-2 text-sm text-brand-dark hover:bg-brand-cream ${indent ? 'pl-6 pr-4' : 'px-4'}`}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

function DropdownHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
      {children}
    </p>
  )
}
