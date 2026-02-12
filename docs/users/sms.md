# Sending SMS

App Connect has the ability to send and receive SMS messages. You can access this functionality from the Messages tab and works more or less like your phone. Click on the conversation you want to view, and then send messages to that individual or group. 

## SMS templates

Engaging with communications from customers can be overwhelming, and responding to the same questions individually can be taxing. SMS templates allow you to compose responses to common inquiries ahead of time. Then when it comes time to author a message, rather than composing your response manually, select from one of your pre-written responses, populate the message into the messaging box, make any small edits you need, and then click send. 

<figure markdown>
  ![SMS templates](../img/sms-templates.png)
  <figcaption>Use SMS templates to quickly compose responses to common inquiries</figcaption>
</figure>

### Managing SMS templates

The SMS templates used in App Connect are the same templates you create and manage inside of the RingCentral desktop application to ensure consistency between these two clients. 

<figure markdown>
  ![SMS templates inside desktop app](../img/sms-templates-glip.png){ .mw-400 }
  <figcaption>Use SMS templates as seen from the RingCentral desktop application</figcaption>
</figure>

## SMS logging settings

| Setting | Description |
|---------|-------------|
| **Log SMS conversations automatically** | This toggles the auto log feature which will always attemp to log your SMS messages unless any conflict is found. |
| **Open call SMS logging page after message** | This is a sub-setting under auto log. When enabled, App Connect will open a logging page when an SMS message is sent. It only prompts you in this manner for the first message logged that day. |

Logging SMS conversations follows many of the same rules as logging phone calls, especially as it relates to resolving conflicts and so forth. Please consult [call logging](logging.md) for more information. 

## Direct vs Shared SMS inboxes

Individual RingCentral users with a direct phone number enabled for SMS can send and receive SMS. This form of SMS we refer to as "direct SMS." Only the owner of the phone number is permitted to respond to message sent to them via these means. If you wish to share the responsibility of receiving and replying to SMS, then you should [follow the instructions](https://support.ringcentral.com/article-v2/managing-a-shared-sms-inbox.html?brand=RingCentral&product=RingEX&language=en_US) at RingCentral's support site to set one up and manage it properly. 

!!! tip "Purchase may be required"
    The Shared SMS inbox feature is associated with RingCentral's [Customer Engagement Bundle](https://www.ringcentral.com/products/customer-engagement-bundle.html) which may require an additional fee depending on your account. 

<figure markdown>
  ![Shared SMS inbox](../img/shared-sms-list.png)
  <figcaption>A view of a shared SMS inbox in App Connect</figcaption>
</figure>

### Logging direct SMS conversations

Similar to call logging, App Connect can also log SMS messages. To help prevent a CRM from being overwhelmed by individual records for each SMS, App Connect creates a single CRM record that contains a digest of all the SMS messages sent between you and a recipient sent in a single day. 

### Logging shared SMS conversations

<!-- md:version 2.0 -->

Shared SMS conversations are different from direct SMS conversations in one key way: they can be resolved. For this reason, the logging of shared SMS conversations are done on a conversation-by-conversation basis, rather than being segmented by calendar day (as it done with direct SMS conversations). This ensures that an entire interaction with a customer is properly and completely memorialized in your CRM. 

<figure markdown>
  ![Shared SMS inbox message/conversation](../img/shared-sms-message.png)
  <figcaption>A view of a individual shared SMS convesation in App Connect</figcaption>
</figure>

