import React from 'react';
import QuickAccessButton from './quickAccessButton';

const rootContainerStyle = {
    position: 'fixed',
    bottom: '100px',
    right: '0',
    zIndex: '99999'
}


function App() {
    return (
        <div style={rootContainerStyle}>
            <QuickAccessButton />
        </div>
    )
}

export default App;