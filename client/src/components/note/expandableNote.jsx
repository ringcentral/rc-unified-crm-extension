import {
    RcDrawer,
    RcIconButton,
    RcTextarea
} from '@ringcentral/juno';
import { Note, Check } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { cacheCallNote } from '../../core/log';

export default () => {
    const componentStyle = {
        position: 'relative',
        zIndex: '10',
    }
    const drawerStyle = {
        display: 'flex',
        justifyContent: 'flex-start',
        flexDirection: 'column',
        alignItems: 'flex-start'
    };
    const noteAreaStyle = {
        height: '150px',
        width: '90%',
        margin: '5% 5% 0% 5%'
    }
    const buttonStyle = {
        position: 'fixed',
        zIndex: '10',
        bottom: '10px',
        right: '10px',
    };

    const [isOpen, setIsOpen] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isInCall, setIsInCall] = useState(false);
    const [note, setNote] = useState('');
    const [sessionId, setSessionId] = useState('');

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        if (e.data.type === 'rc-expandable-call-note-open') {
            setIsOpen(true);
            setNote('');
            setSessionId(e.data.sessionId);
            setIsInCall(true);
        }
        if (e.data.type === 'rc-expandable-call-note-terminate') {
            setIsInCall(false);
            if (!isDrawerOpen && note !== '') {
                setIsDrawerOpen(true);
            }
        }
    }
    useEffect(() => {
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    async function onSaveNote() {
        if (!isInCall) {
            await cacheCallNote({ sessionId, note });
            setIsOpen(false);
        }
        setIsDrawerOpen(false);
    }

    function onChangeNote(e) {
        setNote(e.target.value);
    }

    return (
        <div>
            {
                isOpen && (
                    <div style={componentStyle} >
                        <RcIconButton
                            symbol={Note}
                            style={buttonStyle}
                            color='action.primary'
                            variant='contained'
                            onClick={() => { setIsDrawerOpen(true) }}
                        />
                        <RcDrawer
                            radius='zero'
                            style={drawerStyle}
                            anchor="bottom"
                            open={isDrawerOpen}
                            onClose={() => { setIsDrawerOpen(false) }}
                        >
                            <RcTextarea
                                style={noteAreaStyle}
                                label='Note'
                                onChange={onChangeNote}
                                value={note}
                                size='large'
                            />
                            <RcIconButton
                                symbol={Check}
                                style={buttonStyle}
                                color='action.primary'
                                variant='contained'
                                onClick={onSaveNote}
                            />
                        </RcDrawer>
                    </div>
                )
            }
        </div>
    )
}