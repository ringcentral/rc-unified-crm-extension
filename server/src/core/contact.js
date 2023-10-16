const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');

async function getContact({ platform, userId, phoneNumber, overridingFormat }) {
    try {
        let user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return { successful: false, message: `Cannot find user with id: ${userId}` };
        }
        const platformModule = require(`../platformModules/${platform}`);
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