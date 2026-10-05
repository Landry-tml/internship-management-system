const pool = require('../config/db');

async function notify(userId, type, message, entityType, entityId) {
    if (!userId) return;
    await pool.query(
        'INSERT INTO notifications (user_id, type, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
        [userId, type, message, entityType || null, entityId || null]
    );
}

async function notifyMany(userIds, type, message, entityType, entityId) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    for (const userId of uniqueIds) {
        await notify(userId, type, message, entityType, entityId);
    }
}

module.exports = { notify, notifyMany };
