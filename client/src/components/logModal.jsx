import {
    RcTextarea,
    RcThemeProvider,
    RcText,
    RcLoading,
    RcIconButton
} from '@ringcentral/juno';
import { ChevronLeft, Check } from '@ringcentral/juno-icon';
import React, { useState, useEffect } from 'react';
import { syncLog } from '../core/log';
import moment from 'moment';
import { secondsToHourMinuteSecondString } from '../lib/util';

const logEvents = [];

// TODO: add loading animation
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
    const loadingStyle = {
        width: '100%',
        height: '100%',
        background: '#ffffffb5',
        position: 'absolute',
        zIndex: '15'
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

    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [logType, setLogType] = useState('');
    const [logInfo, setLogInfo] = useState(null);
    const [isManual, setIsManual] = useState(false);
    const [contactName, setContactName] = useState('');
    const [direction, setDirection] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [duration, setDuration] = useState('');
    const [isLoading, setLoading] = useState(false);

    function onEvent(e) {
        if (!e || !e.data || !e.data.type) {
            return
        }
        const { type, logProps } = e.data
        if (type === 'rc-log-modal') {
            logEvents.push({ type, logProps });
            setupModal();
            setIsManual(!!logProps.isManual);
        }
    }

    function setupModal() {
        setIsOpen(true);
        setLogInfo(logEvents[0].logProps.logInfo);
        setNote('');
        setLogType(logEvents[0].logProps.logType);
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
                setContactName('WIP - add name');
                setPhoneNumber(logEvents[0].logProps.logInfo.correspondents[0].phoneNumber);
                setDateTime(moment(logEvents[0].logProps.logInfo.messages[0].lastModifiedTime).format('YYYY-MM-DD hh:mm:ss A'));
                break;
        }
        document.getElementById('rc-widget').style.zIndex = 0;
    }

    useEffect(() => {
        window.addEventListener('message', onEvent)
        return () => {
            window.removeEventListener('message', onEvent)
        }
    }, [])

    async function onSubmission() {
        try {
            setLoading(true);
            await syncLog({
                logType,
                logInfo,
                note,
                isManual
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
        <RcThemeProvider>
            {isLoading && <RcLoading style={loadingStyle} loading={isLoading} />}
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
                    </div>
                )
            }
        </RcThemeProvider >
    )
}