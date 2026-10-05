const pool = require('../config/db');
const { notify } = require('../services/notifications');

// GET /api/users - List users (Admin/Supervisor)
async function getUsers(req, res) {
    try {
        const { role } = req.query;
        let query = 'SELECT id, name, email, role, phone, bio, avatar, is_active, department_id, created_at FROM users';
        let params = [];
        if (req.user.role === 'supervisor') {
            query += ` WHERE (id IN (SELECT intern_id FROM placements WHERE supervisor_id = ?)
                OR id IN (SELECT p.intern_id FROM placements p JOIN internships i ON i.id = p.internship_id
                    JOIN department_supervisors ds ON ds.department_id = COALESCE(p.department_id, i.department_id) WHERE ds.supervisor_id = ?)
                OR id IN (SELECT p.intern_id FROM placements p JOIN internships i ON i.id = p.internship_id
                    WHERE COALESCE(p.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)))`;
            params.push(req.user.id, req.user.id, req.user.id);
        }

        if (role) {
            query += query.includes(' WHERE ') ? ' AND role = ?' : ' WHERE role = ?';
            params.push(role);
        }

        query += ' ORDER BY created_at DESC';

        const [users] = await pool.query(query, params);
        return res.json({ users });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve users.' });
    }
}

// PUT /api/users/:id/role - Update user role (Admin)
async function updateUserRole(req, res) {
    const { id } = req.params;
    const { role } = req.body;
    if (!['visitor', 'intern', 'supervisor', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid user role specified.' });
    }
    if (Number(id) === Number(req.user.id) && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot remove your own administrator role.' });
    }
    try {
        const [result] = await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
        return res.json({ message: `User ID ${id} role updated to '${role}'.` });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update user role.' });
    }
}

async function updateUserStatus(req, res) {
    if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'You cannot suspend your own account.' });
    const { status } = req.body;
    let isActive;
    if (status === 'active') isActive = true;
    else if (status === 'suspended') isActive = false;
    else if (typeof req.body.is_active === 'boolean') isActive = req.body.is_active;
    else return res.status(400).json({ error: "Provide status 'active' or 'suspended'." });
    try {
        const [result] = await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
        return res.json({ message: isActive ? 'User activated.' : 'User suspended.', status: isActive ? 'active' : 'suspended' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update user status.' });
    }
}

async function deleteUser(req, res) {
    if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'You cannot delete your own account.' });
    try {
        const [linked] = await pool.query(`
            SELECT
              EXISTS(SELECT 1 FROM placements WHERE intern_id = ? OR supervisor_id = ?) OR
              EXISTS(SELECT 1 FROM applications WHERE intern_id = ?) OR
              EXISTS(SELECT 1 FROM internships WHERE created_by = ?) OR
              EXISTS(SELECT 1 FROM evaluations WHERE supervisor_id = ?) AS has_history
        `, [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id]);
        if (linked[0].has_history) {
            return res.status(409).json({ error: 'User has linked internship history; suspend the account instead of deleting it.' });
        }
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
        return res.json({ message: 'User deleted.' });
    } catch (err) {
        return res.status(409).json({ error: 'User could not be deleted while linked records prevent deletion.' });
    }
}

async function getDepartments(req, res) {
    try {
        if (['intern', 'visitor'].includes(req.user.role)) {
            const [departments] = await pool.query('SELECT id, name, description FROM departments ORDER BY name');
            return res.json({ departments });
        }
        const [departments] = await pool.query(`
            SELECT d.*, GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') AS supervisors,
                   GROUP_CONCAT(DISTINCT ds.supervisor_id ORDER BY ds.supervisor_id) AS supervisor_ids
            FROM departments d LEFT JOIN department_supervisors ds ON ds.department_id = d.id
            LEFT JOIN users u ON u.id = ds.supervisor_id GROUP BY d.id ORDER BY d.name
        `);
        return res.json({ departments });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve departments.' });
    }
}

async function createDepartment(req, res) {
    const { name, description = '' } = req.body;
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Department name is required.' });
    try {
        const [result] = await pool.query('INSERT INTO departments (name, description) VALUES (?, ?)', [name.trim(), description]);
        return res.status(201).json({ department: { id: result.insertId, name: name.trim(), description } });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Department already exists.' });
        return res.status(500).json({ error: 'Failed to create department.' });
    }
}

async function assignSupervisorToDepartment(req, res) {
    const departmentId = Number(req.params.departmentId || req.params.id);
    const supervisorId = Number(req.body.supervisor_id);
    if (!Number.isInteger(departmentId) || departmentId < 1 ||
        !Number.isInteger(supervisorId) || supervisorId < 1) {
        return res.status(400).json({ error: 'A valid department and supervisor are required.' });
    }
    try {
        const [supervisors] = await pool.query('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [supervisorId]);
        if (!supervisors.length || supervisors[0].role !== 'supervisor') return res.status(400).json({ error: 'An active supervisor account is required.' });
        await pool.query('INSERT IGNORE INTO department_supervisors (department_id, supervisor_id) VALUES (?, ?)', [departmentId, supervisorId]);
        await pool.query('UPDATE users SET department_id = ? WHERE id = ?', [departmentId, supervisorId]);
        await notify(supervisorId, 'department_assignment', 'You have been assigned to a department.', 'department', departmentId)
            .catch((notificationError) => console.error('department notification failed:', notificationError.message));
        return res.status(200).json({ message: 'Supervisor assigned to department.' });
    } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ error: 'Department not found.' });
        return res.status(500).json({ error: 'Failed to assign supervisor.' });
    }
}

async function removeSupervisorFromDepartment(req, res) {
    const departmentId = Number(req.params.departmentId);
    const supervisorId = Number(req.params.supervisorId);
    if (!Number.isInteger(departmentId) || departmentId < 1 ||
        !Number.isInteger(supervisorId) || supervisorId < 1) {
        return res.status(400).json({ error: 'A valid department and supervisor are required.' });
    }
    try {
        await pool.query('DELETE FROM department_supervisors WHERE department_id = ? AND supervisor_id = ?', [departmentId, supervisorId]);
        const [assignments] = await pool.query(
            'SELECT department_id FROM department_supervisors WHERE supervisor_id = ? ORDER BY department_id LIMIT 1',
            [supervisorId]
        );
        await pool.query(
            'UPDATE users SET department_id = ? WHERE id = ? AND department_id = ?',
            [assignments[0]?.department_id || null, supervisorId, departmentId]
        );
        return res.json({ message: 'Supervisor removed from department.' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to remove supervisor assignment.' });
    }
}

// PUT /api/users/profile - Update own profile
async function updateProfile(req, res) {
    const { name, phone, bio, avatar } = req.body;
    const userId = req.user.id;
    const profileFields = { name, phone, bio, avatar };
    for (const [field, value] of Object.entries(profileFields)) {
        if (value !== undefined && value !== null && typeof value !== 'string') {
            return res.status(400).json({ error: `${field} must be text.` });
        }
    }
    if (name !== undefined && !name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty.' });
    }
    if (name && name.trim().length > 100) return res.status(400).json({ error: 'Name must be 100 characters or fewer.' });
    if (phone && phone.length > 30) return res.status(400).json({ error: 'Phone must be 30 characters or fewer.' });

    try {
        await pool.query(
            'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), bio = COALESCE(?, bio), avatar = COALESCE(?, avatar) WHERE id = ?',
            [name === undefined ? null : name.trim(), phone, bio, avatar, userId]
        );

        const [updated] = await pool.query('SELECT id, name, email, role, phone, bio, avatar FROM users WHERE id = ?', [userId]);
        return res.json({ message: 'Profile updated successfully!', user: updated[0] });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update profile.' });
    }
}

// GET /api/users/organizations - List organizations
async function getOrganizations(req, res) {
    try {
        const [orgs] = await pool.query('SELECT * FROM organizations ORDER BY created_at DESC');
        return res.json({ organizations: orgs });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve organizations.' });
    }
}

// POST /api/users/organizations - Create organization (Admin)
async function createOrganization(req, res) {
    const { name, industry, description, website, location, logo } = req.body;
    if (!name || !industry) {
        return res.status(400).json({ error: 'Organization name and industry are required.' });
    }

    try {
        const defaultLogo = logo || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80';
        const [result] = await pool.query(
            'INSERT INTO organizations (name, industry, description, website, location, logo) VALUES (?, ?, ?, ?, ?, ?)',
            [name, industry, description || '', website || '', location || '', defaultLogo]
        );

        return res.status(201).json({ 
            message: 'Organization created successfully!', 
            organization: { id: result.insertId, name, industry, description, website, location, logo: defaultLogo } 
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to create organization.' });
    }
}

module.exports = {
    getUsers,
    updateUserRole,
    updateUserStatus,
    deleteUser,
    getDepartments,
    createDepartment,
    assignSupervisorToDepartment,
    removeSupervisorFromDepartment,
    updateProfile,
    getOrganizations,
    createOrganization
};
