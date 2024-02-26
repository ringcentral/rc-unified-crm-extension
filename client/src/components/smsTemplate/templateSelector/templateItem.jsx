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

    // https://stackoverflow.com/questions/33063418/simulate-keyboard-input-insert-string-into-textarea-adwords
    function setNativeValue(element, value) {
        const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, 'value') || {}
        const prototype = Object.getPrototypeOf(element)
        const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, 'value') || {}

        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value)
        } else if (valueSetter) {
            valueSetter.call(element, value)
        } else {
            throw new Error('The given element does not have a value setter')
        }
    }

    function applyMessage(e) {
        const message = e.target.getAttribute('value');
        const textArea = document.querySelector("#rc-widget-adapter-frame").contentWindow.document.querySelector('.MessageInput_textField > textarea');
        setNativeValue(textArea, message);
        textArea.dispatchEvent(new Event('input', { bubbles: true }))  // to mimic user type event
        setIsOpen(false);
        window.postMessage({ type: 'rc-expandable-call-note-terminate' }, '*');
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