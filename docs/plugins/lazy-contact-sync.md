---
title: Lazy Contact Sync — App Connect Plugin
---

# Lazy Contact Sync

<div class="bld-hero">
  <div class="bld-hero__logo">
    <img src="../../img/vendor-captivolabs.svg" alt="Captivo Labs">
  </div>
  <div>
    <div class="bld-hero__category">App Connect Plugin · Free</div>
    <p class="bld-hero__tagline">Identifies callers by name on every RingCentral device — not just inside the App Connect client — by syncing CRM contacts into your RingCentral address book as calls happen.</p>
  </div>
</div>

Lazy Contact Sync is built by [Captivo Labs](../build/captivolabs.md), the first partner to publish a plugin for App Connect. It's free to install, and it works alongside any CRM connector Captivo Labs or RingCentral has already built.

## The problem it solves

App Connect's real-time contact lookup only works inside the App Connect client. A customer calling in is identified against the CRM only if the call is being handled through that client. On a desk phone, the mobile app, or any other RingEX device, the same customer shows up as an anonymous number — even though their record already exists in the CRM.

## How it works

Once installed, the plugin runs quietly in the background of your existing logging workflow:

1. Every call that gets logged through App Connect is routed through the plugin.
2. The plugin receives the contact details App Connect already resolved for that call — name and phone number — from the CRM.
3. It **upserts** the contact into your RingCentral address book using those details — creating it if it doesn't exist yet, updating it if it does.
4. The address book entry stays current: every subsequent call from that person re-triggers the same upsert.

## Why "lazy" sync

- **The address book only grows from real activity.** It accumulates people you've actually corresponded with through App Connect, not your entire CRM contact base — so it stays relevant instead of filling up with stale leads or contacts you have no relationship with.
- **No bulk import, no sync schedule.** The plugin rides on call events that are already happening, so there's no separate job reconciling a full CRM dataset.
- **Contacts stay fresh automatically.** Each new call re-syncs the record, so it updates itself over time without any manual maintenance.

## What this means for you

Once a contact has called in through App Connect at least once, that person is identified by name on any RingCentral device going forward — desk phone, mobile app, or softphone — not just within the App Connect client.

## Installing the plugin

Plugins are installed by account admins from the App Connect admin console:

1. Open the **Admin** tab in App Connect.
2. Open **Plugins** and click **Explore**.
3. Find **Lazy Contact Sync** and review the plugin details page.
4. Click **Install**.

Once installed, the plugin becomes part of your account's configuration and starts syncing on the next logged call. For more on browsing, installing, and configuring plugins in general, see [Plugins](../users/plugins.md).

## Support

Questions about setup, CRM coverage, or field mapping go directly to the people who built it — see the [Captivo Labs](../build/captivolabs.md) partner page for contact details.
