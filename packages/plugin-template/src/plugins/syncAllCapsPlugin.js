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

function getIgnoredLetters({ user }) {
  const config = getPluginConfig({ user });
  return config?.ignoredLetters?.value || '';
}

function run({ user, data }) {
  // This is an example plugin implementation, not framework-level structure.
  // It demonstrates the synchronous POST /plugin/:pluginId contract.
  //
  // Expected input:
  // {
  //   data: {
  //     logInfo: { ... },
  //     note: 'some text',
  //     additionalSubmission: { ... }
  //   }
  // }
  //
  // Required behavior:
  // return the same payload shape App Connect sent you. You may transform
  // fields like note or additionalSubmission, but do not remove required data.
  const ignoredLetters = getIgnoredLetters({ user });
  const originalNote = data?.note || '';

  let note = '';
  for (const letter of originalNote) {
    note += ignoredLetters.includes(letter) ? letter : letter.toUpperCase();
  }

  return {
    ...data,
    note
  };
}

// Optional OAuth hooks for a sync plugin:
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

// Optional license hook for a sync plugin:
//
// async function getLicenseStatus({ userId }) {
//   const licenseTier = process.env.PLUGIN_LICENSE_TIER || 'Basic';
//   return {
//     licenseStatus: true,
//     licenseStatusDescription: `License: ${licenseTier}`
//   };
// }

exports.run = run;
