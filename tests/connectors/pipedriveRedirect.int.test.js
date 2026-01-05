const request = require('supertest');
const nock = require('nock');
const { getServer } = require('../../src/index');
const { UserModel } = require('@app-connect/core/models/userModel');

// Test data
const userId = `pipedriveRedirectTestUser_${Date.now()}`;
const rcUserNumber = '+123456789';
const accessToken = 'testAccessToken';

// Mock environment variables
process.env.PIPEDRIVE_CLIENT_ID = 'test-pipedrive-client-id';
process.env.PIPEDRIVE_CLIENT_SECRET = 'test-pipedrive-client-secret';

beforeAll(async () => {
    await UserModel.create({
        id: userId,
        hostname: 'test.pipedrive.com',
        platform: 'pipedrive',
        rcUserNumber,
        accessToken,
        refreshToken: 'testRefreshToken'
    });
});

afterAll(async () => {
    // Clean up all test users
    await UserModel.destroy({
        where: {
            platform: 'pipedrive'
        }
    });
});

describe('Pipedrive Redirect Routes', () => {
    describe('GET /pipedrive-redirect', () => {
        test('should return redirect HTML page', async () => {
            const res = await request(getServer()).get('/pipedrive-redirect');
            
            expect(res.status).toEqual(200);
            expect(res.type).toEqual('text/html');
            expect(res.text).toContain('RingCentral Extension for Pipedrive');
            expect(res.text).toContain('handleRedirect');
        });

        test('should contain installation instructions', async () => {
            const res = await request(getServer()).get('/pipedrive-redirect');
            
            expect(res.status).toEqual(200);
            // Note: There's a typo in the HTML ("Pipdrive" instead of "Pipedrive")
            expect(res.text).toContain('Pipdrive Marketplace');
            expect(res.text).toContain('www.pipedrive.com/en/marketplace');
        });
    });

    describe('DELETE /pipedrive-redirect', () => {
        test('should return 401 without proper authorization', async () => {
            // Without proper authorization, should return 401
            const res = await request(getServer())
                .delete('/pipedrive-redirect')
                .send({ user_id: userId });
            
            // Should return 401 Unauthorized
            expect(res.status).toEqual(401);
            
            // User should still exist
            const userCheck = await UserModel.findByPk(userId);
            expect(userCheck).not.toBeNull();
        });

        test('should delete user with valid basic auth', async () => {
            // Create a temporary user for this test with unique ID
            const tempUserId = `tempDeleteUser_${Date.now()}`;
            await UserModel.create({
                id: tempUserId,
                hostname: 'test.pipedrive.com',
                platform: 'pipedrive',
                rcUserNumber: '+19876543210',
                accessToken: 'tempAccessToken',
                refreshToken: 'tempRefreshToken'
            });
            
            // Verify user exists
            let userCheck = await UserModel.findByPk(tempUserId);
            expect(userCheck).not.toBeNull();
            
            // Mock the token revocation API calls (unAuthorize revokes both refresh and access tokens)
            const tokenRevokeScope = nock('https://oauth.pipedrive.com')
                .post('/oauth/revoke', /token=tempRefreshToken/)
                .reply(200)
                .post('/oauth/revoke', /token=tempAccessToken/)
                .reply(200);
            
            // Create proper basic auth header
            const credentials = Buffer.from(
                `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
            ).toString('base64');
            
            const res = await request(getServer())
                .delete('/pipedrive-redirect')
                .set('Authorization', `Basic ${credentials}`)
                .send({ user_id: tempUserId });
            
            // Verify response
            expect(res.status).toEqual(200);
            
            // Verify user is deleted
            userCheck = await UserModel.findByPk(tempUserId);
            expect(userCheck).toBeNull();
            
            // Clean up nock
            tokenRevokeScope.done();
        });

        test('should not delete user with invalid basic auth', async () => {
            // Create a temporary user for this test with unique ID
            const tempUserId = `tempDeleteUser2_${Date.now()}`;
            await UserModel.create({
                id: tempUserId,
                hostname: 'test.pipedrive.com',
                platform: 'pipedrive',
                rcUserNumber: '+19876543211',
                accessToken: 'tempAccessToken2',
                refreshToken: 'tempRefreshToken2'
            });
            
            // Verify user exists
            let userCheck = await UserModel.findByPk(tempUserId);
            expect(userCheck).not.toBeNull();
            
            // Create invalid basic auth header
            const wrongCredentials = Buffer.from('wrong:credentials').toString('base64');
            
            const res = await request(getServer())
                .delete('/pipedrive-redirect')
                .set('Authorization', `Basic ${wrongCredentials}`)
                .send({ user_id: tempUserId });
            
            // Should return 401 Unauthorized
            expect(res.status).toEqual(401);
            
            // User should still exist (not deleted)
            userCheck = await UserModel.findByPk(tempUserId);
            expect(userCheck).not.toBeNull();
        });

        test('should return 400 for missing user_id', async () => {
            const credentials = Buffer.from(
                `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
            ).toString('base64');
            
            const res = await request(getServer())
                .delete('/pipedrive-redirect')
                .set('Authorization', `Basic ${credentials}`)
                .send({});
            
            // Should return 400 for missing user_id
            expect(res.status).toEqual(400);
            expect(res.text).toEqual('Missing user_id');
        });

        test('should handle non-existent user_id gracefully', async () => {
            const credentials = Buffer.from(
                `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
            ).toString('base64');
            
            const res = await request(getServer())
                .delete('/pipedrive-redirect')
                .set('Authorization', `Basic ${credentials}`)
                .send({ user_id: 'nonExistentUserId12345' });
            
            // Should return 200 even for non-existent user (idempotent delete)
            expect(res.status).toEqual(200);
        });
    });
});

