function rateLimitErrorMessage({ platform }) {
    return {
        message: `Rate limit exceeded`,
        messageType: 'warning',
        details: [
            {
                title: 'Details',
                items: [
                    {
                        id: '1',
                        type: 'text',
                        text: `You have exceeded the maximum number of requests allowed by ${platform}. Please try again in the next minute. If the problem persists please contact support.`
                    }
                ]
            }
        ],
        ttl: 5000
    }
}

function authorizationErrorMessage({ platform }) {
    return {
        message: `Authorization error`,
        messageType: 'warning',
        details: [
            {
                title: 'Details',
                items: [
                    {
                        id: '1',
                        type: 'text',
                        text: `It seems like there's something wrong with your authorization of ${platform}. Please Logout and then Connect your ${platform} account within this extension.`
                    }
                ]
            }
        ],
        ttl: 5000
    }
}

exports.rateLimitErrorMessage = rateLimitErrorMessage;
exports.authorizationErrorMessage = authorizationErrorMessage;