const axios = require('axios');
require('dotenv').config();

function run() {
    let count = 0;
    let startTime = new Date();

    // Burst time point in minutes
    // const burstTimePoints = [
    //     {
    //         start: 10,
    //         end: 11
    //     },
    //     {
    //         start: 30,
    //         end: 32
    //     },
    //     {
    //         start: 50,
    //         end: 53
    //     }
    // ];
    const burstTimePoints = [
        {
            start: 1,
            end: 2
        },
        {
            start: 3,
            end: 5
        },
        {
            start: 6,
            end: 9
        }
    ];

    const callCreateLogAPI = async () => {
        try {
            const response = await axios.post(process.env.TEST_ENDPOINT_CREATE_LOG,
                {
                    sessionId: `mock-${count.toString()}`
                }
            );
            count++;
            console.log(`Burst Burst ${count} times called API`);
        } catch (error) {
            console.error('Error calling API:', error);
            clearInterval(intervalId);
            console.log('Stopped calling API');
            console.log(`Time spent: ${(new Date() - startTime) / 1000 / 60}min`);
        }
    };

    const callGetLogAPI = async () => {
        try {
            const response = await axios.get(process.env.TEST_ENDPOINT_GET_LOG);
            count++;
            console.log(`Burst ${count} times called API`);
        } catch (error) {
            console.error('Error calling API:', error);
            clearInterval(intervalId);
            console.log('Stopped calling API');
            console.log(`Time spent: ${(new Date() - startTime) / 1000 / 60}min`);
        }
    };

    let intervalId;

    for (const bt of burstTimePoints) {
        setTimeout(async () => {
            intervalId = setInterval(() => {
                callCreateLogAPI();
                callGetLogAPI();
                callGetLogAPI();
                callGetLogAPI();
            }, 235);
            console.log('Start burst calling API');
        }, bt.start * 60 * 1000);
        setTimeout(async () => {
            clearInterval(intervalId);
            console.log('Stopped calling API');
        }, bt.end * 60 * 1000);
    }
}

exports.run = run;