import DropdownList from '../dropdownList';
import React, { useState } from 'react';

export default ({ additionalFormInfo, setSubmission, style }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState(null);
    return (
        <DropdownList
            key='key'
            style={style}
            label={additionalFormInfo.label}
            selectionItems={additionalFormInfo.value.map(d => { return { value: d.id, display: d.title } })}
            presetSelection={additionalDropdownSelection}
            onSelected={(selection) => {
                setAdditionalDropdownSelection(selection);
                setSubmission({ matterId: selection });
            }} />
    );
}