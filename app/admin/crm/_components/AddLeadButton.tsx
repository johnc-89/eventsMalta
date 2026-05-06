'use client'

import { useState } from 'react'
import LeadModal from './LeadModal'

export default function AddLeadButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
      >
        + Add Lead
      </button>
      {open && <LeadModal mode="create" onClose={() => setOpen(false)} />}
    </>
  )
}
