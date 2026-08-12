---
type: contract
title: getManagedAuthOptions
description: Connector contract for loading dynamic user-scoped managed authentication options.
owner: NEEDS_OWNER
status: proposed
tags: [authentication, connector-interface, managed-auth]
---

# getManagedAuthOptions

Returns searchable choices for one user-scoped managed API-key field before or after the administrator's first CRM login.

!!! info "Optional interface"
    Implement this when an API-key manifest contains a managed user field with `managedFieldType: dynamic`.

## Signature

```js
async function getManagedAuthOptions({ field, accountValues }) {
  return [
    {
      value: 'crm-user-id',
      label: 'Jane Smith'
    }
  ];
}
```

## Contract

| Input | Purpose |
| --- | --- |
| `field` | Manifest definition for the dynamic user field being refreshed. Use `field.const` to select the correct option source. |
| `accountValues` | Account-scoped managed values. During first login these are transient form values; after login they come from encrypted account storage. |

Each returned option contains a persisted `value` and a display-only `label`. The interface MUST return the complete list used by client-side search. Server-side search and pagination are not part of this contract.

The framework calls this interface only for fields declared with `managed: true`, `managedScope: user`, and `managedFieldType: dynamic`. Account-scoped fields MUST use `managedFieldType: input`.

If the connector does not implement this interface, App Connect returns an empty option list. If the interface throws or returns an invalid result, the administrator sees the connector error and the current form remains unchanged.

`getManagedAuthOptions` is intentionally separate from [`getUserList`](getUserList.md). `getUserList` requires an existing CRM user session for server-side logging mappings; this interface must also work before the first CRM user exists.

## Persistence boundary

Refreshing options MUST NOT persist transient account values. App Connect stores submitted account- and user-scoped values only after a RingCentral administrator completes a successful CRM login, or after an authenticated administrator explicitly saves Shared Authentication settings.

## Verification

- Interface dispatch, option validation, and account-value filtering: `packages/core/test/handlers/managedAuth.test.ts`
- Pre-login administrator route and connector errors: `packages/core/test/routes/managedAuthRoutes.test.ts`
- Successful administrator login persistence: `packages/core/test/handlers/auth.test.ts`

