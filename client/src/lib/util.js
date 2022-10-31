function secondsToHourMinuteSecondString(totalSeconds){
    const hours = parseInt(totalSeconds / 3600);
    const hourString = hours === 0 ? '' : `${hours} hour(s)`;
    const minutes = parseInt((totalSeconds - 3600 * hours) / 60);
    const minuteString = (hours === 0 && minutes === 0) ? '' : `${minutes} minute(s)`;
    const seconds = parseInt(totalSeconds - 3600 * hours - 60 * minutes);
    const secondString = `${seconds} second(s)`;
    return `${hourString}${minuteString}${secondString}`;
}

exports.secondsToHourMinuteSecondString = secondsToHourMinuteSecondString;