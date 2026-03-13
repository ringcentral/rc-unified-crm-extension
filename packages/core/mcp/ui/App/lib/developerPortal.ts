import { dbg } from './debugLog'

const PORTAL_BASE = 'https://appconnect.labs.ringcentral.com/public-api'

export const SUPPORTED_PLATFORMS = ['clio']

export interface Connector {
  id: string
  name: string
  displayName: string
  description?: string
  status?: 'public' | 'private'
}

/**
 * Fetch the list of available connectors directly from the developer portal.
 * Merges public connectors with private ones (if rcAccountId is provided),
 * then filters to SUPPORTED_PLATFORMS.
 */
export async function fetchConnectors(rcAccountId?: string | null): Promise<Connector[]> {
  dbg.info('fetchConnectors: rcAccountId=', rcAccountId ?? '(none)')

  const results: Connector[] = []

  // Public connectors
  const publicUrl = `${PORTAL_BASE}/connectors`
  dbg.info('fetchConnectors: GET', publicUrl)
  try {
    const resp = await fetch(publicUrl)
    dbg.info('fetchConnectors: public response status=', resp.status, 'ok=', resp.ok)
    if (!resp.ok) {
      const body = await resp.text().catch(() => '(unreadable)')
      throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`)
    }
    const data = await resp.json()
    dbg.info('fetchConnectors: public raw keys=', Object.keys(data).join(', '))
    const list: any[] = data?.connectors ?? data ?? []
    results.push(...list)
    dbg.info('fetchConnectors: public count=', list.length)
  } catch (err: any) {
    dbg.error('fetchConnectors: failed to fetch public connectors:', err.message, '| name=', err.name, '| url=', publicUrl)
    throw new Error(`Failed to load connectors: ${err.message}`)
  }

  // Private connectors (only if account ID is available)
  if (rcAccountId) {
    const privateUrl = `${PORTAL_BASE}/connectors/internal?accountId=${encodeURIComponent(rcAccountId)}`
    dbg.info('fetchConnectors: GET', privateUrl)
    try {
      const resp = await fetch(privateUrl)
      dbg.info('fetchConnectors: private response status=', resp.status, 'ok=', resp.ok)
      if (resp.ok) {
        const data = await resp.json()
        dbg.info('fetchConnectors: private raw keys=', Object.keys(data).join(', '))
        const list: any[] = data?.privateConnectors ?? data ?? []
        results.push(...list)
        dbg.info('fetchConnectors: private count=', list.length)
      } else {
        const body = await resp.text().catch(() => '(unreadable)')
        dbg.warn('fetchConnectors: private non-ok response:', resp.status, body.slice(0, 200))
      }
    } catch (err: any) {
      dbg.warn('fetchConnectors: failed to fetch private connectors (non-fatal):', err.message, '| name=', err.name)
    }
  }

  // Filter to supported platforms and normalise shape
  const supported = results
    .filter((c) => SUPPORTED_PLATFORMS.includes(c.name))
    .map((c): Connector => ({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      description: c.description || `Connect to ${c.displayName}`,
      status: (c.status as 'public' | 'private') ?? 'public',
    }))

  dbg.info('fetchConnectors: supported=', supported.map((c) => c.name).join(', '))
  return supported
}

/**
 * Fetch the manifest for a specific connector directly from the developer portal.
 */
export async function fetchManifest(
  connectorId: string,
  isPrivate: boolean,
  rcAccountId?: string | null,
): Promise<any> {
  dbg.info('fetchManifest: connectorId=', connectorId, 'isPrivate=', isPrivate)

  const url = isPrivate && rcAccountId
    ? `${PORTAL_BASE}/connectors/${connectorId}/manifest?type=internal&accountId=${encodeURIComponent(rcAccountId)}`
    : `${PORTAL_BASE}/connectors/${connectorId}/manifest`

  dbg.info('fetchManifest: GET', url)
  try {
    const resp = await fetch(url)
    dbg.info('fetchManifest: response status=', resp.status, 'ok=', resp.ok)
    if (!resp.ok) {
      const body = await resp.text().catch(() => '(unreadable)')
      throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`)
    }
    const manifest = await resp.json()
    dbg.info('fetchManifest: loaded platforms=', Object.keys(manifest?.platforms ?? {}).join(', '))
    return manifest
  } catch (err: any) {
    dbg.error('fetchManifest: failed:', err.message, '| name=', err.name, '| url=', url)
    throw err
  }
}
