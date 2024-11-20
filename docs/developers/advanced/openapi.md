# Building a custom adapter server 

This developer guide is optimized and intended for Javascript developers who are implementing new adapters using the server that comes bundled with the framework. Using this built in server can save developers a ton of time because it abstracts developers away from the underlying protocol used by the Chrome extension to talk to an adapter. 

If you would like to build your own server framework, perhaps because you personally prefer a programming language other than Javascript, you are welcome to. To implement your own server, you will need to fully implement the OpenAPI specification below. 

## JWT tokens

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

## Adapter Server OpenAPI specification

The OpenAPI specification below defines the interfaces that a developer must implement when creating an adapter for App Connect. Once implemented, your adapter's [manifest file](../manifest.md) will specify the `serverURL` for your adapter's server that has implemented the interfaces defined by the OpenAPI specification below. 

As a user uses the Chrome extension, when a CRM-specific function is engaged, the Chrome extension will compose a request the corresponding adapter's endpoint implemented by that adapter's server. The server will perform the corresponding action in the associated CRM, and return results in a prescribed format so the Chrome extension can display the results of the user's action.

[:fontawesome-solid-download: Download OpenAPI spec](../crm-server-openapi.json){ .md-button }
