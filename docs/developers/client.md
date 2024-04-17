# Implementing client-side functions

{! docs/developers/beta_notice.inc !}

The client-side portion of your adapter performs the following browser functions:

* Open a tab corresponding to an incoming call's associated contact record
* Open a tab corresponding to the activity record associated with a phone call
* Perform any garbage collection when a user logs out of a CRM

## Call-pop

=== "Sample adapter"
    ```js
    {!> client/src/platformModules/testCRM.js [ln:1-9]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/platformModules/pipedrive.js [ln:1-3]!}
    ```

## Opening call log page

=== "Sample adapter"
    ```js
    {!> client/src/platformModules/testCRM.js [ln:14-23]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/platformModules/pipedrive.js [ln:5-7]!}
    ```

### Deauthorizing users

=== "Sample adapter"
    ```js
    {!> client/src/platformModules/testCRM.js [ln:10-12]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/platformModules/pipedrive.js [ln:9-11]!}
    ```

=== "Bullhorn adapter"
    ```js
    {!> client/src/platformModules/bullhorn.js [ln:14-17]!}
    ```

