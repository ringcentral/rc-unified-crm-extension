const mockFindAll = jest.fn();
const mockGetOauthInfo = jest.fn();
const mockCheckAndRefreshAccessToken = jest.fn();

jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn()
}));

jest.mock('@app-connect/core/models/userModel', () => ({
    UserModel: {
        findAll: mockFindAll
    }
}));

jest.mock('@app-connect/core/lib/oauth', () => ({
    getOAuthApp: jest.fn(() => ({ app: 'bullhorn-oauth' }))
}));

jest.mock('@app-connect/core/lib/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

jest.mock('../../src/connectors/bullhorn/index', () => ({
    getOauthInfo: mockGetOauthInfo,
    checkAndRefreshAccessToken: mockCheckAndRefreshAccessToken
}));

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const oauth = require('@app-connect/core/lib/oauth');
const logger = require('@app-connect/core/lib/logger');
const bullhornReport = require('../../src/connectors/bullhorn/report');

describe('Bullhorn monthly report connector', () => {
    const reportsDir = path.join(os.tmpdir(), 'reports');
    const dayMs = 24 * 60 * 60 * 1000;

    function getUtcReportDate() {
        const now = new Date();
        return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-20`;
    }

    function getLocalEmailDateString() {
        const now = new Date();
        return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    }

    function getUtcEmailDateString() {
        const now = new Date();
        return `${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;
    }

    function getLocalPrettyDate() {
        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'
        ];
        const now = new Date();
        return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }

    const userOne = {
        id: '100-bullhorn',
        platformAdditionalInfo: {
            id: 'bh-100',
            tokenUrl: 'https://auth.bullhorn.example/token',
            restUrl: 'https://rest.bullhorn.example/rest-services/corp-1/',
            bhRestToken: 'rest-token-100'
        }
    };

    const userTwo = {
        id: '200-bullhorn',
        platformAdditionalInfo: {
            id: 'bh-200',
            tokenUrl: 'https://auth.bullhorn.example/token',
            restUrl: 'https://rest.bullhorn.example/rest-services/corp-2/',
            bhRestToken: 'rest-token-200'
        }
    };

    beforeEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
        process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-lambda';
        process.env.BULLHORN_REPORT_MAIL_TO = 'ops@example.com';
        process.env.BULLHORN_REPORT_MAIL_BCC = 'audit@example.com';
        process.env.BULLHORN_REPORT_MAIL_REPLY_TO = 'reply@example.com';
        process.env.BULLHORN_REPORT_MAIL_API_KEY = 'customer-io-key';
        process.env.BULLHORN_SALESFORCE_CLIENT_ID = 'salesforce-client-id';
        process.env.BULLHORN_SALESFORCE_CLIENT_SECRET = 'salesforce-client-secret';
        mockGetOauthInfo.mockReturnValue({ clientId: 'client-id' });
        mockCheckAndRefreshAccessToken.mockImplementation(async (_oauthApp, user) => user);
        if (fs.existsSync(reportsDir)) {
            for (const file of fs.readdirSync(reportsDir)) {
                if (file.startsWith('bullhorn_report_') || file.startsWith('bullhorn_salesforce_report_')) {
                    fs.unlinkSync(path.join(reportsDir, file));
                }
            }
        }
    });

    afterEach(() => {
        jest.useRealTimers();
        delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    });

    test('generates a monthly CSV report for Bullhorn users with fetched profiles', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        mockFindAll.mockResolvedValueOnce([userOne, userTwo]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'bob,quoted@example.com',
                            name: 'Bob "Quoted"'
                        }
                    ]
                }
            });

        const report = await bullhornReport.generateMonthlyCsvReport();

        expect(mockFindAll).toHaveBeenCalledWith({
            where: {
                platform: 'bullhorn',
                accessToken: expect.any(Object)
            }
        });
        expect(oauth.getOAuthApp).toHaveBeenCalledWith({ clientId: 'client-id' });
        expect(mockCheckAndRefreshAccessToken).toHaveBeenCalledTimes(2);
        expect(axios.get).toHaveBeenNthCalledWith(
            1,
            'https://rest.bullhorn.example/rest-services/corp-1/query/CorporateUser?fields=id,name,email&where=masterUserID=100',
            { headers: { BhRestToken: 'rest-token-100' } }
        );
        expect(axios.get).toHaveBeenNthCalledWith(
            2,
            'https://rest.bullhorn.example/rest-services/corp-2/query/CorporateUser?fields=id,name,email&where=masterUserID=200',
            { headers: { BhRestToken: 'rest-token-200' } }
        );
        expect(report.csv).toBe([
            'Bullhorn Master User ID,Email,Bullhorn ID,Name,Bullhorn Corp Token',
            '100,alice@example.com,bh-100,Alice Example,corp-1',
            '200,"bob,quoted@example.com",bh-200,"Bob ""Quoted""",corp-2'
        ].join('\n'));
        expect(report.filePath).toBe(path.join(reportsDir, 'bullhorn_report_2026-07-20.csv'));
        expect(fs.readFileSync(report.filePath, 'utf8')).toBe(report.csv);
    });

    test('skips report rows when Bullhorn profile lookup returns no email and name', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        mockFindAll.mockResolvedValueOnce([userOne]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {}
                ]
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReport();

        expect(report.csv).toBe('Bullhorn Master User ID,Email,Bullhorn ID,Name,Bullhorn Corp Token');
        expect(logger.info).toHaveBeenCalledWith({
            message: 'Skipping user because email and name are not found',
            userId: '100-bullhorn'
        });
    });

    test('batches monthly CSV users and creates the reports directory when missing', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        fs.rmSync(reportsDir, { recursive: true, force: true });
        const users = Array.from({ length: 11 }, (_value, index) => ({
            id: `${1000 + index}-bullhorn`,
            platformAdditionalInfo: {
                id: `bh-${index}`,
                tokenUrl: 'https://auth.bullhorn.example/token',
                restUrl: `https://rest.bullhorn.example/rest-services/corp-${index}/`,
                bhRestToken: `rest-token-${index}`
            }
        }));
        mockFindAll.mockResolvedValueOnce(users);
        axios.get.mockResolvedValue({
            data: {
                data: [
                    {
                        email: 'batch@example.com',
                        name: 'Batch User'
                    }
                ]
            }
        });

        const reportPromise = bullhornReport.generateMonthlyCsvReport();
        await jest.advanceTimersByTimeAsync(100);
        const report = await reportPromise;

        expect(axios.get).toHaveBeenCalledTimes(11);
        expect(report.csv.split('\n')).toHaveLength(12);
        expect(report.csv).toContain('1010,batch@example.com,bh-10,Batch User,corp-10');
        expect(fs.existsSync(reportsDir)).toBe(true);
    });

    test('sends the generated monthly CSV by email and removes the temporary report file', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        mockFindAll.mockResolvedValueOnce([userOne]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'alice@example.com',
                        name: 'Alice Example'
                    }
                ]
            }
        });
        axios.post.mockResolvedValueOnce({ data: { ok: true } });

        await bullhornReport.sendMonthlyCsvReportByEmail();

        expect(axios.post).toHaveBeenCalledWith(
            'https://api.customer.io/v1/send/email',
            expect.objectContaining({
                to: 'ops@example.com',
                bcc: 'audit@example.com',
                reply_to: 'reply@example.com',
                subject: 'Bullhorn/RingCentral monthly user report (Jul 20, 2026)',
                attachments: {
                    'BullhornReport_20/07/2026.csv': Buffer.from([
                        'Bullhorn Master User ID,Email,Bullhorn ID,Name,Bullhorn Corp Token',
                        '100,alice@example.com,bh-100,Alice Example,corp-1'
                    ].join('\n'), 'utf8').toString('base64')
                }
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer customer-io-key'
                }
            }
        );
        expect(fs.existsSync(path.join(reportsDir, 'bullhorn_report_2026-07-20.csv'))).toBe(false);
    });

    test('sends an error report when the monthly email provider call fails', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        const sendError = new Error('customer io unavailable');
        mockFindAll.mockResolvedValueOnce([userOne]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'alice@example.com',
                        name: 'Alice Example'
                    }
                ]
            }
        });
        axios.post
            .mockRejectedValueOnce(sendError)
            .mockResolvedValueOnce({ data: { ok: true } });

        await bullhornReport.sendMonthlyCsvReportByEmail();

        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(axios.post.mock.calls[1][0]).toBe('https://api.customer.io/v1/send/email');
        expect(axios.post.mock.calls[1][1]).toMatchObject({
            subject: 'Bullhorn Monthly Report FAILED 20/07/2026',
            identifiers: {
                id: 'noreply@devemail.ringcentral.com'
            }
        });
        expect(axios.post.mock.calls[1][1].body).toContain('Context: sendMonthlyCsvReportByEmail');
        expect(logger.error).toHaveBeenCalledWith('Failed to send email:', { stack: sendError.stack });
    });

    test('generates a Salesforce-enriched monthly CSV report from Bullhorn users and Salesforce records', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'Alice@Example.com ',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_Cancel_Date__c: '',
                            RC_User_ID__c: 'rc-account-1',
                            Partner_Account_Name__c: 'Partner Account',
                            CSM_Name__c: 'Owner One'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-contact-1',
                            FirstName: 'Alice',
                            LastName: 'Example',
                            AccountId: '001ABC000000000001',
                            Email: 'alice@example.com',
                            Company__c: 'Acme, Inc.',
                            Account_Number_of_DLs__c: 42,
                            Account_Status__c: 'Active'
                        }
                    ]
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(1);
        expect(report.filePath).toBe(path.join(reportsDir, `bullhorn_salesforce_report_${getUtcReportDate()}.csv`));
        expect(report.csv).toBe([
            'Bullhorn Master User ID,First Name,Last Name,Email,Company,Partner Account Owner,Partner Account ID,Product,Seats,Opp Status,Cancel Date,RC Account ID',
            '100,Alice,Example,alice@example.com,"Acme, Inc.",Owner One,001ABC000000000001,RingCentral App Connect,42,Active,,rc-account-1'
        ].join('\n'));
        expect(fs.readFileSync(report.filePath, 'utf8')).toBe(report.csv);
        expect(axios.post).toHaveBeenCalledWith(
            'https://rc.my.salesforce.com/services/oauth2/token',
            expect.any(URLSearchParams),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        expect(axios.get.mock.calls[1][0]).toContain('FROM Account WHERE RC_User_ID__c IN');
        expect(axios.get.mock.calls[1][1]).toEqual({
            headers: {
                Authorization: 'Bearer salesforce-access-token'
            }
        });
        expect(axios.get.mock.calls[2][0]).toContain('FROM Contact WHERE AccountId IN');
        expect(axios.get.mock.calls[2][0]).toContain("Email IN ('alice@example.com')");
        expect(logger.info).toHaveBeenCalledWith({
            message: 'Salesforce contacts fetched',
            count: 1
        });
    });

    test('reads paged Salesforce records and joins duplicate Bullhorn ids by email', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1'
            },
            {
                ...userTwo,
                rcAccountId: 'rc-account-2',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'Shared@Example.com',
                            name: 'Shared One'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: ' shared@example.com ',
                            name: 'Shared Two'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    Records: [],
                    nextRecordsUrl: '/services/data/v60.0/query/next-account-page'
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_User_ID__c: 'rc-account-1',
                            CSM_Name__c: 'Owner One'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    Records: [
                        {
                            Id: 'sf-contact-1',
                            FirstName: null,
                            LastName: 'Shared',
                            AccountId: '001ABC000000000001',
                            Email: 'shared@example.com',
                            Company__c: 'Shared Co',
                            Account_Number_of_DLs__c: null,
                            Account_Status__c: 'Active'
                        }
                    ]
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(1);
        expect(axios.get.mock.calls[3][0]).toBe('https://rc.my.salesforce.com/services/data/v60.0/query/next-account-page');
        expect(report.csv).toContain('"100,200",,Shared,shared@example.com,Shared Co,Owner One,001ABC000000000001,RingCentral App Connect,,Active,,rc-account-1');
    });

    test('generates a Salesforce report with only the header when Bullhorn users have no rcAccountId', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: '',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'alice@example.com',
                        name: 'Alice Example'
                    }
                ]
            }
        });
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(0);
        expect(report.csv).toBe('Bullhorn Master User ID,First Name,Last Name,Email,Company,Partner Account Owner,Partner Account ID,Product,Seats,Opp Status,Cancel Date,RC Account ID');
        expect(logger.warn).toHaveBeenCalledWith('No rcAccountId values found for Bullhorn users; skipping Salesforce query');
        expect(logger.warn).toHaveBeenCalledWith('No Salesforce data rows generated. Skipping CSV creation.');
    });

    test('sends the Salesforce CSV report by email and removes the temporary report file', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_User_ID__c: 'rc-account-1',
                            CSM_Name__c: 'Owner One'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-contact-1',
                            FirstName: 'Alice',
                            LastName: 'Example',
                            AccountId: '001ABC000000000001',
                            Email: 'alice@example.com',
                            Company__c: 'Acme',
                            Account_Number_of_DLs__c: 10,
                            Account_Status__c: 'Active'
                        }
                    ]
                }
            });
        axios.post
            .mockResolvedValueOnce({
                data: {
                    access_token: 'salesforce-access-token'
                }
            })
            .mockResolvedValueOnce({ data: { ok: true } });

        await bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData();

        const expectedCsv = [
            'Bullhorn Master User ID,First Name,Last Name,Email,Company,Partner Account Owner,Partner Account ID,Product,Seats,Opp Status,Cancel Date,RC Account ID',
            '100,Alice,Example,alice@example.com,Acme,Owner One,001ABC000000000001,RingCentral App Connect,10,Active,,rc-account-1'
        ].join('\n');
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://api.customer.io/v1/send/email',
            expect.objectContaining({
                to: 'ops@example.com',
                bcc: 'audit@example.com',
                reply_to: 'reply@example.com',
                subject: `Bullhorn monthly report (${getLocalPrettyDate()})`,
                attachments: {
                    [`BullhornSalesforceReport_${getLocalEmailDateString()}.csv`]: Buffer.from(expectedCsv, 'utf8').toString('base64')
                }
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer customer-io-key'
                }
            }
        );
        expect(fs.existsSync(path.join(reportsDir, `bullhorn_salesforce_report_${getUtcReportDate()}.csv`))).toBe(false);
    });

    test('sends a Salesforce error report when the Salesforce report email provider call fails', async () => {
        const sendError = new Error('salesforce customer io unavailable');
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_User_ID__c: 'rc-account-1'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-contact-1',
                            FirstName: 'Alice',
                            LastName: 'Example',
                            AccountId: '001ABC000000000001',
                            Email: 'alice@example.com'
                        }
                    ]
                }
            });
        axios.post
            .mockResolvedValueOnce({
                data: {
                    access_token: 'salesforce-access-token'
                }
            })
            .mockRejectedValueOnce(sendError)
            .mockResolvedValueOnce({ data: { ok: true } });

        await bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData();

        expect(axios.post).toHaveBeenCalledTimes(3);
        expect(axios.post.mock.calls[2][1]).toMatchObject({
            subject: `Bullhorn Monthly Salesforce Report FAILED ${getUtcEmailDateString()}`,
            identifiers: {
                id: 'noreply@devemail.ringcentral.com'
            }
        });
        expect(axios.post.mock.calls[2][1].body).toContain('Context: sendMonthlyCsvReportByEmailWithSalesforceData');
        expect(logger.error).toHaveBeenCalledWith('Failed to send Salesforce report email:', {
            stack: sendError.stack,
            error: sendError
        });
    });

    test('generates the monthly CSV outside Lambda and fills optional user fields with defaults', async () => {
        delete process.env.AWS_LAMBDA_FUNCTION_NAME;
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        mockFindAll.mockResolvedValueOnce([
            {
                id: '300-bullhorn',
                platformAdditionalInfo: {
                    tokenUrl: 'https://auth.bullhorn.example/token',
                    bhRestToken: 'rest-token-300'
                }
            }
        ]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'fallback@example.com',
                        name: 'Fallback User'
                    }
                ]
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReport();

        expect(report.filePath).toBe(path.join(process.cwd(), 'reports', 'bullhorn_report_2026-07-20.csv'));
        expect(report.csv).toContain('300,fallback@example.com,,Fallback User,');
        if (fs.existsSync(report.filePath)) {
            fs.unlinkSync(report.filePath);
        }
    });

    test('logs and continues when monthly report file deletion fails', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        mockFindAll.mockResolvedValueOnce([userOne]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'alice@example.com',
                        name: 'Alice Example'
                    }
                ]
            }
        });
        axios.post.mockResolvedValueOnce({ data: { ok: true } });
        const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
            throw new Error('unlink failed');
        });

        await bullhornReport.sendMonthlyCsvReportByEmail();

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to delete file'),
            expect.objectContaining({
                stack: expect.stringContaining('unlink failed')
            })
        );
        unlinkSpy.mockRestore();
        const filePath = path.join(reportsDir, 'bullhorn_report_2026-07-20.csv');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    test('logs when the monthly report error email also fails', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        mockFindAll.mockResolvedValueOnce([userOne]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'alice@example.com',
                        name: 'Alice Example'
                    }
                ]
            }
        });
        axios.post
            .mockRejectedValueOnce(new Error('main email failed'))
            .mockRejectedValueOnce(new Error('error email failed'));

        await bullhornReport.sendMonthlyCsvReportByEmail();

        expect(logger.error).toHaveBeenCalledWith(
            'Failed to send error report email:',
            expect.objectContaining({
                stack: expect.stringContaining('error email failed')
            })
        );
    });

    test('sends Salesforce error email for plain errors with default context', async () => {
        axios.post.mockResolvedValueOnce({ data: { ok: true } });

        await bullhornReport.sendErrorReportEmailWithSalesforce('plain failure');

        expect(axios.post).toHaveBeenCalledWith(
            'https://api.customer.io/v1/send/email',
            expect.objectContaining({
                body: expect.stringContaining('Error: plain failure')
            }),
            expect.any(Object)
        );
        expect(axios.post.mock.calls[0][1].body).toContain('Context: ');
    });

    test('generates Salesforce rows without an email filter when Bullhorn profile lookup fails', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockRejectedValueOnce(new Error('profile unavailable'))
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_User_ID__c: 'rc-account-1'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-contact-1',
                            FirstName: 'No',
                            LastName: 'EmailFilter',
                            AccountId: '001ABC000000000001',
                            Email: 'contact@example.com'
                        }
                    ]
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(1);
        expect(report.csv).toContain(',No,EmailFilter,contact@example.com');
        expect(axios.get.mock.calls[2][0]).not.toContain('Email IN');
        expect(logger.error).toHaveBeenCalledWith(
            'Error fetching Bullhorn user profile',
            expect.objectContaining({
                stack: expect.stringContaining('profile unavailable')
            })
        );
    });

    test('generates only the Salesforce header when the account query fails', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockRejectedValueOnce(new Error('account query failed'));
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(0);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to fetch Salesforce Account data:',
            expect.objectContaining({
                stack: expect.stringContaining('account query failed')
            })
        );
    });

    test('generates only the Salesforce header when the contact query fails', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_User_ID__c: 'rc-account-1'
                        }
                    ]
                }
            })
            .mockRejectedValueOnce(new Error('contact query failed'));
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(0);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to fetch Salesforce Contact data:',
            expect.objectContaining({
                Stack: expect.stringContaining('contact query failed')
            })
        );
    });

    test('generates only the Salesforce header when accounts have no 18 digit IDs', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-without-18',
                            RC_User_ID__c: 'rc-account-1'
                        }
                    ]
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'salesforce-access-token'
            }
        });

        const report = await bullhornReport.generateMonthlyCsvReportWithSalesforceData();

        expect(report.rowCount).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith('No accounts found for Bullhorn users; skipping Salesforce query');
    });

    test('logs when the Salesforce error report email fails', async () => {
        const error = new Error('original failure');
        axios.post.mockRejectedValueOnce(new Error('salesforce error email failed'));

        await bullhornReport.sendErrorReportEmailWithSalesforce(error, 'unit-test');

        expect(logger.error).toHaveBeenCalledWith(
            'Failed to send Salesforce error report email:',
            expect.objectContaining({
                stack: expect.stringContaining('salesforce error email failed')
            })
        );
    });

    test('logs and continues when Salesforce report file deletion fails', async () => {
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            email: 'alice@example.com',
                            name: 'Alice Example'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-account-1',
                            Accoutn18DigitID__c: '001ABC000000000001',
                            RC_User_ID__c: 'rc-account-1'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    records: [
                        {
                            Id: 'sf-contact-1',
                            FirstName: 'Alice',
                            LastName: 'Example',
                            AccountId: '001ABC000000000001',
                            Email: 'alice@example.com'
                        }
                    ]
                }
            });
        axios.post
            .mockResolvedValueOnce({
                data: {
                    access_token: 'salesforce-access-token'
                }
            })
            .mockResolvedValueOnce({ data: { ok: true } });
        const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
            throw new Error('salesforce unlink failed');
        });

        await bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData();

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to delete file'),
            expect.objectContaining({
                stack: expect.stringContaining('salesforce unlink failed')
            })
        );
        unlinkSpy.mockRestore();
        const filePath = path.join(reportsDir, `bullhorn_salesforce_report_${getUtcReportDate()}.csv`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    test('sends a Salesforce error report when OAuth token retrieval fails', async () => {
        const oauthError = new Error('salesforce oauth failed');
        mockFindAll.mockResolvedValueOnce([
            {
                ...userOne,
                rcAccountId: 'rc-account-1',
                updatedAt: new Date(Date.now() - dayMs)
            }
        ]);
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        email: 'alice@example.com',
                        name: 'Alice Example'
                    }
                ]
            }
        });
        axios.post
            .mockRejectedValueOnce(oauthError)
            .mockResolvedValueOnce({ data: { ok: true } });

        await bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData();

        expect(logger.error).toHaveBeenCalledWith('Failed to retrieve Salesforce OAuth token:', {
            stack: oauthError.stack
        });
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to generate Salesforce report and send email:',
            expect.objectContaining({
                stack: oauthError.stack
            })
        );
        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(axios.post.mock.calls[1][1]).toMatchObject({
            subject: `Bullhorn Monthly Salesforce Report FAILED ${getUtcEmailDateString()}`
        });
    });
});

export {};
