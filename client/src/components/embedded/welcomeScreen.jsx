import React, { useState, useEffect } from 'react';
import { RcButton, RcIcon, RcTypography, RcLink, RcIconButton } from '@ringcentral/juno';
import { PlayCircleBorder, Close } from '@ringcentral/juno-icon';
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

let config = null;

export default () => {
    useEffect(() => {
        checkFirstTime();
        async function checkFirstTime() {
            config = (await chrome.storage.local.get('customCrmConfig')).customCrmConfig;
            let platformName = '';
            const hostname = window.location.hostname;
            const platforms = Object.keys(config.platforms);
            for (const p of platforms) {
                if (hostname.includes(config.platforms[p].urlIdentifier)) {
                    platformName = p;
                    break;
                }
            }
            const isFirstTime = await chrome.storage.local.get('isFirstTime');
            if (isObjectEmpty(isFirstTime) && platformName !== '') {
                setIsOpen(true);
                setDocLink(config.platforms[platformName].embeddedOnCrmPage.welcomePage.docLink);
                setVideoLink(config.platforms[platformName].embeddedOnCrmPage.welcomePage.VideoLink);
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
                            <RcTypography
                                variant='body1'
                            >
                                By {config.author}
                            </RcTypography>
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
