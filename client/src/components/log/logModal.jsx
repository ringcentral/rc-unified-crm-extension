import {
    RcTextarea,
    RcTextField,
    RcText,
    RcLoading,
    RcIconButton,
    RcDivider,
    RcButton,
    RcLink,
} from '@ringcentral/juno';
import styled from 'styled-components';
import { ChevronLeft } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { addLog, updateLog, getCachedNote } from '../../core/log';
import { createContact, openContactPageById } from '../../core/contact';
import moment from 'moment';
import { secondsToHourMinuteSecondString } from '../../lib/util';
import DropdownList from '../dropdownList';
import PipedriveAdditionalForm from './PipedriveAdditionalForm';
import InsightlyAdditionalForm from './InsightlyAdditionalForm';
import ClioAdditionalForm from './ClioAdditionalForm';
import BullhornAdditionalForm from './BullhornAdditionalForm';
import config from '../../config';

const ModalContainer = styled.div`
height: 100%;
width: 100%;
position: absolute;
z-index: 100;
background: rgb(255 255 255);
display: flex;
justify-content: flex-start;
flex-direction: column;
align-items: flex-start;
overflow: hidden auto;
`;

const TopBar = styled.div`
display: flex;
justify-content: space-between;
width: 100%;
align-items: center;
`;

const ElementContainer = styled.div`
padding: 3px 20px;
`;

const ContentContainer = styled.div`
width: 100%;
`;

const ContentRow = styled.div`
display: flex;
width: 100%;
`;

const Label = styled(RcText)`
font-size: 0.8rem;
font-weight: 700;
font-family: Lato, Helvetica, Arial, sans-serif;
line-height: 16px;
color: #666666;
`;

const Content = styled(RcText)`
color: #97979;
font-family: Lato, Helvetica, Arial, sans-serif;
font-size: 14px;
padding-left: 3px;
`;

const Divider = styled(RcDivider)`
margin: 0px 0px 10px;
`;

const InputAreaContainer = styled.div`
padding: 3px 20px;
`;

const Note = styled(RcTextarea)`
width: 100%;
.RcTextFieldInput-root textarea {
    font-size: 14px;
    line-height: 18px;
    padding: 3px;
}
`;

const LoadingText = styled.p`
position: absolute;
width: 100%;
text-align: center;
top: 48%;
font-weight: bold;
font-size: 13px;
`;

const NewContactNameInput = styled(RcTextField)`
.RcTextFieldInput-root input{
    font-size: 14px;
    padding: 3px;
}
`;

const ContactWarningMessage = styled(RcText)`
background: #ffeeba;
font-size: 11px;
padding: 7px;
border-radius: 4px;
height: auto;
text-wrap: wrap;
line-height: 15px;
`;

const logEvents = [];
let trailingLogInfo = [];
let countdownIntervalId = '';
let crmUserName = '';
let additionalSubmission = {};

export default () => {

    const [platform, setPlatform] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [logType, setLogType] = useState('');
    const [logInfo, setLogInfo] = useState(null);
    const [matchedContacts, setMatchedContacts] = useState([]);
    const [selectedContact, setSelectedContact] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newContactType, setNewContactType] = useState('');
    const [direction, setDirection] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [duration, setDuration] = useState('');
    const [isLoading, setLoading] = useState(false);
    const [isActivityTitleEdited, setIsActivityTitleEdited] = useState(false);
    const [loadingCount, setLoadingCount] = useState(-1);
    const [additionalFormInfo, setAdditionalFormInfo] = useState([]);
    const [customSubject, setCustomSubject] = useState('');
    const [countdown, setCountdown] = useState(20);
    const [countdownFinished, setCountdownFinished] = useState(false);
    const [messageLogCount, setMessageLogCount] = useState(0);
    const [messageStartDate, setMessageStartDate] = useState('');
    const [isExisting, setIsExisting] = useState(false);

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        const { type, platform, trailingSMSLogInfo, isTrailing, logProps, triggerType, existingCallLog } = e.data
        if (type === 'rc-log-modal') {
            setPlatform(platform);
            setIsExisting(!!existingCallLog);
            setLoadingCount(-1);
            crmUserName = logProps.crmUserInfo.name;
            switch (logProps.logType) {
                case 'Call':
                    // no trigger type means manual trigger
                    await setupModal({ crmPlatform: platform, logProps, isManualTrigger: !!!triggerType, existingCallLog });
                    break;
                case 'Message':
                    if (isTrailing) {
                        trailingLogInfo.push(logProps.logInfo);
                        setMessageLogCount(messageLogCount + logProps.logInfo.messages.length);
                        setMessageStartDate(logProps.logInfo.date);
                    }
                    else {
                        // no trigger type means manual trigger
                        await setupModal({ crmPlatform: platform, logProps, isManualTrigger: !!!triggerType });
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

    async function setupModal({ crmPlatform, logProps, isManualTrigger, existingCallLog }) {
        clearInterval(countdownIntervalId);
        const cachedNote = await getCachedNote({ sessionId: logProps.logInfo.sessionId });
        setIsActivityTitleEdited(false);
        setIsOpen(true);
        setIsActivityTitleEdited(false);
        setLogInfo(logProps.logInfo);
        setNote(cachedNote);
        setNewContactName('');
        if (!!config.platformsWithDifferentContactType[crmPlatform]) {
            setNewContactType(config.platformsWithDifferentContactType[crmPlatform][0]);
        }
        else {
            setNewContactType('');
        }
        setLogType(logProps.logType);
        if (logProps.autoLog) {
            let { autoLogCountdown } = await chrome.storage.local.get(
                { autoLogCountdown: '20' }
            );
            setCountdown(Number(autoLogCountdown));
            setCountdownFinished(false);
            countdownIntervalId = setInterval(() => {
                setCountdown(c => { return c - 1; });
            }, 1000);
        }
        if (!logProps.autoLog || isManualTrigger) {
            stopCountDown();
        }
        const contactOptions = logProps.contacts.map(c => {
            return {
                value: c.id,
                display: c.name,
                type: c.type ?? "",
                secondaryDisplay: c.type ? `${c.type} - ${c.id}` : "",
                name: c.name,
                additionalFormInfo: c.additionalInfo
            }
        });
        contactOptions.push({ value: 'createPlaceholderContact', display: 'Create placeholder contact...' });
        setAdditionalFormInfo(contactOptions[0].additionalFormInfo);
        switch (logProps.logType) {
            case 'Call':
                setMatchedContacts(contactOptions);
                setDirection(logProps.logInfo.direction);
                setSelectedContact(contactOptions[0].value);
                setPhoneNumber(logProps.logInfo.direction === 'Inbound' ? logProps.logInfo.from.phoneNumber : logProps.logInfo.to.phoneNumber);
                setDateTime(moment(logProps.logInfo.startTime).format('YYYY-MM-DD hh:mm:ss A'));
                setDuration(secondsToHourMinuteSecondString(logProps.logInfo.duration));
                if(!!existingCallLog)
                {
                    setNote(existingCallLog.note);
                    setCustomSubject(existingCallLog.subject);
                }
                break;
            case 'Message':
                setMatchedContacts(contactOptions);
                setDirection('');
                setSelectedContact(contactOptions[0].value);
                setPhoneNumber(logProps.logInfo.correspondents[0].phoneNumber);
                setDateTime(moment(logProps.logInfo.messages[0].lastModifiedTime).format('YYYY-MM-DD hh:mm:ss A'));
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

    useEffect(() => {
        if (isActivityTitleEdited) {
            return;
        }
        if (selectedContact === 'createPlaceholderContact') {
            setCustomSubject(`${logInfo?.direction} call from ${logInfo?.direction === 'Inbound' ? `${newContactName} to ${crmUserName}` : `${crmUserName} to ${newContactName}`}`);
        }
        else {
            setCustomSubject(`${logInfo?.direction} call from ${logInfo?.direction === 'Inbound' ? `${matchedContacts.find(c => c.value === selectedContact)?.name} to ${crmUserName}` : `${crmUserName} to ${matchedContacts.find(c => c.value === selectedContact)?.name}`}`);
        }
    }, [selectedContact, logInfo, newContactName])

    useEffect(() => {
        if (selectedContact === 'createPlaceholderContact') {
            setAdditionalFormInfo(null);
        }
        else {
            setAdditionalFormInfo(matchedContacts.find(m => m.value == selectedContact)?.additionalFormInfo);
        }
    }, [selectedContact]);

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
            let overridingContactId = '';
            if (!!newContactName) {
                const createContactResp = await createContact({
                    phoneNumber,
                    newContactName,
                    newContactType
                })
                overridingContactId = createContactResp.contactInfo.id;
            }
            else {
                overridingContactId = selectedContact;
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
            const { crmUserInfo } = await chrome.storage.local.get({ crmUserInfo: null });
            if (!!crmUserInfo && !!crmUserInfo.name) {
                additionalSubmission['crmUserName'] = crmUserInfo.name;
            }
            if (isExisting) {
                await updateLog({
                    logType,
                    logInfo,
                    note,
                    sessionId: logInfo.sessionId
                });
            }
            else {
                await addLog({
                    logType,
                    logInfo,
                    isMain: true,
                    note,
                    additionalSubmission,
                    overridingContactId,
                    contactType: matchedContacts.find(c => c.value === selectedContact)?.type ?? newContactType,
                    contactName: matchedContacts.find(c => c.value === selectedContact)?.name ?? newContactName
                });
            }
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
                if (logInfo['newContactType']) {
                    delete logInfo['newContactType'];
                }
                for (const extraLogInfo of trailingLogInfo) {
                    await addLog({
                        logType,
                        logInfo: extraLogInfo,
                        isMain: false,
                        note,
                        additionalSubmission,
                        overridingContactId
                    });
                    loggedMessageCount += extraLogInfo.messages.length;
                    setLoadingCount(loggedMessageCount);
                    await chrome.storage.local.set({ [extraLogInfo.conversationLogId]: extraLogInfo.conversationLogId });
                }
                trailingLogInfo = [];
                setLoadingCount(-1);
            }
            if (!!newContactName) {
                const { extensionUserSettings } = await chrome.storage.local.get({ extensionUserSettings: null });
                if (extensionUserSettings && (extensionUserSettings.find(e => e.name === 'Open contact web page after creating it') == null) || extensionUserSettings.find(e => e.name === 'Open contact web page after creating it').value) {
                    openContactPageById({ id: overridingContactId, type: newContactType });
                }
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
        setAdditionalFormInfo(matchedContacts.find(m => m.value == selection)?.additionalFormInfo);
        stopCountDown();
    }

    function onChangeNewContactName(e) {
        setNewContactName(e.target.value);
        stopCountDown();
    }
    function onChangeNewContactType(e) {
        setNewContactType(e);
        stopCountDown();
    }

    function updateAdditionalSubmission(submission) {
        additionalSubmission = submission;
    }

    return (
        <div>
            <RcLoading loading={isLoading} />
            {
                isOpen && (
                    <ModalContainer>
                        {loadingCount >= 0 &&
                            <LoadingText>
                                {loadingCount}/{messageLogCount}
                            </LoadingText>}
                        <TopBar>
                            <RcIconButton
                                onClick={closeModal}
                                symbol={ChevronLeft}
                                color='action.primary'
                                size='medium'
                            />
                            <RcText
                                variant='title1'
                            >{logType === 'Call' ? logType : 'Conversation'} details{isExisting ? ' (edit)' : ''}
                            </RcText>
                            <RcButton
                                onClick={onSubmission}
                                variant="plain"
                                style={{ paddingRight: '10px' }}
                                disabled={selectedContact === 'createPlaceholderContact' && newContactName === ''}
                            >
                                Save{countdownFinished ? '' : `(${countdown})`}
                            </RcButton>
                        </TopBar>
                        <Divider size='bold' color="action.grayDark" />
                        <ContentContainer>
                            <ContentRow>
                                <ElementContainer>
                                    <Label >Phone number</Label>
                                    <Content variant='body1'>{phoneNumber}</Content>
                                </ElementContainer>
                                {direction && <ElementContainer>
                                    <Label >Direction</Label>
                                    <Content variant='body1'>{direction}</Content>
                                </ElementContainer>}
                            </ContentRow>
                            {logType === 'Call' &&
                                <ElementContainer>
                                    <Label >Call time and duration</Label>
                                    <Content variant='body1'>{moment(dateTime).isSame(moment(), 'day') ? moment(dateTime).format('hh:mm:ss A') : dateTime} {duration}</Content>
                                </ElementContainer>
                            }
                            {matchedContacts.length === 1 &&
                                <ElementContainer>
                                    <ContactWarningMessage>No contact found. Enter a name to have a placeholder contact made for you.</ContactWarningMessage>
                                </ElementContainer>
                            }
                            {matchedContacts.length === 1 && (platform === 'clio' || platform === 'insightly') &&
                                <ElementContainer>
                                    <ContactWarningMessage>If the contact already exists.  consult our <RcLink variant="caption1" target='_blank' href='https://ringcentral.github.io/rc-unified-crm-extension/support/'>{platform} documentation</RcLink> to fix.</ContactWarningMessage>
                                </ElementContainer>
                            }
                            {matchedContacts.length > 2 &&
                                <ElementContainer>
                                    <ContactWarningMessage>Multiple contacts found. Please select the contact to associate this activity with.</ContactWarningMessage>
                                </ElementContainer>
                            }
                            {matchedContacts.length > 1 &&
                                <ElementContainer>
                                    <DropdownList
                                        key='key'
                                        label='Contact'
                                        selectionItems={matchedContacts}
                                        presetSelection={selectedContact}
                                        onSelected={onChangeSelectedContact}
                                        notShowNone={true}
                                    />
                                </ElementContainer>
                            }
                            {selectedContact === 'createPlaceholderContact' &&
                                <ElementContainer>
                                    <NewContactNameInput
                                        label='New contact name'
                                        placeholder='Enter new contact name...'
                                        fullWidth
                                        value={newContactName}
                                        onChange={onChangeNewContactName}
                                        required
                                    />
                                </ElementContainer>
                            }
                            {selectedContact === 'createPlaceholderContact' && !!config.platformsWithDifferentContactType[platform] &&
                                <ElementContainer>
                                    <DropdownList
                                        key='key'
                                        label='Contact type'
                                        selectionItems={config.platformsWithDifferentContactType[platform].map(t => { return { value: t, display: t } })}
                                        presetSelection={newContactType}
                                        onSelected={onChangeNewContactType}
                                        notShowNone={true}
                                    />
                                </ElementContainer>
                            }
                            {logType === 'Call' &&
                                <InputAreaContainer>
                                    <Note
                                        label='Activity title'
                                        onChange={onChangeCustomSubject}
                                        value={customSubject}
                                    />
                                </InputAreaContainer>
                            }
                            {logType === 'Call' &&
                                <InputAreaContainer>
                                    <Note
                                        label='Note'
                                        onChange={onChangeNote}
                                        value={note}
                                    />
                                </InputAreaContainer>
                            }
                            {logType === 'Message' &&
                                <ElementContainer>
                                    <Label >Message log summary</Label>
                                    <Content variant='body1'>Started on {moment(messageStartDate).format('YYYY/MM/DD')}</Content>
                                    <Content variant='body1'>Ended on {moment(dateTime).format('YYYY/MM/DD')}</Content>
                                    <Content variant='body1'>Total: {messageLogCount} messages</Content>
                                </ElementContainer>
                            }
                            {platform === 'pipedrive' &&
                                <ElementContainer>
                                    <PipedriveAdditionalForm
                                        additionalFormInfo={additionalFormInfo}
                                        setSubmission={updateAdditionalSubmission}
                                    />
                                </ElementContainer>
                            }
                            {platform === 'insightly' &&
                                <ElementContainer>
                                    <InsightlyAdditionalForm
                                        additionalFormInfo={additionalFormInfo}
                                        setSubmission={updateAdditionalSubmission}
                                    />
                                </ElementContainer>
                            }
                            {platform === 'clio' &&
                                <ElementContainer>
                                    <ClioAdditionalForm
                                        additionalFormInfo={additionalFormInfo}
                                        setSubmission={updateAdditionalSubmission}
                                        logType={logType}
                                        isExisting={isExisting}
                                    />
                                </ElementContainer>
                            }
                            {platform === 'bullhorn' &&
                                <ElementContainer>
                                    <BullhornAdditionalForm
                                        additionalFormInfo={additionalFormInfo}
                                        setSubmission={updateAdditionalSubmission}
                                    />
                                </ElementContainer>
                            }
                        </ContentContainer>
                    </ModalContainer>
                )
            }
        </div>
    )
}