const request = require('supertest');
const { server } = require('../src/index');
const jwt = require('../src/lib/jwt');
const { UserModel } = require('../src/models/userModel');
const ClientOAuth2 = require('client-oauth2');

// create test data
const userId = 'userId';
const unknownUserId = 'unknownUserId';
const unknownJwt = 'unknownJwt;'
const rcUserNumber = '+123456789';
const unknownPhoneNumber = 'unknownPhoneNumber';
const accessToken = 'accessToken';
const refreshToken = 'refreshToken';
const expires = new Date();

describe('auth tests', () => {
    describe('oauth login', () => {
        describe('validations', () => {
            test('no platform - error', async () => {
                // Act
                const res = await request(server).get(`/oauth-callback`)

                // Assert
                expect(res.status).toEqual(400);
            })
        })
    });
    describe('logout', () => {
        describe('get jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/unAuthorize?jwtToken=${unknownJwt}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/unAuthorize`)

                // Assert
                expect(res.status).toEqual(400);
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        describe('logout', () => {
            test('unknown user - unsuccessful', async () => {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: unknownUserId,
                    rcUserNumber: unknownPhoneNumber,
                    platform: ''
                });
                // Act
                const res = await request(server).post(`/unAuthorize?jwtToken=${jwtToken}`)

                // Assert
                expect(res.status).toEqual(400);
                expect(res.error.text).toEqual('unknown user');
            });
            test('known user - successful', async () => {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber: rcUserNumber,
                    platform: ''
                });
                await UserModel.create({
                    id: userId,
                    name: '',
                    companyId: '',
                    companyName: '',
                    companyDomain: '',
                    platform: '',
                    accessToken: '',
                    refreshToken: '',
                    tokenExpiry: null,
                    rcUserNumber: rcUserNumber
                });

                // Act
                const res = await request(server).post(`/unAuthorize?jwtToken=${jwtToken}`)

                // Assert
                expect(res.status).toEqual(200);
                const userCheck = await UserModel.findByPk(`${userId}-pipedrive`);
                expect(userCheck).toBeNull();
            });
        });
    });
});