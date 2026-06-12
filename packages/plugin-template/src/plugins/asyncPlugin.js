// Summary:
// This plugin waits for 5 seconds and then sends a message via webhook to the RingCentral App

const axios = require('axios');

// Setup RC webhook in RingCentrap App
// 1. Open RingCentral App and go to any message conversation
// 2. Top-right, more buttons -> Add apps -> scroll and find Incoming Webhook
// 3. Copy the webhook URL and paste it here -> Finish
const RC_WEBHOOK_ENDPOINT = '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run({ identity, data, config }) {
  // Expected input:
  // {
  //   data: {
  //     logInfo: { ... }
  //   },
  //   config: { ... },
  // }
  //
  // Async plugins should return quickly, avoid blocking CRM logging, and
  // should not try to mutate the payload used by the main logging flow.
  try {
    const delayMs = 5000; // 5s
    // This tiny side effect exists only to demonstrate async work.
    // A real async plugin could upload a file, call an API, or persist data.
    console.log('Async plugin start wait for 5 seconds');
    await sleep(delayMs);
    console.log('Async plugin wait completed');
    await axios.post(RC_WEBHOOK_ENDPOINT, {
      text: 'Async plugin completed'
    });
    console.log('Async plugin webhook completed');

    return {
      accepted: true,
      pluginIdentity: identity
    };
  } catch (error) {
    return {
      accepted: false,
      message: 'Async plugin processing failed'
    };
  }
}

exports.run = run;
