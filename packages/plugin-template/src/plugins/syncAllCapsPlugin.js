function getIgnoredLetters() {
  return process.env.PLUGIN_IGNORED_LETTERS || '';
}

function run({ identity, data, config }) {
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
  const originalNote = data?.note || '';
  const ignoreLetters = config.ignoreLetters || '';

  let note = '';
  for (const letter of originalNote) {
    note += ignoreLetters.value.includes(letter) ? letter : letter.toUpperCase();
  }

  return {
    ...data,
    pluginIdentity: identity,
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
