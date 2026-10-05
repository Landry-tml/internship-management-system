const pool = require('../config/db');

async function hasColumn(connection, table, column) {
    const [rows] = await connection.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows.length > 0;
}

async function addColumn(connection, table, column, definition) {
    if (!(await hasColumn(connection, table, column))) {
        await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
}

async function migrate(connection) {
    await addColumn(connection, 'users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addColumn(connection, 'users', 'department_id', 'INT NULL');
    await connection.query(`CREATE TABLE IF NOT EXISTS password_reset_codes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
        request_ip VARCHAR(45) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        consumed_at TIMESTAMP NULL,
        INDEX idx_password_reset_user_created (user_id, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await addColumn(connection, 'password_reset_codes', 'code_hash', 'CHAR(64) NOT NULL');
    await addColumn(connection, 'password_reset_codes', 'attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
    await addColumn(connection, 'password_reset_codes', 'request_ip', 'VARCHAR(45) NULL');
    if (await hasColumn(connection, 'password_reset_codes', 'code')) {
        await connection.query('ALTER TABLE `password_reset_codes` MODIFY COLUMN `code` VARCHAR(10) NULL');
    }
    await addColumn(connection, 'internships', 'department_id', 'INT NULL');
    await addColumn(connection, 'internships', 'duration_weeks', 'INT NULL');
    await addColumn(connection, 'internships', 'suspended_at', 'TIMESTAMP NULL');
    await addColumn(connection, 'applications', 'motivation_letter', 'TEXT NULL');
    await addColumn(connection, 'applications', 'motivation_file_id', 'INT NULL');
    await addColumn(connection, 'applications', 'recommendation_file_id', 'INT NULL');
    await addColumn(connection, 'applications', 'resume_file_id', 'INT NULL');
    await addColumn(connection, 'applications', 'duration_weeks', 'INT NULL');
    await addColumn(connection, 'applications', 'start_date', 'DATE NULL');
    await addColumn(connection, 'applications', 'end_date', 'DATE NULL');
    await addColumn(connection, 'applications', 'supervisor_id', 'INT NULL');
    await addColumn(connection, 'applications', 'department_id', 'INT NULL');
    await addColumn(connection, 'applications', 'reviewed_at', 'TIMESTAMP NULL');
    await addColumn(connection, 'placements', 'department_id', 'INT NULL');
    await addColumn(connection, 'tasks', 'department_id', 'INT NULL');
    await addColumn(connection, 'tasks', 'assigned_by', 'INT NULL');
    await addColumn(connection, 'tasks', 'submission_file_id', 'INT NULL');
    await addColumn(connection, 'reports', 'file_id', 'INT NULL');
    await addColumn(connection, 'reports', 'template_id', 'VARCHAR(100) NULL');
    await addColumn(connection, 'reports', 'school_template_file_id', 'BIGINT NULL');
    await addColumn(connection, 'reports', 'school_template_content', 'LONGTEXT NULL');
    await addColumn(connection, 'reports', 'ai_missing_sections', 'JSON NULL');
    await connection.query('ALTER TABLE reports MODIFY content LONGTEXT NOT NULL');
    await addColumn(connection, 'reports', 'supervisor_feedback', 'TEXT NULL');
    await addColumn(connection, 'reports', 'supervisor_feedback_by', 'INT NULL');
    await addColumn(connection, 'reports', 'supervisor_feedback_at', 'TIMESTAMP NULL');

    await connection.query(`ALTER TABLE internships MODIFY status ENUM('open','closed','suspended','deleted') NOT NULL DEFAULT 'open'`);
    await connection.query(`ALTER TABLE applications MODIFY status ENUM('pending','shortlisted','accepted','rejected','withdrawn','under_review') NOT NULL DEFAULT 'pending'`);
    await connection.query(`ALTER TABLE reports MODIFY report_type ENUM('daily','weekly','final') NOT NULL DEFAULT 'weekly'`);

    await connection.query(`
        INSERT INTO placements (intern_id, supervisor_id, internship_id, start_date, end_date, status)
        SELECT a.intern_id, a.supervisor_id, a.internship_id,
               COALESCE(a.start_date, CURDATE()),
               COALESCE(a.end_date, DATE_ADD(COALESCE(a.start_date, CURDATE()), INTERVAL COALESCE(a.duration_weeks, i.duration_weeks, 12) WEEK)),
               'active'
        FROM applications a
        JOIN internships i ON i.id = a.internship_id
        WHERE a.status = 'accepted'
          AND a.supervisor_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM placements p
              WHERE p.intern_id = a.intern_id AND p.internship_id = a.internship_id
          )
    `);

    await connection.query(`CREATE TABLE IF NOT EXISTS departments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`);
    await connection.query(`
        UPDATE applications a
        JOIN internships i ON i.id = a.internship_id
        SET a.department_id = i.department_id
        WHERE a.department_id IS NULL AND i.department_id IS NOT NULL
    `);
    await connection.query(`
        UPDATE placements p
        JOIN internships i ON i.id = p.internship_id
        SET p.department_id = i.department_id
        WHERE p.department_id IS NULL AND i.department_id IS NOT NULL
    `);
    await connection.query(`CREATE TABLE IF NOT EXISTS department_supervisors (
            department_id INT NOT NULL,
            supervisor_id INT NOT NULL,
            PRIMARY KEY (department_id, supervisor_id),
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
            FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS notifications (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type VARCHAR(60) NOT NULL,
            message VARCHAR(500) NOT NULL,
            entity_type VARCHAR(40),
            entity_id INT,
            read_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_notifications_user_created (user_id, created_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS uploaded_files (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            storage_name VARCHAR(100) NOT NULL UNIQUE,
            original_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            size_bytes INT NOT NULL,
            category ENUM('application','task','report','evaluation','other') NOT NULL DEFAULT 'other',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS evaluation_exercises (
            id INT AUTO_INCREMENT PRIMARY KEY,
            placement_id INT NOT NULL,
            supervisor_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            questions_json JSON NOT NULL,
            source_notes TEXT,
            status ENUM('pending','assigned','submitted','reviewed') NOT NULL DEFAULT 'pending',
            score INT NULL,
            feedback TEXT,
            submission_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            submitted_at TIMESTAMP NULL,
            FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE,
            FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    await addColumn(connection, 'evaluation_exercises', 'source_file_id', 'BIGINT NULL');
    await connection.query(`ALTER TABLE evaluation_exercises
        MODIFY status ENUM('pending','assigned','submitted','reviewed') NOT NULL DEFAULT 'pending'`);

    // Resolve legacy file links when they already identify an uploaded record.
    await connection.query(`UPDATE reports SET file_id = CAST(SUBSTRING(file_url, 12) AS UNSIGNED)
        WHERE file_id IS NULL AND file_url REGEXP '^/api/files/[0-9]+$'`);
    await connection.query(`UPDATE applications SET resume_url = '' WHERE resume_url IS NOT NULL AND resume_url <> '' AND resume_url NOT REGEXP '^https?://'`);
    await connection.query(`UPDATE tasks SET submission_url = '' WHERE submission_url IS NOT NULL AND submission_url <> '' AND submission_url NOT REGEXP '^https?://'`);
    await connection.query(`UPDATE reports SET file_url = '' WHERE file_url IS NOT NULL AND file_url <> ''
        AND file_url NOT REGEXP '^https?://' AND file_url NOT REGEXP '^/api/files/[0-9]+$'`);
}

async function runMigrations() {
    const connection = await pool.getConnection();
    try {
        await migrate(connection);
    } finally {
        connection.release();
    }
}

module.exports = { migrate, runMigrations };
