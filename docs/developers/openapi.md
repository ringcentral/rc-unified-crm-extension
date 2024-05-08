# Adapter Server OpenAPI specification

The OpenAPI specification below defines the interfaces that a developer must implement when creating an adapter for the Unified CRM extension. Once implemented, your adapter's [config file](config.md) will specify the `serverURL` for your adapter's server that has implemented the interfaces defined by the OpenAPI specification below. 

As a user uses the Chrome extension, when a CRM-specific function is engaged, the Chrome extension will compose a request the corresponding adapter's endpoint implemented by that adapter's server. The server will perform the corresponding action in the associated CRM, and return results in a prescribed format so the Chrome extension can display the results of the user's action.

[:fontawesome-solid-download: Download OpenAPI spec](crm-server-openapi.json){ .md-button }
