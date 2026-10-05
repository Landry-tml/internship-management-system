const pool = require('../config/db');

// GET /api/analytics - System-wide dashboard metrics & reports
async function getAnalytics(req, res) {
    try {
        const supervisor = req.user.role === 'supervisor';
        const scope = supervisor
            ? ` AND (p.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN
                (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                OR COALESCE(p.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?))`
            : '';
        const args = supervisor ? [req.user.id, req.user.id, req.user.id] : [];
        const [[{ total_users }]] = await pool.query(supervisor
            ? `SELECT COUNT(DISTINCT p.intern_id) + 1 AS total_users FROM placements p JOIN internships i ON i.id = p.internship_id WHERE p.status = 'active' ${scope}`
            : 'SELECT COUNT(*) AS total_users FROM users', args);
        const [[{ total_interns }]] = await pool.query(supervisor
            ? `SELECT COUNT(DISTINCT p.intern_id) AS total_interns FROM placements p
               JOIN internships i ON i.id = p.internship_id
               WHERE p.status = 'active' ${scope}`
            : `SELECT COUNT(*) AS total_interns FROM users WHERE role = 'intern'`);
        const [[{ total_supervisors }]] = await pool.query(supervisor
            ? 'SELECT 1 AS total_supervisors'
            : 'SELECT COUNT(*) AS total_supervisors FROM users WHERE role = "supervisor"');
        const [[{ total_organizations }]] = await pool.query(supervisor
            ? `SELECT COUNT(DISTINCT i.organization_id) AS total_organizations FROM internships i
               JOIN placements p ON p.internship_id = i.id WHERE p.status = 'active' ${scope}`
            : 'SELECT COUNT(*) AS total_organizations FROM organizations', args);
        const [[{ total_internships }]] = await pool.query(supervisor
            ? `SELECT COUNT(DISTINCT i.id) AS total_internships FROM internships i JOIN placements p ON p.internship_id = i.id WHERE p.status = 'active' ${scope}`
            : 'SELECT COUNT(*) AS total_internships FROM internships');
        const appScope = supervisor
            ? ` WHERE a.supervisor_id = ? OR COALESCE(a.department_id, i.department_id) IN
                (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                OR COALESCE(a.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)`
            : '';
        const [[{ total_applications }]] = await pool.query(
            `SELECT COUNT(*) AS total_applications FROM applications a JOIN internships i ON i.id = a.internship_id ${appScope}`, args);
        const [[{ total_placements }]] = await pool.query(
            `SELECT COUNT(*) AS total_placements FROM placements p JOIN internships i ON i.id = p.internship_id WHERE p.status = 'active' ${scope}`, args);
        const [[{ total_tasks }]] = await pool.query(
            `SELECT COUNT(*) AS total_tasks FROM tasks t JOIN placements p ON p.id = t.placement_id JOIN internships i ON i.id = p.internship_id WHERE 1=1 ${scope}`, args);
        const [[{ completed_tasks }]] = await pool.query(
            `SELECT COUNT(*) AS completed_tasks FROM tasks t JOIN placements p ON p.id = t.placement_id JOIN internships i ON i.id = p.internship_id WHERE t.status = "completed" ${scope}`, args);
        const [[{ avg_evaluation_score }]] = await pool.query(
            `SELECT COALESCE(ROUND(AVG(e.performance_score)), 0) AS avg_evaluation_score
             FROM evaluations e JOIN placements p ON p.id = e.placement_id JOIN internships i ON i.id = p.internship_id WHERE 1=1 ${scope}`, args);

        // Application status breakdown
        const [appStats] = await pool.query(
            `SELECT a.status, COUNT(*) as count FROM applications a JOIN internships i ON i.id = a.internship_id ${appScope} GROUP BY a.status`, args);
        
        // Placements list with intern & supervisor details
        const [placementsList] = await pool.query(`
            SELECT p.*, COALESCE(p.department_id, i.department_id) AS department_id,
                   u_intern.name AS intern_name, u_intern.email AS intern_email, u_intern.avatar AS intern_avatar,
                   u_sup.name AS supervisor_name, i.title AS internship_title, o.name AS organization_name
            FROM placements p
            JOIN users u_intern ON p.intern_id = u_intern.id
            LEFT JOIN users u_sup ON p.supervisor_id = u_sup.id
            JOIN internships i ON p.internship_id = i.id
            JOIN organizations o ON i.organization_id = o.id
            WHERE p.status = 'active' ${scope}
            ORDER BY p.created_at DESC
        `, args);

        return res.json({
            metrics: {
                total_users,
                total_interns,
                total_supervisors,
                total_organizations,
                total_internships,
                total_applications,
                total_placements,
                total_tasks,
                completed_tasks,
                avg_evaluation_score
            },
            applicationStats: appStats,
            placements: placementsList
        });
    } catch (err) {
        console.error('getAnalytics error:', err.message);
        return res.status(500).json({ error: 'Failed to generate analytics report.' });
    }
}

module.exports = {
    getAnalytics
};
