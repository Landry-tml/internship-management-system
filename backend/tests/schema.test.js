const fs = require('fs');
const path = require('path');

describe('initial database schema', () => {
    it('creates application tables without inserting demo records', () => {
        const schema = fs.readFileSync(path.join(__dirname, '../scripts/schema.sql'), 'utf8');

        expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS users/i);
        expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS placements/i);
        expect(schema).not.toMatch(/\bINSERT\s+(?:IGNORE\s+)?INTO\b/i);
        expect(schema).not.toMatch(/Alex Rivera|Emily Zhang|Sarah Jenkins|TechCorp AI Labs/i);
    });
});
