import DropdownList from '../dropdownList';
import React, { useState, useEffect } from 'react';

export default ({ additionalFormInfo, setSubmission }) => {
    const [additionalDropdownSelection, setAdditionalDropdownSelection] = useState(additionalFormInfo.deals[0].id);

    useEffect(() => {
        setSubmission({ dealId: additionalFormInfo.deals[0].id })
        setAdditionalDropdownSelection(additionalFormInfo.deals[0].id);
    }, [additionalFormInfo])

    return (
        <DropdownList
            key='key'
            label='Deals'
            selectionItems={additionalFormInfo.deals.map(d => { return { value: d.id, display: d.title } })}
            presetSelection={additionalDropdownSelection}
            onSelected={(selection) => {
                setAdditionalDropdownSelection(selection);
                selection ? setSubmission({ dealId: selection }) : setSubmission({});
            }} />
    );
}