import { RcDivider, RcIconButton, RcText, RcTextField } from '@ringcentral/juno';
import React, { useState } from 'react';
import { ChevronLeft, SaveDraft } from '@ringcentral/juno-icon';

export default ({
    templates,
    saveTemplates,
    setPageState
}) => {
    const buttonContainerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    }
    const bodyStyle = {
        padding: '15px',
        display: 'flex',
        gap: '15px',
        flexDirection: 'column',
        alignItems: 'flex-start'
    }

    const [name, setName] = useState('')
    const [message, setMessage] = useState('')

    function onNameChange(e) {
        setName(e.target.value)
    }
    function onMessageChange(e) {
        setMessage(e.target.value)
    }

    return (
        <div>
            <div style={buttonContainerStyle}>
                <RcIconButton
                    symbol={ChevronLeft}
                    color="action.primary"
                    onClick={() => {
                        setPageState('select');
                    }}
                />
                <RcText>Create template</RcText>
                <RcIconButton
                    symbol={SaveDraft}
                    color="action.primary"
                    disabled={name === '' || message === ''}
                    onClick={async () => {
                        templates.push({
                            name,
                            message
                        })
                        await saveTemplates({ templates });
                        setPageState('select');
                    }}
                />
            </div>
            <RcDivider />
            <div style={bodyStyle}>
                <RcTextField
                    label="Template name"
                    variant="outline"
                    value={name}
                    required
                    fullWidth
                    onChange={onNameChange}
                />
                <RcTextField
                    label="Message"
                    variant="outline"
                    value={message}
                    required
                    fullWidth
                    onChange={onMessageChange}
                    multiline
                />
            </div >
        </div>
    )
}
