import React, { useState, useEffect } from 'react';
import {
    RcTypography,
    RcButton
} from '@ringcentral/juno';
import config from '../config.json';

export default () => {
    const containerStyle = {
        position: 'absolute',
        zIndex: '1000000000',
        width: 'auto',
        height: '100%',
        background: 'white',
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
            if (version && version !== config.version) {
                setIsOpen(true);
                setTitle('Release note');
                setMessage(config.releaseNote);
            }
            await chrome.storage.local.set({
                ['rc-crm-extension-version']: config.version
            });
        }
    }
    useEffect(() => {
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    const [isOpen, setIsOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    return (
        <div>
            {isOpen && <div style={containerStyle}>
                <RcTypography
                    variant='title1'
                >
                    {title}
                </RcTypography>
                <RcTypography
                    variant='body1'
                >
                    {message}
                </RcTypography>
                <RcButton
                    onClick={() => { setIsOpen(false); }}
                    style={{
                        position: 'absolute',
                        bottom: '100px'
                    }}
                >
                    OK
                </RcButton>
            </div>}
        </div>
    )
}