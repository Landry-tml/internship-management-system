const pool = require('../config/db');

async function canAccessPlacement(user, placementId) {
    const [rows] = await pool.query(`
        SELECT p.id
        FROM placements p
        JOIN internships i ON i.id = p.internship_id
        LEFT JOIN department_supervisors ds
          ON ds.department_id = COALESCE(p.department_id, i.department_id) AND ds.supervisor_id = ?
        LEFT JOIN users su ON su.id = ?
        WHERE p.id = ?
          AND (? = 'admin'
            OR (? = 'intern' AND p.intern_id = ?)
            OR (? = 'supervisor' AND (
                p.supervisor_id = ? OR ds.supervisor_id IS NOT NULL
                OR (su.department_id IS NOT NULL AND su.department_id = COALESCE(p.department_id, i.department_id))
            )))
        LIMIT 1
    `, [user.id, user.id, placementId, user.role, user.role, user.id, user.role, user.id]);
    return rows.length > 0;
}

async function canReviewApplication(user, applicationId) {
    const [rows] = await pool.query(`
        SELECT a.id FROM applications a
        JOIN internships i ON i.id = a.internship_id
        LEFT JOIN department_supervisors ds
          ON ds.department_id = COALESCE(a.department_id, i.department_id) AND ds.supervisor_id = ?
        LEFT JOIN users su ON su.id = ?
        WHERE a.id = ? AND (
          ? = 'admin' OR (? = 'supervisor' AND (
            a.supervisor_id = ? OR ds.supervisor_id IS NOT NULL
            OR (su.department_id IS NOT NULL AND su.department_id = COALESCE(a.department_id, i.department_id))
          ))
        ) LIMIT 1
    `, [user.id, user.id, applicationId, user.role, user.role, user.id]);
    return rows.length > 0;
}

module.exports = { canAccessPlacement, canReviewApplication };
