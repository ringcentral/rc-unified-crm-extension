import { useEffect, useRef, useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { callTool, getServerUrl, updateModelContext } from '../lib/callTool'
import { dbg } from '../lib/debugLog'

type AuthStatus = 'ready' | 'creatingSession' | 'polling' | 'error'

interface OAuthConnectProps {
  connectorManifest: any
  connectorName: string
  connectorDisplayName: string
  hostname: string
  openaiSessionId?: string | null
  rcExtensionId?: string | null
  onSuccess: (data: { jwtToken: string; userInfo?: any }) => void
  onError: (error: string) => void
  onBack: () => void
}

/**
 * Compose the OAuth authorization URL entirely client-side.
 * The widget already has the full manifest and serverUrl — no server round-trip needed.
 */
function buildAuthUri(platform: any, sessionId: string, hostname: string, serverUrl: string): string {
  const oauth = platform.auth.oauth
  let stateParam = `sessionId=${sessionId}&platform=${platform.name}&hostname=${hostname}`
  if (oauth.customState) stateParam += `&${oauth.customState}`

  return `${oauth.authUrl}?` +
    `response_type=code` +
    `&client_id=${oauth.clientId}` +
    `${oauth.scope ? `&${oauth.scope}` : ''}` +
    `&state=${encodeURIComponent(stateParam)}` +
    `&redirect_uri=${serverUrl}/oauth-callback`
}

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes

export function OAuthConnect({
  connectorManifest,
  connectorName,
  connectorDisplayName,
  hostname,
  openaiSessionId,
  rcExtensionId,
  onSuccess,
  onError,
  onBack,
}: OAuthConnectProps) {
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [authUri, setAuthUri] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const unmountedRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unmountedRef.current = true
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // Build authUri client-side immediately — no server round-trip needed.
  // Simultaneously call doAuth in the background to create the DB session.
  useEffect(() => {
    let cancelled = false
    const platform = connectorManifest?.platforms?.[connectorName]

    if (!platform) {
      setStatus('error')
      setErrorMsg('Invalid connector configuration')
      return
    }

    // Use openaiSessionId as the primary session key so the OAuth callback
    // can be correlated with the ChatGPT conversation. Fall back to a random
    // UUID when the widget is loaded outside ChatGPT.
    const sessionId = openaiSessionId ?? crypto.randomUUID()
    sessionIdRef.current = sessionId
    const serverUrl = getServerUrl() ?? ''
    const uri = buildAuthUri(platform, sessionId, hostname, serverUrl)
    setAuthUri(uri)
    dbg.info('authUri composed client-side, sessionId:', sessionId)

    // Create the server-side session in background (fast DB write only)
    callTool('doAuth', { connectorName, hostname, sessionId }).then((result) => {
      if (cancelled || unmountedRef.current) return
      if (!result?.success) {
        dbg.warn('doAuth session creation failed:', result?.error)
        setStatus('error')
        setErrorMsg(result?.error || 'Failed to prepare authentication session')
        return
      }
      dbg.info('doAuth session created successfully')
      setSessionReady(true)
    }).catch((err: any) => {
      if (cancelled || unmountedRef.current) return
      dbg.error('doAuth error:', err.message)
      setStatus('error')
      setErrorMsg(err.message || 'Failed to prepare authentication session')
    })

    return () => { cancelled = true }
  }, [connectorManifest, connectorName, hostname])

  const startPolling = () => {
    setStatus('polling')
    pollCountRef.current = 0

    pollTimerRef.current = setInterval(async () => {
      if (unmountedRef.current) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        return
      }

      pollCountRef.current += 1
      if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        setStatus('error')
        setErrorMsg('Authorization timed out. Please try again.')
        return
      }

      try {
        const res = await callTool('checkAuthStatus', {
          sessionId: sessionIdRef.current,
          ...(rcExtensionId ? { rcExtensionId } : {}),
        })
        const sc = res?.data ?? null

        if (unmountedRef.current) return

        const dataStatus = sc?.status
        if (dataStatus === 'completed' && sc?.jwtToken) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)

          // Push the JWT into ChatGPT's model context so it can be used
          // in future tool calls. updateModelContext tries ui/update-model-context
          // first (invisible to user, visible to model), then falls back to ui/message.
          const userLabel = sc.userInfo?.name ? ` as ${sc.userInfo.name}` : ''
          await updateModelContext(
            `CRM authentication with ${connectorDisplayName} completed${userLabel}. ` +
            `Platform: ${connectorName}. ` +
            `jwtToken: ${sc.jwtToken}. ` +
            `IMPORTANT: Store this jwtToken and pass it as a parameter to all future CRM tool calls.`
          )
          dbg.info('updateModelContext sent with jwtToken')

          onSuccess({
            jwtToken: sc.jwtToken,
            userInfo: sc.userInfo,
          })
        } else if (dataStatus === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          setStatus('error')
          setErrorMsg(sc?.errorMessage || 'Authorization failed')
        } else if (dataStatus === 'expired') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          setStatus('error')
          setErrorMsg('Authorization session expired. Please try again.')
        }
        // 'pending' -> keep polling
      } catch {
        // Transient errors during polling are acceptable; keep trying
      }
    }, POLL_INTERVAL_MS)
  }

  const handleAuthorizeClick = () => {
    if (authUri && sessionReady) {
      window.open(authUri, '_blank', 'noopener,noreferrer')
      startPolling()
    }
  }

  const handleRetry = () => {
    setStatus('error')
    setErrorMsg(null)
    onError('retry')
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="w-full max-w-md">
        <div className="mb-4">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-secondary hover:text-primary transition-colors mb-2 cursor-pointer"
          >
            &larr; Back
          </button>
          <h2 className="heading-lg">Authentication Error</h2>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4">
          <p className="text-red-700 text-sm">{errorMsg}</p>
        </div>
        <Button color="primary" size="sm" onClick={handleRetry}>
          Try Again
        </Button>
      </div>
    )
  }

  // Ready to authorize or polling
  return (
    <div className="w-full max-w-md">
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-secondary hover:text-primary transition-colors mb-2 cursor-pointer"
        >
          &larr; Back
        </button>
        <h2 className="heading-lg">Authorize {connectorDisplayName}</h2>
      </div>

      <div className="rounded-xl border border-default bg-surface p-4 space-y-4">
        {status === 'ready' && (
          <>
            <p className="text-sm text-secondary">
              Click the button below to open {connectorDisplayName}'s authorization
              page. After you approve access, return here to continue.
            </p>
            <Button
              color="primary"
              size="md"
              onClick={handleAuthorizeClick}
              disabled={!sessionReady}
            >
              {sessionReady
                ? `Authorize in ${connectorDisplayName}`
                : 'Preparing…'}
            </Button>
          </>
        )}

        {status === 'polling' && (
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto" />
            <p className="text-sm text-secondary">
              Waiting for you to authorize in {connectorDisplayName}...
            </p>
            <p className="text-xs text-secondary opacity-60">
              Complete the authorization in the opened tab, then come back here.
            </p>
            {authUri && (
              <a
                href={authUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Open authorization page again
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
