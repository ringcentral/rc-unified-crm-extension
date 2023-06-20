import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import LogModal from './components/log/logModal';
import ExpandableNote from './components/note/expandableNote';
import FeedbackForm from './components/feedback/feedbackForm';
import InsightlyAuth from './components/auth/insightlyAuth';
import SMSTemplate from './components/smsTemplate';
import { RcThemeProvider } from '@ringcentral/juno';

function App() {
    return (
        <RcThemeProvider>
            <InsightlyAuth />
            <ExpandableNote />
            <FeedbackForm />
            <LogModal />
            <SMSTemplate />
        </RcThemeProvider>
    )
}
const container = document.getElementById('react-container');
ReactDOM.render(<App />, container);