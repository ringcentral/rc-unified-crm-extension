import React, { useState, useEffect } from 'react';
import TemplateSelection from './templateSelector';
import TemplateEdit from './templateEdit';
import TemplateCreate from './templateCreate';

export default () => {
    const containerStyle = {
        zIndex: '1',
        position: 'absolute',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'white'
    }

    const [isOpen, setIsOpen] = useState(false)
    const [templates, setTemplates] = useState([]);
    const [editTemplateIndex, setEditTemplateIndex] = useState(-1);
    const [pageState, setPageState] = useState('select');   // states: select, edit, create


    useEffect(() => {
        const getTemplates = async function () {
            const storedTemplates = await chrome.storage.local.get('rc-sms-templates');
            if (storedTemplates['rc-sms-templates']) {
                setTemplates(storedTemplates['rc-sms-templates']);
            }
        }
        getTemplates();
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        if (e.data.type === 'rc-select-sms-template') {
            setIsOpen(true);
        }
    }

    async function saveTemplates({ templates }) {
        await chrome.storage.local.set({ ['rc-sms-templates']: templates });
        setTemplates(templates);
    }

    return (
        <div>
            {isOpen &&
                <div style={containerStyle}>
                    {
                        pageState === 'select' &&
                        <TemplateSelection
                            templates={templates}
                            setEditTemplateIndex={setEditTemplateIndex}
                            setIsOpen={setIsOpen}
                            setPageState={setPageState}
                            saveTemplates={saveTemplates}
                        />
                    }
                    {
                        pageState === 'edit' &&
                        <TemplateEdit
                            templates={templates}
                            templateIndex={editTemplateIndex}
                            saveTemplates={saveTemplates}
                            setPageState={setPageState}
                        />
                    }
                    {
                        pageState === 'create' &&
                        <TemplateCreate
                            templates={templates}
                            saveTemplates={saveTemplates}
                            setPageState={setPageState}
                        />
                    }
                </div>
            }
        </div>
    )
}