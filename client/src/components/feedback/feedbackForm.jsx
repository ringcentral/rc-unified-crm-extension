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
import { trackSubmitFeedback } from '../../lib/analytics';

let rcUserInfo = {};

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
        margin: '0px auto 10px auto',
        color: '#2f2f2f',
        fontSize: '20px',
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
    }
    const subTitleStyle = {
        margin: '0px 10px 5px 10px',
        fontSize: '12px',
        lineHeight: '15px',
        color: '#2f2f2f'
    }
    const labelStyle = {
        margin: '0px 10px 5px 10px',
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        fontWeight: 'bold'
    }
    const recommendRadioGroupStyle = {
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        margin: 'auto'
    }
    const platformRadioGroupStyle = {
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        marginLeft: '15px'
    }
    const noteAreaStyle = {
        height: '300px',
        width: '90%',
        margin: '0px 10px'
    }

    const [isOpen, setIsOpen] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [recommend, setRecommend] = useState('');
    const [platform, setPlatform] = useState('');
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
            if(e.data.props.platformName)
            {
                // eg. insightly -> Insightly
                setPlatform(e.data.props.platformName.charAt(0).toUpperCase() + e.data.props.platformName.slice(1));
            }
        }
    }
    useEffect(() => {
        async function getRcUserInfo() {
            rcUserInfo = (await chrome.storage.local.get('rcUserInfo')).rcUserInfo;
        }
        getRcUserInfo();
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    function onChangeFeedback(e) {
        setFeedback(e.target.value);
        setIsSubmitEnabled(e.target.value !== '' && recommend !== '' && platform !== '');
    }
    function onChangeRecommend(e) {
        setRecommend(e.target.value);
        setIsSubmitEnabled(e.target.value !== '' && feedback !== '' && platform !== '');
    }

    function closeModal() {
        setIsOpen(false);
    }

    function onSubmission() {
        trackSubmitFeedback();
        const feedbackText = encodeURIComponent(feedback);
        const formUrl = `https://docs.google.com/forms/d/e/1FAIpQLSd3vF5MVJ5RAo1Uldy0EwsibGR8ZVucPW4E3JUnyAkHz2_Zpw/viewform?usp=pp_url&entry.912199227=${recommend}&entry.2052354973=${platform}&entry.844920872=${feedbackText}&entry.1467064016=${userName}&entry.1822789675=${userEmail}`;
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
                                size='medium'
                                color='action.primary'
                            />
                            <RcIconButton
                                onClick={onSubmission}
                                symbol={Check}
                                size='large'
                                color='action.primary'
                                disabled={!isSubmitEnabled}
                            />
                        </div>
                        <RcTypography style={titleStyle} >Send us your feedback</RcTypography>
                        <RcTypography style={subTitleStyle}  >RingCentral CRM Extension is currently in beta. We welcome any problem reports, feedback, ideas and feature requests you may have.</RcTypography>
                        <RcTypography style={labelStyle} >How likely are you to recommend the Unified CRM Extension to a friend or colleague?</RcTypography>

                        <RcFormControl style={recommendRadioGroupStyle}>
                            <RcRadioGroup row value={recommend} onChange={onChangeRecommend}>
                                <RcRadio useRcTooltip TooltipProps={1} size='xsmall' title="1" value="1" />
                                <RcRadio useRcTooltip TooltipProps={2} size='xsmall' title="2" value="2" />
                                <RcRadio useRcTooltip TooltipProps={3} size='xsmall' title="3" value="3" />
                                <RcRadio useRcTooltip TooltipProps={4} size='xsmall' title="4" value="4" />
                                <RcRadio useRcTooltip TooltipProps={5} size='xsmall' title="5" value="5" />
                                <RcRadio useRcTooltip TooltipProps={6} size='xsmall' title="6" value="6" />
                                <RcRadio useRcTooltip TooltipProps={7} size='xsmall' title="7" value="7" />
                                <RcRadio useRcTooltip TooltipProps={8} size='xsmall' title="8" value="8" />
                                <RcRadio useRcTooltip TooltipProps={9} size='xsmall' title="9" value="9" />
                                <RcRadio useRcTooltip TooltipProps={10} size='xsmall' title="10" value="10" />
                            </RcRadioGroup>
                        </RcFormControl>
                        <div style={{ height: '35px' }}>
                            <RcTypography style={{ position: 'absolute', left: '10px' }} variant='caption1'>Not likely at all</RcTypography>
                            <RcTypography style={{ position: 'absolute', right: '10px' }} variant='caption1'>Extremely likely</RcTypography>
                        </div>
                        <RcTypography style={labelStyle} >Please share your feedback in the space below.</RcTypography>
                        <RcTextarea
                            style={noteAreaStyle}
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