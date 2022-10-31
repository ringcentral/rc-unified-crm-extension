async function getContact({ platform, userId, phoneNumber }) {
    const platformModule = require(`../platformModules/${platform}`);
    const contactInfo = await platformModule.getContact({ userId, phoneNumber });
    if (contactInfo != null) {
        return { successful: true, message: '', contact: contactInfo };
    }
    else {
        throw `[Get Contact]Cannot find contact from phone number: ${phoneNumber}`
    }
}

exports.getContact = getContact;