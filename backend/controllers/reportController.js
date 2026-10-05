const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const { uploadDirectory } = require('../middleware/uploadMiddleware');
const { extractDocumentText, reviewReport } = require('../services/aiService');
const { canAccessPlacement } = require('../services/accessControl');
const { notifyMany } = require('../services/notifications');
const { isSafeExternalUrl } = require('../utils/validation');

function uploadedFrom(req, ...names) {
    for (const name of names) {
        if (req.files && req.files[name] && req.files[name][0]) return req.files[name][0];
    }
    return null;
}

function removeUpload(file) {
    if (file && file.path) fs.unlink(file.path, () => {});
}

async function textFromFile(file) {
    return extractDocumentText(file.path, file.mimetype);
}

async function persistUpload(file, ownerId, category) {
    const [saved] = await pool.query(
        `INSERT INTO uploaded_files (owner_id, storage_name, original_name, mime_type, size_bytes, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ownerId, file.filename, path.basename(file.originalname).slice(0, 255), file.mimetype, file.size, category]
    );
    return { id: saved.insertId, storage_name: file.filename };
}

async function getReports(req, res) {
    try {
        let filter = '';
        const params = [];
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
            if (!(await canAccessPlacement(req.user, req.query.placement_id))) return res.status(404).json({ error: 'Placement not found.' });
            filter += ' AND r.placement_id = ?';
            params.push(req.query.placement_id);
        }
        const [reports] = await pool.query(`
            SELECT r.*, p.intern_id, p.supervisor_id, u.name AS intern_name, u.avatar AS intern_avatar,
                   report_file.storage_name AS report_storage_name,
                   template_file.storage_name AS school_template_storage_name
            FROM reports r JOIN placements p ON r.placement_id = p.id
            JOIN internships i ON p.internship_id = i.id
            JOIN users u ON p.intern_id = u.id
            LEFT JOIN uploaded_files report_file ON report_file.id = r.file_id
            LEFT JOIN uploaded_files template_file ON template_file.id = r.school_template_file_id
            WHERE 1=1 ${filter} ORDER BY r.submitted_at DESC
        `, params);
        return res.json({
            reports: reports.map((report) => ({
                ...report,
                file_url: report.report_storage_name
                    ? `/uploads/${encodeURIComponent(report.report_storage_name)}`
                    : report.file_url,
                school_template_url: report.school_template_storage_name
                    ? `/uploads/${encodeURIComponent(report.school_template_storage_name)}`
                    : null,
                ai_missing_sections: typeof report.ai_missing_sections === 'string'
                    ? JSON.parse(report.ai_missing_sections || '[]')
                    : (report.ai_missing_sections || [])
            }))
        });
    } catch (err) {
        console.error('getReports error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve reports.' });
    }
}

async function submitReport(req, res) {
    const {
        placement_id, report_type = 'weekly', title, content: suppliedContent = '', file_id, file_url
    } = req.body;
    const template_id = req.body.template_id || req.body.template || 'ims-final-v1';
    const templateTextValue = req.body.school_template_content || req.body.template_content || '';
    let content = suppliedContent;
    let schoolTemplateContent = templateTextValue;
    const document = uploadedFrom(req, 'document', 'documents', 'file');
    const schoolTemplateDocument = uploadedFrom(req, 'school_template', 'template_document');
    const discardUploads = () => { removeUpload(document); removeUpload(schoolTemplateDocument); };
    if (!title || typeof content !== 'string' || (!content.trim() && !file_id && !document)) {
        discardUploads();
        return res.status(400).json({ error: 'Title and report content or document are required.' });
    }
    if (!['daily', 'weekly', 'final'].includes(report_type)) {
        discardUploads();
        return res.status(400).json({ error: 'Report type must be daily, weekly, or final.' });
    }
    if (report_type === 'final' && template_id !== 'ims-final-v1') {
        discardUploads();
        return res.status(400).json({ error: 'Unsupported final report template.' });
    }
    if (!file_id && !document && !isSafeExternalUrl(file_url)) {
        discardUploads();
        return res.status(400).json({ error: 'Report URL must use HTTP or HTTPS, or upload a report file.' });
    }
    if (report_type === 'final' && !schoolTemplateDocument && !schoolTemplateContent.trim()) {
        discardUploads();
        return res.status(400).json({ error: 'Final reports require the uploaded school template (school_template field) or school_template_content.' });
    }
    if (schoolTemplateContent.length > 1000000) {
        discardUploads();
        return res.status(413).json({ error: 'School template text exceeds the 1 MB extracted-text limit.' });
    }
    if (content.length > 5000000) {
        discardUploads();
        return res.status(413).json({ error: 'Report text exceeds the 5 MB extracted-text limit.' });
    }
    let reportFileId = null;
    let templateFileId = null;
    let reportSaved = false;
    try {
        let targetPlacementId = placement_id;
        if (!targetPlacementId) {
            const [placements] = await pool.query(
                `SELECT id FROM placements WHERE intern_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 2`,
                [req.user.id]
            );
            if (placements.length !== 1) {
                discardUploads();
                return res.status(400).json({ error: 'placement_id is required unless exactly one active placement exists.' });
            }
            targetPlacementId = placements[0].id;
        }
        if (!(await canAccessPlacement(req.user, targetPlacementId))) {
            discardUploads();
            return res.status(404).json({ error: 'Placement not found.' });
        }

        if (document) {
            const extracted = await textFromFile(document);
            if (!content.trim() && extracted) content = extracted;
            if (content.length > 5000000) throw Object.assign(new Error('Report text exceeds the 5 MB extracted-text limit.'), { statusCode: 413 });
            reportFileId = (await persistUpload(document, req.user.id, 'report')).id;
        }
        if (schoolTemplateDocument) {
            const extracted = await textFromFile(schoolTemplateDocument);
            if (!schoolTemplateContent.trim() && extracted) schoolTemplateContent = extracted;
            if (schoolTemplateContent.length > 1000000) throw Object.assign(new Error('School template text exceeds the 1 MB extracted-text limit.'), { statusCode: 413 });
            templateFileId = (await persistUpload(schoolTemplateDocument, req.user.id, 'report')).id;
        }
        if (file_id) {
            const [owned] = await pool.query(
                'SELECT id, storage_name, mime_type FROM uploaded_files WHERE id = ? AND owner_id = ?',
                [file_id, req.user.id]
            );
            if (!owned.length) throw Object.assign(new Error('Report file must be uploaded by this intern.'), { statusCode: 400 });
            reportFileId = owned[0].id;
            if (!content.trim()) {
                content = await extractDocumentText(
                    path.join(uploadDirectory, path.basename(owned[0].storage_name)),
                    owned[0].mime_type
                );
            }
            if (content.length > 5000000) {
                throw Object.assign(new Error('Report text exceeds the 5 MB extracted-text limit.'), { statusCode: 413 });
            }
        }
        if (schoolTemplateContent.length > 1000000) {
            throw Object.assign(new Error('School template text exceeds the 1 MB extracted-text limit.'), { statusCode: 413 });
        }
        let reportFileUrl = file_url || '';
        if (reportFileId) {
            const [file] = await pool.query('SELECT storage_name FROM uploaded_files WHERE id = ?', [reportFileId]);
            reportFileUrl = `/uploads/${encodeURIComponent(file[0].storage_name)}`;
        }
        const [result] = await pool.query(
            `INSERT INTO reports
             (placement_id, report_type, title, content, file_url, file_id, template_id, school_template_file_id, school_template_content)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [targetPlacementId, report_type, title, content, reportFileUrl, reportFileId,
                report_type === 'final' ? template_id : null, templateFileId, schoolTemplateContent || null]
        );
        reportSaved = true;
        const [placement] = await pool.query(
            `SELECT p.intern_id, p.supervisor_id, u.name AS intern_name,
                    COALESCE(p.department_id, i.department_id) AS department_id
             FROM placements p JOIN internships i ON i.id = p.internship_id
             JOIN users u ON u.id = p.intern_id WHERE p.id = ?`,
            [targetPlacementId]
        );
        let aiReview = null;
        let aiReviewError = null;
        if (report_type === 'final' && content.trim() && schoolTemplateContent.trim()) {
            try {
                aiReview = await reviewReport(content, title, placement[0].intern_name, report_type, schoolTemplateContent);
                await pool.query(
                    'UPDATE reports SET ai_summary = ?, ai_score = ?, ai_feedback = ?, ai_missing_sections = ? WHERE id = ?',
                    [aiReview.summary, aiReview.score, aiReview.feedback, JSON.stringify(aiReview.missing_sections), result.insertId]
                );
            } catch (err) {
                console.error('Final report AI review failed:', err.message);
                aiReviewError = 'The report was saved, but AI scoring did not complete. A supervisor can retry the review.';
            }
        }
        const [departmentSupervisors] = placement[0].department_id
            ? await pool.query(
                `SELECT ds.supervisor_id AS id FROM department_supervisors ds
                 JOIN users u ON u.id = ds.supervisor_id
                 WHERE ds.department_id = ? AND u.is_active = 1`,
                [placement[0].department_id]
            )
            : [[]];
        const [supervisorsInDepartment] = placement[0].department_id
            ? await pool.query('SELECT id FROM users WHERE role = "supervisor" AND department_id = ? AND is_active = 1', [placement[0].department_id])
            : [[]];
        const [admins] = await pool.query('SELECT id FROM users WHERE role = "admin" AND is_active = 1');
        try {
            await notifyMany([
                placement[0].supervisor_id,
                ...departmentSupervisors.map((supervisor) => supervisor.id),
                ...supervisorsInDepartment.map((supervisor) => supervisor.id),
                ...admins.map((admin) => admin.id)
            ], 'report_submitted', `${placement[0].intern_name} submitted a ${report_type} report.`, 'report', result.insertId);
        } catch (notificationError) {
            console.error('report notification failed:', notificationError.message);
            return res.status(201).json({
                message: 'Report submitted, but notifications could not be delivered.',
                reportId: result.insertId,
                file_url: reportFileUrl,
                aiReview,
                warning: 'The report was saved, but its supervisor notification failed.'
            });
        }
        return res.status(201).json({
            message: aiReviewError || 'Report submitted successfully.',
            reportId: result.insertId,
            file_url: reportFileUrl,
            school_template_url: templateFileId
                ? `/uploads/${encodeURIComponent((await pool.query('SELECT storage_name FROM uploaded_files WHERE id = ?', [templateFileId]))[0][0].storage_name)}`
                : null,
            aiReview,
            warning: aiReviewError
        });
    } catch (err) {
        if (err.statusCode) {
            discardUploads();
            return res.status(err.statusCode).json({ error: err.message });
        }
        if (!reportSaved) {
            for (const fileId of [reportFileId, templateFileId].filter(Boolean)) {
                await pool.query('DELETE FROM uploaded_files WHERE id = ? AND owner_id = ?', [fileId, req.user.id])
                    .catch((cleanupError) => console.error('report upload cleanup failed:', cleanupError.message));
            }
            discardUploads();
        }
        console.error('submitReport error:', err.message);
        return res.status(500).json({ error: reportSaved ? 'Report was saved but workflow notification failed.' : 'Failed to submit report.' });
    }
}

async function triggerAiReview(req, res) {
    try {
        const [rows] = await pool.query(`
            SELECT r.*, p.id AS placement_id, p.intern_id, u.name AS intern_name
            FROM reports r JOIN placements p ON r.placement_id = p.id
            JOIN users u ON p.intern_id = u.id WHERE r.id = ?
        `, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Report not found.' });
        const report = rows[0];
        if (!(await canAccessPlacement(req.user, report.placement_id))) return res.status(404).json({ error: 'Report not found.' });
        let reportContent = report.content || '';
        let schoolTemplateContent = report.school_template_content || '';
        if (!reportContent.trim() && report.file_id) {
            const [files] = await pool.query(
                'SELECT storage_name, mime_type FROM uploaded_files WHERE id = ? AND owner_id = ?',
                [report.file_id, report.intern_id]
            );
            if (!files.length) return res.status(422).json({ error: 'The uploaded report file is unavailable to its owner.' });
            reportContent = await extractDocumentText(
                path.join(uploadDirectory, path.basename(files[0].storage_name)),
                files[0].mime_type
            );
        }
        if (!reportContent.trim()) return res.status(422).json({ error: 'Upload a report document containing readable text before requesting an AI review.' });
        if (report.report_type === 'final' && !schoolTemplateContent.trim() && report.school_template_file_id) {
            const [files] = await pool.query(
                'SELECT storage_name, mime_type FROM uploaded_files WHERE id = ? AND owner_id = ?',
                [report.school_template_file_id, report.intern_id]
            );
            if (!files.length) return res.status(422).json({ error: 'The uploaded school template is unavailable to its owner.' });
            schoolTemplateContent = await extractDocumentText(
                path.join(uploadDirectory, path.basename(files[0].storage_name)),
                files[0].mime_type
            );
        }
        if (report.report_type === 'final' && !schoolTemplateContent.trim()) {
            return res.status(422).json({ error: 'Upload a school template containing readable text before reviewing a final report.' });
        }
        const aiResult = await reviewReport(reportContent, report.title, report.intern_name,
            report.report_type, schoolTemplateContent);
        await pool.query(
            'UPDATE reports SET ai_summary = ?, ai_score = ?, ai_feedback = ?, ai_missing_sections = ? WHERE id = ?',
            [aiResult.summary, aiResult.score, aiResult.feedback, JSON.stringify(aiResult.missing_sections), req.params.id]
        );
        return res.json({ message: 'AI review completed.', aiReview: aiResult });
    } catch (err) {
        console.error('triggerAiReview error:', err.message);
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        return res.status(502).json({ error: 'AI report review failed.' });
    }
}

module.exports = { getReports, submitReport, triggerAiReview };
