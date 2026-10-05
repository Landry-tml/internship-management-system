const pool = require('../config/db');
const { canAccessPlacement } = require('../services/accessControl');
const { notify } = require('../services/notifications');

async function saveReportFeedback(req, res) {
    const reportId = Number(req.params.id);
    const feedback = req.body.feedback;
    if (!Number.isInteger(reportId) || reportId < 1) {
        return res.status(400).json({ error: 'A valid report ID is required.' });
    }
    if (typeof feedback !== 'string' || !feedback.trim()) {
        return res.status(400).json({ error: 'Feedback is required.' });
    }
    if (feedback.trim().length > 10000) {
        return res.status(413).json({ error: 'Feedback exceeds the supported length.' });
    }

    try {
        const [reports] = await pool.query(
            `SELECT r.id, p.id AS placement_id, p.intern_id
             FROM reports r JOIN placements p ON p.id = r.placement_id
             WHERE r.id = ?`,
            [reportId]
        );
        if (!reports.length) return res.status(404).json({ error: 'Report not found.' });
        const report = reports[0];
        if (!(await canAccessPlacement(req.user, report.placement_id))) {
            return res.status(403).json({ error: 'You are not assigned to this intern or department.' });
        }

        const savedFeedback = feedback.trim();
        await pool.query(
            `UPDATE reports
             SET supervisor_feedback = ?, supervisor_feedback_by = ?, supervisor_feedback_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [savedFeedback, req.user.id, reportId]
        );
        await notify(report.intern_id, 'report_feedback', 'Your supervisor left feedback on your report.', 'report', reportId)
            .catch((notificationError) => console.error('report feedback notification failed:', notificationError.message));

        return res.json({
            message: 'Report feedback saved.',
            feedback: savedFeedback,
            feedback_by: req.user.id,
            feedback_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('saveReportFeedback error:', err.message);
        return res.status(500).json({ error: 'Failed to save report feedback.' });
    }
}

module.exports = { saveReportFeedback };
