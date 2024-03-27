import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import Loading from './components/loading';
import ExpandableNote from './components/note/expandableNote';
import FeedbackForm from './components/feedback/feedbackForm';
import Notification from './components/notification';
import InsightlyAuth from './components/auth/insightlyAuth';
import RedtailAuth from './components/auth/redtailAuth';
import SMSTemplate from './components/smsTemplate';
import { RcThemeProvider } from '@ringcentral/juno';

function App() {
    return (
        <RcThemeProvider>
            <Loading />
            <InsightlyAuth />
            <RedtailAuth />
            <ExpandableNote />
            <FeedbackForm />
            <Notification />
            <SMSTemplate />
        </RcThemeProvider>
    )
}
const container = document.getElementById('react-container');
ReactDOM.render(<App />, container);