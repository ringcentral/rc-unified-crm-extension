---
title: No "Connect" or "Authorize" Button Visible | App Connect Troubleshooting
description: Learn why the Connect or Authorize button is missing in App Connect, and how to resolve it by launching the extension from within your CRM.
---

# No "Connect" or "Authorize" button visible

If you open App Connect and do not see a **Connect** or **Authorize** button to link your CRM account, it is because App Connect has not detected which CRM you are using. This is resolved by launching App Connect while you are already inside your CRM.

## Symptom

The App Connect sidebar opens, but there is no button to connect or authenticate with your CRM. You may see a blank state or a prompt with no actionable option.

## Cause

App Connect determines which CRM to connect to by reading the domain of the page you are currently visiting. It uses this domain to identify the CRM and display the appropriate authorization flow. If App Connect is opened from any other page — such as a new tab, a search engine, or an unrelated website — it cannot identify a CRM and will not show the Connect button.

## Resolution

1. Log in to your CRM in your browser as you normally would.
2. While on any page within your CRM, open App Connect.
3. The Connect or Authorize button for your CRM will now appear.

!!! tip "Keep your CRM tab open"
    App Connect works best when your CRM is open in at least one browser tab. Navigating away from your CRM entirely while using App Connect can cause the connection to appear lost.

## Related topics

- [Getting started with App Connect](../getting-started.md)
- [Supported integrations](../crm/index.md)
