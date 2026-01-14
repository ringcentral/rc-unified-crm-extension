# Logging RingCX calls via App Connect

<!-- md:version 2.0-experimental -->

Our vision is to eventually bring the full power and feature set of App Connect to RingCX users. As a first step toward this goal, we have introduced experimental support that allows RingCX phone calls to be logged directly to any supported CRM via App Connect.

## Prerequisites

Before enabling this feature, ensure your account meets the following requirements:

* **RingCX license**: An active RingCX subscription.
* **ACE (a.k.a. RingSense) license**: Required for data processing and AI insights.
* **Server-Side call logging**: This must be enabled on your account.

## Key Limitations

As this is an experimental release, please be aware of the following:

* **Extension Functionality**: The App Connect browser extension is currently used only to configure RingCX logging. All other features (such as the overlay or side panel) are effectively inert for RingCX at this time.
* **Conflict Resolution**: You are currently unable to resolve logging conflicts manually.
    !!! hint "We strongly recommend using auto-logging policies to ensure that the majority of your calls are logged without intervention."

## Setting Up RingCX Logging

Configuration must be performed by a SuperAdmin.

1. Navigate to the Admin tab within App Connect.
2. Locate the Server side logging section.
3. For RingCX customers, a new option will be visible here.
4. Select both RingEX and RingCX (Experimental).

<figure markdown>
  ![User report](../img/ringcx-logging.png){ .mw-400 }
  <figcaption>The Admin settings showing both RingEX and RingCX (Experimental) checkboxes selected under Server Side Logging.</figcaption>
</figure>


