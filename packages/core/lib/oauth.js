/* eslint-disable no-param-reassign */
const ClientOAuth2 = require('client-oauth2');
const { UserModel } = require('../models/userModel');
const adapterRegistry = require('../adapter/registry');
const dynamoose = require('dynamoose');

// oauthApp strategy is default to 'code' which use credentials to get accessCode, then exchange for accessToken and refreshToken.
// To change to other strategies, please refer to: https://github.com/mulesoft-labs/js-client-oauth2
function getOAuthApp({ clientId, clientSecret, accessTokenUri, authorizationUri, redirectUri, scopes }) {
    return new ClientOAuth2({
        clientId: clientId,
        clientSecret: clientSecret,
        accessTokenUri: accessTokenUri,
        authorizationUri: authorizationUri,
        redirectUri: redirectUri,
        scopes: scopes
    });
}


async function checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout = 10) {
    const dateNow = new Date();
    const tokenExpiry = new Date(user.tokenExpiry);
    const expiryBuffer = 1000 * 60 * 2; // 2 minutes => 120000ms
    // Special case: Bullhorn
    if (user.platform) {
        const platformModule = adapterRegistry.getAdapter(user.platform);
        if (platformModule.checkAndRefreshAccessToken) {
            return platformModule.checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout);
        }
    }
    // Other CRMs
    if (user && user.accessToken && user.refreshToken && tokenExpiry.getTime() < (dateNow.getTime() + expiryBuffer)) {
        let newLock;
        // case: use dynamoDB to manage token refresh lock
        if (process.env.USE_TOKEN_REFRESH_LOCK === 'true') {
            const { Lock } = require('../models/dynamo/lockSchema');
            // Try to atomically create lock only if it doesn't exist
            try {
                newLock = await Lock.create(
                    { 
                        userId: user.id,
                        ttl: dateNow.getTime() + 1000 * 30
                     },
                    { 
                        condition: new dynamoose.Condition().where('userId').not().exists()
                    }
                );
                console.log('lock created')
            } catch (e) {
                // If creation failed due to condition, a lock exists
                if (e.name === 'ConditionalCheckFailedException' || e.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                    let lock = await Lock.get({ userId: user.id });
                    if (!!lock?.ttl && lock.ttl < dateNow.getTime()) {
                        // Try to delete expired lock and create a new one atomically
                        try {
                            await lock.delete();
                            newLock = await Lock.create(
                                { userId: user.id },
                                { 
                                    condition: new dynamoose.Condition().where('userId').not().exists()
                                }
                            );
                        } catch (e2) {
                            if (e2.name === 'ConditionalCheckFailedException' || e2.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                                // Another process created a lock between our delete and create
                                lock = await Lock.get({ userId: user.id });
                            } else {
                                throw e2;
                            }
                        }
                    }
                    
                    if (lock && !newLock) {
                        let processTime = 0;
                        while (!!lock && processTime < tokenLockTimeout) {
                            await new Promise(resolve => setTimeout(resolve, 2000));    // wait for 2 seconds
                            processTime += 2;
                            lock = await Lock.get({ userId: user.id });
                        }
                        // Timeout -> let users try another time
                        if (processTime >= tokenLockTimeout) {
                            throw new Error('Token lock timeout');
                        }
                        user = await UserModel.findByPk(user.id);
                        console.log('locked. bypass')
                        return user;
                    }
                } else {
                    throw e;
                }
            }
            const token = oauthApp.createToken(user.accessToken, user.refreshToken);
            console.log('token refreshing...')
            const { accessToken, refreshToken, expires } = await token.refresh();
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpiry = expires;
            await user.save();
            if (newLock) {
                await newLock.delete();
            }
            console.log('token refreshing finished')
        }
        // case: run withou token refresh lock
        else {
            console.log('token refreshing...')
            const token = oauthApp.createToken(user.accessToken, user.refreshToken);
            const { accessToken, refreshToken, expires } = await token.refresh();
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpiry = expires;
            await user.save();
            console.log('token refreshing finished')
        }

    }
    return user;
}

exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getOAuthApp = getOAuthApp;