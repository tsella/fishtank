/**
 * PostgreSQL Database Setup and Operations for Aquae
 */

const { Pool } = require('pg');
const logger = require('../logger');

/**
 * Initialize PostgreSQL connection pool and create tables
 * @returns {Promise<Pool>} PostgreSQL connection pool
 */
async function setupDatabase() {
    const pool = new Pool({
        host: process.env.PG_HOST,
        port: process.env.PG_PORT,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
    });

    pool.on('error', (err, client) => {
        logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
        process.exit(-1);
    });

    try {
        await pool.query('SELECT NOW()');
        logger.info('Connected to PostgreSQL database');
    } catch (err) {
        logger.error('PostgreSQL connection failed', { error: err.message });
        throw err;
    }

    // Create aquariums table
    const createAquariumsTable = `
        CREATE TABLE IF NOT EXISTS aquariums (
            id SERIAL PRIMARY KEY,
            psid VARCHAR(255) NOT NULL UNIQUE,
            tank_life_sec INTEGER NOT NULL DEFAULT 0,
            num_fish INTEGER NOT NULL DEFAULT 0,
            total_feedings INTEGER NOT NULL DEFAULT 0,
            food_level REAL NOT NULL DEFAULT 50.0,
            castle_unlocked BOOLEAN DEFAULT FALSE,
            submarine_unlocked BOOLEAN DEFAULT FALSE,
            music_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    // Create fish table
    const createFishTable = `
        CREATE TABLE IF NOT EXISTS fish (
            id SERIAL PRIMARY KEY,
            aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
            type VARCHAR(255) NOT NULL,
            hunger INTEGER NOT NULL DEFAULT 0,
            x REAL NOT NULL DEFAULT 400,
            y REAL NOT NULL DEFAULT 300,
            last_fed TIMESTAMPTZ DEFAULT NOW(),
            spawn_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    // Create leaderboard table
    const createLeaderboardTable = `
        CREATE TABLE IF NOT EXISTS leaderboard (
            fish_id INTEGER PRIMARY KEY,
            aquarium_id INTEGER NOT NULL,
            psid VARCHAR(255) NOT NULL,
            fish_type VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        )
    `;

    // Create indexes
    const createIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_aquariums_psid ON aquariums(psid)',
        'CREATE INDEX IF NOT EXISTS idx_fish_aquarium_id ON fish(aquarium_id)',
        'CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard(created_at ASC)'
    ];

    const client = await pool.connect();
    try {
        await client.query(createAquariumsTable);
        logger.info('Aquariums table created/verified');
        await client.query(createFishTable);
        logger.info('Fish table created/verified');
        await client.query(createLeaderboardTable);
        logger.info('Leaderboard table created/verified');
        for (const indexQuery of createIndexes) {
            await client.query(indexQuery);
        }
    } finally {
        client.release();
    }

    return pool;
}

/**
 * PostgreSQL database abstraction layer
 */
class PostgresDB {
    constructor(pool) {
        this.pool = pool;
    }

    async getAquarium(psid) {
        const query = `
            SELECT a.*, 
                   f.id as fish_id, f.type, f.hunger, f.x, f.y, 
                   f.last_fed, f.spawn_count, f.created_at as fish_created_at, f.aquarium_id
            FROM aquariums a
            LEFT JOIN fish f ON a.id = f.aquarium_id
            WHERE a.psid = $1
            ORDER BY f.id
        `;
        const { rows } = await this.pool.query(query, [psid]);
        if (rows.length === 0) return null;

        const aquarium = {
            id: rows[0].id,
            psid: rows[0].psid,
            tank_life_sec: rows[0].tank_life_sec,
            num_fish: rows[0].num_fish,
            total_feedings: rows[0].total_feedings || 0,
            food_level: rows[0].food_level,
            castle_unlocked: Boolean(rows[0].castle_unlocked),
            submarine_unlocked: Boolean(rows[0].submarine_unlocked),
            music_enabled: Boolean(rows[0].music_enabled),
            fish: []
        };

        rows.forEach(row => {
            if (row.fish_id) {
                aquarium.fish.push({
                    id: row.fish_id,
                    type: row.type,
                    hunger: row.hunger,
                    x: row.x,
                    y: row.y,
                    last_fed: row.last_fed,
                    spawn_count: row.spawn_count,
                    created_at: row.fish_created_at,
                    aquarium_id: row.aquarium_id
                });
            }
        });
        return aquarium;
    }

    async createAquarium(psid) {
        const query = `
            INSERT INTO aquariums (psid, tank_life_sec, num_fish, total_feedings)
            VALUES ($1, 0, 0, 0)
            RETURNING id
        `;
        const { rows } = await this.pool.query(query, [psid]);
        return {
            id: rows[0].id, psid, tank_life_sec: 0, num_fish: 0, total_feedings: 0,
            food_level: 50.0, castle_unlocked: false, submarine_unlocked: false, 
            music_enabled: true, fish: []
        };
    }

    async updateAquarium(psid, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
        
        const query = `
            UPDATE aquariums 
            SET ${setClause}, updated_at = NOW()
            WHERE psid = $${fields.length + 1}
        `;
        await this.pool.query(query, [...values, psid]);
    }

    async addFish(aquariumId, fishData) {
        const query = `
            INSERT INTO fish (aquarium_id, type, hunger, x, y, last_fed, spawn_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [
            aquariumId, fishData.type, fishData.hunger || 0, fishData.x || 400,
            fishData.y || 300, fishData.last_fed || new Date(), fishData.spawn_count || 0
        ];
        const { rows } = await this.pool.query(query, values);
        return rows[0];
    }

    async updateFish(fishId, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
        const query = `UPDATE fish SET ${setClause} WHERE id = $${fields.length + 1}`;
        await this.pool.query(query, [...values, fishId]);
    }

    async removeFish(fishId) {
        await this.pool.query('DELETE FROM fish WHERE id = $1', [fishId]);
        await this.pool.query('DELETE FROM leaderboard WHERE fish_id = $1', [fishId]);
    }

    async getLeaderboard() {
        const query = `
            SELECT fish_id, psid, fish_type, created_at FROM leaderboard ORDER BY created_at ASC LIMIT 10
        `;
        const { rows } = await this.pool.query(query);
        return rows;
    }

    async updateLeaderboard(fish, psid) {
        const upsertQuery = `
            INSERT INTO leaderboard (fish_id, aquarium_id, psid, fish_type, created_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(fish_id) DO NOTHING
        `;
        const trimQuery = `
            DELETE FROM leaderboard
            WHERE fish_id NOT IN (
                SELECT fish_id FROM leaderboard ORDER BY created_at ASC LIMIT 10
            )
        `;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(upsertQuery, [fish.id, fish.aquarium_id, psid, fish.type, fish.created_at]);
            await client.query(trimQuery);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
        logger.info('PostgreSQL connection pool closed');
    }
}

module.exports = { setupDatabase, PostgresDB };
