import {
    RcTypography,
    RcFormControl,
    RcIconButton,
    RcRadioGroup,
    RcRadio,
    RcTextarea
} from '@ringcentral/juno';
import { ChevronLeft, Check } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';

export default () => {
    const modalStyle = {
        height: '100%',
        width: '100%',
        position: 'absolute',
        zIndex: '100',
        background: 'rgb(255 255 255)',
        display: 'flex',
        justifyContent: 'flex-start',
        flexDirection: 'column',
        alignItems: 'flex-start'
    };
    const topBarStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%'
    }
    const titleStyle = {
        margin: '0px auto 15px auto',
        textAlign: 'center'
    }
    const labelStyle = {
        margin: '0px 10px 10px 10px'
    }
    const noteAreaStyle = {
        height: '300px',
        width: '90%',
        margin: '0px 10px'
    }

    const [isOpen, setIsOpen] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [recommend, setRecommend] = useState('');
    const [isSubmitEnabled, setIsSubmitEnabled] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        if (e.data.type === 'rc-feedback-open') {
            setIsOpen(true);
            setFeedback('');
            setRecommend('');
            setUserName(e.data.props.userName);
            setUserEmail(e.data.props.userEmail);
        }
    }
    useEffect(() => {
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    function onChangeFeedback(e) {
        setFeedback(e.target.value);
        setIsSubmitEnabled(e.target.value !== '' && recommend !== '');
    }
    function onChangeRecommend(e) {
        setRecommend(e.target.value);
        setIsSubmitEnabled(e.target.value !== '' && feedback !== '');
    }

    function closeModal() {
        setIsOpen(false);
    }

    function onSubmission() {
        const feedbackText = encodeURIComponent(feedback);
        const formUrl = `https://docs.google.com/forms/d/e/1FAIpQLSd3vF5MVJ5RAo1Uldy0EwsibGR8ZVucPW4E3JUnyAkHz2_Zpw/viewform?usp=pp_url&entry.912199227=${recommend}&entry.844920872=${feedbackText}&entry.1467064016=${userName}&entry.1822789675=${userEmail}`;
        window.open(formUrl, '_blank');
        setIsOpen(false);
    }

    return (
        <div>
            {
                isOpen && (
                    <div style={modalStyle} >
                        <div style={topBarStyle}>
                            <RcIconButton
                                onClick={closeModal}
                                symbol={ChevronLeft}
                                size='xlarge'
                                color='action.primary'
                            />
                            <RcIconButton
                                onClick={onSubmission}
                                symbol={Check}
                                size='xxlarge'
                                color='action.primary'
                                disabled={!isSubmitEnabled}
                            />
                        </div>
                        <RcTypography style={titleStyle} variant='title2' >Send us your feedback</RcTypography>
                        <RcTypography style={labelStyle} variant='caption1' >RingCentral CRM Extension is currently in beta. We welcome any problem reports, feedback, ideas and feature requests you may have.</RcTypography>
                        <RcTypography style={labelStyle} variant='body2'>Would you recommend this product to your friends or colleagues?</RcTypography>

                        <RcFormControl style={labelStyle}>
                            <RcRadioGroup row value={recommend} onChange={onChangeRecommend}>
                                <RcRadio label="Yes" value="Yes" />
                                <RcRadio label="No" value="No" />
                                <RcRadio label="Maybe" value="Maybe" />
                            </RcRadioGroup>
                        </RcFormControl>
                        <RcTypography style={labelStyle} variant='body2'>Please share your feedback in the space below.</RcTypography>
                        <RcTextarea
                            style={noteAreaStyle}
                            label='Feedback'
                            onChange={onChangeFeedback}
                            value={feedback}
                            size='large'
                        />
                    </div>
                )
            }
        </div>
    )
}