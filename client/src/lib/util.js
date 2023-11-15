function secondsToHourMinuteSecondString(totalSeconds) {
    const hours = parseInt(totalSeconds / 3600);
    const minutes = parseInt((totalSeconds - 3600 * hours) / 60);
    const seconds = parseInt(totalSeconds - 3600 * hours - 60 * minutes);
    return `${hours}h${minutes}m${seconds}s`;
}

function showNotification({ level, message, ttl }) {
    if (!level || !message || isObjectEmpty(message)) {
        return;
    }
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-message-request',
        requestId: Date.now().toString(),
        path: '/custom-alert-message',
        alertMessage: message,
        alertLevel: level,
        ttl
    }, '*');
}

function responseMessage(responseId, response) {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-post-message-response',
        responseId,
        response,
    }, '*');
}

function isObjectEmpty(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object;
}

exports.secondsToHourMinuteSecondString = secondsToHourMinuteSecondString;
exports.showNotification = showNotification;
exports.responseMessage = responseMessage;
exports.isObjectEmpty = isObjectEmpty;