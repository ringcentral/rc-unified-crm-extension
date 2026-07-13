describe('app connector TypeScript modules', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        jest.dontMock('../../src/connectors/googleSheets/index');
    });

    test('googleSheets extra.ts exposes the source helper API', () => {
        jest.doMock('../../src/connectors/googleSheets/index', () => ({
            getOauthInfo: jest.fn()
        }));

        const googleSheetsExtra = require('../../src/connectors/googleSheets/extra.ts');

        expect(Object.keys(googleSheetsExtra).sort()).toEqual([
            'createNewSheet',
            'getAdminGoogleSheetsConfig',
            'removeSheet',
            'renderAdminPickerFile',
            'renderPickerFile',
            'setAdminGoogleSheetsConfig',
            'updateSelectedSheet'
        ]);
    });

    test('mock.ts exposes the source connector API', () => {
        jest.doMock('../../src/models/userModel', () => ({
            UserModel: {
                findByPk: jest.fn(),
                create: jest.fn()
            }
        }), { virtual: true });
        jest.doMock('../../src/models/callLogModel', () => ({
            CallLogModel: {
                create: jest.fn(),
                destroy: jest.fn(),
                findAll: jest.fn(),
                findOne: jest.fn()
            }
        }), { virtual: true });

        const mockConnector = require('../../src/connectors/mock.ts');

        expect(Object.keys(mockConnector).sort()).toEqual([
            'cleanUpMockLogs',
            'createCallLog',
            'createUser',
            'deleteUser',
            'getCallLog'
        ]);
    });

    test('redtail index.ts exposes the source connector API', () => {
        const redtail = require('../../src/connectors/redtail/index.ts');

        expect(Object.keys(redtail).sort()).toEqual([
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getBasicAuth',
            'getCallLog',
            'getLogFormatType',
            'getUserInfo',
            'getUserList',
            'unAuthorize',
            'updateCallLog',
            'updateMessageLog',
            'upsertCallDisposition'
        ]);
    });

    test('pipedrive index.ts exposes the source connector API', () => {
        const pipedrive = require('../../src/connectors/pipedrive/index.ts');

        expect(Object.keys(pipedrive).sort()).toEqual([
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getCallLog',
            'getLogFormatType',
            'getOauthInfo',
            'getUserInfo',
            'getUserList',
            'unAuthorize',
            'updateCallLog',
            'updateMessageLog',
            'upsertCallDisposition'
        ]);
    });

    test('vinsolutions index.ts exposes the source connector API', () => {
        const vinsolutions = require('../../src/connectors/vinsolutions/index.ts');

        expect(Object.keys(vinsolutions).sort()).toEqual([
            'checkAndRefreshAccessToken',
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getBasicAuth',
            'getCallLog',
            'getLogFormatType',
            'getOauthInfo',
            'getUserInfo',
            'getUserList',
            'postSaveUserInfo',
            'refreshUserInfo',
            'unAuthorize',
            'updateCallLog',
            'updateMessageLog'
        ]);
    });

    test('insightly index.ts exposes the source connector API', () => {
        const insightly = require('../../src/connectors/insightly/index.ts');

        expect(Object.keys(insightly).sort()).toEqual([
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getBasicAuth',
            'getCallLog',
            'getLogFormatType',
            'getUserInfo',
            'getUserList',
            'unAuthorize',
            'updateCallLog',
            'updateMessageLog',
            'upsertCallDisposition'
        ]);
    });

    test('googleSheets index.ts exposes the source connector API', () => {
        const googleSheets = require('../../src/connectors/googleSheets/index.ts');

        expect(Object.keys(googleSheets).sort()).toEqual([
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'getAuthType',
            'getCallLog',
            'getLogFormatType',
            'getOauthInfo',
            'getUserInfo',
            'unAuthorize',
            'updateCallLog',
            'updateMessageLog',
            'upsertCallDisposition'
        ]);
    });

    test('clio index.ts exposes the source connector API', () => {
        const clio = require('../../src/connectors/clio/index.ts');

        expect(Object.keys(clio).sort()).toEqual([
            'cancelAppointment',
            'createAppointment',
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getCallLog',
            'getLogFormatType',
            'getOauthInfo',
            'getUserInfo',
            'getUserList',
            'listAppointments',
            'refreshAppointment',
            'refreshUserInfo',
            'unAuthorize',
            'updateAppointment',
            'updateCallLog',
            'updateMessageLog',
            'upsertCallDisposition'
        ]);
    });

    test('netsuite index.ts exposes the source connector API', () => {
        const netsuite = require('../../src/connectors/netsuite/index.ts');

        expect(Object.keys(netsuite).sort()).toEqual([
            'cancelAppointment',
            'confirmAppointment',
            'createAppointment',
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getCallLog',
            'getLogFormatType',
            'getOauthInfo',
            'getUserInfo',
            'getUserList',
            'listAppointments',
            'refreshAppointment',
            'unAuthorize',
            'updateAppointment',
            'updateCallLog',
            'updateMessageLog',
            'upsertCallDisposition'
        ]);
    });

    test('bullhorn index.ts exposes the source connector API', () => {
        const bullhorn = require('../../src/connectors/bullhorn/index.ts');

        expect(Object.keys(bullhorn).sort()).toEqual([
            'authValidation',
            'cancelAppointment',
            'checkAndRefreshAccessToken',
            'createAppointment',
            'createCallLog',
            'createContact',
            'createMessageLog',
            'findContact',
            'findContactWithName',
            'getAuthType',
            'getCallLog',
            'getLogFormatType',
            'getOauthInfo',
            'getOverridingOAuthOption',
            'getServerLoggingSettings',
            'getUserInfo',
            'getUserList',
            'listAppointments',
            'postSaveUserInfo',
            'refreshAppointment',
            'unAuthorize',
            'updateAppointment',
            'updateCallLog',
            'updateMessageLog',
            'updateServerLoggingSettings',
            'upsertCallDisposition'
        ]);
    });

    test('bullhorn report.ts exposes the source report API', () => {
        const bullhornReport = require('../../src/connectors/bullhorn/report.ts');

        expect(Object.keys(bullhornReport).sort()).toEqual([
            'generateMonthlyCsvReport',
            'generateMonthlyCsvReportWithSalesforceData',
            'sendErrorReportEmailWithSalesforce',
            'sendMonthlyCsvReportByEmail',
            'sendMonthlyCsvReportByEmailWithSalesforceData'
        ]);
    });
});

export {};
