import axios from 'axios';
import config from '../config.json';
import pipedriveModule from '../platformModules/pipedrive.js';
import insightlyModule from '../platformModules/insightly.js';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const contactRes = await axios.get(`${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}`);
    const platformModule = await getModule();
    const additionalLogInfo = platformModule.getContactAdditionalInfo(contactRes);
    return { matched: contactRes.data.successful, message: contactRes.data.message, contactInfo: contactRes.data.contact, additionalLogInfo };
}

async function getModule() {
    const platformInfo = await chrome.storage.local.get('platform-info');
    switch (platformInfo['platform-info'].platformName) {
        case 'pipedrive':
            return pipedriveModule;
        case 'insightly':
            return insightlyModule;
    }
}

exports.getContact = getContact;