import React, { useState, useEffect } from 'react';
import QuickAccessButton from './quickAccessButton';
import { RcButton, RcIconButton } from '@ringcentral/juno';
import SetupButton from './setupButton';
import Draggable from 'react-draggable';
import DragImage from '../../images/dragImage_blue.png';
import { ArrowUp2, ArrowDown2 } from '@ringcentral/juno-icon';
import { isObjectEmpty } from '../../lib/util';
import Navigator from './navigator';
import WelcomeScreen from './welcomeScreen';

const quickAccessButtonContainerStyle = {
    bottom: '100px',
    right: '0',
    position: 'fixed',
    zIndex: '99999'
}
const menuContainerStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
}

const needSetupBadgeStyle = {
    position: 'absolute',
    top: '-4px',
    right: '20px',
    background: '#f15353',
    borderRadius: ' 50%',
    height: '16px',
    width: '16px',
    color: 'white',
    border: 'solid 2px white'
}

const navigatorBadgeStyle = {
    position: 'absolute',
    top: '-4px',
    right: '20px',
    background: '#066fac',
    borderRadius: ' 50%',
    height: '16px',
    width: '16px',
    color: 'white',
    border: 'solid 2px white'
}

function App() {
    const [state, setState] = useState('quick_access');
    const [isSetup, setIsSetup] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [showNavigator, setShowNavigator] = useState(false);

    useEffect(() => {
        async function checkSetup() {
            const platformInfo = await chrome.storage.local.get('platform-info');
            setIsSetup(!isObjectEmpty(platformInfo) && platformInfo['platform-info'].platformName);
        }
        checkSetup();
        updatePos();
    }, []);

    function updatePos() {
        const setTransform = localStorage.getItem('rcQuickAccessButtonTransform');
        if (setTransform) {
            const xPos = setTransform.split('translate(')[1].split('px,')[0];
            const yPos = setTransform.split('px, ')[1].split('px')[0];
            setPos({ x: Number(xPos), y: Number(yPos) });
        }
    }

    function onDragStop(e) {
        const newTransform = document.querySelector('.react-draggable-dragged').style.transform;
        localStorage.setItem('rcQuickAccessButtonTransform', newTransform);
        updatePos();
    }
    return (
        <div>
            <div style={quickAccessButtonContainerStyle}>
                <Draggable axis='y' handle=".rc-huddle-menu-handle" position={pos} onStop={onDragStop}>
                    <div style={menuContainerStyle}>
                        {state === 'quick_access' && <QuickAccessButton
                            isSetup={isSetup}
                            setState={setState}
                        />}
                        {state === 'setup' && <SetupButton
                            setIsSetup={setIsSetup}
                            setState={setState}
                        />}
                        {isSetup ?
                            <RcIconButton
                                size='small'
                                symbol={showNavigator ? ArrowDown2 : ArrowUp2}
                                onClick={() => { setShowNavigator(!showNavigator) }}
                                style={navigatorBadgeStyle}
                            />
                            :
                            <div style={needSetupBadgeStyle} ></div>}
                        {showNavigator &&
                            <Navigator />
                        }
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
            <WelcomeScreen />
        </div>
    )
}

export default App;