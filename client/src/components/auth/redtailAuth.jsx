import {
    RcTextField,
    RcText,
    RcLoading,
    RcIconButton
} from '@ringcentral/juno';
import { ChevronLeft, Check } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { apiKeyLogin } from '../../core/auth';

export default () => {
    const modalStyle = {
        height: '100%',
        width: '100%',
        position: 'absolute',
        zIndex: '100',
        background: 'rgb(255 255 255)',
        display: 'flex',
        justifyContent: 'flex-start',
        flexDirection: 'column',
        alignItems: 'flex-start'
    };
    const topBarStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%'
    }
    const titleStyle = {
        margin: '0px auto 15px auto'
    }
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        if (e.data.type === 'rc-apiKey-input-modal' && e.data.platform === 'redtail') {
            setIsOpen(true);
        }
    }
    useEffect(() => {
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    async function onSubmission() {
        setLoading(true);
        await apiKeyLogin({ apiKey: 'apiKey', username, password });
        setIsOpen(false);
        setLoading(false);
    }

    function onChangeUsername(e) {
        setUsername(e.target.value);
    }
    function onChangePassword(e) {
        setPassword(e.target.value);
    }

    return (
        <div>
            <RcLoading loading={isLoading} />
            {
                isOpen && (
                    <div style={modalStyle}>
                        <div style={topBarStyle}>
                            <RcIconButton
                                onClick={() => { setIsOpen(false) }}
                                symbol={ChevronLeft}
                                size='xlarge'
                                color='action.primary'
                            />
                            <RcIconButton
                                onClick={onSubmission}
                                symbol={Check}
                                size='xxlarge'
                                color='action.primary'
                            /></div>
                        <RcText style={titleStyle} variant='title2'>Redtail Authorization</RcText>
                        <RcTextField
                            style={titleStyle}
                            label='username'
                            onChange={onChangeUsername}
                            value={username}
                            required={true}
                        ></RcTextField>
                        <RcTextField
                            style={titleStyle}
                            label='password'
                            onChange={onChangePassword}
                            value={password}
                            required={true}
                        ></RcTextField>
                    </div>
                )
            }
        </div>
    )
}