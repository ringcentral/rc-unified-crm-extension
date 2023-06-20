import { RcDivider, RcIconButton, RcButton, RcText, RcTextField } from '@ringcentral/juno';
import React, { useState } from 'react';
import { ChevronLeft, SaveDraft } from '@ringcentral/juno-icon';

export default ({
    templates,
    templateIndex,
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

    const [name, setName] = useState(templates[templateIndex].name)
    const [message, setMessage] = useState(templates[templateIndex].message)

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
                <RcText>Edit template</RcText>
                <RcIconButton
                    symbol={SaveDraft}
                    color="action.primary"
                    onClick={async () => {
                        templates[templateIndex].name = name;
                        templates[templateIndex].message = message;
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
                <RcButton
                    style={{
                        bottom: '15px',
                        position: 'absolute'
                    }}
                    color="danger.b03"
                    variant="plain"
                    onClick={async () => {
                        templates.splice(templateIndex, 1);
                        await saveTemplates({ templates });
                        setPageState('select');
                    }}
                >
                    Delete template
                </RcButton >
            </div >
        </div>
    )
}
