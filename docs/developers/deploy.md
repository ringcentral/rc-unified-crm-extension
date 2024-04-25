# Build and deploy a CRM adapter

Once you have developed your adapter for a CRM, it is time to try it out. To do that, you will need to do two things:

* Build a Chrome extension and load it into your browser
* Deploy your adapter's server to a publicly accessible server

## Building the Chrome extension

Build scripts have been provided to assist you in building the Chrome extension you will install in your browser. 

1. Build the Chrome extension

    ```
	cd rc-unified-crm-extension/client
	npm run build
	```

    When you have completed the above, inside the `rc-unified-crm-extension/client` directory you will find a `build/dist` directory. The dist folder contains your Chrome extension. 
	
2. Install the Chrome extension

    * Open your Chrome web browser
	* From the "Window" menu, select "Extensions"
	* Click "Load unpacked"
	* Select the `dist` folder created in the previous step

## Deploying server to AWS

Technically your adapter's server could be deployed anywhere. You could host it yourself, or deploy it to a third-party like Heroku or AWS. To assist developers, we have provided a [serverless config file](https://www.serverless.com/) for AWS deployment under the `serverless-deploy`. 

1. Customize your environment
    
    ```js
	cd rc-unified-crm-extension/server/serverless-deploy
	cp sample.env.yml env.yml
	```
	
	Then edit `env.yml`.

2. Customize your serverless deploy config
    
	```js
	cp sample.serverless.yml serverless.yml
	```
	
	Then edit `serverless.yml`

3. Build and deploy the server

    ```js
	npm run build
	npm run deploy
	```
	
!!! tip "Deploying to another platform" 
    If you want to deploy it to other platform. Run `npm run build` and a build folder will be created for you in the `serverless-deploy` folder. You can then deploy this build folder to any other hosting provider.

### Server environment variables

| Variable                        | Description |
|---------------------------------|-------------|
| `APP_SERVER`                    | Url for your backend server        |
| `APP_SERVER_SECRET_KEY`         | Key to create secret toke between your server and client        |
| `TEST_CRM_CLIENT_ID`            | If CRM uses OAuth, it should be the client id for OAuth        |
| `TEST_CRM_CLIENT_SECRET`        | If CRM uses OAuth, it should be the client secret for OAuth        |
| `TEST_CRM_ACCESS_TOKEN_URI`     | If CRM uses OAuth, it should access token url for OAuth        |
| `TEST_CRM_REDIRECT_URI`         | You can use the default redirect uri, or change it to yours        |
| `DATABASE_URL`                  | Url for your database, the default one is for local sqlite database        |

