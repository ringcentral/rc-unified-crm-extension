# getUserList

Returns CRM users for server-side call logging user mapping.

!!! info "Optional interface"
    Implement this when admins should be able to map RingCentral extensions to CRM users for server-side logging ownership.

## Signature

```js
async function getUserList({
  user,
  authHeader,
  proxyConfig
}) {
  return [
    {
      id: 'crm-user-id',
      name: 'Jane Smith',
      email: 'jane@example.com'
    }
  ];
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user used to access the CRM user list. |
| `authHeader` | Prepared CRM auth header. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

Return an array of CRM user records:

| Field | Description |
| --- | --- |
| `id` | CRM user ID used by your connector for ownership/assignment. |
| `name` | CRM user display name. |
| `email` | CRM user email. Core uses this for automatic mapping to RingCentral extensions. |

Core auto-matches CRM users to RingCentral extensions by email or name. Admins can manually fix unmatched users.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getUserList.js"
    ```

