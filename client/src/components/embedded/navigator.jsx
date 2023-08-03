import React from 'react';
import { RcIconButton } from '@ringcentral/juno';
import { Logout, Feedback, Settings } from '@ringcentral/juno-icon';

const containerStyle = {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column-reverse',
    bottom: '55px',
    gap: '5px'
}

function Navigator() {
    return (
        <div style={containerStyle}>
            <RcIconButton
                size='medium'
                symbol={Settings}
                onClick={() => {
                    chrome.runtime.sendMessage({
                        type: "openPopupWindow",
                        navigationPath: "/settings"
                    });
                }}
                style={{
                    backgroundColor: '#7A7A7A',
                    height: '48px',
                    width: '48px',
                }}
                variant='contained'
            >
            </RcIconButton >
            <RcIconButton
                size='medium'
                symbol={Feedback}
                onClick={() => {
                    chrome.runtime.sendMessage({
                        type: "openPopupWindow",
                        navigationPath: "/feedback"
                    });
                }}
                style={{
                    backgroundColor: '#00B1A7',
                    height: '48px',
                    width: '48px',
                }}
                variant='contained'
            >
            </RcIconButton >
            <RcIconButton
                size='medium'
                symbol={Logout}
                onClick={() => {
                    chrome.runtime.sendMessage({
                        type: "openPopupWindow",
                        navigationPath: "/settings"
                    });
                }}
                style={{
                    backgroundColor: '#E6413C',
                    height: '48px',
                    width: '48px',
                }}
                variant='contained'
            >
            </RcIconButton >
        </div>
    )
}

export default Navigator;