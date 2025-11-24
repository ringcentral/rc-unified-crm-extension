# RingSense Insights Logging

<!-- md:version 1.6.12 -->

!!! info "RingSense license required"

!!! warning "Not all CRM yet support RingSense"
    Not all CRM connectors currently support RingSense logging. Check with the maintainers of your CRM connector for compatibility and availability.

RingCentral's RingSense platform generates high-quality transcripts, actionable summaries, and detailed meeting notes based on customer calls. It has the ability to log other artifacts as well, including call scores, sentiment analysis and more. 

For RingSense customers who utilize App Connect for activity logging, this integration provides a significant advantage: the ability to synchronize these valuable RingSense insights directly into your CRM platform.

## Why use App Connect for RingSense Logging?

While RingSense offers its own native logging, integrating through App Connect prevents the creation of duplicate call log activities. App Connect acts as the single, reliable source for all call data, aggregating both standard call log information and rich RingSense artifacts into one comprehensive activity entry within your CRM. This unified approach simplifies reporting and ensures data consistency.

## Prerequisites

Before enabling this feature, ensure the following requirements are met:

**RingSense License**. The account **must** have active RingSense licenses assigned to users. The admin user must also have the `"RingSense for Sales - Access Insights"` and `"Company Call Log - Access Recordings"` permissions in role

**Logging Mode**. RingSense logging is supported **only** when using [server-side logging mode](./server-side-logging.md).

**User License**. The call owner (the user whose call is being logged) **must** be assigned a RingSense license.

**Call Recording**. The call **must** be recorded for RingSense data to be generated. We strongly recommend enabling automatic call recording.


### How to Enable RingSense Logging (Admin Steps)

1. Sign in to App Connect as an [admin](./admin.md).  
2. Open the **Admin** panel.  
3. Navigate to the call logging settings:  
   > **Route:** `Admin` → `Managed settings` → `Activity logging` → `Call log details`
4. Ensure [server-side logging](./server-side-logging.md) is enabled.
5. In **Call log details**, enable the **RingSense fields** you want to sync.

---

### Supported RingSense Data Fields

When enabled, App Connect can sync the following RingSense fields:

* **RingSense transcript**
* **RingSense summary**
* **RingSense bulleted summary**
* **RingSense AI score**
* **RingSense link** (direct link to the RingSense interaction details)

---

### ⚠️ Important Considerations

* **Processing Delay:**  
  RingSense insights are generated *after* the call ends and require processing time. A delay before data appears in your CRM is expected.

* **CRM Compatibility:**

