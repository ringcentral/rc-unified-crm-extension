import React, { useState } from 'react';
import { RcIconButton } from '@ringcentral/juno';
import { Dialer, RcCloudContact } from '@ringcentral/juno-icon';

function QuickAccessButton(
    {
        isSetup,
        setState
    }
) {
    const [showDialer, setShowDialer] = useState(false);
    return (
        <RcIconButton
            symbol={showDialer ? Dialer : RcCloudContact} 
            variant="contained"
            size='large'
            style={{ padding: '0px', background: '#066FAC' }}
            onClick={() => {
                chrome.runtime.sendMessage({ type: "openPopupWindow" });
            }}
            onPointerEnter={() => { isSetup ? setShowDialer(true) : setState('setup'); }}
            onPointerLeave={() => { setShowDialer(false) }}
        />
    )
}

export default QuickAccessButton;