const jwt = require('jsonwebtoken');
const path = require('path');
const pool = require('../config/db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const JWT_SECRET = require('../config/jwtSecret');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.query('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [decoded.id]);
        if (!users.length || !users[0].is_active) {
            return res.status(401).json({ error: 'Account is unavailable.' });
        }
        req.user = { id: users[0].id, name: users[0].name, email: users[0].email, role: users[0].role };
        return next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(403).json({ error: 'Invalid or expired authentication token.' });
        }
        console.error('Authentication lookup failed:', err.message);
        return res.status(503).json({ error: 'Authentication service unavailable.' });
    }
}

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: `Forbidden. Role '${req.user ? req.user.role : 'none'}' does not have permission for this resource.` 
            });
        }
        next();
    };
}

module.exports = {
    authenticateToken,
    authorizeRoles
};
