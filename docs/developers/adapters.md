# Building a custom CRM adapter

## Add your own CRM platform

*This framework is in beta, please create Github issues or contact da.kong@ringcentral.com if you encounter any problem*

It's recommended to apply changes to 3 mock files to build up your CRM support.

### CRM module on server side

(following TODOs in sequence)

### CRM module on client side

(just few self-explanatory content)

### CRM config on client side

(go through each object/field that needs explanation)

(authType - only support 'oauth' and 'apiKey')

(authUrl, clientId, redirectUri - ONLY for 'oauth')

(canOpenLogPage - Some CRMs don't have dedicated activity page therefore cannot be opened. It'd open contact page instead)

(contactDependent - Whether this field would change accordingly when selected contact is changed, in multi match cases)

(embedded - welcomePage that only shows when user first time open crm page)
