const RC_EXTENSION_ENDPOINT = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~';

async function validateRcIdentity({ rcAccessToken }) {
    if (!rcAccessToken) {
        throw new Error('rcAccessToken is required');
    }
    const rcResponse = await fetch(RC_EXTENSION_ENDPOINT, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${rcAccessToken}`
        }
    });
    if (!rcResponse.ok) {
        throw new Error('Failed to validate rcAccessToken');
    }
    const extensionData = await rcResponse.json();
    return {
        rcAccountId: extensionData?.account?.id?.toString() ?? '',
        rcExtensionId: extensionData?.id?.toString() ?? ''
    };
}

exports.validateRcIdentity = validateRcIdentity;