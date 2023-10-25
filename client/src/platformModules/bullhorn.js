function getContactAdditionalInfo(contactRes) {
    if (contactRes.data.contact && contactRes.data.contact.commentActionList) {
        return {
            label: 'Note action',
            value: contactRes.data.contact.commentActionList
        }
    }

    return null;
}

function getIncomingCallContactInfo(contactInfo) {
    return {
        id: contactInfo.id,
        contactType: contactInfo.contactType
    }
}

function openContactPage(hostname, incomingCallContactInfo) {
    openBullhornContactPage({ contactType: incomingCallContactInfo.contactType, contactId: incomingCallContactInfo.id });
}

async function openBullhornContactPage({ contactType, contactId }) {
    const { crm_extension_bullhorn_user_urls } = await chrome.storage.local.get({ crm_extension_bullhorn_user_urls: null });
    if (crm_extension_bullhorn_user_urls?.atsUrl) {
        const newTab = window.open(`${crm_extension_bullhorn_user_urls.atsUrl}/BullhornStaffing/OpenWindow.cfm?Entity=${contactType}&id=${contactId}&view=Overview`, '_blank', 'popup');
        newTab.blur();
        window.focus();
    }
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;