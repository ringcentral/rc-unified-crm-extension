const request = require('supertest');
const { app } = require('../src/app');

describe('Server', () => {
  describe('GET /is-alive', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/is-alive')
        .expect(200);
      expect(response.text).toBe('OK');
    });
  });
});
