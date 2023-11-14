import {
    RcTextarea,
    RcText,
    RcLoading,
    RcIconButton,
    RcDivider,
    RcCheckbox,
    RcButton,
} from '@ringcentral/juno';
import { ChevronLeft } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { addLog, getCachedNote } from '../../core/log';
import moment from 'moment';
import { secondsToHourMinuteSecondString } from '../../lib/util';
import PipedriveAdditionalForm from './PipedriveAdditionalForm';
import InsightlyAdditionalForm from './InsightlyAdditionalForm';
import ClioAdditionalForm from './ClioAdditionalForm';
import BullhornAdditionalForm from './BullhornAdditionalForm';

const logEvents = [];
let countdownIntervalId = '';

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
        alignItems: 'flex-start',
        overflow: 'hidden auto'
    };
    const topBarStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'center'
    }
    const titleStyle = {
        color: '#2f2f2f',
        fontSize: '20px'
    }
    const elementContainerStyle = {
        padding: '2px 20px'
    }
    const contentRowStyle = {
        display: 'flex',
        width: '100%'
    }
    const labelStyle = {
        fontSize: '0.8rem',
        fontWeight: '700',
        fontFamily: 'Lato,Helvetica,Arial,sans-serif',
        lineHeight: '16px',
        color: '#666666'
    }
    const contentStyle = {
        color: '#97979',
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
        fontSize: '14px'
    }
    const dividerStyle = {
        right: '4%',
        margin: '0% 8%',
        width: '92%',
        marginBottom: '10px'
    }
    const noteStyle = {
        right: '7%',
        margin: '2% 14%',
        width: '86%'
    }

    const [platform, setPlatform] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [logType, setLogType] = useState('');
    const [logInfo, setLogInfo] = useState(null);
    const [isToday, setIsToday] = useState(null);
    const [contactName, setContactName] = useState('');
    const [direction, setDirection] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [duration, setDuration] = useState('');
    const [isLoading, setLoading] = useState(false);
    const [additionalFormInfo, setAdditionalFormInfo] = useState([]);
    const [additionalSubmission, setAdditionalSubmission] = useState(null);
    const [useCustomSubject, setUseCustomSubject] = useState(false);
    const [customSubject, setCustomSubject] = useState('');
    const [countdown, setCountdown] = useState(20);
    const [countdownFinished, setCountdownFinished] = useState(false);

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        const { type, platform, logProps, additionalLogInfo, triggerType } = e.data
        if (type === 'rc-log-modal') {
            setPlatform(platform);
            // no trigger type means manual trigger
            logEvents.push({ type, logProps, additionalLogInfo, isManualTrigger: !!!triggerType });
            await setupModal();
            setLoading(false);
        }
        if (type === 'rc-log-modal-loading-on') {
            setLoading(true);
        }
        if (type === 'rc-log-modal-loading-off') {
            setLoading(false);
        }
    }

    async function setupModal() {
        clearInterval(countdownIntervalId);
        const cachedNote = await getCachedNote({ sessionId: logEvents[0].logProps.logInfo.sessionId });
        setIsOpen(true);
        setLogInfo(logEvents[0].logProps.logInfo);
        setIsToday(logEvents[0].logProps.isToday);
        setNote(cachedNote);
        setLogType(logEvents[0].logProps.logType);
        if (logEvents[0].logProps.autoLog) {
            let { autoLogCountdown } = await chrome.storage.local.get(
                { autoLogCountdown: '20' }
            );
            setCountdown(Number(autoLogCountdown));
            setCountdownFinished(false);
            countdownIntervalId = setInterval(() => {
                setCountdown(c => { return c - 1; });
            }, 1000);
        }
        if (!logEvents[0].logProps.autoLog || logEvents[0].isManualTrigger) {
            stopCountDown();
        }
        if (!logEvents[0].additionalLogInfo) {
            setAdditionalSubmission(null);
        }
        setAdditionalFormInfo(logEvents[0].additionalLogInfo);
        setUseCustomSubject(false);
        setCustomSubject('');
        switch (logEvents[0].logProps.logType) {
            case 'Call':
                setDirection(logEvents[0].logProps.logInfo.direction);
                setContactName(logEvents[0].logProps.contactName);
                setPhoneNumber(logEvents[0].logProps.logInfo.direction === 'Inbound' ? logEvents[0].logProps.logInfo.from.phoneNumber : logEvents[0].logProps.logInfo.to.phoneNumber);
                setDateTime(moment(logEvents[0].logProps.logInfo.startTime).format('YYYY-MM-DD hh:mm:ss A'));
                setDuration(secondsToHourMinuteSecondString(logEvents[0].logProps.logInfo.duration));
                break;
            case 'Message':
                setDirection('');
                setContactName(logEvents[0].logProps.contactName);
                setPhoneNumber(logEvents[0].logProps.logInfo.correspondents[0].phoneNumber);
                setDateTime(moment(logEvents[0].logProps.logInfo.messages[0].lastModifiedTime).format('YYYY-MM-DD hh:mm:ss A'));
                break;
        }
    }

    useEffect(() => {
        window.addEventListener("focus", stopCountDown);
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
            window.removeEventListener("focus", stopCountDown);
        }
    }, [])

    useEffect(() => {
        const countDownCheck = async function () {
            if (countdown <= 0) {
                await onSubmission();
            }
        }
        countDownCheck();
        console.log(`Auto log countdown: ${countdown}`)
    }, [countdown])

    // any editing action would stop countdown
    function stopCountDown() {
        setCountdownFinished(true);
        clearInterval(countdownIntervalId);
    }

    async function onSubmission() {
        try {
            stopCountDown();
            setLoading(true);
            if (useCustomSubject) {
                logInfo['customSubject'] = customSubject;
            }
            await addLog({
                logType,
                logInfo,
                isToday,
                note,
                additionalSubmission
            });
        }
        catch (e) {
            console.log(e);
        }
        closeModal();
        setLoading(false);
    }

    function closeModal() {
        stopCountDown();
        setIsOpen(false);
        logEvents.shift();  // array FIFO
        if (logEvents.length > 0) {
            setupModal();
        }
    }

    function onChangeNote(e) {
        setNote(e.target.value);
        stopCountDown();
    }

    function onChangeCustomSubjectCheckBox(e) {
        setUseCustomSubject(e.target.checked);
        stopCountDown();
    }

    function onChangeCustomSubject(e) {
        setCustomSubject(e.target.value);
        stopCountDown();
    }

    return (
        <div>
            <RcLoading loading={isLoading} />
            {
                isOpen && (
                    <div style={modalStyle}>
                        <div style={topBarStyle}>
                            <RcIconButton
                                onClick={closeModal}
                                symbol={ChevronLeft}
                                color='action.primary'
                                size='medium'
                            />
                            <RcText style={titleStyle} >{logType} details</RcText>
                            <RcButton
                                onClick={onSubmission}
                                variant="plain"
                                style={{ paddingRight: '10px' }}
                            >
                                Save{countdownFinished ? '' : `(${countdown})`}
                            </RcButton>
                        </div>
                        <RcDivider color="action.grayDark" style={dividerStyle} />
                        <div style={contentRowStyle}>
                            <div style={elementContainerStyle}>
                                <RcText style={labelStyle} >Phone number</RcText>
                                <RcText style={contentStyle} variant='body1'>{phoneNumber}</RcText>
                            </div>
                            {direction && <div style={elementContainerStyle}>
                                <RcText style={labelStyle} >Direction</RcText>
                                <RcText style={contentStyle} variant='body1'>{direction}</RcText>
                            </div>}
                        </div>
                        <div style={elementContainerStyle}>
                            <RcText style={labelStyle} >{logType == 'Call' ? 'Call time and duration' : 'Message time'}</RcText>
                            <RcText style={contentStyle} variant='body1'>{moment(dateTime).isSame(moment(), 'day') ? moment(dateTime).format('hh:mm:ss A') : dateTime} {logType == 'Call' ? `(${duration})` : ''}</RcText>
                        </div>
                        <div style={elementContainerStyle}>
                            <RcText style={labelStyle} >Contact name</RcText>
                            <RcText style={contentStyle} variant='body1'>{contactName}</RcText>
                        </div>
                        {logType === 'Call' &&
                            <div style={elementContainerStyle}>
                                <RcCheckbox
                                    label="Custom log subject"
                                    onChange={onChangeCustomSubjectCheckBox}
                                    disableRipple
                                />
                            </div>
                        }
                        {useCustomSubject &&
                            <RcTextarea
                                style={noteStyle}
                                label='Custom subject'
                                onChange={onChangeCustomSubject}
                                value={customSubject}
                            />
                        }
                        {logType === 'Call' &&
                            <RcTextarea
                                style={noteStyle}
                                label='Note'
                                onChange={onChangeNote}
                                value={note}
                            />
                        }
                        {platform === 'pipedrive' && additionalFormInfo && additionalFormInfo.length !== 0 &&
                            <div style={elementContainerStyle}>
                                <PipedriveAdditionalForm
                                    additionalFormInfo={additionalFormInfo}
                                    setSubmission={setAdditionalSubmission}
                                    style={labelStyle}
                                />
                            </div>
                        }
                        {platform === 'insightly' && additionalFormInfo && additionalFormInfo.length !== 0 &&
                            <div style={elementContainerStyle}>
                                <InsightlyAdditionalForm
                                    additionalFormInfo={additionalFormInfo}
                                    setSubmission={setAdditionalSubmission}
                                    style={labelStyle}
                                />
                            </div>
                        }
                        {platform === 'clio' && additionalFormInfo && additionalFormInfo.length !== 0 &&
                            <div style={elementContainerStyle}>
                                <ClioAdditionalForm
                                    additionalFormInfo={additionalFormInfo}
                                    setSubmission={setAdditionalSubmission}
                                    style={labelStyle}
                                />
                            </div>
                        }
                        {platform === 'bullhorn' && additionalFormInfo && additionalFormInfo.length !== 0 &&
                            <div style={elementContainerStyle}>
                                <BullhornAdditionalForm
                                    additionalFormInfo={additionalFormInfo}
                                    setSubmission={setAdditionalSubmission}
                                    style={labelStyle}
                                />
                            </div>
                        }
                    </div>
                )
            }
        </div>
    )
}