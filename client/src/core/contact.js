import axios from 'axios';
import config from '../config.json';
import analytics from '../lib/analytics';
import moduleMapper from '../platformModules/moduleMapper';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const { overridingPhoneNumberFormat, overridingPhoneNumberFormat2, overridingPhoneNumberFormat3 } =
        await chrome.storage.local.get({ overridingPhoneNumberFormat: '', overridingPhoneNumberFormat2: '', overridingPhoneNumberFormat3: '' });
    const overridingFormats = [];
    if (overridingPhoneNumberFormat) { overridingFormats.push('+1**********'); overridingFormats.push(overridingPhoneNumberFormat); }
    if (overridingPhoneNumberFormat2) overridingFormats.push(overridingPhoneNumberFormat2);
    if (overridingPhoneNumberFormat3) overridingFormats.push(overridingPhoneNumberFormat3);
    if (!!rcUnifiedCrmExtJwt) {
        const contactRes = await axios.get(`${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}&overridingFormat=${overridingFormats.toString()}`);
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
        if (!!!contactRes.data?.successful && contactRes.data?.message === 'Failed to create contact.') {
            await chrome.runtime.sendMessage(
                {
                    type: 'notifyToReconnectCRM'
                })
        }
        // force trigger contact matcher
        document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
            type: 'rc-adapter-trigger-contact-match',
            phoneNumbers: [phoneNumber],
        }, '*');
        await chrome.storage.local.set({ tempContactMatchTask: { contactId: contactRes.data.contact.id, phoneNumber, contactName: newContactName } });
        analytics.createNewContact();
        return { matched: contactRes.data.successful, contactInfo: contactRes.data.contact };
    }
    else {
        return { matched: false, message: 'Please go to Settings and authorize CRM platform', contactInfo: null };
    }
}

async function openContactPage({ platformName, phoneNumber }) {
    const { matched: contactMatched, contactInfo } = await getContact({ phoneNumber });
    if (!contactMatched) {
        return;
    }
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const platformModule = moduleMapper.getModule({ platformName });
    let platformInfo = await chrome.storage.local.get('platform-info');
    if (platformInfo['platform-info'].hostname === 'temp') {
        const hostnameRes = await axios.get(`${config.serverUrl}/hostname?jwtToken=${rcUnifiedCrmExtJwt}`);
        platformInfo['platform-info'].hostname = hostnameRes.data;
        await chrome.storage.local.set(platformInfo);
    }
    for (const c of contactInfo) {
        platformModule.openContactPage(platformInfo['platform-info'].hostname, c);
    }
}

exports.getContact = getContact;
exports.createContact = createContact;
exports.openContactPage = openContactPage;