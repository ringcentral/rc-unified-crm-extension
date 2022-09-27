import React from 'react';
import ReactDOM from 'react-dom';
import LogModal from './components/logModal.jsx';

function App() {
    return (
        <div>
            <LogModal />
        </div>
    )
}
const container = document.getElementById('react-container');
ReactDOM.render(<App />, container);