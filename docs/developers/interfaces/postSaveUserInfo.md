# postSaveUserInfo

This lifecycle hook is called immediately after a user successfully authenticates and their user information has been saved to the database. Use it to perform any post-authentication setup that requires the newly saved user record — for example, fetching and caching CRM-specific user details, initializing session tokens, or storing region-specific server URLs.

## Input parameters

| Parameter  | Description                                                                                   |
|------------|-----------------------------------------------------------------------------------------------|
| `userInfo` | The freshly saved user object, as stored in the database after the `getUserInfo` interface ran. |
| `oauthApp` | The OAuth application instance, available in case additional token operations are needed.     |

## Return value(s)

No return value is required. Side effects (such as updating the user record in the database with additional platform-specific info) are expected.

**Example**
```js
async function postSaveUserInfo({ userInfo, oauthApp }) {
  // Fetch the Bullhorn REST URL and session token and store them
  const sessionInfo = await loginToBullhornRestApi(userInfo);
  await User.update({
    id: userInfo.id,
    platformAdditionalInfo: {
      ...userInfo.platformAdditionalInfo,
      restUrl: sessionInfo.restUrl,
      bhRestToken: sessionInfo.BhRestToken
    }
  });
}
```
