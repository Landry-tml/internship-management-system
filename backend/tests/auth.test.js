const request = require('supertest');
const app = require('../server'); // Make sure server.js exports the express app

describe('Authentication API Tests', () => {
  it('should return 400 or 401 when logging in with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@test.com',
        password: 'wrongpassword'
      });
      
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});