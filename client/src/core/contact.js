import axios from 'axios';
import config from '../config.json';
import pipedriveModule from '../platformModules/pipedrive.js';
import insightlyModule from '../platformModules/insightly.js';
import clioModule from '../platformModules/clio.js';
import redtailModule from '../platformModules/redtail';
import bullhornModule from '../platformModules/bullhorn';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const { overridingPhoneNumberFormat } = await chrome.storage.local.get({ overridingPhoneNumberFormat: '' });
    if (!!rcUnifiedCrmExtJwt) {
        const contactRes = await axios.get(`${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}&overridingFormat=${overridingPhoneNumberFormat}`);
        const platformModule = await getModule();
        const additionalLogInfo = platformModule.getContactAdditionalInfo(contactRes);
        return { matched: contactRes.data.successful, message: contactRes.data.message, contactInfo: contactRes.data.contact, additionalLogInfo };
    }
    else {
        return { matched: false, message: 'Please go to Settings and authorize CRM platform', contactInfo: null };
    }
}

// Hack: directly modify DOM element
async function showIncomingCallContactInfo({ phoneNumber }) {
    const { matched: contactMatched, contactInfo } = await getContact({ phoneNumber });
    if (contactMatched) {
        const platformModule = await getModule();
        const infoToShow = platformModule.getIncomingCallContactInfo(contactInfo);
        const incomingCallUserPanelDOM = document.querySelector("#rc-widget-adapter-frame").contentWindow.document.querySelector('.IncomingCallPanel_userInfo');
        if (incomingCallUserPanelDOM && infoToShow.company) {
            const companyDiv = document.createElement('div');
            companyDiv.innerHTML = infoToShow.company;
            companyDiv.style = 'font-size: 12px';
            incomingCallUserPanelDOM.appendChild(companyDiv);
        }
        if (incomingCallUserPanelDOM && infoToShow.title) {
            const titleDiv = document.createElement('div');
            titleDiv.innerHTML = infoToShow.title;
            titleDiv.style = 'font-size: 12px';
            incomingCallUserPanelDOM.appendChild(titleDiv);
        }
        return infoToShow;
    }
    return null;
}

function showInCallContactInfo({ incomingCallContactInfo }) {
    const incomingCallUserPanelDOM = document.querySelector("#rc-widget-adapter-frame").contentWindow.document.querySelector('.ActiveCallPanel_userInfo');
    if (incomingCallContactInfo.company) {
        const companyDiv = document.createElement('div');
        companyDiv.innerHTML = incomingCallContactInfo.company;
        companyDiv.style = 'font-size: 12px';
        incomingCallUserPanelDOM.appendChild(companyDiv);
    }
    if (incomingCallContactInfo.title) {
        const titleDiv = document.createElement('div');
        titleDiv.innerHTML = incomingCallContactInfo.title;
        titleDiv.style = 'font-size: 12px';
        incomingCallUserPanelDOM.appendChild(titleDiv);
    }
}

async function openContactPage({ incomingCallContactInfo }) {
    if (!!!incomingCallContactInfo.id) {
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
    platformModule.openContactPage(platformInfo['platform-info'].hostname, incomingCallContactInfo);
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
exports.showIncomingCallContactInfo = showIncomingCallContactInfo;
exports.showInCallContactInfo = showInCallContactInfo;
exports.openContactPage = openContactPage;