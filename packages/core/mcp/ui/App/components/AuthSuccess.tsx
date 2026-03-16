interface AuthSuccessProps {
  connectorDisplayName: string
  userInfo?: { id?: string; name?: string }
}

export function AuthSuccess({ connectorDisplayName, userInfo }: AuthSuccessProps) {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center space-y-2">
        <div className="text-2xl text-green-700">&#10003;</div>
        <h2 className="heading-lg text-green-800">Connected</h2>
        <p className="text-sm text-green-700">
          Successfully connected to <strong>{connectorDisplayName}</strong>
          {userInfo?.name ? ` as ${userInfo.name}` : ''}.
        </p>
        <p className="text-xs text-green-600 mt-2">
          You can now use the AI assistant to interact with your CRM.
        </p>
      </div>
    </div>
  )
}
