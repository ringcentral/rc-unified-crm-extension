import React, { useState, useEffect } from 'react';
import { RcButton } from '@ringcentral/juno';
import Draggable from 'react-draggable';
import DragImage from '../../images/dragImage_blue.png';
import MenuLogo from '../../images/menuLogo.png';
import { isObjectEmpty } from '../../lib/util';

const menuContainerStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
}

const setupFinishedBadgeStyle = {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    background: '#2DAE2D',
    borderRadius: ' 50%',
    height: '18px',
    width: '18px',
    color: 'white',
    border: 'solid 3px white',
}

const needSetupBadgeStyle = {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    background: '#f15353',
    borderRadius: ' 50%',
    height: '18px',
    width: '18px',
    color: 'white',
    border: 'solid 3px white'
}

function QuickAccessButton() {

    const [isSetup, setIsSetup] = useState(false);
    const [pos, setPos] = useState({x: 0, y: 0});

    useEffect(() => {
        async function checkSetup() {
            const platformInfo = await chrome.storage.local.get('platform-info');
            setIsSetup(!isObjectEmpty(platformInfo) && platformInfo['platform-info'].platformName);
        }
        checkSetup();
        updatePos();
    }, []);

    function updatePos(){
        const setTransform = localStorage.getItem('rcQuickAccessButtonTransform');
        const xPos = setTransform.split('translate(')[1].split('px,')[0];
        const yPos = setTransform.split('px, ')[1].split('px')[0];
        setPos({x: Number(xPos), y: Number(yPos)});
    }

    function onDragStop(e) {
        const newTransform = document.querySelector('.react-draggable-dragged').style.transform;
        localStorage.setItem('rcQuickAccessButtonTransform', newTransform);
        updatePos();
    }

    return (
        <div>
            <Draggable axis='y' handle=".rc-huddle-menu-handle" position={pos} onStop={onDragStop}>
                <div style={menuContainerStyle}>
                    <RcButton
                        variant="plain"
                        size='large'
                        style={{ padding: '0px' }}
                        onClick={() => {
                            setIsSetup(true);
                            chrome.runtime.sendMessage({ type: "openPopupWindow" });
                        }}
                    >
                        <div style={isSetup ? setupFinishedBadgeStyle : needSetupBadgeStyle} ></div>
                        <img style={{ height: '48px', width: '48px' }} src={MenuLogo} />
                    </RcButton>
                    <div style={{ cursor: 'grab', display: 'inherit' }}>
                        <RcButton
                            className="rc-huddle-menu-handle"
                            variant="plain"
                            size='large'
                            style={{ padding: '0px' }}
                        >
                            <img style={{ pointerEvents: 'none', width: '20px', height: '20px' }} src={DragImage} />
                        </RcButton>
                    </div>
                </div>
            </Draggable >
        </div>

    )
}

export default QuickAccessButton;