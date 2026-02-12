import { useState } from 'react'
import { Button } from "@openai/apps-sdk-ui/components/Button"
import { Badge } from "@openai/apps-sdk-ui/components/Badge"

export interface Connector {
  name: string
  displayName: string
  description?: string
  status?: 'public' | 'private'
}

interface ConnectorListProps {
  connectors: Connector[]
  onSelect?: (connector: Connector) => void
}

export function ConnectorList({ connectors, onSelect }: ConnectorListProps) {
  const [connectedDisplayName, setConnectedDisplayName] = useState<string | null>(null)

  if (!connectors || connectors.length === 0) {
    return (
      <div className="p-4 text-center text-secondary">
        <p>No connectors available</p>
      </div>
    )
  }

  const handleSelect = async (connector: Connector) => {
    setConnectedDisplayName(connector.displayName)
    
    // Call tool via MCP Apps bridge (postMessage)
    if (window.parent !== window) {
      window.parent.postMessage({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'setConnector',
          arguments: { connectorDisplayName: connector.displayName }
        }
      }, '*')
    }
    
    onSelect?.(connector)
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-4">
        <h2 className="heading-lg">Available Connectors</h2>
        <p className="text-secondary text-sm mt-1">
          Select a CRM to connect with RingCentral
        </p>
      </div>
      
      <div className="space-y-3">
        {connectors.map((connector) => {
          const isConnected = connectedDisplayName === connector.displayName
          return (
            <div
              key={connector.displayName}
              className="rounded-xl border border-default bg-surface p-4 hover:border-primary transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{connector.displayName}</h3>
                    {connector.status === 'private' && (
                      <Badge color="secondary" size="sm">Private</Badge>
                    )}
                  </div>
                  {connector.description && (
                    <p className="text-secondary text-sm mt-1">
                      {connector.description}
                    </p>
                  )}
                </div>
                <Button
                  color={isConnected ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => handleSelect(connector)}
                  disabled={isConnected}
                >
                  {isConnected ? 'Connected' : 'Connect'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

