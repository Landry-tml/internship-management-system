const pool = require('../config/db');
const { notifyMany } = require('../services/notifications');

async function getInternships(req, res) {
    try {
        const { search, type, organization_id } = req.query;
        let query = `
            SELECT i.*, o.name AS organization_name, o.industry, o.logo AS organization_logo,
                   o.website AS organization_website, u.name AS creator_name
            FROM internships i JOIN organizations o ON i.organization_id = o.id
            JOIN users u ON i.created_by = u.id WHERE i.status = 'open'
        `;
        const params = [];
        if (search) {
            query += ' AND (i.title LIKE ? OR i.description LIKE ? OR o.name LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }
        if (type) {
            query += ' AND i.type = ?';
            params.push(type);
        }
        if (organization_id) {
            query += ' AND i.organization_id = ?';
            params.push(organization_id);
        }
        query += ' ORDER BY i.created_at DESC';
        const [internships] = await pool.query(query, params);
        return res.json({ internships });
    } catch (err) {
        console.error('getInternships error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve internship opportunities.' });
    }
}

async function getManagedInternships(req, res) {
    try {
        const [internships] = await pool.query(`
            SELECT i.*, o.name AS organization_name, o.industry, o.logo AS organization_logo,
                   o.website AS organization_website, u.name AS creator_name
            FROM internships i JOIN organizations o ON i.organization_id = o.id
            JOIN users u ON i.created_by = u.id ORDER BY i.created_at DESC
        `);
        return res.json({ internships });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve managed internships.' });
    }
}

async function getInternshipById(req, res) {
    try {
        const [rows] = await pool.query(`
            SELECT i.*, o.name AS organization_name, o.industry, o.description AS organization_description,
                   o.logo AS organization_logo, o.website AS organization_website
            FROM internships i JOIN organizations o ON i.organization_id = o.id
            WHERE i.id = ? AND i.status = 'open'
        `, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Internship position not found.' });
        return res.json({ internship: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch internship details.' });
    }
}

async function createInternship(req, res) {
    const { organization_id, title, description, requirements, location, type = 'Hybrid', stipend = '', duration_weeks, department_id } = req.body;
    if (!organization_id || !title || !description || !location) {
        return res.status(400).json({ error: 'Organization ID, title, description, and location are required.' });
    }
    if (!['Remote', 'On-Site', 'Hybrid'].includes(type)) return res.status(400).json({ error: 'Invalid internship type.' });
    if (duration_weeks !== undefined && (!Number.isInteger(Number(duration_weeks)) || Number(duration_weeks) < 1 || Number(duration_weeks) > 104)) {
        return res.status(400).json({ error: 'Duration must be between 1 and 104 weeks.' });
    }
    if (department_id && !Number.isInteger(Number(department_id))) return res.status(400).json({ error: 'Department ID must be numeric.' });
    try {
        if (department_id) {
            const [departments] = await pool.query('SELECT id FROM departments WHERE id = ?', [department_id]);
            if (!departments.length) return res.status(400).json({ error: 'Department not found.' });
        }
        const [result] = await pool.query(
            `INSERT INTO internships
             (organization_id, title, description, requirements, location, type, stipend, status, created_by, duration_weeks, department_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
            [organization_id, title, description, requirements || '', location, type, stipend, req.user.id,
                duration_weeks || null, department_id || null]
        );
        const [interns] = await pool.query(`SELECT id FROM users WHERE is_active = 1 AND role = 'intern'`);
        await notifyMany(interns.map((user) => user.id), 'internship_posted',
            `A new internship opportunity is available: ${title}.`, 'internship', result.insertId);
        return res.status(201).json({ message: 'Internship offer posted successfully.', internshipId: result.insertId });
    } catch (err) {
        console.error('createInternship error:', err.message);
        return res.status(500).json({ error: 'Failed to post internship opportunity.' });
    }
}

async function updateInternshipStatus(req, res) {
    const { status } = req.body;
    if (!['open', 'closed', 'suspended'].includes(status)) {
        return res.status(400).json({ error: 'Status must be open, closed, or suspended.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE internships SET status = ?, suspended_at = IF(? = "suspended", CURRENT_TIMESTAMP, NULL) WHERE id = ? AND status <> "deleted"',
            [status, status, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ error: 'Internship not found.' });
        const [applicants] = await pool.query('SELECT intern_id FROM applications WHERE internship_id = ?', [req.params.id]);
        await notifyMany(applicants.map((row) => row.intern_id), `internship_${status}`,
            `An internship you applied for is now ${status}.`, 'internship', Number(req.params.id));
        return res.json({ message: `Internship ${status}.`, status });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update internship.' });
    }
}

async function deleteInternship(req, res) {
    try {
        const [result] = await pool.query(`UPDATE internships SET status = 'deleted' WHERE id = ?`, [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Internship not found.' });
        const [applicants] = await pool.query('SELECT intern_id FROM applications WHERE internship_id = ?', [req.params.id]);
        await notifyMany(applicants.map((row) => row.intern_id), 'internship_deleted',
            'An internship you applied for was removed.', 'internship', Number(req.params.id));
        return res.json({ message: 'Internship deleted.' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete internship.' });
    }
}

module.exports = { getInternships, getManagedInternships, getInternshipById, createInternship, updateInternshipStatus, deleteInternship };
