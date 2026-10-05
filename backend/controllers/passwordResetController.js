const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const jwtSecret = require('../config/jwtSecret');
const { isConfigured, sendPasswordResetCode } = require('../services/emailService');

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;
const REQUEST_COOLDOWN_SECONDS = 60;
const GENERIC_REQUEST_MESSAGE = 'If an account exists for this email, a password reset code will be sent shortly.';

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hashCode(userId, code) {
    return crypto.createHmac('sha256', jwtSecret).update(`${userId}:${code}`).digest('hex');
}

function secureHashEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function requestPasswordReset(req, res) {
    const email = normalizeEmail(req.body.email);
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!isConfigured()) {
        return res.status(503).json({ error: 'Password reset email is not configured. Contact the system administrator.' });
    }

    let resetId = null;
    try {
        await pool.query(
            'DELETE FROM password_reset_codes WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
        );
        const [users] = await pool.query(
            'SELECT id, name, email FROM users WHERE email = ? LIMIT 1',
            [email]
        );
        if (!users.length) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`[PASSWORD RESET] Email '${email}' was not found in the users database.`);
            }
            return res.json({ message: GENERIC_REQUEST_MESSAGE });
        }

        const user = users[0];
        const [limits] = await pool.query(
            `SELECT COUNT(*) AS request_count,
                    SUM(created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)) AS recent_count
             FROM password_reset_codes
             WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [REQUEST_COOLDOWN_SECONDS, user.id]
        );
        if (Number(limits[0]?.request_count || 0) >= MAX_REQUESTS_PER_HOUR ||
            Number(limits[0]?.recent_count || 0) > 0) {
            return res.json({ message: GENERIC_REQUEST_MESSAGE });
        }

        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const codeHash = hashCode(user.id, code);
        await pool.query(
            `UPDATE password_reset_codes SET consumed_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND consumed_at IS NULL`,
            [user.id]
        );
        const [inserted] = await pool.query(
            `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, request_ip)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
            [user.id, codeHash, CODE_TTL_MINUTES, String(req.ip || '').slice(0, 45) || null]
        );
        resetId = inserted.insertId;

        let devMessage = GENERIC_REQUEST_MESSAGE;
        try {
            await sendPasswordResetCode(user.email, user.name, code);
        } catch (emailError) {
            console.error('Password reset email delivery failed:', emailError.message);
            if (process.env.NODE_ENV !== 'production') {
                console.log('\n======================================================');
                console.log(`[PASSWORD RESET DEV CODE] Email: ${user.email} | Code: ${code}`);
                console.log('======================================================\n');
                devMessage = `${GENERIC_REQUEST_MESSAGE} [Reset code: ${code}]`;
                return res.json({
                    message: devMessage,
                    devCode: code
                });
            } else {
                await pool.query(
                    'UPDATE password_reset_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [resetId]
                );
            }
            return res.json({ message: GENERIC_REQUEST_MESSAGE });
        }
        if (process.env.NODE_ENV !== 'production') {
            return res.json({
                message: `${GENERIC_REQUEST_MESSAGE} [Reset code: ${code}]`,
                devCode: code
            });
        }
        return res.json({ message: GENERIC_REQUEST_MESSAGE });
    } catch (err) {
        console.error('requestPasswordReset error:', err.message);
        return res.status(500).json({ error: 'Unable to process the password reset request.' });
    }
}

async function resetPassword(req, res) {
    const email = normalizeEmail(req.body.email);
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    const password = req.body.password;
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) ||
        !/^\d{6}$/.test(code) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: 'Enter your email, six-digit reset code, and a password between 8 and 128 characters.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT pr.id, pr.user_id, pr.code_hash, pr.attempts, u.email
             FROM password_reset_codes pr
             JOIN users u ON u.id = pr.user_id
             WHERE u.email = ? AND pr.consumed_at IS NULL AND pr.expires_at > NOW()
             ORDER BY pr.created_at DESC LIMIT 1 FOR UPDATE`,
            [email]
        );
        if (!rows.length || Number(rows[0].attempts) >= MAX_CODE_ATTEMPTS) {
            await connection.rollback();
            return res.status(400).json({ error: 'The reset code is invalid or expired. Request a new code and try again.' });
        }

        const reset = rows[0];
        if (!secureHashEqual(reset.code_hash, hashCode(reset.user_id, code))) {
            const attempts = Number(reset.attempts) + 1;
            await connection.query(
                `UPDATE password_reset_codes
                 SET attempts = ?, consumed_at = IF(? >= ?, CURRENT_TIMESTAMP, consumed_at)
                 WHERE id = ?`,
                [attempts, attempts, MAX_CODE_ATTEMPTS, reset.id]
            );
            await connection.commit();
            return res.status(400).json({ error: 'The reset code is invalid or expired. Request a new code and try again.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await connection.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, reset.user_id]);
        await connection.query(
            `UPDATE password_reset_codes SET consumed_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND consumed_at IS NULL`,
            [reset.user_id]
        );
        await connection.commit();
        return res.json({ message: 'Password reset successfully. Sign in with your new password.' });
    } catch (err) {
        await connection.rollback();
        console.error('resetPassword error:', err.message);
        return res.status(500).json({ error: 'Unable to reset the password.' });
    } finally {
        connection.release();
    }
}

module.exports = { requestPasswordReset, resetPassword };
