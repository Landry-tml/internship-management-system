const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is not configured; generated a temporary process-local key. Sessions expire on restart.');
}
if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
}

module.exports = jwtSecret;
