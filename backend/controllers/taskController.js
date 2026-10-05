const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const { canAccessPlacement } = require('../services/accessControl');
const { notifyMany } = require('../services/notifications');
const { isSafeExternalUrl } = require('../utils/validation');
const { uploadDirectory } = require('../middleware/uploadMiddleware');

async function getTasks(req, res) {
    try {
        let filter = '';
        let params = [];
        if (req.user.role === 'intern') {
            filter = 'AND p.intern_id = ?';
            params.push(req.user.id);
        } else if (req.user.role === 'supervisor') {
            filter = `AND (p.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN
                (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                OR COALESCE(p.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?))`;
            params.push(req.user.id, req.user.id, req.user.id);
        }
        if (req.query.placement_id) {
            filter += ' AND t.placement_id = ?';
            params.push(req.query.placement_id);
        }
        const [tasks] = await pool.query(`
            SELECT t.*, p.intern_id, p.supervisor_id, COALESCE(p.department_id, i.department_id) AS department_id, d.name AS department_name,
                   u_intern.name AS intern_name, u_sup.name AS supervisor_name
            FROM tasks t JOIN placements p ON t.placement_id = p.id
            JOIN internships i ON p.internship_id = i.id
            LEFT JOIN departments d ON d.id = COALESCE(p.department_id, i.department_id)
            JOIN users u_intern ON p.intern_id = u_intern.id
            JOIN users u_sup ON p.supervisor_id = u_sup.id
            WHERE 1=1 ${filter} ORDER BY t.created_at DESC
        `, params);
        return res.json({ tasks });
    } catch (err) {
        console.error('getTasks error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve task board.' });
    }
}

async function createTask(req, res) {
    const { placement_id, intern_id, department_id, title, description = '', priority = 'medium', deadline } = req.body;
    if (!title || (!placement_id && !intern_id && !department_id)) {
        return res.status(400).json({ error: 'Task title and a placement, intern, or department assignment are required.' });
    }
    if (!['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Invalid task priority.' });
    try {
        let placements;
        if (placement_id) {
            if (!(await canAccessPlacement(req.user, placement_id))) return res.status(403).json({ error: 'You cannot assign tasks for this placement.' });
            const [rows] = await pool.query('SELECT id, intern_id, supervisor_id, internship_id FROM placements WHERE id = ? AND status = "active"', [placement_id]);
            placements = rows;
        } else if (intern_id) {
            const [rows] = await pool.query(
                `SELECT p.id, p.intern_id, p.supervisor_id, p.internship_id FROM placements p
                 JOIN internships i ON i.id = p.internship_id
                 WHERE p.intern_id = ? AND p.status = 'active' AND (
                   p.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN
                     (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                   OR COALESCE(p.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)
                 )`,
                [intern_id, req.user.id, req.user.id, req.user.id]
            );
            placements = rows;
        } else {
            const [rows] = await pool.query(
                `SELECT p.id, p.intern_id, p.supervisor_id, p.internship_id FROM placements p
                 JOIN internships i ON i.id = p.internship_id
                 WHERE COALESCE(p.department_id, i.department_id) = ? AND p.status = 'active'
                   AND (p.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN
                     (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?))`,
                [department_id, req.user.id, req.user.id]
            );
            placements = rows;
        }
        if (!placements.length) return res.status(404).json({ error: 'No active placement in your supervision scope matched this assignment.' });
        const taskIds = [];
        for (const placement of placements) {
            const [result] = await pool.query(
                `INSERT INTO tasks (placement_id, department_id, assigned_by, title, description, priority, deadline, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [placement.id, department_id || null, req.user.id, title, description, priority, deadline || null]
            );
            taskIds.push(result.insertId);
            await notifyMany([placement.intern_id], 'task_assigned', `A new task was assigned: ${title}.`, 'task', result.insertId);
        }
        return res.status(201).json({ message: 'Task assigned successfully.', taskId: taskIds[0], taskIds });
    } catch (err) {
        console.error('createTask error:', err.message);
        return res.status(500).json({ error: 'Failed to assign task.' });
    }
}

async function submitTask(req, res) {
    const { submission_notes, submission_url, submission_file_id } = req.body;
    const attachment = req.files && req.files.attachment && req.files.attachment[0];
    const discardAttachment = () => {
        if (attachment) fs.unlink(attachment.path, () => {});
    };
    if (typeof submission_notes !== 'string' || submission_notes.length > 50000) {
        discardAttachment();
        return res.status(400).json({ error: 'Submission notes must be text no larger than 50 KB.' });
    }
    if (!isSafeExternalUrl(submission_url)) {
        discardAttachment();
        return res.status(400).json({ error: 'Submission URL must use HTTP or HTTPS, or upload a file.' });
    }
    let createdFileId = null;
    let taskSaved = false;
    try {
        const [rows] = await pool.query(
            `SELECT t.id, t.status, p.intern_id, p.supervisor_id FROM tasks t JOIN placements p ON p.id = t.placement_id
             WHERE t.id = ?`,
            [req.params.id]
        );
        if (!rows.length || rows[0].intern_id !== Number(req.user.id)) {
            discardAttachment();
            return res.status(404).json({ error: 'Task not found.' });
        }
        if (rows[0].status !== 'in_progress') {
            discardAttachment();
            return res.status(409).json({ error: 'Start the task before submitting completed work.' });
        }
        if (submission_file_id && !attachment) {
            const [files] = await pool.query('SELECT id FROM uploaded_files WHERE id = ? AND owner_id = ?', [submission_file_id, req.user.id]);
            if (!files.length) {
                discardAttachment();
                return res.status(400).json({ error: 'Task submission file must be uploaded by this intern.' });
            }
        }
        if (!submission_notes.trim() && !submission_url && !submission_file_id && !attachment) {
            discardAttachment();
            return res.status(400).json({ error: 'Submission content or a file is required.' });
        }
        let fileId = submission_file_id || null;
        if (attachment) {
            const descriptor = fs.openSync(attachment.path, 'r');
            const header = Buffer.alloc(12);
            fs.readSync(descriptor, header, 0, header.length, 0);
            fs.closeSync(descriptor);
            const validSignature = attachment.mimetype === 'application/pdf'
                ? header.toString('ascii', 0, 4) === '%PDF'
                : attachment.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ? header[0] === 0x50 && header[1] === 0x4b
                    : attachment.mimetype === 'image/png'
                        ? header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
                        : attachment.mimetype === 'image/jpeg'
                            ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
                            : attachment.mimetype === 'image/webp'
                                ? header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
                                : attachment.mimetype === 'image/gif'
                                    ? ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6))
                                    : !header.includes(0);
            if (!validSignature) {
                discardAttachment();
                return res.status(400).json({ error: 'Task attachment content does not match its declared file type.' });
            }
            const [savedFile] = await pool.query(
                `INSERT INTO uploaded_files (owner_id, storage_name, original_name, mime_type, size_bytes, category)
                 VALUES (?, ?, ?, ?, ?, 'task')`,
                [req.user.id, attachment.filename, path.basename(attachment.originalname).slice(0, 255),
                    attachment.mimetype, attachment.size]
            );
            fileId = savedFile.insertId;
            createdFileId = fileId;
        }
        await pool.query(
            `UPDATE tasks SET submission_notes = ?, submission_url = ?, submission_file_id = ?, status = 'completed' WHERE id = ?`,
            [submission_notes.trim(), submission_url || '', fileId, req.params.id]
        );
        taskSaved = true;
        try {
            await notifyMany([rows[0].supervisor_id], 'task_submitted', 'An intern submitted a task for review.', 'task', Number(req.params.id));
            const [admins] = await pool.query('SELECT id FROM users WHERE role = "admin" AND is_active = 1');
            await notifyMany(admins.map((admin) => admin.id), 'task_submitted', 'An intern submitted a task for review.', 'task', Number(req.params.id));
        } catch (notificationError) {
            console.error('task submission notification failed:', notificationError.message);
            return res.json({
                message: 'Task submission recorded, but notifications could not be delivered.',
                warning: 'Your task was submitted, but the supervisor notification failed.'
            });
        }
        return res.json({
            message: 'Task submission recorded successfully.',
            attachment: fileId ? { file_id: fileId, url: `/api/files/${fileId}` } : null
        });
    } catch (err) {
        if (!taskSaved) {
            discardAttachment();
            if (createdFileId) {
                await pool.query('DELETE FROM uploaded_files WHERE id = ? AND owner_id = ?', [createdFileId, req.user.id])
                    .catch((cleanupError) => console.error('task attachment metadata cleanup failed:', cleanupError.message));
            }
        }
        console.error('submitTask error:', err.message);
        return res.status(500).json({ error: 'Failed to submit task.' });
    }
}

async function saveTaskProgress(req, res) {
    const { submission_notes, submission_url } = req.body;
    if (!isSafeExternalUrl(submission_url)) return res.status(400).json({ error: 'Progress URL must use HTTP or HTTPS.' });
    if (typeof submission_notes !== 'string' || !submission_notes.trim()) {
        return res.status(400).json({ error: 'Progress notes are required.' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT t.id, t.status, p.intern_id FROM tasks t JOIN placements p ON p.id = t.placement_id
             WHERE t.id = ?`,
            [req.params.id]
        );
        if (!rows.length || rows[0].intern_id !== Number(req.user.id)) return res.status(404).json({ error: 'Task not found.' });
        if (rows[0].status !== 'in_progress') return res.status(409).json({ error: 'Only an in-progress task can be updated.' });
        await pool.query(
            `UPDATE tasks SET submission_notes = ?, submission_url = ? WHERE id = ? AND status = 'in_progress'`,
            [submission_notes.trim(), submission_url || '', req.params.id]
        );
        return res.json({ message: 'Task progress saved.', status: 'in_progress' });
    } catch (err) {
        console.error('saveTaskProgress error:', err.message);
        return res.status(500).json({ error: 'Failed to save task progress.' });
    }
}

async function updateTaskStatus(req, res) {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid task status.' });
    try {
        const [tasks] = await pool.query(
            `SELECT t.id, t.placement_id, t.status, p.intern_id FROM tasks t JOIN placements p ON p.id = t.placement_id WHERE t.id = ?`,
            [req.params.id]
        );
        if (!tasks.length) return res.status(404).json({ error: 'Task not found.' });
        if (req.user.role === 'intern') {
            if (tasks[0].intern_id !== Number(req.user.id)) return res.status(404).json({ error: 'Task not found.' });
            if (status !== 'in_progress') return res.status(403).json({ error: 'Interns may only start their own pending tasks.' });
            if (tasks[0].status !== 'pending') return res.status(409).json({ error: 'Only a pending task can be started.' });
            const [result] = await pool.query(
                `UPDATE tasks SET status = 'in_progress' WHERE id = ? AND status = 'pending'`,
                [req.params.id]
            );
            if (!result.affectedRows) return res.status(409).json({ error: 'This task has already been started or completed.' });
            return res.json({ message: "Task status updated to 'in_progress'.", status: 'in_progress' });
        }
        if (req.user.role !== 'supervisor' || !(await canAccessPlacement(req.user, tasks[0].placement_id))) {
            return res.status(403).json({ error: 'Only the assigned supervisor can update task status.' });
        }
        await pool.query('UPDATE tasks SET status = ? WHERE id = ?', [status, req.params.id]);
        return res.json({ message: `Task status updated to '${status}'.` });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update task status.' });
    }
}

module.exports = { getTasks, createTask, submitTask, saveTaskProgress, updateTaskStatus };
