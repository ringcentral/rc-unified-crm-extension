import {
    RcSelect,
    RcMenuItem
} from '@ringcentral/juno';
import React, { useEffect, useState } from 'react';

export default ({ selectionItems, presetSelection, onSelected, label, style, notShowNone = false }) => {
    const [selection, setSelection] = useState(presetSelection);

    function onChange(event) {
        setSelection(event.target.value);
        event.target.value === 'none' ? onSelected(null) : onSelected(event.target.value);
    }
    function getItems(items) {
        const itemElements = items.map(i => { return <RcMenuItem key={i.value} value={i.value}>{i.display}</RcMenuItem > });
        if(!notShowNone)
        {
            // Preset to first item, add additional item as none/null
            itemElements.push(<RcMenuItem key='none' value='none'>none</RcMenuItem >);
        }
        return itemElements;
    }

    useEffect(() => {
        setSelection(presetSelection);
    }, [presetSelection])

    return (
        <div style={style}>
            <RcSelect
                label={label}
                onChange={onChange}
                value={selection}
                fullWidth
            >
                {getItems(selectionItems)}
            </RcSelect>
        </div>
    );
}