import React from 'react';
import { RcButton, RcIcon } from '@ringcentral/juno';
import { People, RcCloudContact } from '@ringcentral/juno-icon';

function SetupButton({
    setIsSetup,
    setState
}) {
    return (
        <div style={{ height: '48px' }}>
            <RcButton
                startIcon={<RcIcon  size='xxxlarge' symbol={People} />}
                endIcon={<RcIcon size='xxxlarge' symbol={RcCloudContact} />}
                radius="round"
                size='xlarge'
                onClick={() => {
                    setIsSetup(true);
                    chrome.runtime.sendMessage({ type: "openPopupWindow" });
                }
                }
                onPointerLeave={() => { setState('quick_access'); }}
            >
                Setup
            </RcButton>
        </div>
    )
}


export default SetupButton;