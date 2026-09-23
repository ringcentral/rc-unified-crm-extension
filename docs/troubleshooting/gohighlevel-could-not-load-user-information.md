---
title: "Could Not Load User Information (GoHighLevel) | App Connect Troubleshooting"
description: Learn why GoHighLevel shows a "Could not load user information" error after authorization, and how to resolve it with Staff sub-account credentials and the correct login URL.
---

# "Could not load user information" error (GoHighLevel)

If you complete the GoHighLevel authorization flow in App Connect and are shown an error reading **"Could not load user information"** instead of a successful connection, App Connect was unable to resolve your login into a Staff record for the specific GoHighLevel sub-account you're connecting.

## Symptom

- App Connect (Beta) is installed and up to date.
- You start the GoHighLevel connection flow and complete every step of the authorization process.
- Instead of showing you as connected, App Connect displays: **Could not load user information.**

## Cause

This error has three common root causes, roughly in order of likelihood:

- **You authorized with the wrong kind of account.** GoHighLevel is organized around **sub-accounts** (also called locations), and each sub-account has its own list of **Staff** members. App Connect needs to look you up as a Staff member of the exact sub-account you're trying to connect. If you log in with a general agency-level login, or with a user account that hasn't been added as Staff on that sub-account, GoHighLevel has no Staff record for App Connect to load — and the connection fails with this error.
- **The flow was started from the wrong domain.** GoHighLevel is white-labeled by agencies, meaning a given GoHighLevel instance can be reached through several different domains: the main `app.gohighlevel.com` domain, an agency's own branded/whitelabel domain, and GoHighLevel's underlying platform domain that white-labeled instances are built on top of (for illustration, something along the lines of `app.crmplatformhq.example`, rather than the customer-facing domain). Starting the App Connect authorization flow from any domain other than `app.gohighlevel.com` can confuse the application context that GoHighLevel hands back to App Connect, which produces the same error.
- **A stale browser session interfered with the flow.** Because authorization is a multi-step process that opens several windows, leftover session state from a previous attempt can sometimes prevent the flow from completing cleanly.

## Resolution

Work through these steps in order — most cases are resolved by the first one.

### 1. Confirm you're using Staff / sub-account credentials

Make sure the account you're logging in with belongs to the **Staff** list of the exact sub-account you want App Connect connected to:

1. In GoHighLevel, go to the sub-account in question.
2. Open **Settings > My Staff** (or your agency's equivalent path) and confirm your login is listed there.
3. If you normally log in with a general agency/admin account rather than a Staff login scoped to that sub-account, that mismatch is very likely the cause of the error.

### 2. Test with a newly added Staff user

To confirm the diagnosis, try the connection with a fresh account:

1. Add a new Staff member to the affected sub-account.
2. Log in as that new Staff user.
3. Attempt the App Connect connection again.

If the new Staff login connects successfully, the issue is tied to the original account's access or Staff configuration on that sub-account — work with your GoHighLevel admin to add or correct that user's Staff membership.

### 3. Start the connection from the correct GoHighLevel URL

Always begin the App Connect installation/connection flow from the main GoHighLevel URL:

- Use: `https://app.gohighlevel.com`

!!! warning "Avoid whitelabel and underlying platform domains"
    Don't start the flow from an agency's whitelabel/whitelisted domain, or from links that point at GoHighLevel's underlying white-label platform domain rather than `app.gohighlevel.com` (agencies sometimes bookmark or get redirected to this kind of link without realizing it). Starting from one of these alternate domains can confuse the application context and trigger the "Could not load user information" error.

### 4. Clear browser cache and retry the full flow

A stale or inconsistent session can prevent GoHighLevel from restoring the correct application state during authorization. To rule this out:

1. Clear your browser cache, or open an incognito/private window.
2. Log in to RingCentral again, if applicable.
3. Repeat the GoHighLevel connection process from the beginning, starting at `https://app.gohighlevel.com`.

## Related topics

- [GoHighLevel by Loyally](../crm/gohighlevel.md)
- [No "Connect" button visible](no-connect-button.md)
- [Getting started with App Connect](../getting-started.md)
