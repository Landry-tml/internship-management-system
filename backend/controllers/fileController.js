const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { uploadDirectory } = require('../middleware/uploadMiddleware');
const { canAccessPlacement } = require('../services/accessControl');

const categories = new Set(['application', 'task', 'report', 'evaluation', 'other']);

async function uploadFile(req, res) {
    const files = [
        ...(req.files && req.files.document ? req.files.document : []),
        ...(req.files && req.files.documents ? req.files.documents : []),
        ...(req.files && req.files.file ? req.files.file : [])
    ];
    if (!files.length) return res.status(400).json({ error: 'Upload at least one file using multipart field document or documents.' });
    const category = categories.has(req.body.category) ? req.body.category : 'other';
    const inserted = [];
    try {
        for (const file of files) {
            const descriptor = fs.openSync(file.path, 'r');
            const header = Buffer.alloc(4);
            fs.readSync(descriptor, header, 0, header.length, 0);
            fs.closeSync(descriptor);
            const validSignature = file.mimetype === 'application/pdf'
                ? header.toString('ascii', 0, 4) === '%PDF'
                : file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ? header[0] === 0x50 && header[1] === 0x4b
                    : !header.includes(0);
            if (!validSignature) {
                throw Object.assign(new Error('File content does not match the declared document type.'), { statusCode: 400 });
            }
            const [result] = await pool.query(
                `INSERT INTO uploaded_files (owner_id, storage_name, original_name, mime_type, size_bytes, category)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.id, file.filename, path.basename(file.originalname).slice(0, 255), file.mimetype, file.size, category]
            );
            inserted.push({
                fileId: result.insertId,
                url: `/uploads/${encodeURIComponent(file.filename)}`,
                downloadUrl: `/api/files/${result.insertId}`,
                originalName: path.basename(file.originalname),
                size: file.size
            });
        }
        const first = inserted[0];
        return res.status(201).json({ ...first, files: inserted });
    } catch (err) {
        for (const file of files) fs.unlink(file.path, () => {});
        if (inserted.length) {
            const fileIds = inserted.map((file) => file.fileId);
            await pool.query(`DELETE FROM uploaded_files WHERE owner_id = ? AND id IN (${fileIds.map(() => '?').join(',')})`, [req.user.id, ...fileIds])
                .catch((cleanupError) => console.error('upload metadata cleanup failed:', cleanupError.message));
        }
        if (err.statusCode === 400) return res.status(400).json({ error: err.message });
        console.error('uploadFile error:', err.message);
        return res.status(500).json({ error: 'Failed to save uploaded file metadata.' });
    }
}

async function findFileById(req, res) {
    try {
        const [rows] = await pool.query('SELECT * FROM uploaded_files WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'File not found.' });
        return sendFile(req, res, rows[0]);
    } catch (err) {
        console.error('downloadFile error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve file.' });
    }
}

async function findFileByName(req, res) {
    const filename = path.basename(req.params.filename);
    if (!/^[0-9a-f-]{36}\.(pdf|docx|txt)$/.test(filename)) return res.status(404).json({ error: 'File not found.' });
    try {
        const [rows] = await pool.query('SELECT * FROM uploaded_files WHERE storage_name = ?', [filename]);
        if (!rows.length) return res.status(404).json({ error: 'File not found.' });
        return sendFile(req, res, rows[0]);
    } catch (err) {
        console.error('downloadFile error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve file.' });
    }
}

async function sendFile(req, res, file) {
    let authorized = req.user.role === 'admin' || file.owner_id === Number(req.user.id);
    if (!authorized) {
        const checks = [
            ['applications', 'motivation_file_id'],
            ['applications', 'resume_file_id'],
            ['applications', 'recommendation_file_id'],
            ['tasks', 'submission_file_id'],
            ['reports', 'file_id'],
            ['reports', 'school_template_file_id'],
            ['evaluation_exercises', 'source_file_id']
        ];
        for (const [table, column] of checks) {
            const placementColumn = table === 'applications' ? 'internship_id' : 'placement_id';
            const [linked] = await pool.query(`SELECT ${placementColumn} FROM ${table} WHERE ${column} = ? LIMIT 1`, [file.id]);
            if (!linked.length) continue;
            if (table === 'applications' && req.user.role === 'supervisor') {
                const [application] = await pool.query(
                    `SELECT a.id FROM applications a JOIN internships i ON i.id = a.internship_id
                     WHERE a.${column} = ? AND (a.supervisor_id = ? OR COALESCE(a.department_id, i.department_id) IN
                       (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?)
                       OR COALESCE(a.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)) LIMIT 1`,
                    [file.id, req.user.id, req.user.id, req.user.id]
                );
                authorized = application.length > 0;
            } else if (table !== 'applications') {
                authorized = await canAccessPlacement(req.user, linked[0].placement_id);
            } else if (req.user.role === 'intern') {
                const [owned] = await pool.query('SELECT id FROM applications WHERE ' + column + ' = ? AND intern_id = ?', [file.id, req.user.id]);
                authorized = owned.length > 0;
            }
            if (authorized) break;
        }
    }
    if (!authorized) {
        const [evaluationAttachments] = await pool.query(
            `SELECT placement_id FROM evaluation_exercises
             WHERE JSON_CONTAINS(submission_json, JSON_OBJECT('file_id', ?), '$.attachments')
             LIMIT 1`,
            [file.id]
        );
        if (evaluationAttachments.length) {
            authorized = await canAccessPlacement(req.user, evaluationAttachments[0].placement_id);
        }
    }
    if (!authorized) return res.status(404).json({ error: 'File not found.' });
    try {
        const storageName = path.basename(file.storage_name);
        const fullPath = path.join(uploadDirectory, storageName);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File is unavailable.' });
        res.setHeader('Content-Type', file.mime_type);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
        return res.sendFile(fullPath);
    } catch (err) {
        console.error('downloadFile error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve file.' });
    }
}

module.exports = { uploadFile, downloadFile: findFileById, downloadFileByName: findFileByName };
