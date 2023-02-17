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
        zIndex: '100000',
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
    const [apiKey, setApiKey] = useState('');
    const [apiUrl, setApiUrl] = useState('');

    function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        if (e.data.type === 'rc-apiKey-input-modal') {
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
        await apiKeyLogin({ apiKey, apiUrl });
        setIsOpen(false);
        setLoading(false);
    }

    function onChangeKey(e) {
        setApiKey(e.target.value);
    }

    function onChangeApiUrl(e) {
        setApiUrl(e.target.value);
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
                        <RcText style={titleStyle} variant='title2'>Register API Key</RcText>
                        <RcText style={titleStyle} variant='caption1'>(info under User Settings - API section)</RcText>
                        <RcTextField
                            style={titleStyle}
                            label='Key'
                            onChange={onChangeKey}
                            value={apiKey}
                            required={true}
                            helperText='eg. xxxxx-xxxx-xxxx-xxxx-xxxxxxx'
                        ></RcTextField>
                        <RcTextField
                            style={titleStyle}
                            label='API url'
                            onChange={onChangeApiUrl}
                            value={apiUrl}
                            required={true}
                            helperText='eg. https://api.xxx.insightly.com'
                        ></RcTextField>
                    </div>
                )
            }
        </div>
    )
}