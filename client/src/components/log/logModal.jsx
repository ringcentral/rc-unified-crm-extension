import {
    RcTextarea,
    RcTextField,
    RcText,
    RcLoading,
    RcIconButton,
    RcDivider,
    RcButton,
} from '@ringcentral/juno';
import { ChevronLeft } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { addLog, getCachedNote } from '../../core/log';
import { createContact } from '../../core/contact';
import moment from 'moment';
import { secondsToHourMinuteSecondString } from '../../lib/util';
import DropdownList from '../dropdownList';
import PipedriveAdditionalForm from './PipedriveAdditionalForm';
import InsightlyAdditionalForm from './InsightlyAdditionalForm';
import ClioAdditionalForm from './ClioAdditionalForm';
import BullhornAdditionalForm from './BullhornAdditionalForm';

const logEvents = [];
let trailingLogInfo = [];
let countdownIntervalId = '';
let crmUserName = '';

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
    const contentContainerStyle = {
        width: '100%'
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
        fontSize: '14px',
        paddingLeft: '3px'
    }
    const dividerStyle = {
        margin: '0px 0px 10px',
    }
    const inputAreaContainerStyle = {
        padding: '0px 20px'
    }
    const noteStyle = {
        width: '100%'
    }

    const loadingTextStyle = {
        position: 'absolute',
        width: '100%',
        textAlign: 'center',
        top: '48%',
        fontWeight: 'bold',
        fontSize: '13px'
    }

    const [platform, setPlatform] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [logType, setLogType] = useState('');
    const [logInfo, setLogInfo] = useState(null);
    const [isToday, setIsToday] = useState(null);
    const [matchedContacts, setMatchedContacts] = useState([]);
    const [selectedContact, setSelectedContact] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [direction, setDirection] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [duration, setDuration] = useState('');
    const [isLoading, setLoading] = useState(false);
    const [isActivityTitleEdited, setIsActivityTitleEdited] = useState(false);
    const [loadingCount, setLoadingCount] = useState(-1);
    const [additionalFormInfo, setAdditionalFormInfo] = useState([]);
    const [additionalSubmission, setAdditionalSubmission] = useState(null);
    const [customSubject, setCustomSubject] = useState('');
    const [countdown, setCountdown] = useState(20);
    const [countdownFinished, setCountdownFinished] = useState(false);
    const [messageLogCount, setMessageLogCount] = useState(0);
    const [messageStartDate, setMessageStartDate] = useState('');

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        const { type, platform, trailingSMSLogInfo, isTrailing, logProps, additionalLogInfo, triggerType } = e.data
        if (type === 'rc-log-modal') {
            setPlatform(platform);
            setLoadingCount(-1);
            switch (logProps.logType) {
                case 'Call':
                    // no trigger type means manual trigger
                    logEvents.push({ type, logProps, additionalLogInfo, isManualTrigger: !!!triggerType });
                    await setupModal();
                    break;
                case 'Message':
                    if (isTrailing) {
                        trailingLogInfo.push(logProps.logInfo);
                        setMessageLogCount(messageLogCount + logProps.logInfo.messages.length);
                        setMessageStartDate(logProps.logInfo.date);
                    }
                    else {
                        // no trigger type means manual trigger
                        logEvents.push({ type, logProps, additionalLogInfo, isManualTrigger: !!!triggerType });
                        await setupModal();
                        trailingLogInfo = trailingSMSLogInfo;
                        let messageCount = logProps.logInfo.messages.length;
                        setMessageStartDate(logProps.logInfo.date);
                        for (const trailingLog of trailingSMSLogInfo) {
                            messageCount += trailingLog.messages.length;
                            setMessageStartDate(trailingLog.date);
                        }
                        setMessageLogCount(messageCount);
                    }
                    break;
            }
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
        setNewContactName('');
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
        const contactOptions = logEvents[0].logProps.contacts.map(c => { return { value: c.name, display: c.name } });
        contactOptions.push({ value: 'createPlaceholderContact', display: 'Create placeholder contact...' });
        switch (logEvents[0].logProps.logType) {
            case 'Call':
                setMatchedContacts(contactOptions);
                setDirection(logEvents[0].logProps.logInfo.direction);
                setSelectedContact(contactOptions[0].value);
                setPhoneNumber(logEvents[0].logProps.logInfo.direction === 'Inbound' ? logEvents[0].logProps.logInfo.from.phoneNumber : logEvents[0].logProps.logInfo.to.phoneNumber);
                setDateTime(moment(logEvents[0].logProps.logInfo.startTime).format('YYYY-MM-DD hh:mm:ss A'));
                setDuration(secondsToHourMinuteSecondString(logEvents[0].logProps.logInfo.duration));
                break;
            case 'Message':
                setMatchedContacts(contactOptions);
                setDirection('');
                setSelectedContact(contactOptions[0].value);
                setPhoneNumber(logEvents[0].logProps.logInfo.correspondents[0].phoneNumber);
                setDateTime(moment(logEvents[0].logProps.logInfo.messages[0].lastModifiedTime).format('YYYY-MM-DD hh:mm:ss A'));
                break;
        }
        crmUserName = logEvents[0].logProps.crmUserInfo.name;
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

    useEffect(() => {
        if (isActivityTitleEdited) {
            return;
        }
        if (selectedContact === 'createPlaceholderContact') {
            setCustomSubject(`${logInfo?.direction} call from ${logInfo?.direction === 'Inbound' ? `${newContactName} to ${crmUserName}` : `${crmUserName} to ${newContactName}`}`);
        }
        else {
            setCustomSubject(`${logInfo?.direction} call from ${logInfo?.direction === 'Inbound' ? `${selectedContact} to ${crmUserName}` : `${crmUserName} to ${selectedContact}`}`);
        }
    }, [selectedContact, logInfo, newContactName])

    // any editing action would stop countdown
    function stopCountDown() {
        setCountdownFinished(true);
        clearInterval(countdownIntervalId);
    }

    async function onSubmission() {
        try {
            stopCountDown();
            setLoading(true);
            logInfo['customSubject'] = customSubject;
            logInfo['selectedContact'] = selectedContact;
            let newCreatedContactId = '';
            if(!!newContactName)
            {
                const createContactResp = await createContact({
                    phoneNumber,
                    newContactName
                })
                newCreatedContactId = createContactResp.contactInfo.id;
            }
            // Case: when log page is open and recording link is updated
            if (!logInfo.recording?.link) {
                const recordingSessionId = `rec-link-${logInfo.sessionId}`;
                const existingCallRecording = await chrome.storage.local.get(recordingSessionId);
                if (!!existingCallRecording[recordingSessionId]) {
                    logInfo['recording'] = {
                        link: existingCallRecording[recordingSessionId].recordingLink
                    }
                    await chrome.storage.local.remove(recordingSessionId);
                    console.log('call recording update done');
                }
            }
            let loggedMessageCount = 0;
            await addLog({
                logType,
                logInfo,
                isToday,
                isMain: true,
                note,
                additionalSubmission,
                overridingContactId: newCreatedContactId
            });
            if (logType === 'Message') {
                loggedMessageCount += logInfo.messages.length;
                setLoadingCount(loggedMessageCount);
            }
            await chrome.storage.local.set({ [logInfo.conversationLogId]: logInfo.conversationLogId });
            if (trailingLogInfo.length > 0) {
                // in case of trailing SMS requests creating to create duplicated new contacts
                if (logInfo['newContactName']) {
                    delete logInfo['newContactName'];
                }
                for (const extraLogInfo of trailingLogInfo) {
                    await addLog({
                        logType,
                        logInfo: extraLogInfo,
                        isToday: false,
                        isMain: false,
                        note,
                        additionalSubmission
                    });
                    loggedMessageCount += extraLogInfo.messages.length;
                    setLoadingCount(loggedMessageCount);
                    await chrome.storage.local.set({ [extraLogInfo.conversationLogId]: extraLogInfo.conversationLogId });
                }
                trailingLogInfo = [];
                setLoadingCount(-1);
            }
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

    function onChangeCustomSubject(e) {
        setCustomSubject(e.target.value);
        setIsActivityTitleEdited(true);
        stopCountDown();
    }

    function onChangeSelectedContact(selection) {
        setSelectedContact(selection);
        stopCountDown();
    }

    function onChangeNewContactName(e) {
        setNewContactName(e.target.value);
        stopCountDown();
    }

    return (
        <div>
            <RcLoading loading={isLoading} />
            {
                isOpen && (
                    <div style={modalStyle}>
                        {loadingCount >= 0 &&
                            <div style={loadingTextStyle}>
                                {loadingCount}/{messageLogCount}
                            </div>}
                        <div style={topBarStyle}>
                            <RcIconButton
                                onClick={closeModal}
                                symbol={ChevronLeft}
                                color='action.primary'
                                size='medium'
                            />
                            <RcText style={titleStyle} >{logType === 'Call' ? logType : 'Conversation'} details</RcText>
                            <RcButton
                                onClick={onSubmission}
                                variant="plain"
                                style={{ paddingRight: '10px' }}
                            >
                                Save{countdownFinished ? '' : `(${countdown})`}
                            </RcButton>
                        </div>
                        <RcDivider color="action.grayDark" style={dividerStyle} />
                        <div style={contentContainerStyle}>
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
                            {logType === 'Call' &&
                                <div style={elementContainerStyle}>
                                    <RcText style={labelStyle} >Call time and duration</RcText>
                                    <RcText style={contentStyle} variant='body1'>{moment(dateTime).isSame(moment(), 'day') ? moment(dateTime).format('hh:mm:ss A') : dateTime} {duration}</RcText>
                                </div>
                            }
                            <div style={elementContainerStyle}>
                                <DropdownList
                                    key='key'
                                    style={{ width: '100%' }}
                                    label='Contact'
                                    selectionItems={matchedContacts}
                                    presetSelection={selectedContact}
                                    onSelected={onChangeSelectedContact}
                                    notShowNone={true}
                                />
                            </div>
                            {selectedContact === 'createPlaceholderContact' &&
                                <div style={elementContainerStyle}>
                                    <RcTextField
                                        label='New contact name'
                                        placeholder='Enter new contact name...'
                                        fullWidth
                                        value={newContactName}
                                        onChange={onChangeNewContactName}
                                    />
                                </div>
                            }
                            {logType === 'Call' &&
                                <div style={inputAreaContainerStyle}>
                                    <RcTextarea
                                        style={noteStyle}
                                        label='Activity title'
                                        onChange={onChangeCustomSubject}
                                        value={customSubject}
                                    />
                                </div>
                            }
                            {logType === 'Call' &&
                                <div style={inputAreaContainerStyle}>
                                    <RcTextarea
                                        style={noteStyle}
                                        label='Note'
                                        onChange={onChangeNote}
                                        value={note}
                                    />
                                </div>
                            }
                            {logType === 'Message' &&
                                <div style={elementContainerStyle}>
                                    <RcText style={labelStyle} >Message log summary</RcText>
                                    <RcText style={contentStyle} variant='body1'>Started on {moment(messageStartDate).format('YYYY/MM/DD')}</RcText>
                                    <RcText style={contentStyle} variant='body1'>Ended on {moment(dateTime).format('YYYY/MM/DD')}</RcText>
                                    <RcText style={contentStyle} variant='body1'>Total: {messageLogCount} messages</RcText>
                                </div>
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
                    </div>
                )
            }
        </div>
    )
}