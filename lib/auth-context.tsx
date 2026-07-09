'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Profile } from '@/types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile()
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile()
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()

    // Primary: get_my_profile() — a SECURITY DEFINER RPC scoped to auth.uid()
    // that returns the caller's own full row (incl. phone). We read it this way
    // because email/phone are revoked from the `authenticated` table grant, so
    // logged-in users can't harvest other users' contact details (migration 0023).
    const { data, error } = await supabase.rpc('get_my_profile')
    let row = error ? null : (Array.isArray(data) ? data[0] : data)

    // Fallback for the brief window before 0023 is applied (RPC not yet present):
    // read the non-sensitive columns directly so the app still works. Never
    // selects email/phone, so it can't hit the revoked columns.
    if (!row && error && user) {
      const { data: fb } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role, is_verified, bio, max_active_events, subscription_tier, created_at, updated_at, suspended_at')
        .eq('id', user.id)
        .single()
      row = fb
    }

    // Email is canonical on the auth session, not the profile row.
    setProfile(row ? { ...row, email: user?.email ?? '' } : null)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
