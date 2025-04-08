const request = require('supertest');
const nock = require('nock');
const { getServer } = require('../src/index');
const jwt = require('../src/lib/jwt');
const platforms = require('../tests/platformInfo.json');
const { UserModel } = require('../src/models/userModel');
// create test data
const userId = 'userId';
const unknownUserId = 'unknownUserId';
const contactId = 'contactId';
const unknownJwt = 'unknownJwt;'
const rcUserNumber = '+123456789';
const accessToken = 'accessToken';
const phoneNumber = '+17206789819';
const unknownPhoneNumber = '+17206789820';
const extensionNumber = '224';
const newContactId = 'newContacId';
const newContactName = 'newContactName';

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


describe('contact tests', () => {
    describe('get contact', () => {
        describe('get jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(getServer()).get(`/contact?jwtToken=${unknownJwt}&phoneNumber=${phoneNumber}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(getServer()).get(`/contact?phoneNumber=${phoneNumber}`)

                // Assert
                expect(res.status).toEqual(400);
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        test('cannot find user - unsuccessful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: unknownUserId,
                    rcUserNumber,
                    platform: platform.name
                });

                // Act
                const res = await request(getServer()).get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.returnMessage.message).toEqual(`Contact not found`);
                expect(res.body.successful).toEqual(false);
            }
        });
        test('unknown contact - return only new contact placeholder', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search?term=${unknownPhoneNumber.replace('+1', '')}&fields=phone`)
                    .once()
                    .reply(200, {
                        data: {
                            items: []
                        }
                    });

                // Act
                const res = await request(getServer()).get(`/contact?jwtToken=${jwtToken}&phoneNumber=${unknownPhoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(true);
                expect(res.body.contact[0].isNewContact).toEqual(true);

                // Clean up
                platformFindContactScope.done();
            }
        });
        test('known contact - successful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search?term=${phoneNumber.replace('+1', '')}&fields=phone`)
                    .once()
                    .reply(200, {
                        data: {
                            items: [
                                {
                                    item: {
                                        id: contactId,
                                        phones: [phoneNumber],
                                        organization: {
                                            name: 'testOrganization'
                                        }
                                    }
                                }
                            ]
                        }
                    });
                const platformGetDealScope = nock(platform.domain)
                    .get(`${platform.contactDealPath}/${contactId}/deals?status=open`)
                    .once()
                    .reply(200, {
                        data: [{
                            id: 'dealId',
                            title: 'dealTitle'
                        }]
                    });

                // Act
                const res = await request(getServer()).get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(true);

                // Clean up
                platformFindContactScope.done();
                platformGetDealScope.done();
            }
        });
        test('429 rate limit exceeded', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search?term=${phoneNumber.replace('+1', '')}&fields=phone`)
                    .once()
                    .reply(429, {
                        message: 'Rate limit exceeded'
                    });

                // Act
                const res = await request(getServer()).get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);

                // Clean up
                platformFindContactScope.done();
            }
        });
        test('500 internal server error', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search?term=${phoneNumber.replace('+1', '')}&fields=phone`)
                    .once()
                    .reply(500, {
                        message: 'Internal server error'
                    });

                // Act
                const res = await request(getServer()).get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);

                // Clean up
                platformFindContactScope.done();
            }
        });
    });
    describe('create contact', () => {
        describe('get jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(getServer()).post(`/contact?jwtToken=${unknownJwt}&phoneNumber=${phoneNumber}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(getServer()).post(`/contact?phoneNumber=${phoneNumber}`)

                // Assert
                expect(res.status).toEqual(400);
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        test('new contact - successful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformCreateContactScope = nock(platform.domain)
                    .post(platform.contactPath)
                    .once()
                    .reply(200, {
                        data: {
                            id: newContactId,
                            name: newContactName
                        }
                    });

                // Act
                const res = await request(getServer()).post(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}&newContactName${newContactName}}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(true);

                // Clean up
                platformCreateContactScope.done();
            }
        })
        test('429 rate limit exceeded', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformCreateContactScope = nock(platform.domain)
                    .post(platform.contactPath)
                    .once()
                    .reply(429, {
                        message: 'Rate limit exceeded'
                    });

                // Act
                const res = await request(getServer()).post(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}&newContactName${newContactName}}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);

                // Clean up
                platformCreateContactScope.done();
            }
        });
        test('500 internal server error', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformCreateContactScope = nock(platform.domain)
                    .post(platform.contactPath)
                    .once()
                    .reply(500, {
                        message: 'Internal server error'
                    });

                // Act
                const res = await request(getServer()).post(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}&newContactName${newContactName}}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);

                // Clean up
                platformCreateContactScope.done();
            }
        });
    })
});