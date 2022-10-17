import {
    RcButton,
    RcTextarea,
    RcThemeProvider,
    RcText
} from '@ringcentral/juno';
import React, { useState, useEffect } from 'react';
import { syncLog } from '../core/log';

// TODO: add loading animation
export default () => {
    const modalStyle = {
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        margin: 'auto',
        transform: 'translate(-50%, -50%)',
        position: 'absolute',
        zIndex: '10',
        background: 'rgb(255 255 255)',
        display: 'flex',
        justifyContent: 'space-evenly',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
        border: '1px solid #a5a5a5'
    };
    const backgroundStyle = {
        width: '100%',
        height: '100%',
        background: '#ffffffb5',
        position: 'absolute',
        zIndex: '5'
    }
    const elementStyle = {
        margin: '0px 30px 20px'
    }

    function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return
        }
        const { type, logProps } = e.data
        if (type === 'rc-log-modal') {
            setIsOpen(true);
            setCallInfo(logProps.callInfo);
            setNote('');
            setLogType(logProps.logType);
            document.getElementById('rc-widget').style.zIndex = 0;
        }
    }
    useEffect(() => {
        window.addEventListener('message', onEvent)
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [logType, setLogType] = useState('');
    const [callInfo, setCallInfo] = useState(null);

    async function onSubmission() {
        closeModal();
        await syncLog({
            logType,
            callInfo,
            note
        });
    }

    function closeModal() {
        setIsOpen(false);
    }

    function onChangeNote(e) {
        setNote(e.target.value);
    }

    return (
        <RcThemeProvider>
            {
                isOpen && (
                    <div>
                        <div style={backgroundStyle} onClick={closeModal}></div>
                        <div style={modalStyle}>
                            <RcText style={elementStyle} variant='title1'>Sync {logType} Log</RcText>
                            <RcTextarea
                                style={elementStyle}
                                label='Note'
                                onChange={onChangeNote}
                                value={note}
                                fullWidth
                            ></RcTextarea>
                            <RcButton
                                radius='sm'
                                onClick={onSubmission}
                            >
                                Submit
                            </RcButton>
                        </div>
                    </div>
                )
            }
        </RcThemeProvider >
    )
}