const pool = require('../config/db');
const { canReviewApplication } = require('../services/accessControl');
const { notify, notifyMany } = require('../services/notifications');
const { isSafeExternalUrl } = require('../utils/validation');

async function applyForInternship(req, res) {
    const {
        internship_id, resume_url, cover_letter, motivation_letter: motivationText, recommendation_file_id, resume_file_id,
        duration_weeks, start_date, end_date, department_id
    } = req.body;
    const uploaded = req.files || {};
    const fileFrom = (field) => (uploaded[field] && uploaded[field][0]) || null;
    const internId = req.user.id;
    const fs = require('fs');
    const discardUploads = () => {
        for (const group of Object.values(uploaded)) for (const file of group || []) fs.unlink(file.path, () => {});
    };
    if (!internship_id) { discardUploads(); return res.status(400).json({ error: 'Internship ID is required.' }); }
    if (!department_id || !Number.isInteger(Number(department_id)) || Number(department_id) < 1) {
        discardUploads(); return res.status(400).json({ error: 'Choose a department for this application.' });
    }
    if (!isSafeExternalUrl(resume_url)) { discardUploads(); return res.status(400).json({ error: 'Resume URL must use HTTP or HTTPS, or upload the resume as a file.' }); }
    if (!fileFrom('motivation_letter')) {
        discardUploads(); return res.status(400).json({ error: 'Upload a motivation letter document.' });
    }
    if (!fileFrom('cv') && !resume_file_id) {
        discardUploads(); return res.status(400).json({ error: 'Upload a CV document.' });
    }
    if (duration_weeks !== undefined && (!Number.isInteger(Number(duration_weeks)) || Number(duration_weeks) < 1 || Number(duration_weeks) > 104)) {
        discardUploads(); return res.status(400).json({ error: 'Internship duration must be between 1 and 104 weeks.' });
    }
    if ((start_date && Number.isNaN(Date.parse(start_date))) || (end_date && Number.isNaN(Date.parse(end_date)))) {
        discardUploads(); return res.status(400).json({ error: 'Start and end dates must be valid dates.' });
    }
    if (!start_date || !end_date) {
        discardUploads(); return res.status(400).json({ error: 'Select the start and end dates for your internship.' });
    }
    if (start_date && end_date && Date.parse(end_date) <= Date.parse(start_date)) {
        discardUploads(); return res.status(400).json({ error: 'End date must be after start date.' });
    }
    const createdFileIds = [];
    try {
        const saveUpload = async (file, category) => {
            if (!file) return null;
            const headerBuffer = Buffer.alloc(4);
            const fs = require('fs');
            const fd = fs.openSync(file.path, 'r');
            fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
            fs.closeSync(fd);
            const valid = file.mimetype === 'application/pdf'
                ? headerBuffer.toString('ascii', 0, 4) === '%PDF'
                : file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ? headerBuffer[0] === 0x50 && headerBuffer[1] === 0x4b
                    : !headerBuffer.includes(0);
            if (!valid) throw Object.assign(new Error('File content does not match the declared document type.'), { statusCode: 400 });
            const [saved] = await pool.query(
                `INSERT INTO uploaded_files (owner_id, storage_name, original_name, mime_type, size_bytes, category)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [internId, file.filename, require('path').basename(file.originalname).slice(0, 255), file.mimetype, file.size, category]
            );
            createdFileIds.push(saved.insertId);
            return saved.insertId;
        };
        const [internships] = await pool.query('SELECT id, status, department_id FROM internships WHERE id = ?', [internship_id]);
        if (!internships.length || internships[0].status !== 'open') { discardUploads(); return res.status(404).json({ error: 'Internship is not accepting applications.' }); }
        const [departments] = await pool.query('SELECT id FROM departments WHERE id = ?', [department_id]);
        if (!departments.length) { discardUploads(); return res.status(400).json({ error: 'Selected department was not found.' }); }
        for (const fileId of [resume_file_id, recommendation_file_id].filter(Boolean)) {
            const [files] = await pool.query('SELECT id FROM uploaded_files WHERE id = ? AND owner_id = ?', [fileId, internId]);
            if (!files.length) { discardUploads(); return res.status(400).json({ error: 'Application files must be uploaded by the applicant.' }); }
        }
        const [existing] = await pool.query('SELECT id FROM applications WHERE internship_id = ? AND intern_id = ?', [internship_id, internId]);
        if (existing.length) { discardUploads(); return res.status(409).json({ error: 'You have already submitted an application for this position.' }); }
        const motivationFileId = await saveUpload(fileFrom('motivation_letter'), 'application');
        const resumeFileId = resume_file_id || await saveUpload(fileFrom('cv'), 'application');
        const recommendationFileId = recommendation_file_id || await saveUpload(fileFrom('recommendation_letter'), 'application');
        const [result] = await pool.query(
            `INSERT INTO applications
             (internship_id, intern_id, department_id, resume_url, cover_letter, motivation_letter, motivation_file_id, recommendation_file_id, resume_file_id,
              duration_weeks, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [internship_id, internId, department_id, resumeFileId ? '' : (resume_url || ''), cover_letter || motivationText || '',
                motivationText || cover_letter || (motivationFileId ? 'See attached motivation letter.' : ''), motivationFileId,
                recommendationFileId || null, resumeFileId || null, duration_weeks || null, start_date || null, end_date || null]
        );
        createdFileIds.length = 0;
        const departmentId = Number(department_id);
        let [supervisors] = departmentId
            ? await pool.query('SELECT supervisor_id AS id FROM department_supervisors WHERE department_id = ?', [departmentId])
            : [ [] ];
        if (departmentId) {
            const [departmentUsers] = await pool.query('SELECT id FROM users WHERE role = "supervisor" AND department_id = ?', [departmentId]);
            supervisors = supervisors.concat(departmentUsers);
        }
        const [admins] = await pool.query('SELECT id FROM users WHERE role = "admin" AND is_active = 1');
        supervisors = supervisors.concat(admins);
        await notifyMany(supervisors.map((row) => row.id), 'application_received', 'A new internship application is ready for review.', 'application', result.insertId)
            .catch((notificationError) => console.error('application notification failed:', notificationError.message));
        return res.status(201).json({
            message: 'Application submitted successfully.',
            applicationId: result.insertId,
            status: 'pending',
            files: {
                motivation_letter: motivationFileId ? `/api/files/${motivationFileId}` : null,
                cv: resumeFileId ? `/api/files/${resumeFileId}` : (resume_url || null),
                recommendation_letter: recommendationFileId ? `/api/files/${recommendationFileId}` : null
            }
        });
    } catch (err) {
        discardUploads();
        for (const fileId of createdFileIds) {
            await pool.query('DELETE FROM uploaded_files WHERE id = ? AND owner_id = ?', [fileId, internId])
                .catch((cleanupError) => console.error('application file cleanup failed:', cleanupError.message));
        }
        for (const field of ['motivation_letter', 'cv', 'recommendation_letter']) {
            for (const file of uploaded[field] || []) fs.unlink(file.path, () => {});
        }
        if (err.statusCode === 400) return res.status(400).json({ error: err.message });
        console.error('applyForInternship error:', err.message);
        return res.status(500).json({ error: 'Failed to submit application.' });
    }
}

async function getMyApplications(req, res) {
    try {
        const [applications] = await pool.query(`
            SELECT a.*, d.name AS department_name, i.title AS internship_title, i.location, i.type, i.duration_weeks AS internship_duration_weeks,
                   o.name AS organization_name, o.logo AS organization_logo, s.name AS supervisor_name,
                   CONCAT('/api/files/', a.motivation_file_id) AS motivation_letter_url,
                   CONCAT('/api/files/', a.resume_file_id) AS resume_file_url,
                   CONCAT('/api/files/', a.recommendation_file_id) AS recommendation_letter_url,
                   s.email AS supervisor_email, s.phone AS supervisor_phone
            FROM applications a
            JOIN internships i ON a.internship_id = i.id
            JOIN organizations o ON i.organization_id = o.id
            LEFT JOIN departments d ON d.id = COALESCE(a.department_id, i.department_id)
            LEFT JOIN users s ON a.supervisor_id = s.id
            WHERE a.intern_id = ? ORDER BY a.applied_at DESC
        `, [req.user.id]);
        return res.json({ applications });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch application tracking data.' });
    }
}

async function getAllApplications(req, res) {
    try {
        let filter = '';
        const params = [];
        if (req.user.role === 'supervisor') {
            filter = `WHERE a.supervisor_id = ? OR COALESCE(a.department_id, i.department_id) IN
                (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                OR COALESCE(a.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)`;
            params.push(req.user.id, req.user.id, req.user.id);
        }
        const [applications] = await pool.query(`
            SELECT a.*, u.name AS intern_name, u.email AS intern_email, u.avatar AS intern_avatar,
                   i.title AS internship_title, COALESCE(a.department_id, i.department_id) AS department_id,
                   d.name AS department_name, o.name AS organization_name, s.name AS supervisor_name,
                   CONCAT('/api/files/', a.motivation_file_id) AS motivation_letter_url,
                   CONCAT('/api/files/', a.resume_file_id) AS resume_file_url,
                   CONCAT('/api/files/', a.recommendation_file_id) AS recommendation_letter_url,
                   s.email AS supervisor_email, s.phone AS supervisor_phone
            FROM applications a
            JOIN users u ON a.intern_id = u.id
            JOIN internships i ON a.internship_id = i.id
            JOIN organizations o ON i.organization_id = o.id
            LEFT JOIN departments d ON d.id = COALESCE(a.department_id, i.department_id)
            LEFT JOIN users s ON a.supervisor_id = s.id
            ${filter} ORDER BY a.applied_at DESC
        `, params);
        return res.json({ applications });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch applications.' });
    }
}

async function assignApplicationForReview(req, res) {
    const { supervisor_id } = req.body;
    if (!supervisor_id) return res.status(400).json({ error: 'A supervisor must be assigned.' });
    try {
        const [supervisors] = await pool.query('SELECT id, role, department_id FROM users WHERE id = ? AND is_active = 1', [supervisor_id]);
        if (!supervisors.length || supervisors[0].role !== 'supervisor') return res.status(400).json({ error: 'Selected user is not an active supervisor.' });
        const [applications] = await pool.query('SELECT id, internship_id, intern_id, department_id, status FROM applications WHERE id = ?', [req.params.id]);
        if (!applications.length) return res.status(404).json({ error: 'Application not found.' });
        if (['accepted', 'rejected', 'withdrawn'].includes(applications[0].status)) {
            return res.status(409).json({ error: 'A completed or withdrawn application cannot be assigned for review.' });
        }

        const [internships] = await pool.query('SELECT department_id FROM internships WHERE id = ?', [applications[0].internship_id]);
        const dept = applications[0].department_id || internships[0].department_id;
        const supervisor = supervisors[0];
        let assigned = dept != null && supervisor.department_id === dept;
        if (dept != null) {
            const [membership] = await pool.query('SELECT 1 FROM department_supervisors WHERE department_id = ? AND supervisor_id = ?', [dept, supervisor_id]);
            assigned = assigned || membership.length > 0;
        }
        if (!assigned && dept != null) return res.status(400).json({ error: 'Supervisor must be assigned to the internship department first.' });
        await pool.query(`UPDATE applications SET supervisor_id = ?, status = 'under_review' WHERE id = ? AND status NOT IN ('accepted','rejected','withdrawn')`, [supervisor_id, req.params.id]);
        await notify(supervisor_id, 'application_assigned', 'An internship application has been assigned to you for review.', 'application', Number(req.params.id));
        await notify(applications[0].intern_id, 'application_under_review', 'Your internship application is now under review.', 'application', Number(req.params.id));
        return res.json({ message: 'Application assigned for review.', status: 'under_review', supervisor_id: Number(supervisor_id) });
    } catch (err) {
        console.error('assignApplicationForReview error:', err.message);
        return res.status(500).json({ error: 'Failed to assign application for review.' });
    }
}

async function updateApplicationStatus(req, res) {
    const { status } = req.body;
    if (req.user.role === 'admin') return res.status(403).json({ error: 'Administrators may assign applications for review but cannot accept or reject them.' });
    if (req.user.role === 'intern') {
        if (status !== 'withdrawn') return res.status(403).json({ error: 'Interns may only withdraw their own application.' });
    } else if (!['shortlisted', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Supervisor status must be shortlisted, accepted, or rejected.' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM applications WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Application not found.' });
        const application = rows[0];
        if (req.user.role === 'intern') {
            if (application.intern_id !== Number(req.user.id)) return res.status(404).json({ error: 'Application not found.' });
            if (!['pending', 'shortlisted', 'under_review'].includes(application.status)) return res.status(409).json({ error: 'This application can no longer be withdrawn.' });
        } else if (!(await canReviewApplication(req.user, req.params.id))) {
            return res.status(403).json({ error: 'You are not assigned to review this application.' });
        }
        if (req.user.role === 'supervisor' && ['accepted', 'rejected', 'withdrawn'].includes(application.status)) {
            return res.status(409).json({ error: 'This application is already closed.' });
        }
        if (['accepted', 'rejected'].includes(status) && req.user.role !== 'supervisor') {
            return res.status(403).json({ error: 'Only a supervisor with access to this application may accept or reject it.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query(
                'UPDATE applications SET status = ?, supervisor_id = COALESCE(supervisor_id, ?), reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, req.user.role === 'supervisor' ? req.user.id : null, req.params.id]
            );
            if (status === 'accepted') {
                const [existing] = await connection.query('SELECT id FROM placements WHERE intern_id = ? AND internship_id = ?', [application.intern_id, application.internship_id]);
                if (!existing.length) {
                    const [internship] = await connection.query('SELECT duration_weeks, department_id FROM internships WHERE id = ?', [application.internship_id]);
                    const duration = Number(application.duration_weeks || internship[0].duration_weeks || 12);
                    const supervisorId = application.supervisor_id || req.user.id;
                    await connection.query(
                        `INSERT INTO placements (intern_id, supervisor_id, internship_id, department_id, start_date, end_date, status)
                         VALUES (?, ?, ?, ?, COALESCE(?, CURDATE()),
                            COALESCE(?, DATE_ADD(COALESCE(?, CURDATE()), INTERVAL ? WEEK)), 'active')`,
                        [application.intern_id, supervisorId, application.internship_id,
                            application.department_id || internship[0].department_id || null,
                            application.start_date || null, application.end_date || null, application.start_date || null, duration]
                    );
                }
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
        await notify(application.intern_id, `application_${status}`, `Your internship application was ${status}.`, 'application', Number(req.params.id));
        if (status === 'withdrawn' && application.supervisor_id) {
            await notify(application.supervisor_id, 'application_withdrawn', 'An applicant withdrew an application assigned to you.', 'application', Number(req.params.id));
        }
        return res.json({ message: `Application status updated to '${status}'.`, status });
    } catch (err) {
        console.error('updateApplicationStatus error:', err.message);
        return res.status(500).json({ error: 'Failed to update application status.' });
    }
}

module.exports = {
    applyForInternship, getMyApplications, getAllApplications, updateApplicationStatus,
    assignApplicationForReview
};
