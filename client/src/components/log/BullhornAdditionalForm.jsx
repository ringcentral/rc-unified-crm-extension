import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission, style }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState(additionalFormInfo.value.sort((a,b) => a.title > b.title ? 1: -1)[0].id);

    useEffect(() => {
        additionalFormInfo.value = additionalFormInfo.value.sort((a,b) => a.title > b.title ? 1: -1)
        setSubmission({ commentAction: additionalFormInfo.value[0].id })
    }, [])

    return (
        <DropdownList
            key='key'
            style={style}
            label={additionalFormInfo.label}
            selectionItems={additionalFormInfo.value.map(d => { return { value: d.id, display: d.title } })}
            presetSelection={additionalDropdownSelection}
            onSelected={(selection) => {
                setAdditionalDropdownSelection(selection);
                selection ? setSubmission({ commentAction: selection }) : setSubmission(null);
            }} />
    );
}