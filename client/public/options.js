// Saves options to chrome.storage
const saveOptions = () => {
    const region = document.getElementById('region').value;
    const c2dDelay = document.getElementById('c2dDelay').value;
    const autoLogCountdown = document.getElementById('autoLogCountdown').value;
    const renderQuickAccessButton = document.getElementById('renderQuickAccessButton').checked;
    const overridingPhoneNumberFormat = document.getElementById('overridingPhoneNumberFormat').value;
    const overridingPhoneNumberFormat2 = document.getElementById('overridingPhoneNumberFormat2').value;
    const overridingPhoneNumberFormat3 = document.getElementById('overridingPhoneNumberFormat3').value;

    chrome.storage.local.set(
        { selectedRegion: region, c2dDelay, autoLogCountdown, renderQuickAccessButton, overridingPhoneNumberFormat, overridingPhoneNumberFormat2, overridingPhoneNumberFormat3 },
        () => {
            // Update status to let user know options were saved.
            const status = document.getElementById('status');
            status.textContent = 'Options saved.';
            setTimeout(() => {
                status.textContent = '';
            }, 750);
        }
    );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
    chrome.storage.local.get(
        { selectedRegion: 'US', c2dDelay: '0', autoLogCountdown: '20', renderQuickAccessButton: true, overridingPhoneNumberFormat: '', overridingPhoneNumberFormat2: '', overridingPhoneNumberFormat3: '' },
        (items) => {
            document.getElementById('region').value = items.selectedRegion;
            document.getElementById('c2dDelay').value = items.c2dDelay;
            document.getElementById('autoLogCountdown').value = items.autoLogCountdown;
            document.getElementById('renderQuickAccessButton').checked = items.renderQuickAccessButton;
            document.getElementById('overridingPhoneNumberFormat').value = items.overridingPhoneNumberFormat;
            document.getElementById('overridingPhoneNumberFormat2').value = items.overridingPhoneNumberFormat2;
            document.getElementById('overridingPhoneNumberFormat3').value = items.overridingPhoneNumberFormat3;
        }
    );
};
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);