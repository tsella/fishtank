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
        logger.info('Initializing PostgreSQL database backend.');
        // This block will only run if DB_CLIENT is 'postgres'
        const { setupDatabase, PostgresDB } = require('./postgres');
        const pool = await setupDatabase(); // This will throw a detailed error if it fails
        return new PostgresDB(pool);

    } else if (dbClient === 'sqlite') {
        logger.info('Initializing SQLite database backend.');
        // This block will only run if DB_CLIENT is 'sqlite'
        const { setupDatabase, SqliteDB } = require('./sqlite');
        const dbInstance = await setupDatabase();
        return new SqliteDB(dbInstance);

    } else {
        // Handle incorrect configuration
        const error = new Error(`Invalid DB_CLIENT specified in .env file: "${dbClient}". Please use 'sqlite' or 'postgres'.`);
        logger.error(error.message);
        throw error;
    }
}

module.exports = { initialize };
