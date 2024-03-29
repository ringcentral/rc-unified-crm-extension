import React from 'react';
import ReactDOM from 'react-dom';
import Loading from './components/loading';
import ExpandableNote from './components/note/expandableNote';
import SMSTemplate from './components/smsTemplate';
import { RcThemeProvider } from '@ringcentral/juno';

function App() {
    return (
        <RcThemeProvider>
            <Loading />
            <ExpandableNote />
            <SMSTemplate />
        </RcThemeProvider>
    )
}
const container = document.getElementById('react-container');
ReactDOM.render(<App />, container);