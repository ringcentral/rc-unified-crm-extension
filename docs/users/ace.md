# AI Conversation Expert insight logging

<!-- md:version 1.6.12 -->

!!! info "AI Conversation Expert (ACE) license required"

!!! warning "Not all CRM yet support ACE"
    Not all CRM connectors currently support ACE logging. Check with the maintainers of your CRM connector for compatibility and availability.

RingCentral's ACE platform generates high-quality transcripts, actionable summaries, and detailed meeting notes based on customer calls. It has the ability to log other artifacts as well, including call scores, sentiment analysis and more. 

For ACE customers who utilize App Connect for activity logging, this integration provides a significant advantage: the ability to synchronize these valuable ACE insights directly into your CRM platform.

## Why use App Connect for ACE Logging?

While ACE offers its own native logging, integrating through App Connect prevents the creation of duplicate call log activities. App Connect acts as the single, reliable source for all call data, aggregating both standard call log information and rich ACE artifacts into one comprehensive activity entry within your CRM. This unified approach simplifies reporting and ensures data consistency.

## Prerequisites

Before enabling this feature, ensure the following requirements are met:

**ACE License**. The account **must** have active ACE licenses assigned to users. The admin user must also have the `"ACE for Sales - Access Insights"` and `"Company Call Log - Access Recordings"` permissions in role

**Logging Mode**. ACE logging is supported **only** when using [server-side logging mode](./server-side-logging.md).

**User License**. The call owner (the user whose call is being logged) **must** be assigned a ACE license.

**Call Recording**. The call **must** be recorded for ACE data to be generated. We strongly recommend enabling automatic call recording.


### How to Enable ACE Logging (Admin Steps)

1. Sign in to App Connect as an [admin](./admin.md).  
2. Open the **Admin** panel.
4. Ensure [server-side logging](./server-side-logging.md) is enabled.
5. Navigate to the call logging settings:
   > **Route:** `Admin` → `Managed settings` → `Activity logging` → `Call log details`
6. In **Call log details**, enable the **ACE fields** you want to sync.

---

### Supported ACE Data Fields

When enabled, App Connect can sync the following ACE fields:

* **ACE transcript**
* **ACE summary**
* **ACE bulleted summary**
* **ACE AI score**
* **ACE link** (direct link to the ACE interaction details)

---

### ⚠️ Important Considerations

* **Processing Delay:**
  ACE insights are generated *after* the call ends and require processing time. A delay before data appears in your CRM is expected.
