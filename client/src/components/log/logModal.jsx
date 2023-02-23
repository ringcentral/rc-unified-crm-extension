import {
    RcTextarea,
    RcText,
    RcLoading,
    RcIconButton,
    RcDivider
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
        margin: '0px auto 5px auto',
        color: '#2f2f2f',
        fontSize: '20px'
    }
    const elementContainerStyle = {
        padding: '2px 20px'
    }
    const labelStyle = {
        color: '#2f2f2f',
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
        fontSize: '13px'
    }
    const contentStyle = {
        color: '#97979',
        marginLeft: '15px',
        fontFamily: 'Lato, Helvetica, Arial, sans-serif',
        fontSize: '14px'
    }
    const dividerStyle = {
        right: '4%',
        margin: '0% 8%',
        width: '92%'
    }
    const noteStyle = {
        right: '7%',
        margin: '2% 14%',
        width: '86%'
    }
    const buttonStyle = {
        color: '#808080'
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
                                size='medium'
                                style={buttonStyle}
                            />
                            <RcIconButton
                                onClick={onSubmission}
                                symbol={Check}
                                size='large'
                                style={buttonStyle}
                            /></div>
                        <RcText style={titleStyle} >Sync {logType} Log</RcText>
                        <div style={elementContainerStyle}>
                            <RcText style={labelStyle} >Phone No.:</RcText>
                            <RcText style={contentStyle} variant='body1'>{phoneNumber}{direction}</RcText>
                        </div>
                        <RcDivider style={dividerStyle} />
                        <div style={elementContainerStyle}>
                            <RcText style={labelStyle} >Contact:</RcText>
                            <RcText style={contentStyle} variant='body1'>{contactName}</RcText>
                        </div>
                        <RcDivider style={dividerStyle} />
                        <div style={elementContainerStyle}>
                            <RcText style={labelStyle} >Time:</RcText>
                            <RcText style={contentStyle} variant='body1'>{moment(dateTime).isSame(moment(), 'day') ? moment(dateTime).format('hh:mm:ss A') : dateTime}</RcText>
                        </div>
                        <RcDivider style={dividerStyle} />
                        {logType === 'Call' &&
                            <div style={elementContainerStyle}>
                                <RcText style={labelStyle} >Duration:</RcText>
                                <RcText style={contentStyle} variant='body1'>{duration}</RcText>
                            </div>
                        }
                        <RcDivider style={dividerStyle} />
                        {logType === 'Call' &&
                            <RcTextarea
                                style={noteStyle}
                                label='Note'
                                onChange={onChangeNote}
                                value={note}></RcTextarea>
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
                    </div>
                )
            }
        </div>
    )
}