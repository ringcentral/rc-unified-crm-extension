// Summary:
// This plugin waits for 5 seconds, optionally sends a message via webhook,
// and reports completion to App Connect through the callback URL.

const axios = require('axios');

// Setup RC webhook in RingCentrap App
// 1. Open RingCentral App and go to any message conversation
// 2. Top-right, more buttons -> Add apps -> scroll and find Incoming Webhook
// 3. Copy the webhook URL and paste it here -> Finish
const RC_WEBHOOK_ENDPOINT = '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postCallback({ callbackUrl, successful, message, note }) {
  await axios.post(callbackUrl, {
    successful,
    message,
    note
  });
}

async function run({ identity, data, config, asyncTaskId, callbackUrl }) {
  // Expected input:
  // {
  //   asyncTaskId: '...',
  //   callbackUrl: 'https://app-connect.example.com/plugin/async-callback/...',
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
    const logContext = data?.logInfo || data || {};
    const completionNote = config?.completionNote?.value || 'Async plugin completed';
    // This tiny side effect exists only to demonstrate async work.
    // A real async plugin could upload a file, call an API, or persist data.
    console.log(`Async plugin ${asyncTaskId} start wait for 5 seconds`);
    await sleep(delayMs);
    console.log(`Async plugin ${asyncTaskId} wait completed`);

    if (RC_WEBHOOK_ENDPOINT) {
      await axios.post(RC_WEBHOOK_ENDPOINT, {
        text: logContext.subject ? `${completionNote}: ${logContext.subject}` : completionNote
      });
      console.log(`Async plugin ${asyncTaskId} webhook completed`);
    }

    await postCallback({
      callbackUrl,
      successful: true,
      message: completionNote,
      note: completionNote
    });

    return {
      accepted: true,
      asyncTaskId,
      pluginIdentity: identity
    };
  } catch (error) {
    const message = error.message || 'Async plugin processing failed';
    try {
      if (callbackUrl) {
        await postCallback({
          callbackUrl,
          successful: false,
          message,
          note: ''
        });
      }
    } catch (callbackError) {
      console.error('Async plugin callback failed', callbackError);
    }

    return {
      accepted: false,
      asyncTaskId,
      message
    };
  }
}

exports.run = run;
