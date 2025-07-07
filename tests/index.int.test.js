const request = require('supertest');
const nock = require('nock');
const platforms = require('./platformInfo.json');
const { getServer } = require('../src/index');
const jwt = require('../src/lib/jwt');
const { UserModel } = require('../src/models/userModel');

// Test data
const baseUserId = 'testUserId';
const unknownUserId = 'unknownUserId';
const unknownJwt = 'unknownJwt';
const accessToken = 'accessToken';
const rcUserNumber = '+123456789';

beforeAll(async () => {
    // Create test user for platforms with unique IDs
    for (const platform of platforms) {
        await UserModel.create({
            id: `${baseUserId}_${platform.name}`,
            hostname: platform.hostname,
            platform: platform.name,
            rcUserNumber,
            accessToken,
            timezoneOffset: '+08:00',
            platformAdditionalInfo: {
                encodedApiUsername: '',
                encodedApiPassword: ''
            }
        });
    }
});

afterAll(async () => {
    // Clean up test data
    for (const platform of platforms) {
        await UserModel.destroy({
            where: {
                id: `${baseUserId}_${platform.name}`,
                platform: platform.name
            }
        });
    }
});

describe('Admin Server Logging Settings endpoints', () => {
    describe('GET /admin/serverLoggingSettings', () => {
        test('should return server logging settings with valid JWT', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${baseUserId}_${platform.name}`,
                    platform: platform.name
                });

                // Act
                const res = await request(getServer()).get(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`);

                // Assert
                expect(res.status).toBe(200);
                expect(res.body).toBeDefined();
                // pipedrive (and other non-bullhorn platforms) return empty object
                expect(res.body).toEqual({});
            }
        });

        test('should return 400 when JWT token is missing', async () => {
            // Act
            const res = await request(getServer()).get('/admin/serverLoggingSettings');

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });

        test('should return 400 when JWT token is invalid', async () => {
            // Act
            const res = await request(getServer()).get(`/admin/serverLoggingSettings?jwtToken=${unknownJwt}`);

            // Assert
            expect(res.status).toBe(400);
        });

        test('should return 400 when user is not found', async () => {
            // Arrange
            const jwtToken = jwt.generateJwt({
                id: unknownUserId,
                platform: 'pipedrive'
            });

            // Act
            const res = await request(getServer()).get(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`);

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('User not found');
        });

        test('should return 400 when JWT token has no user id', async () => {
            // Arrange
            const jwtToken = jwt.generateJwt({
                platform: 'pipedrive'
            });

            // Act
            const res = await request(getServer()).get(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`);

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });
    });

    describe('POST /admin/serverLoggingSettings', () => {
        test('should update server logging settings with valid JWT and additionalFieldValues', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${baseUserId}_${platform.name}`,
                    platform: platform.name
                });
                const additionalFieldValues = {
                    apiUsername: 'newUsername',
                    apiPassword: 'newPassword'
                };

                // Act
                const res = await request(getServer())
                    .post(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`)
                    .send({ additionalFieldValues });

                // Assert
                expect(res.status).toBe(200);
                // pipedrive (and other non-bullhorn platforms) return empty object
                expect(res.body).toEqual({});
            }
        });

        test('should return 400 when JWT token is missing', async () => {
            // Arrange
            const additionalFieldValues = {
                apiUsername: 'newUsername',
                apiPassword: 'newPassword'
            };

            // Act
            const res = await request(getServer())
                .post('/admin/serverLoggingSettings')
                .send({ additionalFieldValues });

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });

        test('should return 400 when JWT token is invalid', async () => {
            // Arrange
            const additionalFieldValues = {
                apiUsername: 'newUsername',
                apiPassword: 'newPassword'
            };

            // Act
            const res = await request(getServer())
                .post(`/admin/serverLoggingSettings?jwtToken=${unknownJwt}`)
                .send({ additionalFieldValues });

            // Assert
            expect(res.status).toBe(400);
        });

        test('should return 400 when additionalFieldValues is missing', async () => {
            // Arrange
            const jwtToken = jwt.generateJwt({
                id: `${baseUserId}_pipedrive`,
                platform: 'pipedrive'
            });

            // Act
            const res = await request(getServer())
                .post(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`)
                .send({});

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('Missing additionalFieldValues');
        });

        test('should return 400 when user is not found', async () => {
            // Arrange
            const jwtToken = jwt.generateJwt({
                id: unknownUserId,
                platform: 'pipedrive'
            });
            const additionalFieldValues = {
                apiUsername: 'newUsername',
                apiPassword: 'newPassword'
            };

            // Act
            const res = await request(getServer())
                .post(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`)
                .send({ additionalFieldValues });

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('User not found');
        });

        test('should return 400 when JWT token has no user id', async () => {
            // Arrange
            const jwtToken = jwt.generateJwt({
                platform: 'pipedrive'
            });
            const additionalFieldValues = {
                apiUsername: 'newUsername',
                apiPassword: 'newPassword'
            };

            // Act
            const res = await request(getServer())
                .post(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`)
                .send({ additionalFieldValues });

            // Assert
            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });

        test('should handle empty additionalFieldValues', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${baseUserId}_${platform.name}`,
                    platform: platform.name
                });
                const additionalFieldValues = {};

                // Act
                const res = await request(getServer())
                    .post(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`)
                    .send({ additionalFieldValues });

                // Assert
                expect(res.status).toBe(200);
                // pipedrive (and other non-bullhorn platforms) return empty object
                expect(res.body).toEqual({});
            }
        });

        test('should handle partial additionalFieldValues', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${baseUserId}_${platform.name}`,
                    platform: platform.name
                });
                const additionalFieldValues = {
                    apiUsername: 'partialUsername'
                    // Missing apiPassword
                };

                // Act
                const res = await request(getServer())
                    .post(`/admin/serverLoggingSettings?jwtToken=${jwtToken}`)
                    .send({ additionalFieldValues });

                // Assert
                expect(res.status).toBe(200);
                // pipedrive (and other non-bullhorn platforms) return empty object
                expect(res.body).toEqual({});
            }
        });
    });
});

