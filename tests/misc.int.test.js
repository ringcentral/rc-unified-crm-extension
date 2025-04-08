const request = require('supertest');
const { getServer } = require('../src/index');
const { UserModel } = require('../src/models/userModel');
const platforms = require('../tests/platformInfo.json');
const jwt = require('../src/lib/jwt');

const extensionId = 'extensionId';
const accountId = 'accountId';
const hashedExtensionId = '346b1a50e634905c27cc79981bd9b9a37610d5ff870b29e1fb712990d27b7225';
const hashedAccountId = '0257a4adb1971568493912e5c7268fa2a771f82fc5c28fb5de4fb9f83577c89e';

// create test data
const userId = 'userId';
const rcUserNumber = '+123456789';
const accessToken = 'accessToken';

beforeAll(async () => {
    for (const platform of platforms) {
        await UserModel.create({
            id: userId,
            hostname: platform.hostname,
            platform: platform.name,
            rcUserNumber,
            accessToken
        });
    }
});

// clear test data in db
afterAll(async () => {
    for (const platform of platforms) {
        await UserModel.destroy({
            where: {
                id: userId,
                platform: platform.name
            }
        })
    }
});

describe('misc tests', () => {
    describe('get manifest', ()=>{
        test('get manifest- no platformName - return default', async()=>{
            // Act
            const res = await request(getServer()).get('/crmManifest');

            // Assert
            expect(res.status).toEqual(200);
            expect(res.body.author.name).toEqual('RingCentral Labs');
        })
        test('get manifest- has platformName - return platform manifest', async()=>{
            // Act
            const res = await request(getServer()).get('/crmManifest?platformName=testCRM');

            // Assert
            expect(res.status).toEqual(200);
            expect(res.body.author.name).toEqual('Test Developer');
        })
        test('get manifest- has platformName but not valid - return error', async()=>{
            // Act
            const res = await request(getServer()).get('/crmManifest?platformName=unknownCRM');

            // Assert
            expect(res.status).toEqual(400);
            expect(res.text).toEqual('Platform not found');
        })
    });
    describe('user info hash', () => {
        test('extensionId hash', async () => {
            // Act
            const res = await request(getServer()).get(`/userInfoHash?extensionId=${extensionId}&accountId=${accountId}`);

            // Assert
            expect(res.status).toEqual(200);
            expect(res.body.extensionId).toEqual(hashedExtensionId);
            expect(res.body.accountId).toEqual(hashedAccountId);
        })
    });
    describe('get hostname', () => {
        test('no jwt - 400', async () => {
            // Act
            const res = await request(getServer()).get(`/hostname`)

            // Assert
            expect(res.status).toEqual(400);
            expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
        });
        test('bad jwt - 400', async () => {
            // Act
            const res = await request(getServer()).get(`/hostname?jwtToken=randomJwt`)

            // Assert
            expect(res.status).toEqual(400);
        });
        test('has jwt - 200', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });

                // Act
                const res = await request(getServer()).get(`/hostname?jwtToken=${jwtToken}`)

                // Assert
                expect(res.status).toEqual(200);
                expect(res.text).toEqual(platform.hostname);
            }
        });
    })
});