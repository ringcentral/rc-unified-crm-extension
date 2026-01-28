const axios = require('axios');
const { PtpUserModel } = require('./models/ptpUserModel');
const { GoogleDriveFileModel } = require('./models/googleDriveFileModel');
const oauth = require('@app-connect/core/lib/oauth');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const oauthApp = oauth.getOAuthApp({
    clientId: process.env.GOOGLE_DRIVE_PTP_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_PTP_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_DRIVE_PTP_REDIRECT_URI,
    accessTokenUri: process.env.GOOGLE_DRIVE_PTP_TOKEN_URI,
    authorizationUri: process.env.GOOGLE_DRIVE_PTP_AUTHORIZATION_URI,
    scopes: 'https://www.googleapis.com/auth/drive.file'
});

async function getOAuthUrl({ jwtToken, processorId }) {
    const state = {
        jwtToken,
        from: 'ptp',
        redirectTo: `${process.env.APP_SERVER}/googleDrive/oauthCallback`,
        processorId
    }
    const stateString = encodeURIComponent(JSON.stringify(state));
    return oauthApp.code.getUri({
        state: stateString,
        query: {
            access_type: 'offline',
            prompt: 'consent'
        }
    });
}
async function onOAuthCallback({ user, callbackUri }) {
    const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(callbackUri);
    const existingUser = await PtpUserModel.findByPk(user.id);
    if (existingUser) {
        await existingUser.update({
            accessToken,
            refreshToken,
            tokenExpiry: expires
        });
    }
    else {
        await PtpUserModel.create({ id: user.id, accessToken, refreshToken, tokenExpiry: expires });
    }
    return 
}

/**
 * Find a folder by name in Google Drive
 * @param {string} accessToken - OAuth access token
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<string|null>} - Folder ID if found, null otherwise
 */
async function findFolderByName(accessToken, folderName) {
    try {
        const response = await axios.get(
            'https://www.googleapis.com/drive/v3/files',
            {
                params: {
                    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
                    fields: 'files(id, name)',
                    pageSize: 1
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }
        return null;
    } catch (error) {
        console.error('Error finding folder:', error.message);
        return null;
    }
}

/**
 * Create a folder in Google Drive
 * @param {string} accessToken - OAuth access token
 * @param {string} folderName - Name of the folder to create
 * @returns {Promise<string|null>} - Folder ID if created successfully, null otherwise
 */
async function createFolder(accessToken, folderName) {
    try {
        const response = await axios.post(
            'https://www.googleapis.com/drive/v3/files',
            {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.id;
    } catch (error) {
        console.error('Error creating folder:', error.message);
        return null;
    }
}

/**
 * Get or create a folder by name in Google Drive
 * @param {string} accessToken - OAuth access token
 * @param {string} folderName - Name of the folder
 * @returns {Promise<string|null>} - Folder ID
 */
async function getOrCreateFolder(accessToken, folderName) {
    if (!folderName) {
        return null;
    }

    // Try to find existing folder
    let folderId = await findFolderByName(accessToken, folderName);

    // If not found, create it
    if (!folderId) {
        folderId = await createFolder(accessToken, folderName);
    }

    return folderId;
}

/**
 * Download a file from a URL
 * @param {string} fileUrl - URL of the file to download
 * @returns {Promise<Buffer>} - File content as Buffer
 */
async function downloadFileFromUrl(fileUrl, token) {
    try {
        const response = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error(`Failed to download file from URL: ${error.message}`);
    }
}

/**
 * Detect MIME type from file extension for audio files
 * @param {string} fileName - File name or URL
 * @returns {string} - MIME type
 */
function detectMimeType(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const audioMimeTypes = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'flac': 'audio/flac',
        'wma': 'audio/x-ms-wma'
    };
    return audioMimeTypes[extension] || 'audio/mpeg';
}

async function uploadToGoogleDrive({ user, data, taskId }) {
    const cache = await CacheModel.findByPk(taskId);
    if (!cache) {
        return {
            successful: false,
            message: 'Cache not found'
        }
    }
    else {
        cache.status = 'processing';
        await cache.save();
    }
    try {
        const existingGoogleDriveFile = await GoogleDriveFileModel.findOne({
            where: {
                telephonySessionId: data.logInfo.telephonySessionId
            }
        });
        if (existingGoogleDriveFile) {
            await cache.destroy();
            return {
                successful: true,
                message: 'File already uploaded to Google Drive'
            }
        }
        const fileUrl = data.logInfo?.recordingDownloadLink ?? data.logInfo?.recording?.downloadUrl;
        if (!fileUrl) {
            await cache.destroy();
            return {
                successful: false,
                message: 'No recording download URL found'
            }
        }
        let ptpUser = await PtpUserModel.findByPk(user.id);
        if (!ptpUser) {
            await cache.destroy();
            return {
                successful: false,
                message: 'User not found'
            }
        }
        ptpUser = await oauth.checkAndRefreshAccessToken(oauthApp, ptpUser);

        // Extract file properties
        const fileName = `${new Date().toISOString("YYYY-MM-DD HH:mm:ss")}.mp3`;

        const accessToken = fileUrl.split('accessToken=')[1];
        // Download audio file from URL
        const fileContent = await downloadFileFromUrl(fileUrl, accessToken);

        // Detect audio MIME type from filename
        const mimeType = detectMimeType(fileName);

        const callDirection = data.logInfo?.direction;
        const fromNumber = data.logInfo?.from?.phoneNumber;
        const toNumber = data.logInfo?.to?.phoneNumber;
        const folderName = callDirection === 'Inbound' ? `${fromNumber}` : `${toNumber}`;
        const folderId = await getOrCreateFolder(ptpUser.accessToken, folderName);
        // Create multipart boundary
        const boundary = `----WebKitFormBoundary${Date.now()}`;

        // Build metadata with optional parent folder
        const metadataObj = {
            name: fileName
        };
        if (folderId) {
            metadataObj.parents = [folderId];
        }

        const metadata = JSON.stringify(metadataObj);

        // Convert fileContent to Buffer if it's not already
        const fileBuffer = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent);

        // Build multipart body parts
        const boundaryBuffer = Buffer.from(`--${boundary}\r\n`, 'utf8');
        const metadataHeader = Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n', 'utf8');
        const metadataBuffer = Buffer.from(metadata, 'utf8');
        const fileHeader = Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8');
        const endBoundary = Buffer.from(`\r\n--${boundary}--`, 'utf8');

        // Concatenate all parts
        const multipartBody = Buffer.concat([
            boundaryBuffer,
            metadataHeader,
            metadataBuffer,
            fileHeader,
            fileBuffer,
            endBoundary
        ]);

        const uploadResponse = await axios.post(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            multipartBody,
            {
                headers: {
                    'Authorization': `Bearer ${ptpUser.accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'Content-Length': multipartBody.length.toString()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );
        console.log('Uploaded to Google Drive:', uploadResponse.data.name);

        await GoogleDriveFileModel.create({
            id: uploadResponse.data.id,
            userId: user.id,
            telephonySessionId: data.logInfo.telephonySessionId
        });
        cache.status = 'completed';
        await cache.save();
        return uploadResponse.data;
    }
    catch (e) {
        cache.status = 'failed';
        await cache.save();
        return {
            successful: false,
            message: 'Failed to upload to Google Drive'
        }
    }
}

async function checkAuth({ userId }) {
    const user = await PtpUserModel.findByPk(userId);
    if (user?.accessToken) {
        return {
            successful: true
        }
    }
    else {
        return {
            successful: false
        }
    }
}

async function logout({ userId }) {
    try {
        const user = await PtpUserModel.findByPk(userId);
        if (user) {
            await user.destroy();
        }
        return {
            successful: true,
            returnMessage: {
                message: 'User logged out',
                messageType: 'success',
                ttl: 3000
            }
        }
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                message: 'Failed to logout',
                messageType: 'error',
                ttl: 3000
            }
        }
    }
}

exports.getOAuthUrl = getOAuthUrl;
exports.onOAuthCallback = onOAuthCallback;
exports.uploadToGoogleDrive = uploadToGoogleDrive;
exports.checkAuth = checkAuth;
exports.logout = logout;