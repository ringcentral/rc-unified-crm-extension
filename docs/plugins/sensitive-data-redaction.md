---
title: Sensitive Data Redaction — App Connect Plugin
---

# Sensitive Data Redaction

<div class="bld-hero">
  <div class="bld-hero__logo">
    <img src="../../img/vendor-captivolabs.svg" alt="Captivo Labs">
  </div>
  <div>
    <div class="bld-hero__category">App Connect Plugin · Free</div>
    <p class="bld-hero__tagline">Masks payment card details and other personal data in call notes, AI summaries, and transcripts before App Connect saves them to your CRM.</p>
  </div>
</div>

Sensitive Data Redaction is built by [Captivo Labs](../build/captivolabs.md). It is free to install, and it works alongside any CRM connector Captivo Labs or RingCentral has already built.

## The problem it solves

Customers read card numbers, security codes, and personal identifiers out loud on calls all the time. Those details flow into the AI summary and the transcript, and from there into the CRM as plain text — where they sit indefinitely in a system that was never designed to hold them, visible to anyone with access to the record.

A caller reading out their card produces an AI summary like this:

> Card 4532 0151 1283 0366, expiry 09/27, CVV 123.

With the plugin installed, your CRM receives this instead:

> Card XXXX XXXX XXXX XXXX, expiry XX/XX, CVV XXX.

Card numbers, expiry dates, and security codes are masked by default, whether they were typed into your notes or spoken aloud and picked up by transcription. Email addresses, phone numbers mentioned in conversation, and ID numbers such as social security and tax file numbers can be masked too, as opt-in settings.

The plugin only inspects the parts of a call log that carry what was said or written — your notes, the AI summary, and the transcript. It never alters what App Connect needs to log the call correctly: the caller's phone number, the contact, the matter or deal you selected, the subject, or the call's times and duration.

## Caveats worth knowing

**Masking is one-way.** The original text never reaches your CRM and the plugin keeps no copy, so there is nothing to unmask later. If you need the original wording, review the call in RingCentral.

**It is a safeguard, not a guarantee.** Redaction works from the text App Connect hands to the plugin. If transcription garbles a number badly, or someone spells details out in an unusual way, it may not be recognized. Spot-check records that matter and correct anything the plugin missed.

**Nothing is lost if the plugin fails.** If it cannot process a call, the call is still logged as normal and App Connect displays a message asking you to check the notes.

!!! note "Built-in connector coverage"

    On CRMs reached through App Connect's built-in connectors, such as Pipedrive, the AI summary and transcript of a **newly logged** call are not masked yet. Your notes are, and so are AI summaries and transcripts when a log is updated. Calls logged through Captivo Labs connectors — [Smokeball](../crm/smokeball.md), [ConnectWise](../crm/connectwise.md), and [Odoo](../crm/odoo.md) — are masked in full.

Calls logged automatically by [server-side call logging](../users/server-side-logging.md) are checked the same way as calls you log yourself.

## Privacy

* **No call content is stored.** The plugin reads the call log, masks it, and hands it back to App Connect. Nothing it reads is retained.
* **No account access.** It does not connect to your RingCentral or CRM account, which is why installing it never asks you to sign in to anything.
* **Usage counts only.** Captivo Labs records how many calls the plugin processed and how many items it masked for each account. What was masked is never recorded.

## Installing the plugin

Plugins are installed by account admins from the App Connect admin console: open the **Admin** tab, go to **Plugins**, click **Explore**, find **Sensitive Data Redaction**, and click **Install**. Card redaction is on from the start; the remaining categories are opt-in. For more on browsing, installing, and configuring plugins in general, see [Plugins](../users/plugins.md).

## Learn more

Captivo Labs maintains the full reference for this plugin, including exactly what each pattern matches and the complete list of settings.

<div class="bld-cta">
  <div>
    <div class="bld-cta__title">Sensitive Data Redaction documentation</div>
    <p class="bld-cta__desc">Detection rules, every setting and its default, and answers to common questions — maintained by the team that built the plugin.</p>
  </div>
  <a href="https://docs.captivolabs.com/sensitive-data-redaction-plugin" class="bld-cta__btn" target="_blank" rel="noopener">Read the Captivo Labs docs →</a>
</div>

Questions about setup, coverage, or redaction behavior go directly to the people who built it — see the [Captivo Labs](../build/captivolabs.md) partner page for contact details.
