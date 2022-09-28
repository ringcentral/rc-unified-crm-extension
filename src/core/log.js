
function init(thirdPartyModule) {
    // TODO: load 3rd party module
}

async function syncLog({ logType, id, note }) {
    let dataToLog = {};
    if (logType === 'Call') {
        // TODO: sync to 3rd party platform
        // TODO: change id to 3rd party id
        dataToLog[id] = { logType, note, id: '1111' }
        await chrome.storage.sync.set(dataToLog);

        // force call log matcher check
        document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
            type: 'rc-adapter-trigger-call-logger-match',
            sessionIds: [id]
        }, '*');
    }
    else if(logType === 'Message')
    {
        
    }
}

exports.syncLog = syncLog;