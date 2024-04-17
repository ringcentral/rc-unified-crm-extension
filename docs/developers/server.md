# Implementing your CRM adapter server

{! docs/developers/beta_notice.inc !}

Each adapter will be configured to communicate with the corresponding server for that adapter. While the [sample server](https://github.com/ringcentral/rc-unified-crm-extension/blob/FrameworkRefactor/server/src/platformModules/testCRM.js) that is provided through this framework is implemented in Javascript, you are free to implement your server in whatever language you prefer -- provided that it implements the interface properly. 

## Interfaces

Each server will need to implement each of the following interfaces:

* [Contact lookup and matching](contact-matching.md)
* [Logging, updating and looking up call logs](logging-calls.md)
* [Logging SMS messages](logging-sms.md)
* [Creating placeholder contacts](placeholder-contacts.md)
* [Unauthorizing users](unauthorization.md)

!!! tip "The included sample server will save you time"
    The sample server that comes bundled with this developer framework handles a lot of the mundane and predictable work for you. To save time, we encourage you to implement your adapter in Javascript as well. 

## JWT token

TODO - what is it, how is it constructed, how is it accessed and decoded

## OpenAPI specification

TODO - provide link to OpenAPI spec file



