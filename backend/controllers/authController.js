const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyRealEmail } = require('../services/emailCheckService');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const JWT_SECRET = require('../config/jwtSecret');

// 1. Verify Real Email Endpoint
async function verifyEmail(req, res) {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email parameter is required.' });
    }

    const verificationResult = await verifyRealEmail(email);
    return res.json(verificationResult);
}

// 2. User Registration
async function register(req, res) {
    const { name, email, password, role: requestedRole = 'intern', phone = '', bio = '' } = req.body;
    if (!['intern', 'visitor', 'supervisor'].includes(requestedRole)) {
        return res.status(400).json({ error: 'Choose an intern, visitor, or supervisor account.' });
    }
    const role = requestedRole;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    // Verify Real Email First
    const emailStatus = await verifyRealEmail(email);
    if (!emailStatus.isValid) {
        return res.status(400).json({ 
            error: `Email validation failed: ${emailStatus.reason}` 
        });
    }

    try {
        // Check if user already exists
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const avatar = `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80`;

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role, phone, bio, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email.toLowerCase(), hashedPassword, role, phone, bio, avatar]
        );

        const userId = result.insertId;
        const user = { id: userId, name, email: email.toLowerCase(), role, phone, bio, avatar };

        // Generate JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            message: 'User registered successfully!',
            user,
            token,
            emailVerification: emailStatus
        });
    } catch (err) {
        console.error('Registration Error:', err.message);
        return res.status(500).json({ error: 'Database server error during registration.' });
    }
}

// 3. User Login
async function login(req, res) {
    const { email, password } = req.body;

    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Invalid email syntax format.' });
    }
    const emailStatus = {
        isValid: true,
        domain: normalizedEmail.split('@')[1],
        reason: 'Email syntax is valid.'
    };

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'No user account found with this email.' });
        }

        const user = users[0];
        if (!user.is_active) {
            return res.status(403).json({ error: 'This account has been suspended.' });
        }

        // Password verification
        let isMatch = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, user.password);
        }

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid password credential.' });
        }

        const userPayload = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            bio: user.bio,
            avatar: user.avatar
        };

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            message: 'Login successful!',
            user: userPayload,
            token,
            emailVerification: emailStatus
        });
    } catch (err) {
        console.error('Login Error:', err.message);
        return res.status(500).json({ error: 'Database server error during login.' });
    }
}

// 4. Get Current User Profile
async function getMe(req, res) {
    try {
        const [users] = await pool.query('SELECT id, name, email, role, phone, bio, avatar, created_at FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User profile not found.' });
        }
        return res.json({ user: users[0] });
    } catch (err) {
        return res.status(500).json({ error: 'Database server error.' });
    }
}

module.exports = {
    verifyEmail,
    register,
    login,
    getMe
};
