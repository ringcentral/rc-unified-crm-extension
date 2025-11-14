# RingSense Logging

!!! warning "Work in Progress"
    This feature is currently under development and not yet available in production.

For customers with a RingCentral RingSense license, App Connect supports to sync RingSense insights into supported CRM platforms.

## Prerequisites

Before enabling this feature, ensure the following requirements are met:

* **RingSense License:**  
  The account **must** have active RingSense licenses assigned to users. The admin user must also have the `"RingSense for Sales - Access Insights"` and `"Company Call Log - Access Recordings"` permissions in role

* **Logging Mode:**  
  RingSense logging is supported **only** when using [server-side logging mode](./server-side-logging.md).

* **User License:**  
  The call owner (the user whose call is being logged) **must** be assigned a RingSense license.

* **Call Recording:**  
  The call **must** be recorded for RingSense data to be generated. We strongly recommend enabling automatic call recording.

---


### How to Enable RingSense Logging (Admin Steps)

1. Sign in to App Connect as an [admin](./admin.md).  
2. Open the **Admin** panel.  
3. Navigate to the call logging settings:  
   > **Route:** `Admin` → `Managed settings` → `Activity logging` → `Call log details`
4. In **Call log details**, enable the **RingSense fields** you want to sync.
5. Ensure [server-side logging](./server-side-logging.md) is enabled.
   **Important:**
   - If server-side logging was already enabled, you must click **Save** server-side logging button again to activate RingSense support.  
   - Any time call log detail settings are updated, the admin must re-save the server-side logging settings to apply the changes.

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
    !!! warning "Connector Support"
        Not all CRM connectors currently support RingSense logging. Check with the maintainers of your CRM connector for compatibility and availability.