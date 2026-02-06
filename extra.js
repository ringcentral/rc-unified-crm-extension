console.log('extra.js loaded');
if (window.location.origin === 'https://ringcentral.github.io') {
  const newUri = window.location.href.replace('ringcentral.github.io/rc-unified-crm-extension', 'appconnect.labs.ringcentral.com');
  window.location.href = newUri;
}
