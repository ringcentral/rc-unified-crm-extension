import React, { useState, useEffect } from 'react';
import { RcButton, RcTypography } from '@ringcentral/juno';
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
        if (e.data.type === 'rc-show-first-time-welcome') {
            setIsOpen(true);
            setMessage(config.welcomeMessage[platformName].message);
            setLink(config.welcomeMessage[platformName].link);
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
    const [message, setMessage] = useState('');
    const [link, setLink] = useState('');

    return (
        <div>
            {isOpen && <div style={pageStyle}>
                <div style={containerStyle}>
                    <RcTypography
                        variant='title1'
                    >
                        Hello
                    </RcTypography>
                    <RcTypography>
                        {message}
                    </RcTypography>
                    {!!link &&
                        <RcButton
                            onClick={() => { window.open(link); }}
                        >
                            Watch video
                        </RcButton>
                    }
                    <RcButton
                        onClick={() => { setIsOpen(false); }}
                        style={{
                            position: 'absolute',
                            bottom: '40px'
                        }}
                    >
                        Close
                    </RcButton>
                </div>
            </div>}
        </div>
    );
};
