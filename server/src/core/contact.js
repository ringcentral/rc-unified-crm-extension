const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');

async function getContact({ platform, userId, phoneNumber }) {
    try {
        const user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            throw `Cannot find user with id: ${userId}`;
        }
        const platformModule = require(`../platformModules/${platform}`);
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo());
                await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactInfo = await platformModule.getContact({ user, authHeader, phoneNumber });
        if (contactInfo != null) {
            return { successful: true, message: '', contact: contactInfo };
        }
        else {
            return { successful: false, message: `Cannot find contact for phone number: ${phoneNumber}. Please create a contact on CRM website with ${phoneNumber}.` };
        }
    } catch (e) {
        console.log(e);
        return { successful: false, message: `Failed to get contact.` };
    }
}

exports.getContact = getContact;