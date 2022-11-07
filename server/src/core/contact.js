async function getContact({ platform, userId, phoneNumber }) {
    const platformModule = require(`../platformModules/${platform}`);
    const contactInfo = await platformModule.getContact({ userId, phoneNumber });
    if (contactInfo != null) {
        return { successful: true, message: '', contact: contactInfo };
    }
    else {
        return { successful: false, message: `Cannot find contact for phone number: ${phoneNumber}. Please create a contact.` };
    }
}

exports.getContact = getContact;