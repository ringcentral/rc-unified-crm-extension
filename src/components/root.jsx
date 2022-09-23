import React from 'react';
import { render } from 'react-dom';

function Root() {
    return (
        <div>
            Test
        </div>
    )
}

render(<Root/>, document.getElementById('react-root'));