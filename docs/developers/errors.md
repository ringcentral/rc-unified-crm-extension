# Returning messages to client

When implementing your connector, you will encounter the need to provide feedback to the end user interacting with the connector. For example you may wish to display:

* an error message
* a confirmation message
* a warning

Within your connector, you can cause App Connect to display a message to a user by returning a `returnMessage` construct in an given interface. Here's a quick example for create call log return in `testCRM`:

```js
return {
    logId: addLogRes.data.id,
    returnMessage: {
        message: 'Call log added.',
        messageType: 'success',
        ttl: 3000
    }
};
```

## Return message parameters 

| Parameter     | Description                                                                                     |
|---------------|-------------------------------------------------------------------------------------------------|
| `message`     | The message to display.                                                                         |
| `messageType` | There are 3 message types: `success`, `warning` and `danger`.                                   |
| `ttl`         | The length of time to display the message (in milliseconds) before it disappears automatically. |
