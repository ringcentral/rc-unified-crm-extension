function responseMessage(responseId, response) {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-post-message-response',
        responseId,
        response,
    }, '*');
}

function isObjectEmpty(obj){
    return Object.keys(obj).length === 0 && obj.constructor === Object;
}

exports.responseMessage = responseMessage;
exports.isObjectEmpty = isObjectEmpty;