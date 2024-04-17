# Configuring your adapter

{! docs/developers/beta_notice.inc !}

## Configuration options

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `urlIdentifier`  | string          |             |
| `name`           | string          |             |
| `authType`       | string          |             |
| `authUrl`        | string          |             |
| `clientId`       | string          |             |
| `canOpenLogPage` | boolean         |             |
| `contactTypes`   | ARRAY of string |             |

## Defining custom form fields

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `const`            | string  |             |
| `title`            | string  |             |
| `type`             | string  |             |
| `contactDependent` | boolean |             |

### Form fields for logging calls

### Form fields for logging SMS messages

## Customizing the welcome page for your CRM

## Sample config file

```js
{! client/src/config-copy.json !}
```
