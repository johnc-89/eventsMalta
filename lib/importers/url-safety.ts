// SSRF guard for server-side fetches of externally-supplied URLs.
//
// Used by the image mirror, which downloads `events.image_url` — a value that
// can originate from *user-submitted* events. Without this, a crafted URL like
// http://169.254.169.254/... or http://localhost:6379/ would make the server
// issue that request on the attacker's behalf.
//
// Caveat: there is an inherent DNS-rebinding TOCTOU between the lookup here and
// the actual fetch. This blocks the practical cases (literal private IPs,
// localhost, link-local, and hostnames that currently resolve into private
// ranges); a determined rebinding attack would need a follow-up mitigation
// (pin the resolved IP and fetch that). Node runtime only.

import { lookup } from 'node:dns/promises'
import net from 'node:net'

function ipIsPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0) return true                          // "this" network
    if (a === 10) return true                         // RFC1918
    if (a === 127) return true                        // loopback
    if (a === 169 && b === 254) return true           // link-local
    if (a === 172 && b >= 16 && b <= 31) return true  // RFC1918
    if (a === 192 && b === 168) return true           // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true                         // multicast / reserved
    return false
  }
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80')) return true           // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local fc00::/7
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped
  if (mapped) return ipIsPrivate(mapped[1])
  return false
}

/** Throws if `raw` is not a public http(s) URL safe to fetch server-side. */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('invalid URL')
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`blocked scheme: ${u.protocol}`)
  }

  const host = u.hostname

  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new Error(`blocked private address: ${host}`)
    return
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error(`blocked host: ${host}`)
  }

  const addresses = await lookup(host, { all: true })
  if (addresses.length === 0) throw new Error(`could not resolve ${host}`)
  for (const { address } of addresses) {
    if (ipIsPrivate(address)) {
      throw new Error(`blocked private address ${address} for ${host}`)
    }
  }
}
