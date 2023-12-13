import axios from 'axios';
import config from '../config.json';
import pipedriveModule from '../platformModules/pipedrive.js';
import insightlyModule from '../platformModules/insightly.js';
import clioModule from '../platformModules/clio.js';
import redtailModule from '../platformModules/redtail';
import bullhornModule from '../platformModules/bullhorn';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const { overridingPhoneNumberFormat, overridingPhoneNumberFormat2, overridingPhoneNumberFormat3 } =
        await chrome.storage.local.get({ overridingPhoneNumberFormat: '', overridingPhoneNumberFormat2: '', overridingPhoneNumberFormat3: '' });
    const overridingFormats = ['+1**********'];
    if (overridingPhoneNumberFormat) overridingFormats.push(overridingPhoneNumberFormat);
    if (overridingPhoneNumberFormat2) overridingFormats.push(overridingPhoneNumberFormat2);
    if (overridingPhoneNumberFormat3) overridingFormats.push(overridingPhoneNumberFormat3);
    if (!!rcUnifiedCrmExtJwt) {
        const contactRes = await axios.get(`${config.serverUrl}/contactV2?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}&overridingFormat=${overridingFormats.toString()}`);
        return { matched: contactRes.data.successful, message: contactRes.data.message, contactInfo: contactRes.data.contact };
    }
    else {
        return { matched: false, message: 'Please go to Settings and authorize CRM platform', contactInfo: null };
    }
}

async function createContact({ phoneNumber, newContactName, newContactType }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        const contactRes = await axios.post(
            `${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}`,
            {
                phoneNumber,
                newContactName,
                newContactType
            }
        );
        // force trigger contact matcher
        document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
            type: 'rc-adapter-trigger-contact-match',
            phoneNumbers: [phoneNumber],
        }, '*');
        await chrome.storage.local.set({ tempContactMatchTask: { contactId: contactRes.data.contact.id, phoneNumber, contactName: newContactName } });
        return { matched: contactRes.data.successful, contactInfo: contactRes.data.contact };
    }
    else {
        return { matched: false, message: 'Please go to Settings and authorize CRM platform', contactInfo: null };
    }
}

async function openContactPage({ phoneNumber }) {
    const { matched: contactMatched, contactInfo } = await getContact({ phoneNumber });
    if (!contactMatched) {
        return;
    }
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const platformModule = await getModule();
    let platformInfo = await chrome.storage.local.get('platform-info');
    if (platformInfo['platform-info'].hostname === 'temp') {
        const hostnameRes = await axios.get(`${config.serverUrl}/hostname?jwtToken=${rcUnifiedCrmExtJwt}`);
        platformInfo['platform-info'].hostname = hostnameRes.data;
        await chrome.storage.local.set(platformInfo);
    }
    platformModule.openContactPage(platformInfo['platform-info'].hostname, contactInfo[0]);
}

async function getModule() {
    const platformInfo = await chrome.storage.local.get('platform-info');
    switch (platformInfo['platform-info'].platformName) {
        case 'pipedrive':
            return pipedriveModule;
        case 'insightly':
            return insightlyModule;
        case 'clio':
            return clioModule;
        case 'redtail':
            return redtailModule;
        case 'bullhorn':
            return bullhornModule;
    }
}

exports.getContact = getContact;
exports.createContact = createContact;
exports.openContactPage = openContactPage;