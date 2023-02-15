import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import LogModal from './components/log/logModal';
import ExpandableNote from './components/note/expandableNote';
import FeedbackForm from './components/feedback/feedbackForm';
import InsightlyAuth from './components/auth/insightlyAuth';
import { RcThemeProvider } from '@ringcentral/juno';

function App() {
    return (
        <RcThemeProvider>
            <LogModal />
            <InsightlyAuth />
            <ExpandableNote />
            <FeedbackForm />
        </RcThemeProvider>
    )
}
const container = document.getElementById('react-container');
ReactDOM.render(<App />, container);