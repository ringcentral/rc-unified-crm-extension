import React, { useState, useEffect } from 'react';
import {
    RcTypography,
    RcButton
} from '@ringcentral/juno';
import config from '../config.json';

let platformName;

export default () => {
    const pageStyle = {
        position: 'absolute',
        zIndex: '1000000000',
        width: '100%',
        height: '100%',
        background: 'white'
    }

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        padding: '30px',
    }

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        if (e.data.type === 'rc-check-version') {
            const recordedVersionInfo = await chrome.storage.local.get('rc-crm-extension-version');
            const version = recordedVersionInfo['rc-crm-extension-version'];
            let releaseNote = config.releaseNote.all;
            if (!!platformName) {
                releaseNote += config.releaseNote[platformName]
            }
            if (version && version !== config.version && !!releaseNote) {
                setIsOpen(true);
                setTitle(`Release note(v${config.version})`);
                setMessage(releaseNote);
            }
            await chrome.storage.local.set({
                ['rc-crm-extension-version']: config.version
            });
        }
    }
    useEffect(() => {
        async function getPlatformName() {
            const platformInfo = await chrome.storage.local.get('platform-info');
            platformName = platformInfo['platform-info'].platformName;
        }
        getPlatformName();

        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }

    }, [])

    const [isOpen, setIsOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');

    function composeMessage() {
        if(!!!message)
        {
            return "";
        }
        const messageBreakDown = message.split(';');
        return messageBreakDown.map(b => {
            return <RcTypography variant='body1'>{b}</RcTypography>
        })
    }

    return (
        <div >
            {isOpen && <div style={pageStyle}>
                <div style={containerStyle}>
                    <RcTypography
                        variant='title1'
                    >
                        {title}
                    </RcTypography>
                    {composeMessage()}
                    <RcButton
                        onClick={() => { setIsOpen(false); }}
                        style={{
                            position: 'absolute',
                            bottom: '40px'
                        }}
                    >
                        OK
                    </RcButton>
                </div>
            </div>}
        </div>
    )
}