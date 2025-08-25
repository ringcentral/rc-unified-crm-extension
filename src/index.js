const {
    createCoreApp,
    adapterRegistry
} = require('@app-connect/core');
const path = require('path');
const { UserModel } = require('@app-connect/core/models/userModel');
const jwt = require('@app-connect/core/lib/jwt');
const axios = require('axios');
const bullhorn = require('./adapters/bullhorn');
const clio = require('./adapters/clio');
const googleSheets = require('./adapters/googleSheets');
const insightly = require('./adapters/insightly');
const netsuite = require('./adapters/netsuite');
const pipedrive = require('./adapters/pipedrive');
const redtail = require('./adapters/redtail');
const testCRM = require('./adapters/testCRM');
const googleSheetsExtra = require('./adapters/googleSheets/extra.js');
const moment = require('moment');

// Register adapters
adapterRegistry.setDefaultManifest(require('./adapters/manifest.json'));
adapterRegistry.setReleaseNotes(require('./releaseNotes.json'));

adapterRegistry.registerAdapter('bullhorn', bullhorn);
adapterRegistry.registerAdapter('clio', clio);
adapterRegistry.registerAdapter('googleSheets', googleSheets);
adapterRegistry.registerAdapter('insightly', insightly);
adapterRegistry.registerAdapter('netsuite', netsuite);
adapterRegistry.registerAdapter('pipedrive', pipedrive);
adapterRegistry.registerAdapter('redtail', redtail);
adapterRegistry.registerAdapter('testCRM', testCRM, require('./adapters/testCRM/manifest.json'));

// Create Express app with core functionality
const app = createCoreApp();

// Add custom routes for specific adapters
// Google Sheets specific routes
app.get('/googleSheets/filePicker', async function (req, res) {
    try {
        const jwtToken = req.query.token;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
                return;
            }
            const fileContent = await googleSheetsExtra.renderPickerFile({ user });
            res.send(fileContent);
        }
    }
    catch (e) {
        console.log(`platform: googleSheets \n${e.stack}`);
        res.status(500).send(e);
    }
});

app.post('/googleSheets/sheet', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
                return;
            }
            const { successful, sheetName, sheetUrl } = await googleSheetsExtra.createNewSheet({ user, data: req.body });
            if (successful) {
                res.status(200).send({
                    name: sheetName,
                    url: sheetUrl
                });
                return;
            }
            else {
                res.status(500).send('Failed to create new sheet');
                return;
            }
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            return;
        }
    }
    catch (e) {
        console.log(`platform: googleSheets \n${e.stack}`);
        res.status(500).send(e);
    }
});

app.delete('/googleSheets/sheet', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
            }
            await googleSheetsExtra.removeSheet({ user });
            res.status(200).send('Sheet removed');
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(`platform: googleSheets \n${e.stack}`);
        res.status(500).send(e);
    }
});

app.post('/googleSheets/selectedSheet', async function (req, res) {
    const authHeader = `Bearer ${req.body.accessToken}`;
    const response = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: {
            Authorization: authHeader
        }
    });
    const data = response?.data;
    const user = await UserModel.findByPk(data?.sub);
    if (!user) {
        res.status(400).send();
    }
    const { successful, sheetName, sheetUrl } = await googleSheetsExtra.updateSelectedSheet({ user, data: req.body });

    res.status(200).send({ message: 'Sheet selected', Id: req.body.field });
});

// Pipedrive specific routes
app.get('/pipedrive-redirect', function (req, res) {
    try {
        res.sendFile(path.join(__dirname, 'adapters/pipedrive/redirect.html'));
    }
    catch (e) {
        console.log(`platform: pipedrive \n${e.stack}`);
        res.status(500).send(e);
    }
});

app.delete('/pipedrive-redirect', async function (req, res) {
    try {
        const basicAuthHeader = Buffer.from(`${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`).toString('base64');
        if (`Basic ${basicAuthHeader}` === req.get('authorization')) {
            const platformModule = require(`./adapters/pipedrive`);
            await platformModule.unAuthorize({ id: req.body.user_id });
            await UserModel.destroy({
                where: {
                    id: req.body.user_id,
                    platform: 'pipedrive'
                }
            });
        }
    }
    catch (e) {
        console.log(`platform: pipedrive \n${e.stack}`);
        res.status(500).send(e);
    }
});

// ========== Monthly Bullhorn CSV Report (runs on the 20th of each month) ==========

function scheduleBullhornMonthlyReport() {
    if (process.env.ENABLE_BULLHORN_REPORT !== 'true') {
        return;
    }
    const MAX_TIMEOUT = 2147483647; // ~24.8 days
    const scheduleAt = (nextRunMoment) => {
        const now = moment.utc();
        let delayMs = nextRunMoment.diff(now);
        if (delayMs <= 0) {
            delayMs = 1000;
        }
        if (delayMs > MAX_TIMEOUT) {
            setTimeout(() => scheduleAt(nextRunMoment), MAX_TIMEOUT);
            return;
        }
        setTimeout(async () => {
            try {
                await bullhorn.generateMonthlyCsvReport();
            } catch (e) {
                console.log('Bullhorn monthly report error', e?.message);
            } finally {
                scheduleNext();
            }
        }, delayMs);
    };
    const scheduleNext = () => {
        const now = moment.utc();
        let next = now.clone().date(20).hour(2).minute(0).second(0).millisecond(0);
        if (now.isAfter(next)) {
            next = next.add(1, 'month');
        }
        scheduleAt(next);
    };
    scheduleNext();
}

// Kick off scheduler
scheduleBullhornMonthlyReport();

exports.getServer = function getServer() {
    return app;
}