const pool = require('../config/db');

async function getPlacements(req, res) {
    try {
        let scope = '';
        const params = [];
        if (req.user.role === 'supervisor') {
            scope = `WHERE p.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN
                (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                OR COALESCE(p.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)`;
            params.push(req.user.id, req.user.id, req.user.id);
        } else if (req.user.role === 'intern') {
            scope = 'WHERE p.intern_id = ?';
            params.push(req.user.id);
        }
        const [placements] = await pool.query(`
            SELECT DISTINCT p.id, p.intern_id, p.internship_id, p.created_at, intern.name AS intern_name, intern.email AS intern_email,
                   intern.phone AS intern_phone,
                   p.supervisor_id, supervisor.name AS supervisor_name, supervisor.email AS supervisor_email,
                   supervisor.phone AS supervisor_phone, i.title AS internship_title,
                   COALESCE(p.department_id, i.department_id) AS department_id, d.name AS department_name, o.name AS organization_name,
                   p.start_date, p.end_date, p.status
            FROM placements p
            JOIN users intern ON intern.id = p.intern_id
            LEFT JOIN users supervisor ON supervisor.id = p.supervisor_id
            JOIN internships i ON i.id = p.internship_id
            LEFT JOIN departments d ON d.id = COALESCE(p.department_id, i.department_id)
            JOIN organizations o ON o.id = i.organization_id
            ${scope}
            ORDER BY p.created_at DESC
        `, params);
        return res.json({ placements });
    } catch (err) {
        console.error('getPlacements error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve placements.' });
    }
}

module.exports = { getPlacements };
