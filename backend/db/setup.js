/**
 * Database Schema Setup for Aquae
 * Creates SQLite tables for aquariums and fish with proper constraints
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

/**
 * Initialize database with required tables
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Promise<sqlite3.Database>} Database instance
 */
async function setupDatabase(dbPath = process.env.DB_PATH || './aquae.db') {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                logger.error('Database connection failed', { error: err.message });
                reject(err);
                return;
            }
            logger.info('Connected to SQLite database', { path: dbPath });
        });

        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');

        // Create aquariums table
        const createAquariumsTable = `
            CREATE TABLE IF NOT EXISTS aquariums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                psid TEXT NOT NULL UNIQUE,
                tank_life_sec INTEGER NOT NULL DEFAULT 0,
                num_fish INTEGER NOT NULL DEFAULT 0,
                total_feedings INTEGER NOT NULL DEFAULT 0,
                castle_unlocked BOOLEAN DEFAULT FALSE,
                submarine_unlocked BOOLEAN DEFAULT FALSE,
                music_enabled BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Create fish table
        const createFishTable = `
            CREATE TABLE IF NOT EXISTS fish (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                aquarium_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                hunger INTEGER NOT NULL DEFAULT 0,
                x REAL NOT NULL DEFAULT 400,
                y REAL NOT NULL DEFAULT 300,
                last_fed DATETIME DEFAULT CURRENT_TIMESTAMP,
                spawn_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (aquarium_id) REFERENCES aquariums (id) ON DELETE CASCADE
            )
        `;

        // Create indexes for performance
        const createIndexes = [
            'CREATE INDEX IF NOT EXISTS idx_aquariums_psid ON aquariums(psid)',
            'CREATE INDEX IF NOT EXISTS idx_fish_aquarium_id ON fish(aquarium_id)',
            'CREATE INDEX IF NOT EXISTS idx_fish_type ON fish(type)'
        ];

        // Execute table creation
        db.serialize(() => {
            db.run(createAquariumsTable, (err) => {
                if (err) {
                    logger.error('Failed to create aquariums table', { error: err.message });
                    reject(err);
                    return;
                }
                logger.info('Aquariums table created/verified');
            });

            db.run(createFishTable, (err) => {
                if (err) {
                    logger.error('Failed to create fish table', { error: err.message });
                    reject(err);
                    return;
                }
                logger.info('Fish table created/verified');
            });

            // Create indexes
            createIndexes.forEach((indexSQL, i) => {
                db.run(indexSQL, (err) => {
                    if (err) {
                        logger.error('Failed to create index', { 
                            index: i + 1, 
                            error: err.message 
                        });
                    }
                });
            });

            resolve(db);
        });
    });
}

/**
 * Database abstraction layer for aquarium operations
 */
class AquariumDB {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get aquarium state by PSID
     * @param {string} psid - Player session ID
     * @returns {Promise<Object>} Aquarium state with fish
     */
    async getAquarium(psid) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT a.*, 
                       f.id as fish_id, f.type, f.hunger, f.x, f.y, 
                       f.last_fed, f.spawn_count
                FROM aquariums a
                LEFT JOIN fish f ON a.id = f.aquarium_id
                WHERE a.psid = ?
                ORDER BY f.id
            `;

            this.db.all(query, [psid], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (rows.length === 0) {
                    resolve(null);
                    return;
                }

                const aquarium = {
                    id: rows[0].id,
                    psid: rows[0].psid,
                    tank_life_sec: rows[0].tank_life_sec,
                    num_fish: rows[0].num_fish,
                    total_feedings: rows[0].total_feedings || 0,
                    castle_unlocked: Boolean(rows[0].castle_unlocked),
                    submarine_unlocked: Boolean(rows[0].submarine_unlocked),
                    music_enabled: Boolean(rows[0].music_enabled),
                    fish: []
                };

                // Add fish if they exist
                rows.forEach(row => {
                    if (row.fish_id) {
                        aquarium.fish.push({
                            id: row.fish_id,
                            type: row.type,
                            hunger: row.hunger,
                            x: row.x,
                            y: row.y,
                            last_fed: row.last_fed,
                            spawn_count: row.spawn_count
                        });
                    }
                });

                resolve(aquarium);
            });
        });
    }

    /**
     * Create new aquarium
     * @param {string} psid - Player session ID
     * @returns {Promise<Object>} Created aquarium
     */
    async createAquarium(psid) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO aquariums (psid, tank_life_sec, num_fish)
                VALUES (?, 0, 0)
            `;

            this.db.run(query, [psid], function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve({
                    id: this.lastID,
                    psid,
                    tank_life_sec: 0,
                    num_fish: 0,
                    total_feedings: 0,
                    castle_unlocked: false,
                    submarine_unlocked: false,
                    music_enabled: true,
                    fish: []
                });
            });
        });
    }

    /**
     * Update aquarium state
     * @param {string} psid - Player session ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateAquarium(psid, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            
            const query = `
                UPDATE aquariums 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE psid = ?
            `;

            this.db.run(query, [...values, psid], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Add fish to aquarium
     * @param {number} aquariumId - Aquarium ID
     * @param {Object} fishData - Fish properties
     * @returns {Promise<number>} Fish ID
     */
    async addFish(aquariumId, fishData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO fish (aquarium_id, type, hunger, x, y, last_fed, spawn_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                aquariumId,
                fishData.type,
                fishData.hunger || 0,
                fishData.x || 400,
                fishData.y || 300,
                fishData.last_fed || new Date().toISOString(),
                fishData.spawn_count || 0
            ];

            this.db.run(query, values, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
        });
    }

    /**
     * Update fish state
     * @param {number} fishId - Fish ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateFish(fishId, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            
            const query = `UPDATE fish SET ${setClause} WHERE id = ?`;

            this.db.run(query, [...values, fishId], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Remove fish from aquarium
     * @param {number} fishId - Fish ID
     * @returns {Promise<void>}
     */
    async removeFish(fishId) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM fish WHERE id = ?', [fishId], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close((err) => {
            if (err) {
                logger.error('Error closing database', { error: err.message });
            } else {
                logger.info('Database connection closed');
            }
        });
    }
}

// Initialize database if run directly
if (require.main === module) {
    require('dotenv').config();
    setupDatabase()
        .then(() => {
            logger.info('Database setup completed successfully');
            process.exit(0);
        })
        .catch((err) => {
            logger.error('Database setup failed', { error: err.message });
            process.exit(1);
        });
}

module.exports = { setupDatabase, AquariumDB };