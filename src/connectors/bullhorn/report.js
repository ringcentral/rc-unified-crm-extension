
const axios = require('axios');
const moment = require('moment');
const oauth = require('@app-connect/core/lib/oauth');
const logger = require('@app-connect/core/lib/logger');
const { getOauthInfo } = require('./index');
const { checkAndRefreshAccessToken } = require('./index');
// ===================== Monthly CSV Report Helpers =====================
async function fetchBullhornUserProfile({ user }) {
    try {
        const oauthApp = oauth.getOAuthApp(await getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
        let currentUser = user;
        if (checkAndRefreshAccessToken) {
            currentUser = await checkAndRefreshAccessToken(oauthApp, currentUser, 20, true);
        }
        const masterUserId = currentUser.id.replace('-bullhorn', '');
        const resp = await axios.get(
            `${currentUser.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name,email&where=masterUserID=${masterUserId}`,
            { headers: { BhRestToken: currentUser.platformAdditionalInfo.bhRestToken } }
        );
        const data = resp?.data?.data?.[0] ?? {};
        return { email: data.email || '', name: data.name || '' };
    } catch (error) {
        logger.error('Error fetching Bullhorn user profile', { stack: error.stack });
        return { email: '', name: '' };
    }
}

function toCsv(rows) {
    const escape = (val) => {
        const s = (val ?? '').toString();
        if (s.includes(',') || s.includes('\n') || s.includes('"')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };
    return rows.map(r => r.map(escape).join(',')).join('\n');
}

async function generateMonthlyCsvReport() {
    const { UserModel } = require('@app-connect/core/models/userModel');
    const { Op } = require('sequelize');
    const users = await UserModel.findAll({
        where: {
            platform: 'bullhorn',
            accessToken: {
                [Op.and]: [
                    { [Op.not]: null },
                    { [Op.ne]: '' }
                ]
            }
        }
    });
    // Only include users who have connected (i.e., have been updated) in the last month, up to the 20th of the current month.
    // This ensures we only report active/connected customers.
    const moment = require('moment');
    const path = require('path');
    const fs = require('fs');

    // Use filteredUsers for the report instead of all users
    const header = ['Bullhorn Master User ID', 'Email', 'Bullhorn ID', 'Name', 'Bullhorn Corp Token'];
    const rows = [header];
    // Bounded parallelism to avoid Lambda timeout and rate limits
    const boundedUsers = users;
    const batchConcurrency = 10;
    const batchDelayMs = 100;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    logger.info({
        message: 'Generating Bullhorn monthly CSV report for', Length: boundedUsers.length
    }
    );
    for (let startIndex = 0; startIndex < boundedUsers.length; startIndex += batchConcurrency) {
        const currentBatch = boundedUsers.slice(startIndex, startIndex + batchConcurrency);
        const batchResults = await Promise.allSettled(
            currentBatch.map(async (currentUser) => {
                try {
                    const profile = await fetchBullhornUserProfile({ user: currentUser });
                    if (!profile?.email && !profile?.name) {
                        logger.info({
                            message: 'Skipping user because email and name are not found',
                            userId: currentUser.id
                        });
                        return null;
                    }
                    const masterId = (currentUser.id || '').replace(/-bullhorn$/, '');
                    const userEmail = profile.email;
                    const bullhornId = currentUser.platformAdditionalInfo?.id || '';
                    const userName = profile.name;
                    const corpToken = (currentUser.platformAdditionalInfo?.restUrl || '').match(/rest-services\/([^/]+)/)?.[1] || '';
                    return [masterId, userEmail, bullhornId, userName, corpToken];
                } catch (error) {
                    logger.error('Error fetching Bullhorn user profile', { stack: error.stack });
                    return null;
                }
            })
        );
        for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value) {
                rows.push(result.value);
            }
        }
        // small breathing room between batches
        if (startIndex + batchConcurrency < boundedUsers.length && batchDelayMs > 0) {
            await delay(batchDelayMs);
        }
    }
    const csv = toCsv(rows);
    const os = require('os');
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const baseDir = isLambda ? os.tmpdir() : process.cwd();
    const outDir = path.join(baseDir, 'reports');
    if (!fs.existsSync(outDir)) {
        try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { logger.error('Error creating report directory', { stack: e.stack }); }
    }
    const filePath = path.join(outDir, `bullhorn_report_${moment.utc().format('YYYY-MM-20')}.csv`);
    fs.writeFileSync(filePath, csv, 'utf8');
    return { csv, filePath };
}
async function sendMonthlyCsvReportByEmail() {
    try {
        const report = await generateMonthlyCsvReport();
        if (!report) {
            logger.error('Report generation failed. Skipping email.');
            return;
        }
        const { filePath } = report;
        const axios = require('axios');
        const fs = require('fs');
        // Read the CSV file and encode it as base64
        const bullhornReport = fs.readFileSync(filePath, { encoding: 'base64' });

        // Concatenate current date in ddmmyyyy format to the file name
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = String(currentDate.getFullYear());
        const dateString = `${day}/${month}/${year}`;
        const attachmentFileName = `BullhornReport_${dateString}.csv`;
        // Build pretty subject: "Bullhorn/RingCentral monthly user report (Mon D, YYYY)"
        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'
        ];
        const d = new Date();
        const monthName = months[d.getMonth()];
        const dayNum = d.getDate();
        const yearNum = d.getFullYear();
        const prettySubject = `Bullhorn/RingCentral monthly user report (${monthName} ${dayNum}, ${yearNum})`;
        // Prepare the request body
        const requestBody = {
            to: process.env.BULLHORN_REPORT_MAIL_TO,
            from: "noreply@devemail.ringcentral.com",
            bcc: process.env.BULLHORN_REPORT_MAIL_BCC,
            reply_to: process.env.BULLHORN_REPORT_MAIL_REPLY_TO,
            subject: prettySubject,
            body: `<p>Please find attached to this email a report containing a list of all active RingCentral customers using the Bullhorn integration powered by App Connect.</p>
<p>If you have questions, or need assistance, please reply directly to this email.</p>
<p>Sincerely,<br/>RingCentral Labs</p>`,
            identifiers: {
                email: "noreply@devemail.ringcentral.com"
            },
            attachments: {
                [attachmentFileName]: bullhornReport
            }
        };

        // Send the email via Customer.io API
        try {
            await axios.post(
                'https://api.customer.io/v1/send/email',
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.BULLHORN_REPORT_MAIL_API_KEY}`
                    }
                }
            );
        } catch (error) {
            logger.error('Failed to send email:', { stack: error.stack });
            await sendErrorReportEmail(error, 'sendMonthlyCsvReportByEmail');
        }
        try {
            fs.unlinkSync(filePath);
            logger.info(`File ${filePath} deleted successfully after sending email.`);
        } catch (err) {
            logger.error(`Failed to delete file ${filePath}:`, { stack: err.stack });
        }
    } catch (error) {
        logger.error('Failed to Generate Report and send email:', { stack: error.stack });
        await sendErrorReportEmail(error, 'sendMonthlyCsvReportByEmail');
    }
}

async function fetchMonthlySalesforceReportRows(){
    const users = [];
    let filteredUsers = [];

    // Map email -> Bullhorn master user id(s) (strip `-bullhorn`)
    // Note: one email may map to multiple Bullhorn users.
    const bullhornMasterUserIdsByEmail = new Map();

    // Bullhorn user id looks like `${masterUserId}-bullhorn`. Strip suffix and fetch email from Bullhorn.
    // (Requested: use id to fetch emailId/email from Bullhorn)
    let bullhornEmailList = [];
    const { UserModel } = require('@app-connect/core/models/userModel');
    const { Op } = require('sequelize');
    users.push(...(await UserModel.findAll({
        where: {
            platform: 'bullhorn',
            accessToken: {
                [Op.and]: [
                    { [Op.not]: null },
                    { [Op.ne]: '' }
                ]
            }
        }
    })));

    // Filter users to only those updated within the last month (up to the current date)
    const oneMonthAgo = moment().subtract(1, 'months').toDate();
    filteredUsers = users.filter(u => {
        if (u.updatedAt) {
            return u.updatedAt > oneMonthAgo;
        }
        return true;
    });

    try {
        const batchConcurrency = 10;
        const batchDelayMs = 100;
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const emailSet = new Set();
        for (let startIndex = 0; startIndex < filteredUsers.length; startIndex += batchConcurrency) {
            const currentBatch = filteredUsers.slice(startIndex, startIndex + batchConcurrency);
            const batchResults = await Promise.allSettled(
                currentBatch.map(async (currentUser) => {
                    const profile = await fetchBullhornUserProfile({ user: currentUser });
                    return { profile, currentUser };
                })
            );
            for (const r of batchResults) {
                const email = r?.value?.profile?.email;
                if (email && typeof email === 'string') {
                    const normalized = email.trim().toLowerCase();
                    if (normalized) {
                        emailSet.add(normalized);
                        const masterUserId = String(r?.value?.currentUser?.id || '').replace(/-bullhorn$/, '');
                        if (masterUserId) {
                            const existing = bullhornMasterUserIdsByEmail.get(normalized);
                            if (existing) existing.add(masterUserId);
                            else bullhornMasterUserIdsByEmail.set(normalized, new Set([masterUserId]));
                        }
                    }
                }
            }
            if (batchDelayMs) await delay(batchDelayMs);
        }
        bullhornEmailList = Array.from(emailSet.values());
        logger.info({ message: 'Bullhorn emails fetched for Salesforce report', count: emailSet.size });
    } catch (error) {
        logger.error('Failed to fetch Bullhorn emails for Salesforce report', { stack: error.stack });
    }


    // Optionally, update the next code block to use filteredUsers instead of users if needed.

    console.log({
        message: 'Bullhorn users fetched for Salesforce report',
        totalUsers: users.length,
        filteredUsers: filteredUsers.length
    });

    const salesforceOAuthToken = await getSalesforceOAuthToken();
    //console.log({message:'salesforceOAuthToken is', salesforceOAuthToken});

    const chunkArray = (arr, chunkSize) => {
        if (!Array.isArray(arr) || arr.length === 0) return [];
        if (!Number.isFinite(chunkSize) || chunkSize <= 0) return [arr];
        const chunks = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            chunks.push(arr.slice(i, i + chunkSize));
        }

        return chunks;
    };

    const fetchSalesforceQueryAllRecords = async (soql) => {
        const host = "https://rc.my.salesforce.com";
        const headers = { 'Authorization': `Bearer ${salesforceOAuthToken.access_token}` };

        const records = [];
        let nextUrl = `${host}/services/data/v60.0/query/?q=${soql}`;

        // Loop through query + nextRecordsUrl pagination (if present)
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const response = await axios.get(nextUrl, { headers });
            const data = response.data || {};
            const pageRecords = data.records || data.Records || [];
            if (Array.isArray(pageRecords) && pageRecords.length) {
                records.push(...pageRecords);
            }

            if (data.nextRecordsUrl) {
                nextUrl = `${host}${data.nextRecordsUrl}`;
                continue;
            }
            break;
        }

        return records;
    };

    const filteredUserRcAccountIdList = [
        ...new Set(
            filteredUsers
                .map(u => (u && u.rcAccountId ? String(u.rcAccountId).trim() : ''))
                .filter(Boolean)
        )
    ];


    if (!filteredUserRcAccountIdList.length) {
        logger.warn('No rcAccountId values found for Bullhorn users; skipping Salesforce query');
        return [];
    }

    

    // String format required by SOQL: ('123','1234','567')
    // Salesforce query is sent via GET `?q=...`, so a large IN-clause can trigger 414 (URI Too Long).
    // Chunk the IN list to keep each request safely under URL limits.
    const ACCOUNT_ID_CHUNK_SIZE = 700;
    const rcIdChunks = chunkArray(filteredUserRcAccountIdList, ACCOUNT_ID_CHUNK_SIZE);
   // console.log({message:'rcIdChunks are', rcIdChunks});
    const accountBySfId = new Map();
    try {
        for (const chunk of rcIdChunks) {
            const filteredUserRcAccountIds = `(${chunk.map(id => `'${String(id).replace(/'/g, "\\'")}'`).join(',')})`;

            // Query Salesforce for Account records (one chunk at a time)
            const accountsSoql =
                'SELECT Id,Name,CSM_Name__c,RC_Cancel_Date__c,Accoutn18DigitID__c,Number_of_DL_s__c,Contact_Email__c,Contact_FName__c,Contact_LName__c,Contact_Phone__c,Contact_s_phone__c,RC_User_ID__c,Partner_Account_Name__c ' +
                `FROM Account WHERE RC_User_ID__c IN ${filteredUserRcAccountIds}`;

            const chunkAccounts = await fetchSalesforceQueryAllRecords(accountsSoql);
            for (const acc of chunkAccounts) {
                if (acc && acc.Id) accountBySfId.set(acc.Id, acc);
            }
        }
    } catch (error) {
        logger.error('Failed to fetch Salesforce Account data:', { stack: error.stack, error });
        //  await sendErrorReportEmail(error, 'fetchMonthlySalesforceReportRows/salesforce-query');
        return [];
    }
    

// The following code will generate the result list as instructed.

// Extract Account records from Salesforce response
const accounts = Array.from(accountBySfId.values());

// Create list of objects with required account fields
const accountIdMap = {}; // Map to store account fields for AccountId lookup later
const acc18List = [];

accounts.forEach(acc => {
    // Salesforce sometimes returns undefined/null -- sanitize
    const obj = {
        Accoutn18DigitID__c: acc.Accoutn18DigitID__c,
        RC_Cancel_Date__c: acc.RC_Cancel_Date__c,
        RC_User_ID__c: acc.RC_User_ID__c,
        Partner_Account_Name__c: acc.Partner_Account_Name__c,
        CSM_Name__c: acc.CSM_Name__c,
    };
    if (obj.Accoutn18DigitID__c) {
        acc18List.push(`'${obj.Accoutn18DigitID__c}'`);
        accountIdMap[obj.Accoutn18DigitID__c] = obj;
    }
});

console.log({m:'acc18List are',Length: acc18List.length});
if(acc18List.length === 0) {
    logger.warn('No accounts found for Bullhorn users; skipping Salesforce query');
    return [];
}
// Query contacts for these accounts (chunked to avoid 414 URI Too Long)
const CONTACT_ACCOUNT_CHUNK_SIZE = 700;
const acc18Chunks = chunkArray(acc18List, CONTACT_ACCOUNT_CHUNK_SIZE);

let contacts = [];
try {
    const contactBySfId = new Map();
    const emailInList = (bullhornEmailList || [])
        .map((e) => (e ? String(e).trim().toLowerCase() : ''))
        .filter(Boolean)
        .map((e) => `'${e.replace(/'/g, "\\'")}'`);

    // If the email list is very large, chunk it to avoid 414 URI Too Long.
    const CONTACT_EMAIL_CHUNK_SIZE = 200;
    const emailChunks = emailInList.length ? chunkArray(emailInList, CONTACT_EMAIL_CHUNK_SIZE) : [[]];

    for (const chunk of acc18Chunks) {
        for (const emailChunk of emailChunks) {
            const emailClause = emailChunk.length ? ` AND Email IN (${emailChunk.join(',')})` : '';
            const contactsSoql =
                "SELECT Id,FirstName,LastName,AccountId,Account_Partner_Status__c,Account_Status__c,Company__c,Email," +
                "Account_Number_of_DLs__c,CSM_Owner__c,Product_Ecomm__c,Product__c " +
                `FROM Contact WHERE AccountId IN (${chunk.join(',')})${emailClause}`;

            const chunkContacts = await fetchSalesforceQueryAllRecords(contactsSoql);
            for (const c of chunkContacts) {
                if (c && c.Id) contactBySfId.set(c.Id, c);
            }
        }
    }
    contacts = Array.from(contactBySfId.values());
} catch (error) {
    logger.error('Failed to fetch Salesforce Contact data:',{Stack:error.stack});
    // await sendErrorReportEmail(error, 'fetchMonthlySalesforceReportRows/contacts-query');
    return [];
}

// Prepare the final list of objects as requested
const results = [];

logger.info({ message: 'Salesforce contacts fetched', count: contacts.length });

// Merge fields for each contact, and supplement with RC_Cancel_Date__c and RC_User_ID__c from account
contacts.forEach(contact => {
    const account = accountIdMap[contact.AccountId] || {};
    results.push({
        'Bullhorn Master User ID': (() => {
            const email = String(contact.Email || '').trim().toLowerCase();
            if (!email) return '';
            const set = bullhornMasterUserIdsByEmail.get(email);
            if (!set || !set.size) return '';
            return Array.from(set.values()).join(',');
        })(),
        'First Name': contact.FirstName,
        'Last Name': contact.LastName,
        'Email': contact.Email,
        'Company': contact.Company__c,
        'Partner Account Owner': account.CSM_Name__c,
        'Partner Account ID': contact.AccountId,
        'Product': "RingCentral App Connect",
        'Seats': contact.Account_Number_of_DLs__c,
        'Opp Status': contact.Account_Status__c,
        'Cancel Date': account.RC_Cancel_Date__c,
        'RC Account ID': account.RC_User_ID__c,
    });
});

console.log({message:"CUmulative data", Length:results.length});

// The `results` array now contains the merged data with the desired fields.
return results;
}

async function generateMonthlyCsvReportWithSalesforceData() {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    let results = await fetchMonthlySalesforceReportRows();
    if (!results || results.length === 0) {
        logger.warn('No Salesforce data rows generated. Skipping CSV creation.');
        results = [];
    }

    const header = [
        'Bullhorn Master User ID',
        'First Name',
        'Last Name',
        'Email',
        'Company',
        'Partner Account Owner',
        'Partner Account ID',
        'Product',
        'Seats',
        'Opp Status',
        'Cancel Date',
        'RC Account ID',
    ];

    const rows = [header];
    for (const r of results) {
        rows.push(header.map((h) => (r && r[h] !== undefined && r[h] !== null ? String(r[h]) : '')));
    }

    const csv = toCsv(rows);

    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const baseDir = isLambda ? os.tmpdir() : process.cwd();
    const outDir = path.join(baseDir, 'reports');
    if (!fs.existsSync(outDir)) {
        try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { logger.error('Error creating report directory', { stack: e.stack }); }
    }

    const filePath = path.join(outDir, `bullhorn_salesforce_report_${moment.utc().format('YYYY-MM-20')}.csv`);
    fs.writeFileSync(filePath, csv, 'utf8');
    return { csv, filePath, rowCount: results.length };
}

async function sendErrorReportEmailWithSalesforce(error, contextInfo = '') {
    try {
        const now = new Date();
        const day = String(now.getUTCDate()).padStart(2, '0');
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const year = String(now.getUTCFullYear());
        const dateString = `${day}/${month}/${year}`;
        const subject = `Bullhorn Monthly Salesforce Report FAILED ${dateString}`;
        const body = `Bullhorn monthly Salesforce report failed to send.\n\nError: ${error && error.stack ? error.stack : error}\n\nContext: ${contextInfo}`;
        const requestBody = {
            to: "sushil.mall@ringcentral.com,da.kong@ringcentral.com",
            from: "noreply@devemail.ringcentral.com",
            subject,
            body,
            identifiers: {
                id: "noreply@devemail.ringcentral.com"
            }
        };
        await axios.post(
            'https://api.customer.io/v1/send/email',
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.BULLHORN_REPORT_MAIL_API_KEY}`
                }
            }
        );
    } catch (err) {
        logger.error('Failed to send Salesforce error report email:', { stack: err.stack });
    }
}

async function sendMonthlyCsvReportByEmailWithSalesforceData() {
    try {
        const report = await generateMonthlyCsvReportWithSalesforceData();
        if (!report) {
            logger.error('Salesforce report generation failed. Skipping email.');
            return;
        }

        const { filePath, rowCount } = report;
        const fs = require('fs');

        const reportB64 = fs.readFileSync(filePath, { encoding: 'base64' });

        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = String(currentDate.getFullYear());
        const dateString = `${day}/${month}/${year}`;
        const attachmentFileName = `BullhornSalesforceReport_${dateString}.csv`;

        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'
        ];
        const d = new Date();
        const monthName = months[d.getMonth()];
        const dayNum = d.getDate();
        const yearNum = d.getFullYear();
        const prettySubject = `Bullhorn/Salesforce monthly report (${monthName} ${dayNum}, ${yearNum})`;

        const requestBody = {
            to: process.env.BULLHORN_REPORT_MAIL_TO,
            from: "noreply@devemail.ringcentral.com",
            bcc: process.env.BULLHORN_REPORT_MAIL_BCC,
            reply_to: process.env.BULLHORN_REPORT_MAIL_REPLY_TO,
            subject: prettySubject,
            body: `<p>Please find attached to this email a report containing a list of all active RingCentral customers using the Bullhorn integration powered by App Connect.</p>
<p>If you have questions, or need assistance, please reply directly to this email.</p>
<p>Sincerely,<br/>RingCentral Labs</p>`,
            identifiers: {
                email: "noreply@devemail.ringcentral.com"
            },
            attachments: {
                [attachmentFileName]: reportB64
            }
        };

        console.log({message:'requestBody is', requestBody});

        try {
            await axios.post(
                'https://api.customer.io/v1/send/email',
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.BULLHORN_REPORT_MAIL_API_KEY}`
                    }
                }
            );
        } catch (error) {
            logger.error('Failed to send Salesforce report email:', { stack: error.stack, error});
            await sendErrorReportEmailWithSalesforce(error, 'sendMonthlyCsvReportByEmailWithSalesforceData');
        }

        try {
            fs.unlinkSync(filePath);
            logger.info(`File ${filePath} deleted successfully after sending Salesforce report email.`);
        } catch (err) {
            logger.error(`Failed to delete file ${filePath}:`, { stack: err.stack });
        }
    } catch (error) {
        logger.error('Failed to generate Salesforce report and send email:', { stack: error.stack });
        await sendErrorReportEmailWithSalesforce(error, 'sendMonthlyCsvReportByEmailWithSalesforceData');
    }
}
async function getSalesforceOAuthToken() {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', process.env.BULLHORN_SALESFORCE_CLIENT_ID);
        params.append('client_secret', process.env.BULLHORN_SALESFORCE_CLIENT_SECRET);

        const response = await axios.post(
            `https://rc.my.salesforce.com/services/oauth2/token`,
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
                // No need to send the provided cookies for this server-to-server request,
                // and they generally should be omitted unless explicitly required.
            }
        );
        return response.data;
    } catch (error) {
        logger.error('Failed to retrieve Salesforce OAuth token:', { stack: error.stack });
        throw error;
    }
}

// Add fallback logic to send an error report email if sending the main report fails
async function sendErrorReportEmail(error, contextInfo = '') {
    try {
        const now = new Date();
        const day = String(now.getUTCDate()).padStart(2, '0');
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const year = String(now.getUTCFullYear());
        const dateString = `${day}/${month}/${year}`;
        const subject = `Bullhorn Monthly Report FAILED ${dateString}`;
        const body = `Bullhorn monthly report failed to send.\n\nError: ${error && error.stack ? error.stack : error}\n\nContext: ${contextInfo}`;
        const requestBody = {
            to: "sushil.mall@ringcentral.com,da.kong@ringcentral.com" ,
            from: "noreply@devemail.ringcentral.com",
            subject,
            body,
            identifiers: {
                id: "noreply@devemail.ringcentral.com"
            }
        };
        await axios.post(
            'https://api.customer.io/v1/send/email',
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.BULLHORN_REPORT_MAIL_API_KEY}`
                }
            }
        );
    } catch (err) {
        logger.error('Failed to send error report email:', { stack: err.stack });
    }
}


exports.sendMonthlyCsvReportByEmail = sendMonthlyCsvReportByEmail;
exports.generateMonthlyCsvReport = generateMonthlyCsvReport;
exports.generateMonthlyCsvReportWithSalesforceData = generateMonthlyCsvReportWithSalesforceData;
exports.sendMonthlyCsvReportByEmailWithSalesforceData = sendMonthlyCsvReportByEmailWithSalesforceData;
exports.sendErrorReportEmailWithSalesforce = sendErrorReportEmailWithSalesforce;