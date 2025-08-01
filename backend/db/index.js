/**
 * Database Factory for Aquae
 * Selects and initializes the appropriate database client based on environment variables.
 */
require('dotenv').config();
const logger = require('../logger');

/**
 * Initializes and returns the configured database client.
 * @returns {Promise<SqliteDB|PostgresDB>} An instance of the database client.
 */
async function initialize() {
    const dbClient = process.env.DB_CLIENT || 'sqlite';

    if (dbClient === 'postgres') {
        try {
            logger.info('Initializing PostgreSQL database backend.');
            const { setupDatabase, PostgresDB } = require('./postgres');
            const pool = await setupDatabase();
            return new PostgresDB(pool);
        } catch (error) {
            logger.error('Failed to initialize PostgreSQL. Falling back to SQLite.', { error: error.message });
        }
    }
    
    logger.info('Initializing SQLite database backend.');
    const { setupDatabase, SqliteDB } = require('./sqlite');
    const dbInstance = await setupDatabase();
    return new SqliteDB(dbInstance);
}

module.exports = { initialize };
