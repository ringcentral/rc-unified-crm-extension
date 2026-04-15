// return the same payload shape App Connect sent you. You may transform
// fields like note or additionalSubmission, but do not remove required data.
function run({ identity, data, config }) {
  const originalNote = data?.note || '';
  const ignoreLetters = config.ignoreLetters || '';

  let note = '';
  for (const letter of originalNote) {
    note += ignoreLetters.value.includes(letter) ? letter : letter.toUpperCase();
  }

  // Expected input:
  // {
  //   data: {
  //     logInfo: { ... },
  //     note: 'some text',
  //     additionalSubmission: { ... }
  //   }
  // }
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
// async function getLicenseStatus() {
//   const licenseTier = process.env.PLUGIN_LICENSE_TIER || 'Basic';
//   return {
//     licenseStatus: true,
//     licenseStatusDescription: `License: ${licenseTier}`
//   };
// }

exports.run = run;
