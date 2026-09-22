---
title: What Does App Connect Cost? | App Connect Knowledge Base
description: A breakdown of what's free and what costs extra when using App Connect — the core framework, third-party connectors and plugins, and RingCentral ACE-powered AI features.
---

# What does App Connect cost?

App Connect itself is free. Some of what it connects to is not. Here's how the pricing breaks down.

## The core framework is free for every customer

The underlying App Connect framework is available at no additional cost to all RingCentral customers, at every plan tier — Core, Advanced, and Ultimate. This includes the core functionality that connects RingCentral to your CRM: contact lookups and matching, screen-pop, and client-side call and SMS logging.

## Some connectors and plugins cost extra

App Connect supports a growing list of CRMs and other tools through connectors and plugins. Some are built and maintained by RingCentral; many others are built by third-party developers. Whether a given connector or plugin is free depends on who built it and how they choose to distribute it.

!!! money "Check with the connector's developer for pricing"
    When a connector or plugin has a cost, that cost is set and billed by the developer who built and maintains it — not by RingCentral. Consult the developer or creator directly for current licensing and pricing information.

## AI-generated call artifacts: two tiers, two cost models

RingCentral offers two distinct ways to generate AI insights from a call, and they're priced differently.

### RingCentral ACE (AI Conversation Expert)

ACE produces high-fidelity transcripts, summaries, and other insights from a high-quality call recording, using a more sophisticated AI model. It also captures a transcript for every call automatically, regardless of whether a user chose to record it — making it the better fit if you want AI insights across every conversation in your company. Access to ACE-produced artifacts requires a RingCentral ACE license, purchased separately from App Connect, and that requirement isn't affected by the introductory period below.

### App Connect's built-in AI Assistant

AI Assistant is available to every RingCentral customer at no extra license cost. It generates a live transcript, summary, and other insights for a single call as it happens — ideal for extracting insights from one conversation at a time, rather than aggregating insights across your whole company.

### What each one produces

Both are generated from the live call transcript, but ACE produces a broader set of artifacts:

| Artifact         | AI Assistant | RingCentral ACE    |
|------------------|--------------|--------------------|
| Call transcript  | ✅           | ✅ (high-fidelity) |
| Call summary     | ✅           | ✅                 |
| Bulleted summary | —            | ✅                 |
| Next steps       | —            | ✅                 |
| Highlights       | —            | ✅                 |
| Call notes       | —            | ✅                 |
| Sentiment        | —            | ✅                 |
| AI Score         | —            | ✅                 |

### Which one is right for you?

| | App Connect's AI Assistant | RingCentral ACE |
|---|---|---|
| Cost | Included | License required |
| Call coverage | One call at a time, as it's happening | Every call, automatically — recording not required |
| Best for | Insights from a single, isolated call | Company-wide AI insights across all conversations |

### Logging AI Assistant artifacts to your CRM

--8<-- "docs/_snippets/ai-artifacts-free-period.md"

See [How long will the introductory period last?](introductory-period.md) for more detail.

## Related topics

- [How long will the introductory period last?](introductory-period.md)
- [AI Assistant](../users/ai.md)
- [AI Conversation Expert (ACE) logging](../users/ace.md)
- [Call logging overview](../users/logging.md)
- [Supported integrations](../crm/index.md)
