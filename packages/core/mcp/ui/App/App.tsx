import { useState, useEffect, useCallback } from 'react'
import { ConnectorList, type Connector } from './components/ConnectorList'
import { AuthInfoForm } from './components/AuthInfoForm'
import { OAuthConnect } from './components/OAuthConnect'
import { AuthSuccess } from './components/AuthSuccess'
import { setServerUrl } from './lib/callTool'
import { fetchConnectors, fetchManifest } from './lib/developerPortal'
import { dbg } from './lib/debugLog'
import { DebugPanel } from './components/DebugPanel'

// Initial structuredContent from getPublicConnectors — serverUrl, rcAccountId, rcExtensionId, openaiSessionId
interface ToolOutput {
  serverUrl?: string
  rcAccountId?: string | null
  rcExtensionId?: string | null
  openaiSessionId?: string | null
  error?: boolean
  errorMessage?: string
}

type Step = 'loadingConnectors' | 'select' | 'loading' | 'authInfo' | 'oauth' | 'success' | 'error'

interface FlowState {
  connectorManifest: any | null
  connectorName: string | null
  connectorDisplayName: string | null
  hostname: string
  userInfo: any | null
}

const INITIAL_FLOW_STATE: FlowState = {
  connectorManifest: null,
  connectorName: null,
  connectorDisplayName: null,
  hostname: '',
  userInfo: null,
}

/**
 * Extract and apply serverUrl from tool output as early as possible.
 * Must be called synchronously so it's set before any tool calls.
 */
function applyServerUrl(output: ToolOutput | null) {
  dbg.info('applyServerUrl: received output keys:', output ? Object.keys(output).join(', ') : 'null');
  dbg.info('applyServerUrl: serverUrl =', output?.serverUrl ?? '(none)');
  if (output?.serverUrl) {
    setServerUrl(output.serverUrl);
  }
  return output;
}

/**
 * Hook to receive the initial tool output (serverUrl + rcAccountId).
 *
 * Listens via three mechanisms per the ChatGPT Apps SDK docs:
 *  1. window.openai.toolOutput — synchronous read on mount
 *  2. openai:set_globals event — ChatGPT pushes globals into the iframe
 *  3. ui/notifications/tool-result postMessage — MCP Apps bridge notification
 *  4. Polling window.openai.toolOutput — fallback for async population
 */
function useToolResult() {
  const [toolResult, setToolResult] = useState<ToolOutput | null>(() => {
    const openai = (window as any).openai
    dbg.info('init: window.openai exists?', !!openai);
    dbg.info('init: window.openai.toolOutput?', JSON.stringify(openai?.toolOutput)?.slice(0, 200) ?? 'null');
    const output = openai?.toolOutput
    if (output && Object.keys(output).length > 0) {
      return applyServerUrl(output)
    }
    return null
  })

  useEffect(() => {
    if (toolResult) return

    // MCP Apps bridge: tool-result notification
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const message = event.data
      if (!message || message.jsonrpc !== '2.0') return
      if (message.method !== 'ui/notifications/tool-result') return
      const payload = message.params?.structuredContent ?? message.params ?? null
      if (payload) setToolResult(applyServerUrl(payload))
    }
    window.addEventListener('message', onMessage, { passive: true })

    // ChatGPT extension: openai:set_globals event
    const onSetGlobals = (event: Event) => {
      const detail = (event as CustomEvent).detail
      const output = detail?.globals?.toolOutput ?? (window as any).openai?.toolOutput
      if (output && Object.keys(output).length > 0) {
        setToolResult(applyServerUrl(output))
      }
    }
    window.addEventListener('openai:set_globals', onSetGlobals, { passive: true })

    // Fallback: poll window.openai.toolOutput for async population
    const interval = setInterval(() => {
      const output = (window as any).openai?.toolOutput
      if (output && Object.keys(output).length > 0) {
        setToolResult(applyServerUrl(output))
        clearInterval(interval)
      }
    }, 100)

    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('openai:set_globals', onSetGlobals)
      clearInterval(interval)
    }
  }, [toolResult])

  return toolResult
}

export function App() {
  const data = useToolResult()
  const [step, setStep] = useState<Step>('loadingConnectors')
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW_STATE)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Fetch connector list from developer portal once serverUrl (and optionally rcAccountId) is known
  useEffect(() => {
    if (!data || data.error) return

    async function loadConnectors() {
      try {
        dbg.info('loadConnectors: fetching with rcAccountId=', data!.rcAccountId ?? '(none)')
        const list = await fetchConnectors(data!.rcAccountId)
        setConnectors(list)
        setStep('select')
      } catch (err: any) {
        dbg.error('loadConnectors failed:', err.message)
        setStep('error')
        setErrorMsg(err.message || 'Failed to load connectors')
      }
    }

    loadConnectors()
  }, [data])

  const resetToSelect = useCallback(() => {
    setStep('select')
    setFlow(INITIAL_FLOW_STATE)
    setErrorMsg(null)
  }, [])

  const handleConnectorSelect = useCallback(async (connector: Connector) => {
    dbg.info('connector selected:', JSON.stringify(connector))
    setStep('loading')
    setErrorMsg(null)

    try {
      const manifest = await fetchManifest(
        connector.id,
        connector.status === 'private',
        data?.rcAccountId,
      )

      if (!manifest) {
        setStep('error')
        setErrorMsg('Failed to load connector configuration')
        return
      }

      const connectorName = connector.name
      const platform = manifest?.platforms?.[connectorName]

      if (!platform) {
        setStep('error')
        setErrorMsg('Invalid connector configuration')
        return
      }

      setFlow((prev) => ({
        ...prev,
        connectorManifest: manifest,
        connectorName,
        connectorDisplayName: connector.displayName,
      }))

      const envType = platform.environment?.type
      const authType = platform.auth?.type

      // For oauth with dynamic/selectable environments, collect auth info first
      if (authType === 'oauth' && (envType === 'dynamic' || envType === 'selectable')) {
        setStep('authInfo')
        return
      }

      // For fixed environments, extract hostname from the fixed URL
      if (envType === 'fixed' && platform.environment?.url) {
        try {
          const url = new URL(platform.environment.url)
          setFlow((prev) => ({ ...prev, hostname: url.hostname }))
        } catch {
          // hostname stays empty
        }
      }

      setStep('oauth')
    } catch (err: any) {
      setStep('error')
      setErrorMsg(err.message || 'Failed to load connector')
    }
  }, [data?.rcAccountId])

  const handleAuthInfoSubmit = useCallback(
    (value: { hostname?: string; selection?: string }) => {
      try {
        const platform = flow.connectorManifest?.platforms?.[flow.connectorName!]
        const envType = platform?.environment?.type
        let resolvedHostname = ''

        if (envType === 'dynamic' && value.hostname) {
          resolvedHostname = new URL(value.hostname).hostname
        } else if (envType === 'selectable' && value.selection) {
          const sel = platform.environment.selections?.find(
            (s: { name: string; const: string }) => s.name === value.selection,
          )
          if (sel?.const) {
            resolvedHostname = new URL(sel.const).hostname
          }
        }

        setFlow((prev) => ({ ...prev, hostname: resolvedHostname }))
        setStep('oauth')
      } catch (err: any) {
        setStep('error')
        setErrorMsg(err.message || 'Failed to process environment selection')
      }
    },
    [flow.connectorManifest, flow.connectorName],
  )

  const handleAuthSuccess = useCallback(
    (authData: { jwtToken?: string; userInfo?: any }) => {
      setFlow((prev) => ({ ...prev, userInfo: authData.userInfo ?? null }))
      setStep('success')
    },
    [],
  )

  const handleAuthError = useCallback(
    (error: string) => {
      if (error === 'retry') {
        setStep('oauth')
        return
      }
      setStep('error')
      setErrorMsg(error)
    },
    [],
  )

  // Waiting for initial tool output from ChatGPT
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[150px] p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  // Error from initial tool call
  if (data.error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{data.errorMessage || 'An error occurred'}</p>
        </div>
        <DebugPanel />
      </div>
    )
  }

  return (
    <div className="p-4">
      {step === 'loadingConnectors' && (
        <div className="flex items-center justify-center min-h-[150px]">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            <p className="text-sm text-secondary">Loading connectors...</p>
          </div>
        </div>
      )}

      {step === 'select' && (
        <ConnectorList connectors={connectors} onSelect={handleConnectorSelect} />
      )}

      {step === 'loading' && (
        <div className="flex items-center justify-center min-h-[150px]">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            <p className="text-sm text-secondary">Loading...</p>
          </div>
        </div>
      )}

      {step === 'authInfo' && flow.connectorManifest && flow.connectorName && (
        <AuthInfoForm
          environmentType={
            flow.connectorManifest.platforms[flow.connectorName].environment.type
          }
          urlIdentifier={
            flow.connectorManifest.platforms[flow.connectorName].environment.urlIdentifier
          }
          instructions={
            flow.connectorManifest.platforms[flow.connectorName].environment.instructions
          }
          selections={
            flow.connectorManifest.platforms[flow.connectorName].environment.selections
          }
          connectorDisplayName={flow.connectorDisplayName!}
          onSubmit={handleAuthInfoSubmit}
          onBack={resetToSelect}
        />
      )}

      {step === 'oauth' && flow.connectorManifest && flow.connectorName && (
        <OAuthConnect
          connectorManifest={flow.connectorManifest}
          connectorName={flow.connectorName}
          connectorDisplayName={flow.connectorDisplayName!}
          hostname={flow.hostname}
          openaiSessionId={data?.openaiSessionId ?? null}
          rcExtensionId={data?.rcExtensionId ?? null}
          onSuccess={handleAuthSuccess}
          onError={handleAuthError}
          onBack={resetToSelect}
        />
      )}

      {step === 'success' && (
        <AuthSuccess
          connectorDisplayName={flow.connectorDisplayName!}
          userInfo={flow.userInfo ?? undefined}
        />
      )}

      {step === 'error' && (
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4">
            <p className="text-red-700 text-sm font-semibold">Error</p>
            <p className="text-red-700 text-sm mt-1">{errorMsg || 'An error occurred'}</p>
          </div>
          <button
            type="button"
            onClick={resetToSelect}
            className="text-sm text-primary hover:underline cursor-pointer"
          >
            &larr; Back to connector list
          </button>
          <DebugPanel />
        </div>
      )}
    </div>
  )
}
