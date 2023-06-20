import { RcIconButton, RcListItem, RcListItemText } from '@ringcentral/juno';
import React, { useState } from 'react';
import { Edit } from '@ringcentral/juno-icon';

export default ({
    title,
    content,
    index,
    setEditTemplateIndex,
    setIsOpen,
    setPageState,
    templates,
    saveTemplates,
    draggingTemplate,
    setDraggingTemplate
}) => {
    const [showEdit, setShowEdit] = useState(false);
    const [opacity, setOpacity] = useState(1);

    function applyMessage(e) {
        const message = e.target.getAttribute('value');
        const textArea = document.querySelector("#rc-widget-adapter-frame").contentWindow.document.querySelector('.MessageInput_textField > textarea');
        textArea.value = message;
        setIsOpen(false);
    }

    return (
        <RcListItem
            style={{
                opacity: opacity
            }}
            draggable={true}
            alignItems="flex-start"
            divider
            button
            singleLine
            dense
            onClick={applyMessage}
            value={content}
            onPointerEnter={() => { setShowEdit(true) }}
            onPointerLeave={() => { setShowEdit(false) }}
            onDragStart={(e) => {
                setDraggingTemplate({
                    index,
                    name: title,
                    message: content
                });
                setOpacity(0.5);
            }}
            onDragEnd={() => {
                setOpacity(1);
            }}
            onDrop={(e) => {
                e.preventDefault();
                templates.splice(draggingTemplate.index, 1);
                templates.splice(index, 0, { name: draggingTemplate.name, message: draggingTemplate.message });
                saveTemplates({ templates });
                setDraggingTemplate(null);
            }}
            onDragOver={(e) => {
                e.preventDefault();
            }}
        >
            <RcListItemText
                style={{ pointerEvents: 'none' }}
                primary={title}
                secondary={content}
            />
            {showEdit &&
                <RcIconButton
                    symbol={Edit}
                    color="action.primary"
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditTemplateIndex(index);
                        setPageState('edit');
                    }}
                />
            }
        </RcListItem>
    )
}