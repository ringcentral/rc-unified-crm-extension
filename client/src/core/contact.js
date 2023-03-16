import axios from 'axios';
import config from '../config.json';
import pipedriveModule from '../platformModules/pipedrive.js';
import insightlyModule from '../platformModules/insightly.js';
import clioModule from '../platformModules/clio.js';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        const contactRes = await axios.get(`${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}`);
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
        if (infoToShow.company) {
            const companyDiv = document.createElement('div');
            companyDiv.innerHTML = infoToShow.company;
            companyDiv.style = 'font-size: 12px';
            incomingCallUserPanelDOM.appendChild(companyDiv);
        }
        if (infoToShow.title) {
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
    const platformModule = await getModule();
    const platformInfo = await chrome.storage.local.get('platform-info');
    platformModule.openContactPage(platformInfo['platform-info'].hostname, incomingCallContactInfo.id);
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
    }
}

exports.getContact = getContact;
exports.showIncomingCallContactInfo = showIncomingCallContactInfo;
exports.showInCallContactInfo = showInCallContactInfo;
exports.openContactPage = openContactPage;