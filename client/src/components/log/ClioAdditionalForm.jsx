import { RcCheckbox } from '@ringcentral/juno';
import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission, logType }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState(additionalFormInfo != null ? additionalFormInfo.matters[0].id : null);
    const [logTimeEntry, setLogTimeEntry] = useState(additionalFormInfo != null ? true : false);

    useEffect(() => {
        if (additionalFormInfo != null) {
            setSubmission({ matterId: additionalFormInfo.matters[0].id, logTimeEntry })
        }
        else {
            setSubmission({});
        }
    }, [])

    useEffect(() => {
        if (additionalFormInfo != null) {
            setSubmission({ matterId: additionalDropdownSelection, logTimeEntry });
        }
        else {
            setSubmission({});
        }
    }, [logTimeEntry, additionalDropdownSelection])

    return (
        <div>
            {additionalFormInfo != null &&
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
            }
        </div>
    );
}