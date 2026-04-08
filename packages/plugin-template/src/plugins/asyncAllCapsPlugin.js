const { CacheModel } = require('@app-connect/core/models/cacheModel');

function getPluginConfig({ user }) {
  // Recommended practice:
  // read the plugin setting key from environment instead of hard-coding the
  // developer-portal-generated key directly in source code.
  const pluginSettingKey = process.env.PLUGIN_SETTING_KEY;
  if (!pluginSettingKey) {
    return {};
  }

  return user?.userSettings?.[pluginSettingKey]?.value?.config || {};
}

function getDelayMs({ user }) {
  const config = getPluginConfig({ user });
  const rawValue = Number(config?.delayMs?.value);
  return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : 500;
}

function getIgnoredLetters({ user }) {
  const config = getPluginConfig({ user });
  return config?.ignoredLetters?.value || '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function markTaskStatus({ asyncTaskId, status }) {
  if (!asyncTaskId) {
    return;
  }

  const cache = await CacheModel.findByPk(asyncTaskId);
  if (!cache) {
    return;
  }

  cache.status = status;
  await cache.save();
}

async function run({ user, data, asyncTaskId }) {
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
    await markTaskStatus({ asyncTaskId, status: 'processing' });

    const delayMs = getDelayMs({ user });
    const ignoredLetters = getIgnoredLetters({ user });
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

    await markTaskStatus({ asyncTaskId, status: 'completed' });
    return {
      accepted: true,
      asyncTaskId
    };
  } catch (error) {
    await markTaskStatus({ asyncTaskId, status: 'failed' });
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
