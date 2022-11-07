import {
    RcSelect,
    RcMenuItem
} from '@ringcentral/juno';
import React, { useState } from 'react';

export default ({ selectionItems, presetSelection, onSelected, label, style }) => {
    const [selection, setSelection] = useState(presetSelection);

    function onChange(event) {
        setSelection(event.target.value);
        onSelected(event.target.value);
    }
    function getItems(items) {
        const itemElements = items.map(i => { return <RcMenuItem key={i.value} value={i.value}>{i.display}</RcMenuItem > });
        return itemElements;
    }
    return (
        <div style={style}>
            <RcSelect
                label={label}
                onChange={onChange}
                value={selection}
            >
                {getItems(selectionItems)}
            </RcSelect>
        </div>
    );
}