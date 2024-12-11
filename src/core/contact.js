const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');

async function findContact({ platform, userId, phoneNumber, overridingFormat, isExtension }) {
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage: {
                    message: `Cannot find user with id: ${userId}`,
                    messageType: 'warning',
                    ttl: 3000
                }
            };
        }
        const platformModule = require(`../adapters/${platform}`);
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { matchedContactInfo, returnMessage, extraDataTracking } = await platformModule.findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension });
        if (matchedContactInfo != null && matchedContactInfo.length > 0) {
            return { successful: true, returnMessage, contact: matchedContactInfo, extraDataTracking };
        }
        else {
            return { successful: false, returnMessage };
        }
    } catch (e) {
        console.log(`platform: ${platform} \n${e.stack}`);
        if (e.response?.status === 429) {
            return { successful: false, returnMessage: { message: `${platform} rate limit reached. Please try again the next minute.`, messageType: 'warning', ttl: 5000 } };
        }
        return { successful: false, returnMessage: { message: `Failed to find contact.`, messageType: 'warning' } };
    }
}

async function createContact({ platform, userId, phoneNumber, newContactName, newContactType }) {
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return { successful: false, message: `Cannot find user with id: ${userId}` };
        }
        const platformModule = require(`../adapters/${platform}`);
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { contactInfo, returnMessage, extraDataTracking } = await platformModule.createContact({ user, authHeader, phoneNumber, newContactName, newContactType });
        if (contactInfo != null) {
            return { successful: true, returnMessage, contact: contactInfo, extraDataTracking };
        }
        else {
            return { successful: false, returnMessage };
        }
    } catch (e) {
        console.log(`platform: ${platform} \n${e.stack}`);
        if (e.response?.status === 429) {
            return { successful: false, returnMessage: { message: `${platform} rate limit reached. Please try again the next minute.`, messageType: 'warning', ttl: 5000 } };
        }
        return { successful: false, returnMessage: { message: `Failed to create contact.`, messageType: 'warning' } };
    }
}

exports.findContact = findContact;
exports.createContact = createContact;