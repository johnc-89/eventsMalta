'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Profile } from '@/types'
import { useRouter } from 'next/navigation'

type InviteResult = {
  email: string
  status: 'invited' | 'already_exists' | 'error'
  error?: string
}

export default function AdminUsersPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null)
  const [inviteError, setInviteError] = useState('')

  async function sendInvites() {
    if (!inviteEmails.trim()) return
    setInviting(true)
    setInviteError('')
    setInviteResults(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setInviteError('Session expired. Please log in again.')
        return
      }
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ emails: inviteEmails }),
      })
      const json = await res.json()
      if (!res.ok) {
        setInviteError(json.error || 'Invite failed')
        return
      }
      setInviteResults(json.results)
      setInviteEmails('')
      // Refresh user list
      fetchUsers()
    } catch (err: any) {
      setInviteError(err.message ?? 'Network error')
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user || profile?.role !== 'admin' && profile?.role !== 'super_admin') {
      router.push('/')
      return
    }
    fetchUsers()
  }, [user, profile, authLoading])

  async function fetchUsers() {
    // Use SECURITY DEFINER RPC — only admins get rows back, includes emails
    const { data } = await supabase.rpc('admin_list_profiles')
    setUsers(data || [])
    setLoading(false)
  }

  async function toggleTrustedUploader(targetUser: Profile) {
    setActionLoading(targetUser.id)
    const newRole = targetUser.role === 'trusted_uploader' ? 'user' : 'trusted_uploader'
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUser.id)
    if (!error) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      )
    }
    setActionLoading(null)
  }

  async function toggleAdmin(targetUser: Profile) {
    if (targetUser.id === user?.id) return
    setActionLoading(targetUser.id)
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin'
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUser.id)
    if (!error) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      )
    }
    setActionLoading(null)
  }

  async function toggleSuspend(targetUser: Profile) {
    if (targetUser.id === user?.id) return
    setActionLoading(targetUser.id)
    const fnName = targetUser.suspended_at ? 'super_admin_unsuspend_user' : 'super_admin_suspend_user'
    const { error } = await supabase.rpc(fnName, { target_id: targetUser.id })
    if (error) {
      alert(error.message)
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, suspended_at: targetUser.suspended_at ? null : new Date().toISOString() }
            : u,
        ),
      )
    }
    setActionLoading(null)
  }

  async function deleteUser(targetUser: Profile) {
    if (targetUser.id === user?.id) return
    if (!confirm(`Permanently delete ${targetUser.display_name || targetUser.email}?\n\nThis also soft-deletes all their events. Recoverable only via the database.`)) return
    setActionLoading(targetUser.id)
    const { error } = await supabase.rpc('super_admin_delete_user', { target_id: targetUser.id })
    if (error) {
      alert(error.message)
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id))
    }
    setActionLoading(null)
  }

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q)
    )
  })

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" />
      </div>
    )
  }

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return null

  const roleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-brand-burgundy/10 text-brand-burgundy'
      case 'admin':
        return 'bg-brand-teal/10 text-brand-teal'
      case 'trusted_uploader':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  const roleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin'
      case 'admin':
        return 'Admin'
      case 'trusted_uploader':
        return 'Trusted Uploader'
      default:
        return 'User'
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Manage Users</h1>
        <a href="/admin" className="text-brand-cyan hover:text-brand-teal text-sm font-medium">
          ← Back to Admin
        </a>
      </div>
      <p className="text-gray-500 mb-6">{users.length} total users</p>

      {/* Bulk invite */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h2 className="text-lg font-heading font-semibold text-brand-dark mb-2">Invite users</h2>
        <p className="text-sm text-gray-500 mb-3">
          Paste one or more emails — comma, semicolon, space, or newline separated. Each gets a branded invite email with a link to set their password.
        </p>
        <textarea
          value={inviteEmails}
          onChange={(e) => setInviteEmails(e.target.value)}
          rows={3}
          placeholder="alice@example.com, bob@example.com, carol@example.com"
          className="w-full px-3 py-2 rounded-lg border focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm"
        />
        <div className="flex justify-between items-center mt-3 gap-2 flex-wrap">
          <p className="text-xs text-gray-500">
            {inviteEmails.split(/[,\n;\s]+/).filter((s) => s.trim()).length} emails
          </p>
          <button
            onClick={sendInvites}
            disabled={inviting || !inviteEmails.trim()}
            className="bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/40 text-brand-dark px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            {inviting ? 'Sending invites…' : 'Send Invites'}
          </button>
        </div>
        {inviteError && <p className="text-red-600 text-sm mt-3">{inviteError}</p>}
        {inviteResults && (
          <div className="mt-4 space-y-1 text-sm">
            {inviteResults.map((r) => (
              <div key={r.email} className="flex items-center gap-2">
                {r.status === 'invited' && <span className="text-green-600">✓</span>}
                {r.status === 'already_exists' && <span className="text-gray-400">·</span>}
                {r.status === 'error' && <span className="text-red-600">✗</span>}
                <span className="font-mono text-gray-700">{r.email}</span>
                <span className="text-gray-500">
                  {r.status === 'invited' && '— invited'}
                  {r.status === 'already_exists' && '— already a user'}
                  {r.status === 'error' && `— ${r.error}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
          />
        </div>
      </div>

      {/* Users list */}
      <div className="space-y-3">
        {filteredUsers.map((u) => {
          const isCurrentUser = u.id === user?.id
          const isDisabled = actionLoading === u.id

          return (
            <div key={u.id} className="bg-white rounded-xl border p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-brand-gold/15 text-brand-gold rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {u.display_name?.[0]?.toUpperCase() || u.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-brand-dark truncate">
                        {u.display_name || 'No name'}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${roleBadge(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                      {u.suspended_at && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 bg-amber-100 text-amber-800">
                          Suspended
                        </span>
                      )}
                      {isCurrentUser && (
                        <span className="text-xs text-gray-400 flex-shrink-0">(you)</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Joined {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {!isCurrentUser && u.role !== 'super_admin' && (
                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    {/* Toggle trusted uploader */}
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => toggleTrustedUploader(u)}
                        disabled={isDisabled}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          u.role === 'trusted_uploader'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                            : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        } disabled:opacity-50`}
                      >
                        {isDisabled
                          ? '...'
                          : u.role === 'trusted_uploader'
                            ? 'Revoke Auto-Upload'
                            : 'Grant Auto-Upload'}
                      </button>
                    )}

                    {/* Toggle admin */}
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={isDisabled}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        u.role === 'admin'
                          ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                          : 'bg-brand-teal/10 text-brand-teal border border-brand-teal/20 hover:bg-brand-teal/15'
                      } disabled:opacity-50`}
                    >
                      {isDisabled
                        ? '...'
                        : u.role === 'admin'
                          ? 'Demote from Admin'
                          : 'Promote to Admin'}
                    </button>

                    {/* Super-admin-only: suspend / unsuspend */}
                    {profile?.role === 'super_admin' && (
                      <>
                        <button
                          onClick={() => toggleSuspend(u)}
                          disabled={isDisabled}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                            u.suspended_at
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                          }`}
                        >
                          {u.suspended_at ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={isDisabled}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-red-700 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-gray-500">No users found.</p>
          </div>
        )}
      </div>
    </main>
  )
}
