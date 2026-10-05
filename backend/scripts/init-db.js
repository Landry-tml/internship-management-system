const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function initDB() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true
    };

    console.log(`🔌 Connecting to MySQL server at ${config.host}:${config.port} as '${config.user}'...`);

    try {
        const connection = await mysql.createConnection(config);
        console.log('✅ MySQL Server connected successfully!');

        const sqlFilePath = path.join(__dirname, 'schema.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('📜 Executing schema.sql to create empty application tables...');
        await connection.query(sqlContent);
        await require('./migrate').migrate(connection);
        
        console.log('🎉 Database schema initialized. No demo users or records were created.');
        await connection.end();
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
        process.exit(1);
    }
}

initDB();
