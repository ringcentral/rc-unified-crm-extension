---
type: contract
title: Plugin Licensing and Pricing
description: License checks, paid plugin listings, and refusing service to unlicensed accounts.
owner: RingCentral
status: proposed
tags: [app-connect, plugins]
---

# Plugin Licensing and Pricing

## License checks

If a plugin requires entitlement checks, configure `licenseStatusUrl`. App Connect calls it with the account-level plugin JWT:

```http
Authorization: Bearer <pluginJwtToken>
```

Return a JSON object that the client can interpret as the plugin license state. The template handler is `src/handlers/license.ts` in the generated project.

## Pricing and paid listings

A paid plugin can publish its price and purchase links so administrators see them in the Admin Console before and after installing it. The listing itself only displays information; it does not check or enforce a license. Because a paid plugin needs a way to tell administrators when an account is not licensed, **a paid plugin must also turn on the license status check**: set `requireLicense` to `true` and give a `licenseStatusUrl` (see [License checks](#license-checks)). The Developer Console enforces this when you save. A plugin that does not declare `licensing` is listed as free, and a free plugin may still use the license check.

In the Developer Console, open the plugin settings and turn on **List as a paid plugin** in the **Licensing** section (a required **License status url** field appears below it; there is no separate switch for the check), or add a `licensing` block to the manifest together with `requireLicense` and `licenseStatusUrl`:

```json
{
  "requireLicense": true,
  "licenseStatusUrl": "https://example.com/plugins/my-plugin/license",
  "licensing": {
    "enabled": true,
    "priceAmount": 4.00,
    "priceUnit": "user",
    "billingPeriod": "month",
    "pricingInfoUrl": "https://example.com/plugins/my-plugin/pricing",
    "purchaseUrl": "https://example.com/plugins/my-plugin/buy",
    "manageSubscriptionUrl": "https://example.com/account/billing",
    "marketplaceDescription": "Archive every call recording to a bucket you control."
  }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `enabled` | Yes | `false` or missing lists the plugin as free. Values you entered are kept but not published while this is `false`. |
| `priceAmount` | When enabled | A positive number with at most two decimal places. USD only. |
| `priceUnit` | When enabled | `user` or `account`. |
| `billingPeriod` | When enabled | `month` or `year`. The price is shown as, for example, `$4 per user / month`. |
| `pricingInfoUrl` | When enabled | Public pricing page. Opened by **Pricing** and **View pricing**. |
| `purchaseUrl` | When enabled | Checkout page. Opened by **Purchase** once the plugin is installed. |
| `manageSubscriptionUrl` | When enabled | Billing portal. Opened by **Manage subscription** once the plugin is installed. |
| `marketplaceDescription` | No | Plain text, up to 500 characters, entered in a multi-line text area. Shown under the plugin details in the Details dialog, in addition to the plugin description. |

Every URL must be an absolute `http://` or `https://` URL without embedded credentials, and opens in a new tab. Use `https://` for a published plugin; `http://` is accepted so you can point the links at a local server while testing. The Developer Console rejects any other scheme, relative URLs, and URLs with credentials when you save.

If a plugin is marked as paid but a required value is missing or invalid, the Admin Console still labels it **Paid** but shows no price and no pricing links, so a broken manifest never produces a broken button.

### What administrators see

| Situation | Plugin card | Details dialog |
| --- | --- | --- |
| Free, not installed | **Free** badge, **Install for free** | "No license needed", **Close** and **Install for free** |
| Paid, not installed | **Paid** badge, price, **Install** and **Pricing** | "Billed by *publisher*", **Pricing** and **Install** |
| Installed | **Configure** and **Uninstall**, plus **Manage subscription** when the plugin is paid | **Uninstall**, **Close**, **Purchase** when the plugin is paid, and **Save configuration** when it has settings |

The Price field in the dialog shows `Free`, or the price with **View pricing** before installation and **Manage subscription** afterwards.

### Account parameter on purchase links

When an administrator opens **Purchase** or **Manage subscription**, App Connect appends the RingCentral account ID as a query parameter, for example `https://example.com/buy?rcAccountId=1234567`. Existing query parameters and the hash are preserved, and an existing `rcAccountId` parameter is replaced. Use it to pre-fill your checkout form.

!!! warning "Do not treat `rcAccountId` as proof of identity"
    Anyone can edit a URL. The parameter is a convenience only. Decide who is licensed on your own server, from the account recorded in the plugin JWT you issue at registration.

### Charging and refusing service is your responsibility

App Connect does not block a plugin because the account is unlicensed. The license result only drives the warning administrators see, and the pricing information above is never used to check a license. If your plugin must refuse unlicensed accounts, do it on your plugin server:

- **Synchronous plugins**: do not return a non-2xx status. App Connect runs synchronous plugins before the connector saves the activity, and a failed plugin request fails the whole call log. Return `200` with the `data` you received, **unchanged and complete**; the response body replaces the logging payload. Note that a plugin that normally redacts or transforms data will then let the original data through.
- **Asynchronous plugins**: an `accepted: false` response is ignored and leaves the task pending until it expires. Return `200` and then call the `callbackUrl` with `successful: false` and a `message`.
- **License endpoint**: report an unlicensed account with `200` and `licenseStatus: false`, plus a `licenseStatusDescription` administrators can act on. Keep `401` and `403` for an invalid or mismatched plugin bearer token, as described in the [Plugin server API reference](../plugin-server-api/index.md).
- **Per-user pricing**: each call includes `hashedExtensionId`, a pseudonymous identifier for the RingCentral extension. Use it to count users. It is not an authentication credential and can be empty.

### Review

Changing `pricingInfoUrl`, `purchaseUrl`, or `manageSubscriptionUrl` on an approved plugin sends it back for review. Changing the price, unit, period, or description does not.
