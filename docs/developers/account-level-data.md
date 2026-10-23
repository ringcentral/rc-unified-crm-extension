# Account-level data

Some CRM metadata is the same for every user in a CRM account: Pipedrive activity types, Bullhorn note actions, Bullhorn lead/candidate/contact statuses, and so on. Fetching it on every contact search or every log is wasteful, so App Connect lets a connector register it once and caches it per RingCentral account.

Use account-level data when:

- the values belong to the CRM account, not to a contact or a user
- the values change rarely (picklists, types, statuses)
- you want to offer them as options in a settings page or a log form

## How it works

1. The connector exports an `accountData` object. Each entry is a **data key** with a `fetch` function.
2. Core calls `getAccountData` to read a key. The value is stored in `AccountDataModel`, keyed by `rcAccountId + platformName + dataKey`, so all users of the same RingCentral account share one copy.
3. The value is served from cache until its TTL expires (24 hours by default). It is refreshed lazily on the next read.
4. If a refresh fails and an older value exists, the older value is returned and the error is logged.
5. The client reads the same values from `GET /accountData?keys=<key1>,<key2>`. Unknown keys return `400`.

## Registering account data in a connector

Export an `accountData` object. `fetch` receives `{ user, authHeader }` and returns any JSON-serializable value.

```js
const accountData = {
  activityTypes: {
    fetch: async ({ user, authHeader }) => {
      const res = await axios.get(`https://${user.hostname}/v1/activityTypes`, {
        headers: { Authorization: authHeader }
      });
      return res.data.data
        .filter(t => t.active_flag)
        .map(t => ({ const: t.key_string, title: t.name }));
    }
  }
};

exports.accountData = accountData;
```

Descriptor options:

| Option | Default | Description |
| --- | --- | --- |
| `fetch` | required | Loads the value from the CRM. |
| `ttlMs` | 24 hours | How long a cached value is fresh. |
| `mergePartialResult` | `false` | When the value is an object whose properties are fetched independently, a refresh keeps the last good value of any property that failed instead of dropping it. |

Return option lists as `{ const, title }` pairs. This is the shape that `selection` and `option` fields expect.

## Reading account data in connector code

```js
const { getAccountData } = require('@app-connect/core/lib/accountData');

const activityTypes = await getAccountData({
  platform: 'pipedrive',
  user,
  authHeader,
  dataKey: 'activityTypes'
});
```

Pass `forceRefresh: true` to bypass the cache, for example when a configured value is not found in the cached list and may have been created recently:

```js
const fresh = await getAccountData({
  platform: 'pipedrive',
  user,
  authHeader,
  dataKey: 'activityTypes',
  forceRefresh: true
});
```

`getAccountData` throws if the key is unknown or the user has no `rcAccountId`. If the data is optional for the feature, catch the error and continue without it, as the Bullhorn connector does during contact search.

## Showing account data as options in the UI

There are two ways to get the options to the client.

### Declarative: `accountDataKey` in the manifest

Add `accountDataKey` to an admin setting or a page `additionalFields` entry. The client fetches the key from `/accountData` and fills the options itself.

Pipedrive uses this for the admin settings that choose the activity type for calls and SMS:

```json
{
  "adminSettings": [
    {
      "id": "callActivityType",
      "name": "Call activity type",
      "type": "option",
      "accountDataKey": "activityTypes",
      "defaultValue": ""
    },
    {
      "id": "smsActivityType",
      "name": "SMS activity type",
      "type": "option",
      "accountDataKey": "activityTypes",
      "defaultValue": ""
    }
  ]
}
```

The same works for a log form field. This hypothetical field gets its options from the `activityTypes` key:

```json
{
  "page": {
    "callLog": {
      "additionalFields": [
        {
          "const": "activityType",
          "title": "Activity type",
          "type": "selection",
          "accountDataKey": "activityTypes"
        }
      ]
    }
  }
}
```

If the data key holds an object with several lists, pick one with `accountDataProperty`. The Bullhorn manifest does not currently use this (see the next section), but the same note action field could be declared like this:

```json
{
  "const": "noteActions",
  "title": "Note action",
  "type": "selection",
  "accountDataKey": "bullhornData",
  "accountDataProperty": "commentActionList"
}
```

When different contact types need different lists, use `accountDataPropertyByContactType`. Each contact type then gets the list from its own property of the same data key.

### Pushed by the server: `additionalInfo` on contacts

The connector can instead return the options on each contact from `findContact`. The client reads them from `contact.additionalInfo` and matches them to the form field by its `const`.

Bullhorn does this for note actions. The `bullhornData` key holds several independently fetched lists, and `findContact` copies `commentActionList` into every matched contact:

```js
const accountData = {
  bullhornData: {
    mergePartialResult: true,
    fetch: async ({ user }) => {
      // fetch commentActionList, leadStatuses, candidateStatuses, contactStatuses.
      // A list that fails is omitted from the result, and the cached one is kept.
      return { commentActionList: [{ const: 'Call', title: 'Call' }], /* ... */ };
    }
  }
};

async function findContact({ user, phoneNumber, isForceRefreshAccountData }) {
  const bullhornData = await getOptionalAccountDataForContactSearch({
    user,
    forceRefresh: isForceRefreshAccountData
  });
  const commentActionList = bullhornData.commentActionList ?? [];
  // ...search for contacts...
  matchedContactInfo.push({
    id: result.id,
    name: result.name,
    type: 'Contact',
    additionalInfo: commentActionList.length > 0 ? { noteActions: commentActionList } : null
  });
}
```

The manifest only declares the field. Its `const` is the `additionalInfo` key:

```json
{
  "const": "noteActions",
  "title": "Note action",
  "type": "selection",
  "allowCustomValue": true,
  "contactDependent": false
}
```

If a field declares `accountDataKey`, the client overwrites the matching `additionalInfo` entry with the value from `/accountData`. If the server does not expose `/accountData`, the client keeps whatever the contact already carries in `additionalInfo`.

Which one should you choose?

| | `accountDataKey` in manifest | `additionalInfo` from `findContact` |
| --- | --- | --- |
| Where options are resolved | Client | Server |
| Works outside a contact (admin settings) | Yes | No |
| Extra CRM calls during contact search | None | None, cached read |
| Good for | Settings pages, simple log fields | Options that depend on the matched contact |

## Refreshing

- `isForceRefreshAccountData` on [findContact](interfaces/findContact.md) is passed through so the connector can force a refresh with `forceRefresh`.
- `GET /accountData?keys=...&forceRefresh=true` refreshes the requested keys.
- Otherwise a value refreshes on the first read after its TTL expires.

## Existing examples

| Connector | Data key | Content | Consumed by |
| --- | --- | --- | --- |
| Pipedrive | `activityTypes` | Active activity types as `{ const, title }` | Admin settings via `accountDataKey`; server-side lookup when logging |
| Bullhorn | `bullhornData` | `commentActionList`, `leadStatuses`, `candidateStatuses`, `contactStatuses` | `findContact` returns `noteActions` and statuses in `additionalInfo` |

## See also

- [Customizing pages](manifest-pages.md)
- [Custom settings](custom-settings.md)
- [findContact](interfaces/findContact.md)
