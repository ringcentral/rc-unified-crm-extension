import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import LogModal from './components/log/logModal';
import ExpandableNote from './components/note/expandableNote';
import FeedbackForm from './components/feedback/feedbackForm';
import Notification from './components/notification';
import InsightlyAuth from './components/auth/insightlyAuth';
import RedtailAuth from './components/auth/redtailAuth';
import SMSTemplate from './components/smsTemplate';
import { RcThemeProvider } from '@ringcentral/juno';
import WelcomeScreen from './components/welcomeScreen';

function App() {
    return (
        <RcThemeProvider>
            <InsightlyAuth />
            <RedtailAuth />
            <ExpandableNote />
            <FeedbackForm />
            <Notification />
            <LogModal />
            <SMSTemplate />
            <WelcomeScreen />
        </RcThemeProvider>
    )
}
const container = document.getElementById('react-container');
ReactDOM.render(<App />, container);