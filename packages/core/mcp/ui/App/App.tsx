import { useState, useEffect } from 'react'
import { ConnectorList, type Connector } from './components/ConnectorList'

interface ToolOutput {
  connectors?: Connector[]
  error?: boolean
  errorMessage?: string
}

/**
 * Hook to receive tool results via MCP Apps bridge (postMessage)
 * with fallback polling for window.openai.toolOutput
 * See: https://developers.openai.com/apps-sdk/build/chatgpt-ui
 */
function useToolResult() {
  const [toolResult, setToolResult] = useState<ToolOutput | null>(() => {
    // Check window.openai.toolOutput synchronously during init
    const output = (window as any).openai?.toolOutput
    return output && Object.keys(output).length > 0 ? output : null
  })

  useEffect(() => {
    if (toolResult) return // Already have data

    // Listen for MCP Apps bridge messages (recommended approach)
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const message = event.data
      if (!message || message.jsonrpc !== '2.0') return
      if (message.method !== 'ui/notifications/tool-result') return
      setToolResult(message.params?.structuredContent ?? message.params ?? null)
    }
    window.addEventListener('message', onMessage, { passive: true })

    // Fallback: poll window.openai.toolOutput (handles async population)
    const interval = setInterval(() => {
      const output = (window as any).openai?.toolOutput
      if (output && Object.keys(output).length > 0) {
        setToolResult(output)
        clearInterval(interval)
      }
    }, 100)

    return () => {
      window.removeEventListener('message', onMessage)
      clearInterval(interval)
    }
  }, [toolResult])

  return toolResult
}

export function App() {
  const data = useToolResult()

  // Loading
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[150px] p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Error
  if (data.error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{data.errorMessage || 'An error occurred'}</p>
        </div>
      </div>
    )
  }

  // Connectors list
  if (data.connectors) {
    return (
      <div className="p-4">
        <ConnectorList connectors={data.connectors} />
      </div>
    )
  }

  // Fallback - empty state
  return (
    <div className="p-4 text-center text-secondary">
      <p>No connectors available</p>
    </div>
  )
}
