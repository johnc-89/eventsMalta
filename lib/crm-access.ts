import type { Profile } from '@/types'

// Single source of truth for who can see / write the CRM.
// Today: super_admin only. To add a future read-only role (e.g. lead_viewer),
// extend canReadLeads here and add a matching SELECT-only RLS policy in SQL.
export const canReadLeads  = (p: Profile | null) => p?.role === 'super_admin'
export const canWriteLeads = (p: Profile | null) => p?.role === 'super_admin'
