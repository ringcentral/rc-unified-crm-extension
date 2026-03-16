import { useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Input } from '@openai/apps-sdk-ui/components/Input'

interface Selection {
  name: string
  const: string
}

interface AuthInfoFormProps {
  environmentType: 'dynamic' | 'selectable'
  urlIdentifier?: string
  instructions?: string
  selections?: Selection[]
  connectorDisplayName: string
  onSubmit: (value: { hostname?: string; selection?: string }) => void
  onBack: () => void
}

export function AuthInfoForm({
  environmentType,
  urlIdentifier,
  instructions,
  selections,
  connectorDisplayName,
  onSubmit,
  onBack,
}: AuthInfoFormProps) {
  const [hostname, setHostname] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (environmentType === 'dynamic') {
      onSubmit({ hostname })
    } else if (selectedName) {
      onSubmit({ selection: selectedName })
    }
  }

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
        <h2 className="heading-lg">Connect to {connectorDisplayName}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {environmentType === 'dynamic' && (
          <div className="space-y-2">
            <p className="text-secondary text-sm">
              {instructions || `Enter your ${connectorDisplayName} hostname`}
            </p>
            {urlIdentifier && (
              <p className="text-xs text-secondary opacity-70">
                Example: {urlIdentifier}
              </p>
            )}
            <Input
              type="url"
              value={hostname}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHostname(e.target.value)}
              placeholder="https://your-instance.example.com"
              size="md"
            />
          </div>
        )}

        {environmentType === 'selectable' && selections && (
          <div className="space-y-2">
            <p className="text-secondary text-sm">
              Select your {connectorDisplayName} environment
            </p>
            <div className="space-y-2">
              {selections.map((sel) => (
                <button
                  key={sel.name}
                  type="button"
                  onClick={() => setSelectedName(sel.name)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                    selectedName === sel.name
                      ? 'border-primary bg-surface-hover'
                      : 'border-default bg-surface hover:border-primary'
                  }`}
                >
                  <span className="font-medium text-sm">{sel.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          type="submit"
          color="primary"
          size="md"
          disabled={
            (environmentType === 'dynamic' && !hostname.trim()) ||
            (environmentType === 'selectable' && !selectedName)
          }
        >
          Continue
        </Button>
      </form>
    </div>
  )
}
