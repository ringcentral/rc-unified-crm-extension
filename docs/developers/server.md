# Implementing your CRM adapter server

{! docs/developers/beta_notice.inc !}

Each adapter will be configured to communicate with the corresponding server for that adapter. While the [sample server](https://github.com/ringcentral/rc-unified-crm-extension/blob/FrameworkRefactor/src/adapters/testCRM/index.js) that is provided through this framework is implemented in Javascript, you are free to implement your server in whatever language you prefer -- provided that it implements the interface properly. 

It is highly recommeded that you look at [Quick Start](./quick-start.md) before starting your development.

## Flow

![Flow](../img/flow.png)

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

The frontend client helps to maintain a user's current authentication context, and transmits to the server with every API call a `jwtToken` parameter that encodes the data associated with the user making the current request. A JWT token, once decoded looks like this:

```js
{
  id: "<User ID in CRM>",
  platform: "<the CRM being integrated with>"
}
```

With this information, server can validate and identify users so to perform API actions under their accounts on CRM platforms. 

### Decoding JWT tokens

The JWT token created by the framework uses the `APP_SERVER_SECRET_KEY` environment variable as the secret to encode the token. To decode a token, we recommend using a third party library accordingly.

=== "Javascript"

    ```js
	const { verify } = require('jsonwebtoken');
    function decodeJwt(token) {
      try {
        return verify(token, process.env.APP_SERVER_SECRET_KEY);
      } catch (e) {
        return null;
      }
    }
    ```

## OpenAPI specification

To assist developers in implementing their CRM adapter server, an OpenAPI specification has been produced that defines the input and output of that server and its various endpoints. 

[Download the OpenAPI specification](openapi.md)



