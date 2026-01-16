const {
    createCoreApp,
    connectorRegistry,
    proxyConnector
} = require('@app-connect/core');
const path = require('path');
const { UserModel } = require('@app-connect/core/models/userModel');
const jwt = require('@app-connect/core/lib/jwt');
const axios = require('axios');
const authCore = require('@app-connect/core/handlers/auth');
const bullhorn = require('./connectors/bullhorn');
const clio = require('./connectors/clio');
const googleSheets = require('./connectors/googleSheets');
const insightly = require('./connectors/insightly');
const netsuite = require('./connectors/netsuite');
const pipedrive = require('./connectors/pipedrive');
const redtail = require('./connectors/redtail');
const googleSheetsExtra = require('./connectors/googleSheets/extra.js');
const adminCore = require('@app-connect/core/handlers/admin');
const piiRedactionProcessor = require('./processors/piiRedactionProcessor');
const googleDriveProcessor = require('./processors/googleDriveProcessor');

// Register connectors
connectorRegistry.setDefaultManifest(require('./connectors/manifest.json'));
connectorRegistry.setReleaseNotes(require('./releaseNotes.json'));

connectorRegistry.registerConnector('bullhorn', bullhorn);
connectorRegistry.registerConnector('clio', clio);
connectorRegistry.registerConnector('googleSheets', googleSheets);
connectorRegistry.registerConnector('insightly', insightly);
connectorRegistry.registerConnector('netsuite', netsuite);
connectorRegistry.registerConnector('pipedrive', pipedrive);
connectorRegistry.registerConnector('redtail', redtail);
connectorRegistry.registerConnector('proxy', proxyConnector);

// Create Express app with core functionality
const app = createCoreApp();

const { PtpUserModel } = require('./processors/models/ptpUserModel');
const { GoogleDriveFileModel } = require('./processors/models/googleDriveFileModel');
async function initDB() {
    if (!process.env.DISABLE_SYNC_DB_TABLE) {
        console.log('creating db tables if not exist...');
        await PtpUserModel.sync();
        await GoogleDriveFileModel.sync();
    }
}

initDB();

// Add custom routes for specific connectors
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
        } else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
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
                return;
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
    const user = await UserModel.findByPk(`${data?.sub}-googleSheets`);
    if (!user) {
        res.status(400).send('User not found');
        return;
    }
    const { successful, sheetName, sheetUrl } = await googleSheetsExtra.updateSelectedSheet({ user, data: req.body });

    res.status(200).send({ message: 'Sheet selected', Id: req.body.field });
});

// Google Sheets admin routes
app.get('/admin/googleSheets/filePicker', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send('User not found');
                return;
            }
            const fileContent = await googleSheetsExtra.renderAdminPickerFile({ user, rcAccessToken: req.query.rcAccessToken });
            res.send(fileContent);
        } else {
            res.status(400).send('Please authorize admin access');
        }
    }
    catch (e) {
        res.status(500).send(e);
    }
});

app.post('/admin/googleSheets/sheet', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send('User not found');
                return;
            }
            const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
            if (isValidated) {
                const { successful, sheetName, sheetUrl } = await googleSheetsExtra.createNewSheet({ user, data: req.body });
                if (successful) {
                    // Store admin configuration
                    await googleSheetsExtra.setAdminGoogleSheetsConfig({
                        rcAccountId,
                        sheetName,
                        sheetUrl,
                        customizable: req.body.customizable || false
                    });
                    res.status(200).send({
                        name: sheetName,
                        url: sheetUrl
                    });
                } else {
                    res.status(500).send('Failed to create new sheet');
                }
            } else {
                res.status(401).send('Admin validation failed');
            }
        }
    }
    catch (e) {
        res.status(500).send(e);
    }
});

app.post('/admin/googleSheets/selectedSheet', async function (req, res) {
    try {
        const authHeader = `Bearer ${req.body.accessToken}`;
        const response = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo`, {
            headers: {
                Authorization: authHeader
            }
        });
        const data = response?.data;
        const user = await UserModel.findByPk(`${data?.sub}-googleSheets`);
        if (!user) {
            res.status(400).send('User not found');
            return;
        }
        const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
        if (isValidated) {
            const { successful, sheetName, sheetUrl } = await googleSheetsExtra.updateSelectedSheet({ user, data: req.body });
            if (successful) {
                // Store admin configuration
                await googleSheetsExtra.setAdminGoogleSheetsConfig({
                    rcAccountId,
                    sheetName,
                    sheetUrl,
                    customizable: req.body.customizable || false
                });
                res.status(200).send({ message: 'Admin sheet configuration saved', Id: req.body.field });
            } else {
                res.status(500).send('Failed to configure sheet');
            }
        } else {
            res.status(401).send('Admin validation failed');
        }
    }
    catch (e) {
        res.status(500).send(e);
    }
});

app.get('/admin/googleSheets/config', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send('User not found');
                return;
            }
            const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
            if (isValidated) {
                const config = await googleSheetsExtra.getAdminGoogleSheetsConfig({ rcAccountId });
                res.status(200).send(config);
            } else {
                res.status(401).send('Admin validation failed');
            }
        } else {
            res.status(400).send('Please authorize admin access');
        }
    }
    catch (e) {
        res.status(500).send(e);
    }
});

// Pipedrive specific routes
app.get('/pipedrive-redirect', function (req, res) {
    try {
        res.sendFile(path.join(__dirname, 'connectors/pipedrive/redirect.html'));
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
            const userId = req.body.user_id;
            if (!userId) {
                res.status(400).send('Missing user_id');
                return;
            }

            // Find the user to get refresh token for revocation
            const user = await UserModel.findByPk(userId);
            if (user) {
                const platformModule = require(`./connectors/pipedrive`);
                await platformModule.unAuthorize({ user });
                await UserModel.destroy({
                    where: {
                        id: userId,
                        platform: 'pipedrive'
                    }
                });
            }
            res.status(200).send('User deleted');
        } else {
            res.status(401).send('Unauthorized');
        }
    }
    catch (e) {
        console.log(`platform: pipedrive \n${e.stack}`);
        res.status(500).send(e);
    }
});

app.post('/processor/:processorId', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        const { id: userId, platform } = jwt.decodeJwt(jwtToken);
        const user = await UserModel.findByPk(userId);
        if (!user) {
            res.status(400).send('User not found');
            return;
        }
        let result;
        switch (req.params.processorId) {
            case 'piiRedaction':
                result = piiRedactionProcessor.redactPii(req.body.data);
                break;
            case 'googleDrive':
                result = googleDriveProcessor.uploadToGoogleDrive({ user, data: req.body.data, taskId: req.body.asyncTaskId });
                break;
            default:
                res.status(400).send('Unknown processor');
                return;
        }

        res.status(200).send(result);
    }
    catch (e) {
        console.log(e.stack);
        res.status(400).send();
    }
});

app.get('/googleDrive/oauthUrl', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!jwtToken) {
            res.status(400).send('JWT token is required');
            return;
        }
        const result = await googleDriveProcessor.getOAuthUrl({ jwtToken });
        res.status(200).send(result);
    }
    catch (e) {
        console.log(e.stack);
        res.status(400).send();
    }
});

app.get('/googleDrive/oauthCallback', async function (req, res) {
    try {
        const state = req.query.callbackUri.split('state=')[1];
        // add params back to callbackUri
        const callbackUri = `${req.query.callbackUri}&code=${req.query.code}&scope=${req.query.scope}`;
        const jwtToken = JSON.parse(decodeURIComponent(state)).jwtToken;
        const { id: userId, platform } = jwt.decodeJwt(jwtToken);
        const user = await UserModel.findByPk(userId);
        if (!user) {
            res.status(400).send('User not found');
            return;
        }
        const result = await googleDriveProcessor.onOAuthCallback({ user, callbackUri });
        res.status(200).send(result);
    }
    catch (e) {
        console.log(e.stack);
        res.status(400).send();
    }
});

app.get('/googleDrive/checkAuth', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!jwtToken) {
            res.status(400).send('JWT token is required');
            return;
        }
        const { id: userId, platform } = jwt.decodeJwt(jwtToken);
        const result = await googleDriveProcessor.checkAuth({ userId });
        res.status(200).send(result);
    }
    catch (e) {
        console.log(e.stack);
        res.status(400).send();
    }
});

app.post('/googleDrive/logout', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!jwtToken) {
            res.status(400).send('JWT token is required');
            return;
        }
        const { id: userId, platform } = jwt.decodeJwt(jwtToken);
        const result = await googleDriveProcessor.logout({ userId });
        res.status(200).send(result);
    }
    catch (e) {
        console.log(e.stack);
        res.status(400).send();
    }
});

exports.getServer = function getServer() {
    return app;
}