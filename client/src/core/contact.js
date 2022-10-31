import axios from 'axios';
import config from '../config.json';

async function getContact({ phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const contactRes = await axios.get(`${config.serverUrl}/contact?jwtToken=${rcUnifiedCrmExtJwt}&phoneNumber=${phoneNumber}`);
    return { matched: contactRes.data.successful, contactInfo: contactRes.data.contact };
}

exports.getContact = getContact;