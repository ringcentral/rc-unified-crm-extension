# Regional Services

Many CRM platforms maintain separate regional deployments to meet data residency requirements, reduce latency, or comply with local regulations. For example, some CRMs maintain separate US and EU servers, each with different URLs and potentially different authentication endpoints.

The App Connect framework provides built-in support for regional services through a flexible configuration system.

## Implementation with Manifest Override

Regional services are supported through the `override` property in the manifest configuration. This powerful feature allows you to define conditions under which certain properties of your manifest should be replaced with alternative values.

### Example: Clio Configuration

Clio provides a great example of regional configuration. They maintain different servers for different regions, each with unique authentication endpoints:

```json
"override": [
    {
        "triggerType": "hostname",
        "triggerValue": "au.app.clio.com",
        "overrideObjects": [
            {
                "path": "auth.oauth.authUrl",
                "value": "https://au.app.clio.com/oauth/authorize"
            }
        ]
    }
]
```

In this example:
- The `triggerType` is set to "hostname" 
- When the hostname matches "au.app.clio.com" (Australian region)
- The framework overrides specific configuration values:
  - The OAuth authorization URL is set to the Australian server

## How It Works

1. The client-side application monitors for trigger conditions (currently only hostname is supported as a trigger)
2. When a trigger condition is met, the app locates the specified path in the manifest configuration
3. It then replaces the default value with the region-specific value defined in the override

This approach allows for seamless switching between regional deployments without requiring separate connectors or complex conditional logic in your code.

## Available Trigger Types

Currently, the only supported trigger type is `hostname`. If you need additional trigger types to better support your regional implementation, please create a GitHub issue requesting the specific trigger you require.

## Implementing Regional Services in Your Connector

When implementing support for regional services in your connector:

1. **Store Regional Information**: Keep the regional API server URL in the user model in your database to maintain consistent connections with the correct region.

2. **Authentication Handling**: Use environment variables and auth-related methods in your connector to determine which server configuration to use.

3. **API Endpoint Selection**: When making API calls, be mindful to use the correct regional server URLs if those are different.

## Best Practices

1. **Comprehensive Testing**: Test your connector against all supported regional deployments to ensure consistent behavior.

2. **Clear Documentation**: Document which regions are supported and any region-specific behavior or limitations.

3. **Default Region**: Always provide a sensible default region configuration for new users.

4. **User Selection**: Consider providing UI elements that allow users to select their region if it cannot be automatically detected.

5. **Error Handling**: Implement robust error handling that accounts for regional differences in API responses or rate limits.

By following these guidelines, you can create a seamless experience for users regardless of which regional deployment of your CRM they are using.
