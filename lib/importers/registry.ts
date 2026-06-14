// Adapter registry — maps the adapter string stored on event_sources.adapter
// to the live implementation. Adding a new adapter means: write the file at
// adapters/<name>.ts, import it here, and add the entry below.
//
// Adapters that are seeded in event_sources but NOT yet implemented just
// don't appear here — the pipeline throws a clear error if you try to run
// them, which is what we want.

import type { Adapter } from './types'
import { teatrumanoelAdapter } from './adapters/teatrumanoel'
import { tsmaltaAdapter } from './adapters/tsmalta'
import { poppAdapter } from './adapters/popp'
import { heritagemaltaAdapter } from './adapters/heritagemalta'
import { esploraAdapter } from './adapters/esplora'
import { festivalsMtAdapter } from './adapters/festivals_mt'
import { visitmaltaAdapter } from './adapters/visitmalta'
import { maltaartisanmarketsAdapter } from './adapters/maltaartisanmarkets'
import { gianpulaAdapter } from './adapters/gianpula'
import { cafedelmarAdapter } from './adapters/cafedelmar'
import { g7eventsAdapter } from './adapters/g7events'
import { unomaltaAdapter } from './adapters/unomalta'

const REGISTRY: Record<string, Adapter> = {
  [teatrumanoelAdapter.name]: teatrumanoelAdapter,
  [tsmaltaAdapter.name]: tsmaltaAdapter,
  [poppAdapter.name]: poppAdapter,
  [heritagemaltaAdapter.name]: heritagemaltaAdapter,
  [esploraAdapter.name]: esploraAdapter,
  [festivalsMtAdapter.name]: festivalsMtAdapter,
  [visitmaltaAdapter.name]: visitmaltaAdapter,
  [maltaartisanmarketsAdapter.name]: maltaartisanmarketsAdapter,
  [gianpulaAdapter.name]: gianpulaAdapter,
  [cafedelmarAdapter.name]: cafedelmarAdapter,
  [g7eventsAdapter.name]: g7eventsAdapter,
  [unomaltaAdapter.name]: unomaltaAdapter,
}

export function getAdapter(name: string): Adapter | null {
  return REGISTRY[name] ?? null
}

/** For debugging / UI affordances ("Run now is disabled because no adapter
 *  exists yet for X"). */
export function listAdapterNames(): string[] {
  return Object.keys(REGISTRY)
}
