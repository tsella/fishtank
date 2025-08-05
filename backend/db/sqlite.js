/**
 * SQLite Database Setup and Operations for Aquae
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

/**
 * Initialize SQLite database with required tables
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

        db.run('PRAGMA foreign_keys = ON');

        const queries = [
            `CREATE TABLE IF NOT EXISTS aquariums (
                id INTEGER PRIMARY KEY AUTOINCREMENT, psid TEXT NOT NULL UNIQUE,
                tank_life_sec INTEGER NOT NULL DEFAULT 0, num_fish INTEGER NOT NULL DEFAULT 0,
                total_feedings INTEGER NOT NULL DEFAULT 0, food_level REAL NOT NULL DEFAULT 50.0,
                castle_unlocked BOOLEAN DEFAULT FALSE, submarine_unlocked BOOLEAN DEFAULT FALSE, 
                music_enabled BOOLEAN DEFAULT TRUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS fish (
                id INTEGER PRIMARY KEY AUTOINCREMENT, aquarium_id INTEGER NOT NULL, type TEXT NOT NULL,
                hunger INTEGER NOT NULL DEFAULT 0, x REAL NOT NULL DEFAULT 400, y REAL NOT NULL DEFAULT 300,
                last_fed DATETIME DEFAULT CURRENT_TIMESTAMP, spawn_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (aquarium_id) REFERENCES aquariums (id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS leaderboard (
                fish_id INTEGER PRIMARY KEY,
                aquarium_id INTEGER NOT NULL,
                psid TEXT NOT NULL,
                fish_type TEXT NOT NULL,
                created_at DATETIME NOT NULL
            )`,
            'CREATE INDEX IF NOT EXISTS idx_aquariums_psid ON aquariums(psid)',
            'CREATE INDEX IF NOT EXISTS idx_fish_aquarium_id ON fish(aquarium_id)',
            'CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard(created_at ASC)'
        ];

        db.serialize(() => {
            queries.forEach((query, i) => {
                db.run(query, (err) => {
                    if (err) {
                        logger.error(`Failed to execute query ${i}`, { error: err.message });
                        if (i === 0) reject(err); // Only reject on the first, critical query
                    }
                });
            });
            logger.info('All SQLite tables and indexes created/verified.');
            resolve(db);
        });
    });
}

/**
 * SQLite database abstraction layer
 */
class SqliteDB {
    constructor(db) {
        this.db = db;
    }

    async getAquarium(psid) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT a.*, f.id as fish_id, f.type, f.hunger, f.x, f.y, f.last_fed, f.spawn_count, f.created_at as fish_created_at, f.aquarium_id
                FROM aquariums a LEFT JOIN fish f ON a.id = f.aquarium_id
                WHERE a.psid = ? ORDER BY f.id
            `;
            this.db.all(query, [psid], (err, rows) => {
                if (err) return reject(err);
                if (rows.length === 0) return resolve(null);

                const aquarium = {
                    id: rows[0].id, psid: rows[0].psid, tank_life_sec: rows[0].tank_life_sec,
                    num_fish: rows[0].num_fish, total_feedings: rows[0].total_feedings || 0,
                    food_level: rows[0].food_level,
                    castle_unlocked: Boolean(rows[0].castle_unlocked),
                    submarine_unlocked: Boolean(rows[0].submarine_unlocked),
                    music_enabled: Boolean(rows[0].music_enabled), fish: []
                };
                rows.forEach(row => {
                    if (row.fish_id) aquarium.fish.push({
                        id: row.fish_id, type: row.type, hunger: row.hunger, x: row.x, y: row.y,
                        last_fed: row.last_fed, spawn_count: row.spawn_count, created_at: row.fish_created_at,
                        aquarium_id: row.aquarium_id
                    });
                });
                resolve(aquarium);
            });
        });
    }

    async createAquarium(psid) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO aquariums (psid) VALUES (?)`;
            this.db.run(query, [psid], function(err) {
                if (err) return reject(err);
                resolve({
                    id: this.lastID, psid, tank_life_sec: 0, num_fish: 0, total_feedings: 0,
                    food_level: 50.0, castle_unlocked: false, submarine_unlocked: false, 
                    music_enabled: true, fish: []
                });
            });
        });
    }

    async updateAquarium(psid, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE aquariums SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE psid = ?`;
            this.db.run(query, [...values, psid], (err) => err ? reject(err) : resolve());
        });
    }

    async addFish(aquariumId, fishData) {
        return new Promise((resolve, reject) => {
            const insertQuery = `INSERT INTO fish (aquarium_id, type, hunger, x, y, last_fed, spawn_count) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            const values = [
                aquariumId, fishData.type, fishData.hunger || 0, fishData.x || 400,
                fishData.y || 300, fishData.last_fed || new Date().toISOString(), fishData.spawn_count || 0
            ];
            
            const db = this.db;
            
            db.run(insertQuery, values, function(err) {
                if (err) return reject(err);
                const fishId = this.lastID;
                const selectQuery = `SELECT * FROM fish WHERE id = ?`;
                db.get(selectQuery, [fishId], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
        });
    }

    async updateFish(fishId, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE fish SET ${setClause} WHERE id = ?`;
            this.db.run(query, [...values, fishId], (err) => err ? reject(err) : resolve());
        });
    }

    async removeFish(fishId) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM fish WHERE id = ?', [fishId], (err) => {
                if (err) return reject(err);
                this.db.run('DELETE FROM leaderboard WHERE fish_id = ?', [fishId], (err) => {
                    err ? reject(err) : resolve();
                });
            });
        });
    }

    async getLeaderboard() {
        return new Promise((resolve, reject) => {
            const query = `SELECT fish_id, psid, fish_type, created_at FROM leaderboard ORDER BY created_at ASC LIMIT 10`;
            this.db.all(query, [], (err, rows) => err ? reject(err) : resolve(rows));
        });
    }

    async updateLeaderboard(fish, psid) {
        return new Promise((resolve, reject) => {
            if (!fish || !fish.id || !fish.aquarium_id || !fish.type || !fish.created_at) {
                logger.warn('Attempted to update leaderboard with invalid fish data.', { fish, psid });
                return resolve();
            }

            this.db.serialize(() => {
                const upsertQuery = `
                    INSERT INTO leaderboard (fish_id, aquarium_id, psid, fish_type, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(fish_id) DO NOTHING
                `;
                this.db.run(upsertQuery, [fish.id, fish.aquarium_id, psid, fish.type, fish.created_at], (err) => {
                    if (err) return reject(err);
                    const trimQuery = `DELETE FROM leaderboard WHERE fish_id NOT IN (SELECT fish_id FROM leaderboard ORDER BY created_at ASC LIMIT 10)`;
                    this.db.run(trimQuery, (err) => err ? reject(err) : resolve());
                });
            });
        });
    }

    close() {
        this.db.close((err) => {
            if (err) logger.error('Error closing database', { error: err.message });
            else logger.info('Database connection closed');
        });
    }
}

module.exports = { setupDatabase, SqliteDB };
