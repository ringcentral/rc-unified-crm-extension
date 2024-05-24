# Authorization

We support 2 types of authorization: [`oauth`](#oauth) and [`apiKey`](#api-key). Please fill the value in `manifest.json/platforms/{newCRM}/authType`. 

To start off, you need to register an app on CRM platform, and then you'll get:

* `oauth`: `ClientId` and `ClientSecret`

OR

* `apiKey`: `apiKey`

## OAuth

### Config

There are some parameters you may want to setup in `manifest.json`:

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `redirectUri`    | string          | Redirect Uri for RingCentral login. It's recommended to use the default one |
| `platforms.{crmName}.authUrl`      | string          | The auth URL to initiate the OAuth process with the CRM. Eg. https://app.clio.com/oauth/authorize |
| `platforms.{crmName}.clientId`       | string          | Only used with `authType` equal to `oauth`. The client ID of the application registered with the CRM to access it's API. |
| `platforms.{crmName}.scope`| string |(Optional) Only if you want to specify scopes in OAuth url. eg. "scope":"scopes=write,read" |
| `platforms.{crmName}.customState`| string |(Optional) Only if you want to override state query string in OAuth url. The state query string will be `state={customState}` instead. |

The client-side authorization url that is opened by the extension will be: `{authUrl}?responseType=code&client_id={clientId}&{scope}&state=platform={name}&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html`

### Implementation

Following interfaces need to be inplemented:

* `getAuthType`: return auth type
* `getOauthInfo`: return oauth info (needs to be setup in `.env` file)
* `getUserInfo`: replace mock with the actual call to CRM API server (`TODO.1`)

### Test

1. Refresh manifest: go to your extension options and click `save` to force the extension update its manifest and then reload the extension.
2. Log in to your RingCentral account.
3. Go to user settings and `Connect` to your CRM account, which should open a new tab with full auth url.
4. Check if user info is saved in database (`CHECK.1`)

## API key

### Auth page setup

Please go to [manifest](manifest.md#authentication-page).

### Implementation

Following interfaces need to be inplemented:

* `getAuthType`: return auth type
* `getBasicAuth`: return basic auth
* `getUserInfo`: replace mock with the actual call to CRM API server (`TODO.1`)

### Test

1. Refresh manifest: go to your extension options and click `save` to force the extension update its manifest and then reload the extension.
2. Log in to your RingCentral account.
3. Go to user settings and `Connect` to your CRM account, which should open a new tab with full auth url.
4. Check if user info is saved in database (`CHECK.1`)

## Unauthorize

### Implementation

Following interfaces need to be inplemented:

* `unAuthorize`: remove user info (`TODO.2`)

### Test

1. In the extension, click `Logout`
2. Check if user info is moreved from database (`CHECK.2`)
