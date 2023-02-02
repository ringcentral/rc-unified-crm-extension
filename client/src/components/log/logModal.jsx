import {
    RcTextarea,
    RcText,
    RcLoading,
    RcIconButton
} from '@ringcentral/juno';
import { ChevronLeft, Check } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { addLog, getCachedNote } from '../../core/log';
import moment from 'moment';
import { secondsToHourMinuteSecondString } from '../../lib/util';
import PipedriveAdditionalForm from './PipedriveAdditionalForm';
import InsightlyAdditionalForm from './InsightlyAdditionalForm';

const logEvents = [];

export default () => {
    const modalStyle = {
        height: '100%',
        width: '100%',
        position: 'absolute',
        zIndex: '10',
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
        margin: '0px auto 15px auto'
    }
    const labelStyle = {
        marginLeft: '15px'
    }
    const contentStyle = {
        marginLeft: '25px',
        marginBottom: '5px'
    }
    const noteStyle = {
        right: '5%',
        margin: '0% 10%',
        width: '90%'
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

    async function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return;
        }
        const { type, platform, logProps, additionalLogInfo } = e.data
        if (type === 'rc-log-modal') {
            setPlatform(platform);
            logEvents.push({ type, logProps, additionalLogInfo });
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
        const cachedNote = await getCachedNote({ sessionId: logEvents[0].logProps.logInfo.sessionId });
        setIsOpen(true);
        setLogInfo(logEvents[0].logProps.logInfo);
        setIsToday(logEvents[0].logProps.isToday);
        setNote(cachedNote);
        setLogType(logEvents[0].logProps.logType);
        setAdditionalFormInfo(logEvents[0].additionalLogInfo);
        switch (logEvents[0].logProps.logType) {
            case 'Call':
                setDirection(` (${logEvents[0].logProps.logInfo.direction})`);
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
        window.addEventListener('message', onEvent);
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    async function onSubmission() {
        try {
            setLoading(true);
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
        setIsOpen(false);
        logEvents.shift();  // array FIFO
        if (logEvents.length > 0) {
            setupModal();
        }
    }

    function onChangeNote(e) {
        setNote(e.target.value);
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
                                size='xlarge'
                                color='action.primary'
                            />
                            <RcIconButton
                                onClick={onSubmission}
                                symbol={Check}
                                size='xxlarge'
                                color='action.primary'
                            /></div>
                        <RcText style={titleStyle} variant='title2'>Sync {logType} Log</RcText>
                        <RcText style={labelStyle} variant='caption2'>Phone No.:</RcText>
                        <RcText style={contentStyle} variant='body1'>{phoneNumber}{direction}</RcText>
                        <RcText style={labelStyle} variant='caption2'>Contact:</RcText>
                        <RcText style={contentStyle} variant='body1'>{contactName}</RcText>
                        <RcText style={labelStyle} variant='caption2'>Time:</RcText>
                        <RcText style={contentStyle} variant='body1'>{moment(dateTime).isSame(moment(), 'day') ? moment(dateTime).format('hh:mm:ss A') : dateTime}</RcText>
                        {logType === 'Call' && <RcText style={labelStyle} variant='caption2'>Duration:</RcText>}
                        {logType === 'Call' && <RcText style={contentStyle} variant='body1'>{duration}</RcText>}
                        {logType === 'Call' && <RcTextarea
                            style={noteStyle}
                            label='Note'
                            onChange={onChangeNote}
                            value={note}
                        ></RcTextarea>}
                        {platform === 'pipedrive' && additionalFormInfo && <PipedriveAdditionalForm
                            additionalFormInfo={additionalFormInfo}
                            setSubmission={setAdditionalSubmission}
                            style={labelStyle}
                        />}
                        {platform === 'insightly' && additionalFormInfo && <InsightlyAdditionalForm
                            additionalFormInfo={additionalFormInfo}
                            setSubmission={setAdditionalSubmission}
                            style={labelStyle}
                        />}
                    </div>
                )
            }
        </div>
    )
}