import React, { useState, useEffect } from 'react';
import { RcButton, RcIcon, RcTypography, RcLink, RcIconButton } from '@ringcentral/juno';
import { PlayCircleBorder, Close } from '@ringcentral/juno-icon';
import config from '../../config.json';
import rcLogo from '../../images/logo.png';
import { isObjectEmpty } from '../../lib/util';
import { trackFirstTimeSetup } from '../../lib/analytics';

const backgroundStyle = {
    height: '100%',
    width: '100%',
    background: '#00000075',
    position: 'absolute',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    top: '0',
    zIndex: '10000000',
    textAlign: 'center'
}

const welcomeScreenStyle = {
    width: '300px',
    background: 'white',
    borderRadius: '15px',
    padding: '15px 30px'
}

const logoContainerStyle = {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: '6px'
}

export default () => {
    useEffect(() => {
        let platformName = '';
        const hostname = window.location.hostname;
        if (hostname.includes('pipedrive')) {
            platformName = 'pipedrive';
        }
        else if (hostname.includes('insightly')) {
            platformName = 'insightly';
        }
        else if (hostname.includes('clio')) {
            platformName = 'clio';
        }
        else if (hostname.includes('bullhorn')) {
            platformName = 'bullhorn';
        }
        else if (hostname.includes('redtailtechnology')) {
            platformName = 'redtail';
        }

        checkFirstTime();
        async function checkFirstTime() {
            const isFirstTime = await chrome.storage.local.get('isFirstTime');
            if (isObjectEmpty(isFirstTime) && platformName !== '') {
                setIsOpen(true);
                setDocLink(config.welcomeMessage[platformName].docLink);
                setVideoLink(config.welcomeMessage[platformName].VideoLink);
                console.log(platformName);
                console.log(config.welcomeMessage[platformName].docLink);
                console.log(config.welcomeMessage[platformName].VideoLink);
                await chrome.storage.local.set({ isFirstTime: false });
                trackFirstTimeSetup();
            }
        }

    }, [])

    const [isOpen, setIsOpen] = useState(false);
    const [docLink, setDocLink] = useState('');
    const [videoLink, setVideoLink] = useState('');

    return (
        <div>
            {isOpen && <div style={backgroundStyle} >
                <div style={welcomeScreenStyle}>
                    <div>
                        <div>
                            <RcTypography
                                variant='headline2'
                            >
                                Welcome to the
                            </RcTypography>
                            <RcTypography
                                variant='headline2'
                            >
                                Unified CRM Extension
                            </RcTypography>
                            <br />
                            <br />
                            <RcTypography
                                variant='title1'
                            >
                                Getting started
                            </RcTypography>
                            <br />
                            <RcTypography
                                variant='body1'
                            >
                                To begin using the Unified CRM extension for RingCentral, you need  to connect to your CRM provider.
                            </RcTypography>
                            <br />
                            <RcTypography
                                variant='body1'
                            >
                                View our
                                <RcLink
                                    variant="inherit"
                                    onClick={() => { window.open(docLink) }}
                                > setup guide</RcLink>
                                , or...
                            </RcTypography>
                            <br />
                            <br />
                            <RcButton
                                startIcon={<RcIcon symbol={PlayCircleBorder} />}
                                onClick={() => { window.open(videoLink); }}
                                size='xlarge'
                                radius='round'
                            >
                                Watch video
                            </RcButton>
                            <br />
                            <br />
                            <br />
                            <br />
                            <RcIconButton
                                onClick={() => { setIsOpen(false) }}
                                symbol={Close}
                                variant='contained'
                                color="action.primary"
                            >
                                X
                            </RcIconButton>
                            <br />
                            <br />
                            <div style={logoContainerStyle}>
                                <p style={{ fontFamily: 'Lato ,Helvetica,Arial,sans-serif', fontSize: '9px' }}>Powered by</p>
                                <img src={rcLogo} style={{ width: '110px' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>}
        </div >
    );
};
