'use client'

import { useCrm } from '../CrmContext'

export default function SyncIndicator() {
  const { syncState } = useCrm()
  const map = {
    connected: { color: 'bg-green-500',  label: 'live',    pulse: false },
    saving:    { color: 'bg-amber-400',  label: 'saving…', pulse: true  },
    offline:   { color: 'bg-gray-400',   label: 'offline', pulse: false },
  } as const
  const s = map[syncState]
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
      <span className="relative flex w-2 h-2">
        {s.pulse && <span className={`absolute inline-flex h-full w-full rounded-full ${s.color} opacity-75 animate-ping`} />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${s.color}`} />
      </span>
      {s.label}
    </div>
  )
}
