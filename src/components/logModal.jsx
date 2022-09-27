import {
    RcButton,
    RcTextarea,
    RcThemeProvider,
    RcText
} from '@ringcentral/juno';
import React, { useState, useEffect } from 'react';
import { onModalSubmission } from '../popup';

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
    const elementStyle = {
        margin: '20px'
    }

    function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return
        }
        const { type, callLogProps } = e.data
        if (type === 'rc-call-log-modal') {
            setIsOpen(true);
            setSessionId(callLogProps.id);
            setNote('');
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
    const [sessionId, setSessionId] = useState(null);
    const [note, setNote] = useState('');

    async function onSubmission() {
        closeModal();
        await onModalSubmission({
            id: sessionId,
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
                    <div style={modalStyle}>
                        <RcText style={elementStyle} variant='headline1'>Sync Call Log</RcText>
                        <RcTextarea
                            style={elementStyle}
                            label='Note'
                            onChange={onChangeNote}
                            value={note}
                            fullWidth
                        ></RcTextarea>
                        <RcButton
                            style={elementStyle}
                            onClick={onSubmission}
                        >
                            Submit
                        </RcButton>
                        <RcButton
                            onClick={closeModal}
                            color='presence.busy'
                        >
                            Cancel
                        </RcButton>
                    </div>
                )
            }
        </RcThemeProvider >
    )
}