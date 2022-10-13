import axios from 'axios';

async function onAuthCallback(callbackUri) {
    const { rcUserNumber } = await chrome.storage.sync.get('rcUserNumber');
    await axios.get(`https://d8c6-202-163-1-218.ap.ngrok.io/oauth-callback?callbackUri=${callbackUri}&rcUserNumber=${rcUserNumber}`);
}

exports.onAuthCallback = onAuthCallback;