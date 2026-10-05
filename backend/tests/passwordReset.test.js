jest.mock('../config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

jest.mock('../services/emailService', () => ({
    isConfigured: jest.fn(),
    sendPasswordResetCode: jest.fn()
}));

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const jwtSecret = require('../config/jwtSecret');
const { isConfigured, sendPasswordResetCode } = require('../services/emailService');
const { requestPasswordReset, resetPassword } = require('../controllers/passwordResetController');

function response() {
    return {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

describe('email password reset flow', () => {
    beforeEach(() => {
        pool.query.mockReset();
        pool.getConnection.mockReset();
        isConfigured.mockReset().mockReturnValue(true);
        sendPasswordResetCode.mockReset().mockResolvedValue(undefined);
    });

    it('sends a short-lived code without revealing whether an email has an account', async () => {
        const randomInt = jest.spyOn(crypto, 'randomInt').mockReturnValue(12345);
        pool.query
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            .mockResolvedValueOnce([[{ id: 17, name: 'Test User', email: 'user@example.com' }]])
            .mockResolvedValueOnce([[{ request_count: 0, recent_count: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            .mockResolvedValueOnce([{ insertId: 42 }]);
        const res = response();

        await requestPasswordReset({ body: { email: ' USER@example.com ' }, ip: '127.0.0.1' }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('If an account exists');
        expect(sendPasswordResetCode).toHaveBeenCalledWith('user@example.com', 'Test User', '012345');
        const insert = pool.query.mock.calls[4];
        expect(insert[0]).toContain('DATE_ADD(NOW(), INTERVAL ? MINUTE)');
        const expectedHash = crypto.createHmac('sha256', jwtSecret).update('17:012345').digest('hex');
        expect(insert[1]).toEqual([17, expectedHash, 10, '127.0.0.1']);
        randomInt.mockRestore();
    });

    it('returns the same request response for unknown addresses and enforces cooldown', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
        const unknown = response();
        await requestPasswordReset({ body: { email: 'unknown@example.com' } }, unknown);

        pool.query
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            .mockResolvedValueOnce([[{ id: 17, name: 'Test User', email: 'user@example.com' }]])
            .mockResolvedValueOnce([[{ request_count: 1, recent_count: 1 }]]);
        const limited = response();
        await requestPasswordReset({ body: { email: 'user@example.com' } }, limited);

        expect(unknown.body).toEqual(limited.body);
        expect(sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('rejects reset requests when SMTP is not configured without looking up accounts', async () => {
        isConfigured.mockReturnValue(false);
        const res = response();

        await requestPasswordReset({ body: { email: 'user@example.com' } }, res);

        expect(res.statusCode).toBe(503);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('increments invalid code attempts and does not change the password', async () => {
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            query: jest.fn().mockResolvedValueOnce([[
                { id: 42, user_id: 17, code_hash: '0'.repeat(64), attempts: 0, email: 'user@example.com' }
            ]]).mockResolvedValueOnce([{ affectedRows: 1 }])
        };
        pool.getConnection.mockResolvedValue(connection);
        const res = response();

        await resetPassword({
            body: { email: 'user@example.com', code: '000000', password: 'new-password-secure' }
        }, res);

        expect(res.statusCode).toBe(400);
        expect(connection.query.mock.calls[1][1]).toEqual([1, 1, 5, 42]);
        expect(connection.commit).toHaveBeenCalled();
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('hashes a new password and consumes reset codes after valid confirmation', async () => {
        const code = '012345';
        const codeHash = crypto.createHmac('sha256', jwtSecret).update(`17:${code}`).digest('hex');
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            query: jest.fn()
                .mockResolvedValueOnce([[
                    { id: 42, user_id: 17, code_hash: codeHash, attempts: 0, email: 'user@example.com' }
                ]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
        };
        pool.getConnection.mockResolvedValue(connection);
        const res = response();

        await resetPassword({
            body: { email: 'user@example.com', code, password: 'new-password-secure' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('Password reset successfully');
        const [passwordUpdate, params] = connection.query.mock.calls[1];
        expect(passwordUpdate).toContain('UPDATE users SET password');
        expect(await bcrypt.compare('new-password-secure', params[0])).toBe(true);
        expect(connection.query.mock.calls[2][0]).toContain('UPDATE password_reset_codes');
        expect(connection.commit).toHaveBeenCalled();
    });
});
