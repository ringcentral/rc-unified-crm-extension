# findContactWithName

Searches CRM contacts by name when a phone-number lookup did not find the right contact.

!!! info "Optional interface"
    Implement this when users should be able to manually search CRM contacts from App Connect.

## Signature

```js
async function findContactWithName({
  user,
  authHeader,
  name,
  proxyConfig
}) {
  return {
    successful: true,
    matchedContactInfo: []
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `authHeader` | Prepared CRM auth header. |
| `name` | User-entered search text. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

Return the same contact shape used by [`findContact`](findContact.md):

```js
return {
  successful: true,
  matchedContactInfo: [
    {
      id: 'contact-id',
      name: 'Jane Smith',
      type: 'Contact',
      phone: '+14155550100',
      email: 'jane@example.com',
      additionalInfo: null
    }
  ],
  returnMessage: null
};
```

Core treats an empty list as "no contact found" and can show a default warning if you do not provide `returnMessage`.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/findContactWithName.js"
    ```

