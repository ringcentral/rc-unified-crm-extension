---
title: Calls Stuck in "Pending" or "Preparing Data" | App Connect Troubleshooting
description: Learn why App Connect call logs get stuck in a Pending state or show "preparing data..." indefinitely, and how to fix it by enabling all-at-once logging.
---

# Calls stuck in "Pending" or "preparing data..."

Call log records that never progress past "Pending" in the CRM, or that show "preparing data..." indefinitely in App Connect's call history, are almost always caused by a CRM permission policy that prevents users from updating records after they are created.

## Symptom

You may notice one or both of the following:

- In App Connect's **call history tab**, a call record is stuck showing **"preparing data..."** and never transitions to a completed state.
- In your **CRM**, the corresponding call log record is created but stays in a **"Pending"** state indefinitely — the call result, recording link, AI transcript, and agent notes are never added.

If you observe the "preparing data..." indicator in your call history, this is a strong signal that your organization is affected by the permission issue described below.

## Cause

App Connect logs calls in stages. When a call ends, it immediately creates a call log record in the CRM with basic call details, then updates that record multiple times as additional artifacts become available — the call result, any recording link, agent notes, and AI-generated transcript or summary.

Many organizations — particularly those using staffing and recruiting platforms like Bullhorn — have a compliance policy that allows agents to **create** records but not **edit** them. The intent is to preserve the integrity of call notes after creation. However, this policy prevents App Connect from completing its update steps, leaving the record permanently in its initial "Pending" state.

## Resolution

There are two ways to resolve this issue. Choose the one that best fits your organization's setup.

### Option 1: Enable all-at-once logging

Enable **all-at-once logging** in App Connect's Activity Logging settings.

When all-at-once logging is active, App Connect waits until all call data has been collected and then creates the call log record in a single transaction. No subsequent updates are ever needed, so the create-only permission policy is fully respected and calls are logged completely.

See [Incremental versus all-at-once logging](../users/logging.md#incremental-versus-all-at-once-logging) for step-by-step instructions on enabling this setting.

!!! note "All-at-once logging introduces a delay"
    Because App Connect waits for all call artifacts to be ready before writing anything to the CRM, there will be a noticeable delay between when a call ends and when the log record appears. The length of that delay depends on system load and how long it takes for artifacts like recordings and AI transcripts to become available. If real-time logging is a priority for your organization, Option 2 below is the better choice.

### Option 2: Use server-side logging with an elevated account

Enable [server-side call logging](../users/server-side-logging.md) and configure it to authenticate using a CRM account that has both **create and update** permissions on activity records — typically an admin or service account.

Because server-side logging operates under the credentials of the account that configured it, rather than the individual agent's account, it can bypass the agent-level restriction that causes records to get stuck. This approach lets agents continue working under their normal permission policy while ensuring call logs are fully completed by the service account.

!!! tip "This setting is especially important for Bullhorn users"
    Bullhorn organizations commonly restrict recruiters and agents to create-only permissions on notes and activity records. Either remedy above will resolve the issue; all-at-once logging is simpler to configure, while server-side logging with an elevated account gives you additional capabilities like real-time logging and organization-wide coverage.

## Related topics

- [Incremental versus all-at-once logging](../users/logging.md#incremental-versus-all-at-once-logging)
- [Server-side call logging](../users/server-side-logging.md)
- [Call logging overview](../users/logging.md)
