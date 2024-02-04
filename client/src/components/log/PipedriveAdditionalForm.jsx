import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState(additionalFormInfo ? additionalFormInfo.deals[0].id : null);

    useEffect(() => {
        if (additionalFormInfo != null) {
            setSubmission({ dealId: additionalFormInfo.deals[0].id })
            setAdditionalDropdownSelection(additionalFormInfo.deals[0].id);
        }
        else {
            setSubmission({})
            setAdditionalDropdownSelection(null);
        }
    }, [additionalFormInfo])

    return (
        <div>
            {
                additionalFormInfo != null && <DropdownList
                    key='key'
                    label='Deals'
                    selectionItems={additionalFormInfo.deals.map(d => { return { value: d.id, display: d.title } })}
                    presetSelection={additionalDropdownSelection}
                    onSelected={(selection) => {
                        setAdditionalDropdownSelection(selection);
                        selection ? setSubmission({ dealId: selection }) : setSubmission({});
                    }} />
            }
        </div>
    );
}