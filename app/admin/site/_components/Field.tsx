'use client'

interface Props {
  label: string
  hint?: string
  children: React.ReactNode
  full?: boolean
}

export function Field({ label, hint, children, full }: Props) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export const inputCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm'

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-4">
      <h2 className="font-heading text-lg font-bold text-brand-dark">{title}</h2>
      {description && <p className="text-sm text-gray-500 mt-1 mb-4">{description}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">{children}</div>
    </section>
  )
}
