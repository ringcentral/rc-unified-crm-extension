const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');

async function getContact({ platform, userId, phoneNumber, overridingFormat }) {
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
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactInfo = await platformModule.getContact({ user, authHeader, phoneNumber, overridingFormat });
        if (contactInfo != null && contactInfo.length > 0) {
            return { successful: true, message: '', contact: contactInfo };
        }
        else {
            return { successful: false, message: 'Cannot find contact' };
        }
    } catch (e) {
        console.log(e);
        return { successful: false, message: 'Failed to get contact.' };
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
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactInfo = await platformModule.createContact({ user, authHeader, phoneNumber, newContactName, newContactType });
        if (contactInfo != null) {
            return { successful: true, message: '', contact: contactInfo };
        }
        else {
            return { successful: false, message: `Cannot create contact ${newContactName} for phone number: ${phoneNumber}.` };
        }
    } catch (e) {
        console.log(e);
        return { successful: false, message: `Failed to create contact.` };
    }
}

exports.getContact = getContact;
exports.createContact = createContact;