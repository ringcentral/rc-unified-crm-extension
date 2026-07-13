/* eslint-disable no-param-reassign */
import type {
    OAuthAppLike,
    OAuthInfo,
    OperationFailureResult,
    RefreshableOAuthUser
} from '../types';

const ClientOAuth2 = require('client-oauth2');
const moment = require('moment');
const { UserModel: UserModelImport } = require('../models/userModel');
const UserModel = UserModelImport as any;
const connectorRegistry = require('../connector/registry') as any;
const logger = require('./logger');
const { handleDatabaseError } = require('./errorHandler');

// oauthApp strategy is default to 'code' which use credentials to get accessCode, then exchange for accessToken and refreshToken.
// To change to other strategies, please refer to: https://github.com/mulesoft-labs/js-client-oauth2
function getOAuthApp({
    clientId,
    clientSecret,
    accessTokenUri,
    authorizationUri,
    redirectUri,
    scopes
}: OAuthInfo): OAuthAppLike {
    return new ClientOAuth2({
        clientId: clientId,
        clientSecret: clientSecret,
        accessTokenUri: accessTokenUri,
        authorizationUri: authorizationUri,
        redirectUri: redirectUri,
        scopes: scopes
    });
}

async function checkAndRefreshAccessToken(
    oauthApp: OAuthAppLike,
    user: RefreshableOAuthUser,
    tokenLockTimeout = 20
): Promise<RefreshableOAuthUser | OperationFailureResult | null> {
    const now = moment();
    const tokenExpiry = moment(user.tokenExpiry);
    const expiryBuffer = 2; // 2 minutes
    // Special case: Bullhorn
    if (user.platform) {
        const platformModule = connectorRegistry.getConnector(user.platform);
        if (platformModule.checkAndRefreshAccessToken) {
            return platformModule.checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout);
        }
    }
    // Other CRMs - check if token will expire within the buffer time
    if (user && user.accessToken && user.refreshToken && tokenExpiry.isBefore(now.clone().add(expiryBuffer, 'minutes'))) {
        // case: use dynamoDB to manage token refresh lock
        if (process.env.USE_TOKEN_REFRESH_LOCK_PLATFORMS?.split(',')?.includes(user.platform as string)) {
            let newLock;
            const { Lock } = require('../models/dynamo/lockSchema');
            // Try to atomically create lock only if it doesn't exist
            try {
                newLock = await Lock.create(
                    {
                        userId: user.id,
                        ttl: now.unix() + tokenLockTimeout
                    },
                    {
                        overwrite: false
                    }
                );
                logger.info('lock created');
            } catch (e) {
                const lockError = e as any;
                // If creation failed due to condition, a lock exists
                if (lockError.name === 'ConditionalCheckFailedException' || lockError.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                    let lock = await Lock.get({ userId: user.id });
                    if (!!lock?.ttl && moment(lock.ttl).unix() < now.unix()) {
                        // Try to delete expired lock and create a new one atomically
                        try {
                            logger.info('lock expired.');
                            await lock.delete();
                            newLock = await Lock.create(
                                {
                                    userId: user.id,
                                    ttl: now.unix() + tokenLockTimeout
                                },
                                {
                                    overwrite: false
                                }
                            );
                        } catch (e2) {
                            const expiredLockError = e2 as any;
                            if (expiredLockError.name === 'ConditionalCheckFailedException' || expiredLockError.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                                // Another process created a lock between our delete and create
                                lock = await Lock.get({ userId: user.id });
                            } else {
                                throw e2;
                            }
                        }
                    }

                    if (lock && !newLock) {
                        let processTime = 0;
                        let delay = 500; // Start with 500ms
                        const maxDelay = 8000; // Cap at 8 seconds
                        while (!!lock && processTime < tokenLockTimeout) {
                            await new Promise(resolve => setTimeout(resolve, delay));
                            processTime += delay / 1000; // Convert to seconds for comparison
                            delay = Math.min(delay * 2, maxDelay); // Exponential backoff with cap
                            lock = await Lock.get({ userId: user.id });
                        }
                        // Timeout -> let users try another time
                        if (processTime >= tokenLockTimeout) {
                            throw new Error('Token lock timeout');
                        }
                        user = await UserModel.findByPk(user.id);
                        logger.info('locked. bypass');
                        return user;
                    }
                } else {
                    throw e;
                }
            }
            try {
                const startRefreshTime = moment();
                const token = oauthApp.createToken(user.accessToken, user.refreshToken);
                logger.info('token refreshing...');
                const { accessToken, refreshToken, expires } = await token.refresh();
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                user.tokenExpiry = expires;
                try {
                    await user.save();
                }
                catch (error) {
                    return handleDatabaseError(error, 'Error saving user');
                }
                if (newLock) {
                    const deletionStartTime = moment();
                    await newLock.delete();
                    const deletionEndTime = moment();
                    logger.info(`lock deleted in ${deletionEndTime.diff(deletionStartTime)}ms`);
                }
                const endRefreshTime = moment();
                logger.info(`token refreshing finished in ${endRefreshTime.diff(startRefreshTime)}ms`);
            }
            catch (e) {
                console.log('token refreshing failed', (e as any).stack);
                if (newLock) {
                    await newLock.delete();
                }
                return null;
            }
        }
        // case: run withou token refresh lock
        else {
            try {
                logger.info('token refreshing...');
                const token = oauthApp.createToken(user.accessToken, user.refreshToken);
                const { accessToken, refreshToken, expires } = await token.refresh();
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                user.tokenExpiry = expires;
            }
            catch (e) {
                console.log('token refreshing failed', (e as any).stack);
                return null;
            }
            try {
                await user.save();
            }
            catch (error) {
                return handleDatabaseError(error, 'Error saving user');
            }
            logger.info('token refreshing finished');
        }

    }
    return user;
}

export {
    checkAndRefreshAccessToken,
    getOAuthApp
};
