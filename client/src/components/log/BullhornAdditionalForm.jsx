import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState('');

    useEffect(() => {
        chrome.storage.local.get({ bullhornDefaultActionCode: '' },
            (items => {
                if (items.bullhornDefaultActionCode && additionalFormInfo.actions.some(i => i.title === items.bullhornDefaultActionCode)) {
                    setAdditionalDropdownSelection(items.bullhornDefaultActionCode);
                    setSubmission({ commentAction: items.bullhornDefaultActionCode })
                }
                else {
                    setAdditionalDropdownSelection(additionalFormInfo.actions[0].id);
                    setSubmission({ commentAction: additionalFormInfo.actions[0].id });
                }
            }));
    }, [additionalFormInfo])

    return (
        <div>
            {additionalFormInfo != null &&
                <DropdownList
                    key='key'
                    label='Note actions'
                    selectionItems={additionalFormInfo.actions.map(d => { return { value: d.id, display: d.title } })}
                    presetSelection={additionalDropdownSelection}
                    onSelected={(selection) => {
                        setAdditionalDropdownSelection(selection);
                        selection ? setSubmission({ commentAction: selection }) : setSubmission({});
                    }} />
            }
        </div>
    );
}