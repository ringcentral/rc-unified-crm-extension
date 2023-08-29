// Saves options to chrome.storage
const saveOptions = () => {
    const region = document.getElementById('region').value;
    const c2dDelay = document.getElementById('c2dDelay').value;
    const overridingPhoneNumberFormat = document.getElementById('overridingPhoneNumberFormat').value;

    chrome.storage.local.set(
        { selectedRegion: region, c2dDelay, overridingPhoneNumberFormat },
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
        { selectedRegion: 'US', c2dDelay: '0', overridingPhoneNumberFormat: '' },
        (items) => {
            document.getElementById('region').value = items.selectedRegion;
            document.getElementById('c2dDelay').value = items.c2dDelay;
            document.getElementById('overridingPhoneNumberFormat').value = items.overridingPhoneNumberFormat;
        }
    );
};
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);