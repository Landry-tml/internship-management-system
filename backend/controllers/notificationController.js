const pool = require('../config/db');

async function getNotifications(req, res) {
    try {
        const [notifications] = await pool.query(
            `SELECT id, type, message, entity_type, entity_id, read_at, created_at
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
            [req.user.id]
        );
        return res.json({ notifications });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve notifications.' });
    }
}

async function markNotificationRead(req, res) {
    try {
        const [result] = await pool.query(
            'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found.' });
        return res.json({ message: 'Notification marked as read.' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update notification.' });
    }
}

module.exports = { getNotifications, markNotificationRead };
