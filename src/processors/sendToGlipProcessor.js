const axios = require('axios');
const { CacheModel } = require('@app-connect/core/models/cacheModel');

async function sendToGlip({ data, taskId }) {
    // wait for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    const webhookUrl = 'https://hooks.ringcentral.com/webhook/v2/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvdCI6ImMiLCJvaSI6IjQzOTE4MzAzMjMzIiwiaWQiOiIzNDkwNjc2NzYzIn0.e2_KwAjL2h2FRJoAer7Nv2NgOZvb_Gw6Rexoj22oayk';
    const response = await axios.post(webhookUrl, {
        text: data.text
    },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );
    await CacheModel.update(
        {
            status: 'completed'
        },
        {
            where: {
                id: taskId
            }
        }
    );
    return response.data;
}

exports.sendToGlip = sendToGlip;