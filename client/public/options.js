let timerId = '';

// Saves options to chrome.storage
const saveOptions = () => {
    const customCrmConfigUrl = document.getElementById('customCrmConfigUrl').value;
    const region = document.getElementById('region').value;
    const c2dDelay = document.getElementById('c2dDelay').value;
    const autoLogCountdown = document.getElementById('autoLogCountdown').value;
    const bullhornDefaultActionCode = document.getElementById('bullhornDefaultActionCode').value;
    const renderQuickAccessButton = document.getElementById('renderQuickAccessButton').checked;
    const overridingPhoneNumberFormat = document.getElementById('overridingPhoneNumberFormat').value;
    const overridingPhoneNumberFormat2 = document.getElementById('overridingPhoneNumberFormat2').value;
    const overridingPhoneNumberFormat3 = document.getElementById('overridingPhoneNumberFormat3').value;

    chrome.storage.local.set(
        { customCrmConfigUrl, selectedRegion: region, c2dDelay, autoLogCountdown, bullhornDefaultActionCode, renderQuickAccessButton, overridingPhoneNumberFormat, overridingPhoneNumberFormat2, overridingPhoneNumberFormat3 },
        () => {
            setupConfig({ customCrmConfigUrl });
        }
    );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
    chrome.storage.local.get(
        { customCrmConfigUrl: '', selectedRegion: 'US', c2dDelay: '0', autoLogCountdown: '20', bullhornDefaultActionCode: '', renderQuickAccessButton: true, overridingPhoneNumberFormat: '', overridingPhoneNumberFormat2: '', overridingPhoneNumberFormat3: '' },
        (items) => {
            document.getElementById('customCrmConfigUrl').value = items.customCrmConfigUrl;
            document.getElementById('region').value = items.selectedRegion;
            document.getElementById('c2dDelay').value = items.c2dDelay;
            document.getElementById('autoLogCountdown').value = items.autoLogCountdown;
            document.getElementById('bullhornDefaultActionCode').value = items.bullhornDefaultActionCode;
            document.getElementById('renderQuickAccessButton').checked = items.renderQuickAccessButton;
            document.getElementById('overridingPhoneNumberFormat').value = items.overridingPhoneNumberFormat;
            document.getElementById('overridingPhoneNumberFormat2').value = items.overridingPhoneNumberFormat2;
            document.getElementById('overridingPhoneNumberFormat3').value = items.overridingPhoneNumberFormat3;
        }
    );
};

async function setupConfig({ customCrmConfigUrl }) {
    try {
        await chrome.storage.local.remove('customCrmConfig');
        if(customCrmConfigUrl === '') {
            return;
        }
        const customCrmConfigJson = await (await fetch(customCrmConfigUrl)).json();
        if (customCrmConfigJson) {
            await chrome.storage.local.set({ customCrmConfig: customCrmConfigJson });
        }
        // Update status to let user know options were saved.
        const status = document.getElementById('status');
        status.style = 'color: green';
        status.textContent = 'Options saved.';
    }
    catch (e) {
        clearTimeout(timerId);
        // Update status to let user know options were saved.
        const status = document.getElementById('status');
        status.textContent = 'Config file error';
        status.style = 'color: red';
        await chrome.storage.local.remove('customCrmConfig');
    }
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);