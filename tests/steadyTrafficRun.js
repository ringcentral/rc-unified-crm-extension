const axios = require('axios');
require('dotenv').config();
function run(){
    let count = 0;
    let startTime = new Date();

    const registerUser = async () => {
        try {
            const response = await axios.post(process.env.TEST_ENDPOINT_CREATE_USER);
            console.log(response.data);
        }
        catch (error) {
            console.error('Error registering user:', error);
        }
    }

    registerUser();

    // const trafficLastingTime = 60; // in minutes
    const trafficLastingTime = 10; // in minutes

    const callCreateLogAPI = async () => {
        try {
            const response = await axios.post(process.env.TEST_ENDPOINT_CREATE_LOG,
                {
                    sessionId: `mock-${count.toString()}`
                }
            );
            count++;
            console.log(`Steady ${count} times called API`);
        } catch (error) {
            console.error('Error calling API:', error);
            clearInterval(intervalId);
            await clearLogAPI();
            console.log('Stopped calling API');
            console.log(`Time spent: ${(new Date() - startTime) / 1000 / 60}min`);
        }
    };

    const callGetLogAPI = async () => {
        try {
            const response = await axios.get(process.env.TEST_ENDPOINT_GET_LOG);
            count++;
            console.log(`Steady ${count} times called API`);
        } catch (error) {
            console.error('Error calling API:', error);
            clearInterval(intervalId);
            await clearLogAPI();
            console.log('Stopped calling API');
            console.log(`Time spent: ${(new Date() - startTime) / 1000 / 60}min`);
        }
    };

    const clearLogAPI = async () => {
        try {
            const response = await axios.delete(process.env.TEST_ENDPOINT_CLEAR_LOG);
            console.log(response.data);
        }
        catch (error) {
            console.error('Error clearing logs:', error);
            clearInterval(intervalId);
            await clearLogAPI();
            console.log('Stopped calling API');
            console.log(`Time spent: ${(new Date() - startTime) / 1000 / 60}min`);
        }
    }

    const intervalId = setInterval(() => {
        callCreateLogAPI();
        callGetLogAPI();
        callGetLogAPI();
        callGetLogAPI();
    }, 235);

    // Execute for 60min, send 17 calls/sec => 1000 calls/min => 60000 calls/hour. 60000 calls in total.
    setTimeout(async () => {
        clearInterval(intervalId);
        await clearLogAPI();
        console.log('Stopped calling API');
        console.log(`Time spent: ${(new Date() - startTime) / 1000 / 60}min`);
    }, trafficLastingTime * 60 * 1000);
}

exports.run = run;