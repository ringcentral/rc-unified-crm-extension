import axios from 'axios';
import config from '../config.json';
import pipedriveModule from '../platformModules/pipedrive.js';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const contactRes = await axios.get(`${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}`);
    const additionalLogInfo = getModule().getContactAdditionalInfo(contactRes);
    return { matched: contactRes.data.successful, message: contactRes.data.message, contactInfo: contactRes.data.contact, additionalLogInfo };
}

function getModule() {
    switch (config.currentPlatform) {
        case 'pipedrive':
            return pipedriveModule;
    }
}

exports.getContact = getContact;