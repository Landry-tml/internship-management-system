const pool = require('../config/db');
const fs = require('fs/promises');
const path = require('path');
const { extractDocumentText, generateEvaluationExercise, scoreEvaluationExercise } = require('../services/aiService');
const { canAccessPlacement } = require('../services/accessControl');
const { notify, notifyMany } = require('../services/notifications');
const { uploadDirectory } = require('../middleware/uploadMiddleware');
const { isSafeExternalUrl } = require('../utils/validation');

async function getEvaluations(req, res) {
    try {
        let evalFilter = '';
        let exFilter = '';
        const evalParams = [];
        const exerciseParams = [];
        if (req.user.role === 'intern') {
            evalFilter = 'AND p.intern_id = ?';
            exFilter = 'AND p.intern_id = ?';
            evalParams.push(req.user.id);
            exerciseParams.push(req.user.id);
        } else if (req.user.role === 'supervisor') {
            evalFilter = 'AND (e.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?))';
            exFilter = 'AND (e.supervisor_id = ? OR COALESCE(p.department_id, i.department_id) IN (SELECT department_id FROM department_supervisors WHERE supervisor_id = ?))';
            evalParams.push(req.user.id, req.user.id);
            exerciseParams.push(req.user.id, req.user.id);
        }
        if (req.query.placement_id) {
            if (!(await canAccessPlacement(req.user, req.query.placement_id))) return res.status(404).json({ error: 'Placement not found.' });
            evalFilter += ' AND e.placement_id = ?';
            exFilter += ' AND e.placement_id = ?';
            evalParams.push(req.query.placement_id);
            exerciseParams.push(req.query.placement_id);
        }
        const [evaluations] = await pool.query(`
            SELECT e.*, p.intern_id, COALESCE(p.department_id, i.department_id) AS department_id,
                   d.name AS department_name, u_intern.name AS intern_name, u_intern.email AS intern_email,
                   u_intern.avatar AS intern_avatar, u_sup.name AS supervisor_name, i.title AS internship_title
            FROM evaluations e JOIN placements p ON e.placement_id = p.id
            JOIN internships i ON p.internship_id = i.id
            LEFT JOIN departments d ON d.id = COALESCE(p.department_id, i.department_id)
            JOIN users u_intern ON p.intern_id = u_intern.id
            JOIN users u_sup ON e.supervisor_id = u_sup.id
            WHERE 1=1 ${evalFilter} ORDER BY e.created_at DESC
        `, evalParams);
        const [exercises] = await pool.query(`
            SELECT e.id, e.placement_id, p.intern_id, e.supervisor_id, e.title, e.questions_json, e.source_file_id, e.status,
                   e.score, e.feedback, e.submission_json, e.created_at, e.submitted_at,
                   u.name AS intern_name, COALESCE(p.department_id, i.department_id) AS department_id
            FROM evaluation_exercises e JOIN placements p ON p.id = e.placement_id
            JOIN internships i ON i.id = p.internship_id JOIN users u ON u.id = p.intern_id
            WHERE 1=1 ${exFilter} ORDER BY e.created_at DESC
        `, exerciseParams);
        return res.json({ evaluations, exercises });
    } catch (err) {
        console.error('getEvaluations error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve evaluations.' });
    }
}

async function generateAiEvaluation(req, res) {
    if (req.user.role !== 'supervisor') return res.status(403).json({ error: 'Only supervisors can assign AI assessments.' });
    const {
        placement_id, intern_id, department_id, supervisor_notes = '', uploaded_doc_name = '',
        uploaded_doc_text: suppliedDocText = '', uploaded_doc_file_id
    } = req.body;
    const document = req.files && ((req.files.document && req.files.document[0]) ||
        (req.files.documents && req.files.documents[0]) || (req.files.file && req.files.file[0]));
    const documentText = typeof req.body.document === 'string' ? req.body.document : '';
    let uploaded_doc_text = suppliedDocText || documentText;
    const discardDocument = () => {
        if (document && document.path) {
            fs.unlink(document.path).catch((err) => console.error('assessment upload cleanup failed:', err.message));
        }
    };
    if ((!placement_id && !(intern_id && department_id)) || (typeof supervisor_notes !== 'string') ||
        (typeof uploaded_doc_text !== 'string') || (!supervisor_notes.trim() && !uploaded_doc_text.trim() && !uploaded_doc_file_id && !document)) {
        discardDocument();
        return res.status(400).json({ error: 'Select a placement or intern and department, and provide course/task notes.' });
    }
    if (supervisor_notes.length > 20000 || uploaded_doc_text.length > 50000) {
        discardDocument();
        return res.status(413).json({ error: 'Assessment notes exceed the supported length.' });
    }
    let sourceFileId = null;
    let createdSourceFile = false;
    try {
        let placementId = placement_id;
        if (!placementId) {
            const [placements] = await pool.query(
                `SELECT p.id FROM placements p JOIN internships i ON i.id = p.internship_id
                 WHERE p.intern_id = ? AND COALESCE(p.department_id, i.department_id) = ? AND p.status = 'active'`,
                [intern_id, department_id]
            );
            if (!placements.length) {
                discardDocument();
                return res.status(404).json({ error: 'No active placement matched this intern and department.' });
            }
            placementId = placements[0].id;
        }
        if (!(await canAccessPlacement(req.user, placementId))) {
            discardDocument();
            return res.status(403).json({ error: 'You are not assigned to this intern or department.' });
        }
        const [placementScope] = await pool.query(`
            SELECT p.id, p.intern_id, COALESCE(p.department_id, i.department_id) AS department_id FROM placements p
            JOIN internships i ON i.id = p.internship_id WHERE p.id = ? AND p.status = 'active'
        `, [placementId]);
        if (!placementScope.length) {
            discardDocument();
            return res.status(404).json({ error: 'Active placement not found.' });
        }
        if (department_id && Number(department_id) !== Number(placementScope[0].department_id)) {
            discardDocument();
            return res.status(400).json({ error: 'Placement does not belong to the selected department.' });
        }
        if (intern_id && Number(intern_id) !== Number(placementScope[0].intern_id)) {
            discardDocument();
            return res.status(400).json({ error: 'Placement does not belong to the selected intern.' });
        }
        if (uploaded_doc_file_id) {
            const [files] = await pool.query('SELECT id, storage_name, mime_type, original_name FROM uploaded_files WHERE id = ? AND owner_id = ?',
                [uploaded_doc_file_id, req.user.id]);
            if (!files.length) {
                discardDocument();
                return res.status(400).json({ error: 'Assessment notes file must be uploaded by this supervisor.' });
            }
            sourceFileId = files[0].id;
            if (!uploaded_doc_text.trim()) {
                uploaded_doc_text = await extractDocumentText(
                    path.join(uploadDirectory, path.basename(files[0].storage_name)),
                    files[0].mime_type
                );
            }
            if (uploaded_doc_text.length > 50000) {
                discardDocument();
                return res.status(413).json({ error: 'Extracted assessment notes exceed the supported length.' });
            }
        }
        if (document) {
            const extracted = await extractDocumentText(document.path, document.mimetype);
            if (!uploaded_doc_text.trim()) uploaded_doc_text = extracted;
            if (uploaded_doc_text.length > 50000) {
                discardDocument();
                return res.status(413).json({ error: 'Extracted assessment notes exceed the supported length.' });
            }
            const [savedFile] = await pool.query(
                `INSERT INTO uploaded_files (owner_id, storage_name, original_name, mime_type, size_bytes, category)
                 VALUES (?, ?, ?, ?, ?, 'evaluation')`,
                [req.user.id, document.filename, path.basename(document.originalname).slice(0, 255), document.mimetype, document.size]
            );
            sourceFileId = savedFile.insertId;
            createdSourceFile = true;
        }
        if (!uploaded_doc_text.trim() && !supervisor_notes.trim()) {
            discardDocument();
            if (createdSourceFile) await pool.query('DELETE FROM uploaded_files WHERE id = ? AND owner_id = ?', [sourceFileId, req.user.id]);
            return res.status(400).json({ error: 'Provide course notes, task description, or supervisor notes.' });
        }
        const [placements] = await pool.query(`
            SELECT p.id, p.intern_id, p.supervisor_id, u.name AS intern_name FROM placements p
            JOIN users u ON p.intern_id = u.id WHERE p.id = ? AND p.status = 'active'
        `, [placementId]);
        if (!placements.length) {
            discardDocument();
            if (createdSourceFile) await pool.query('DELETE FROM uploaded_files WHERE id = ? AND owner_id = ?', [sourceFileId, req.user.id]);
            return res.status(404).json({ error: 'Active placement not found.' });
        }
        const placement = placements[0];
        const [tasks] = await pool.query('SELECT title, description, status FROM tasks WHERE placement_id = ?', [placementId]);
        const exercise = await generateEvaluationExercise(supervisor_notes, uploaded_doc_text, placement.intern_name, tasks);
        const [saved] = await pool.query(
            `INSERT INTO evaluation_exercises (placement_id, supervisor_id, title, questions_json, source_notes, source_file_id, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [placementId, req.user.id, exercise.title || 'Internship assessment', JSON.stringify(exercise),
                `${supervisor_notes}\n${uploaded_doc_text}`.trim(), sourceFileId]
        );
        if (document) document.path = null;
        await notify(placement.intern_id, 'assessment_assigned', 'Your supervisor assigned an AI-generated assessment.', 'evaluation', saved.insertId)
            .catch((notificationError) => console.error('assessment notification failed:', notificationError.message));
        return res.status(201).json({
            message: 'AI assessment generated and assigned.',
            exerciseId: saved.insertId,
            evaluationId: saved.insertId,
            evaluation: {
                id: saved.insertId, placement_id: placementId, intern_id: placement.intern_id,
                title: exercise.title, questions: exercise.questions, tasks: exercise.tasks, status: 'pending'
            }
        });
    } catch (err) {
        discardDocument();
        if (createdSourceFile) {
            await pool.query('DELETE FROM uploaded_files WHERE id = ? AND owner_id = ?', [sourceFileId, req.user.id])
                .catch((cleanupError) => console.error('assessment source cleanup failed:', cleanupError.message));
        }
        console.error('generateAiEvaluation error:', err.message);
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        return res.status(502).json({ error: 'AI assessment generation failed; no assessment was assigned.' });
    }
}

async function submitEvaluationExercise(req, res) {
    const submission = req.body.submission;
    const attachments = req.files && req.files.attachments ? req.files.attachments : [];
    const discardAttachments = () => {
        for (const file of attachments) {
            fs.unlink(file.path).catch((err) => console.error('evaluation attachment cleanup failed:', err.message));
        }
    };
    const links = typeof req.body.links === 'string'
        ? req.body.links.split(/\r?\n/).map((link) => link.trim()).filter(Boolean)
        : [];
    let submissionSaved = false;
    let completedScore = null;
    if (submission === undefined || submission === null ||
        (typeof submission === 'string' && !submission.trim()) ||
        JSON.stringify(submission).length > 50000) {
        discardAttachments();
        return res.status(400).json({ error: 'A submission is required and must be no larger than 50 KB.' });
    }
    if (links.length > 20 || links.some((link) => !isSafeExternalUrl(link))) {
        discardAttachments();
        return res.status(400).json({ error: 'Provide no more than 20 valid HTTP or HTTPS links.' });
    }
    if (attachments.reduce((size, file) => size + file.size, 0) > 15 * 1024 * 1024) {
        discardAttachments();
        return res.status(413).json({ error: 'Evaluation attachments must total no more than 15 MB.' });
    }
    try {
        const [rows] = await pool.query(`
            SELECT e.*, p.intern_id FROM evaluation_exercises e
            JOIN placements p ON p.id = e.placement_id WHERE e.id = ?
        `, [req.params.id]);
        if (!rows.length || rows[0].intern_id !== Number(req.user.id)) {
            discardAttachments();
            return res.status(404).json({ error: 'Assessment not found.' });
        }
        const exerciseRow = rows[0];
        if (!['pending', 'assigned'].includes(exerciseRow.status)) {
            discardAttachments();
            return res.status(409).json({ error: 'Assessment has already been submitted.' });
        }
        const exercise = typeof exerciseRow.questions_json === 'string' ? JSON.parse(exerciseRow.questions_json) : exerciseRow.questions_json;
        const aiAttachments = [];
        let extractedTextSize = 0;
        for (const file of attachments) {
            const buffer = await fs.readFile(file.path);
            const header = buffer.subarray(0, 12);
            const validSignature = file.mimetype === 'application/pdf'
                ? header.subarray(0, 4).toString('ascii') === '%PDF'
                : file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ? header[0] === 0x50 && header[1] === 0x4b
                    : file.mimetype === 'image/png'
                        ? header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
                        : file.mimetype === 'image/jpeg'
                            ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
                            : file.mimetype === 'image/webp'
                                ? header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP'
                                : file.mimetype === 'image/gif'
                                    ? ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString('ascii'))
                                    : !buffer.includes(0);
            if (!validSignature) {
                throw Object.assign(new Error('Evaluation attachment content does not match its declared file type.'), { statusCode: 400 });
            }
            if (file.mimetype.startsWith('image/')) {
                aiAttachments.push({
                    name: path.basename(file.originalname),
                    mime_type: file.mimetype,
                    data: buffer.toString('base64')
                });
            } else {
                const text = await extractDocumentText(file.path, file.mimetype);
                extractedTextSize += text.length;
                if (extractedTextSize > 500000) {
                    throw Object.assign(new Error('Extracted evaluation attachments exceed the 500 KB text limit.'), { statusCode: 413 });
                }
                aiAttachments.push({ name: path.basename(file.originalname), mime_type: file.mimetype, text });
            }
        }
        const score = await scoreEvaluationExercise(
            exercise.questions,
            exercise.tasks,
            { answers: submission, links, document_evidence: aiAttachments.filter((file) => file.text).map((file) => ({ name: file.name, text: file.text })) },
            aiAttachments.filter((file) => file.data)
        );
        completedScore = score;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const savedAttachments = [];
            for (const file of attachments) {
                const [savedFile] = await connection.query(
                    `INSERT INTO uploaded_files (owner_id, storage_name, original_name, mime_type, size_bytes, category)
                     VALUES (?, ?, ?, ?, ?, 'evaluation')`,
                    [req.user.id, file.filename, path.basename(file.originalname).slice(0, 255), file.mimetype, file.size]
                );
                savedAttachments.push({
                    file_id: savedFile.insertId,
                    name: path.basename(file.originalname),
                    mime_type: file.mimetype
                });
            }
            const savedSubmission = {
                submission,
                links,
                attachments: savedAttachments,
                question_feedback: score.question_feedback || []
            };
            const [updated] = await connection.query(
                `UPDATE evaluation_exercises SET status = 'reviewed', score = ?, feedback = ?, submission_json = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'assigned')`,
                [score.score, score.feedback, JSON.stringify(savedSubmission), req.params.id]
            );
            if (!updated.affectedRows) throw new Error('Assessment was already submitted.');
            await connection.commit();
            submissionSaved = true;
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
        const [admins] = await pool.query('SELECT id FROM users WHERE role = "admin" AND is_active = 1');
        await notifyMany([exerciseRow.supervisor_id, ...admins.map((admin) => admin.id)], 'assessment_submitted',
            'An intern submitted an assessment and AI scoring is complete.', 'evaluation', Number(req.params.id))
            .catch((notificationError) => console.error('assessment notification failed:', notificationError.message));
        return res.json({
            message: 'Assessment submitted and scored.',
            evaluation: { id: Number(req.params.id), score: score.score, feedback: score.feedback, question_feedback: score.question_feedback, status: 'reviewed' }
        });
    } catch (err) {
        if (!submissionSaved) discardAttachments();
        console.error('submitEvaluationExercise error:', err.message);
        if (submissionSaved && completedScore) {
            return res.json({
                message: 'Assessment submitted and scored, but the supervisor notification could not be delivered.',
                warning: 'Your answers and score are saved, but a notification could not be sent.',
                evaluation: {
                    id: Number(req.params.id),
                    score: completedScore.score,
                    feedback: completedScore.feedback,
                    question_feedback: completedScore.question_feedback,
                    status: 'reviewed'
                }
            });
        }
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        return res.status(502).json({ error: 'Assessment scoring failed; submission was not recorded.' });
    }
}

module.exports = { getEvaluations, generateAiEvaluation, submitEvaluationExercise };
