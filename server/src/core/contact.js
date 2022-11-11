const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');

async function getContact({ platform, userId, phoneNumber }) {
    const user = await UserModel.findByPk(userId);
    if (!user || !user.accessToken) {
        throw `Cannot find user with id: ${userId}`;
    }
    const platformModule = require(`../platformModules/${platform}`);
    const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo());
    await oauth.checkAndRefreshAccessToken(oauthApp, user);
    const contactInfo = await platformModule.getContact({ accessToken: user.accessToken, phoneNumber });
    if (contactInfo != null) {
        return { successful: true, message: '', contact: contactInfo };
    }
    else {
        throw `Cannot find contact for phone number: ${phoneNumber}. Please create a contact.`;
    }
}

exports.getContact = getContact;