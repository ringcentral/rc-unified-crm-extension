import { RcCheckbox } from '@ringcentral/juno';
import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission, logType }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState(additionalFormInfo.matters[0].id);
    const [logTimeEntry, setLogTimeEntry] = useState(true);

    useEffect(() => {
        setSubmission({ matterId: additionalFormInfo.matters[0].id, logTimeEntry })
    }, [])

    useEffect(() => {
        setSubmission({ matterId: additionalDropdownSelection, logTimeEntry });
    }, [logTimeEntry, additionalDropdownSelection])

    return (
        <div>
            <DropdownList
                key='key'
                label="Sync to matter"
                selectionItems={additionalFormInfo.matters.map(d => { return { value: d.id, display: d.title } })}
                presetSelection={additionalDropdownSelection}
                onSelected={(selection) => {
                    setAdditionalDropdownSelection(selection);
                }} />
            {logType === 'Call' &&
                <RcCheckbox
                    label="Log time entry"
                    defaultChecked={true}
                    onChange={(event) => {
                        setLogTimeEntry(event.target.checked);
                    }}
                    disableRipple
                />}
        </div>
    );
}