import { RcLoading } from '@ringcentral/juno';
import React, { useState, useEffect } from 'react';

export default () => {
    const [isLoading, setLoading] = useState(false);

    function onEvent(e) {
        if (!e?.data?.type) {
            return;
        }
        if (e.data.type === 'rc-log-modal-loading-on') {
            setLoading(true);
        }
        if (e.data.type === 'rc-log-modal-loading-off') {
            setLoading(false);
        }
    }

    useEffect(() => {
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    return (
        <div>
            <RcLoading loading={isLoading} />
        </div>
    )
}