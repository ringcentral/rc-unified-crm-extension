function getDelayMs() {
  const rawValue = Number(process.env.PLUGIN_DELAY_MS || 500);
  return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : 500;
}

function getIgnoredLetters() {
  return process.env.PLUGIN_IGNORED_LETTERS || '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run({ identity, data, asyncTaskId }) {
  // This is an example async plugin implementation, not framework-level structure.
  // It demonstrates the asynchronous POST /plugin/:pluginId contract.
  //
  // Expected input:
  // {
  //   data: {
  //     logInfo: { ... },
  //     note: 'some text'
  //   },
  //   asyncTaskId: 'userId-uuid'
  // }
  //
  // Async plugins should return quickly, avoid blocking CRM logging, and
  // should not try to mutate the payload used by the main logging flow.
  try {
    const delayMs = getDelayMs();
    const ignoredLetters = getIgnoredLetters();
    const originalNote = data?.note || '';

    // This tiny side effect exists only to demonstrate async work.
    // A real async plugin could upload a file, call an API, or persist data.
    await sleep(delayMs);
    const transformedNote = originalNote
      .split('')
      .map(letter => (ignoredLetters.includes(letter) ? letter : letter.toUpperCase()))
      .join('');

    console.log('Async ALL_CAPS example completed', {
      asyncTaskId,
      preview: transformedNote.slice(0, 50)
    });

    return {
      accepted: true,
      asyncTaskId,
      pluginIdentity: identity
    };
  } catch (error) {
    return {
      accepted: false,
      asyncTaskId,
      message: 'Async plugin processing failed'
    };
  }
}

// Optional OAuth hooks for an async plugin:
//
// async function getOAuthUrl({ jwtToken, pluginId }) {
//   const authBaseUrl = process.env.PLUGIN_OAUTH_AUTHORIZE_URL;
//   return { authUrl: `${authBaseUrl}?pluginId=${pluginId}` };
// }
//
// async function checkAuth({ userId }) {
//   return { successful: true };
// }
//
// async function logout({ userId }) {
//   return {
//     successful: true,
//     returnMessage: {
//       message: 'Logged out',
//       messageType: 'success',
//       ttl: 3000
//     }
//   };
// }

// Optional license hook for an async plugin:
//
// async function getLicenseStatus({ userId }) {
//   const licenseTier = process.env.PLUGIN_LICENSE_TIER || 'Basic';
//   return {
//     licenseStatus: true,
//     licenseStatusDescription: `License: ${licenseTier}`
//   };
// }

exports.run = run;
