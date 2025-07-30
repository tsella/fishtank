/**
 * Redis Client for Aquae Caching
 * Optional in-memory cache with graceful fallback
 */

const redis = require('redis');
const logger = require('../logger');

/**
 * Redis client abstraction with fallback capabilities
 */
class RedisClient {
    constructor() {
        this.client = null;
        this.enabled = false;
        this.connecting = false;
    }

    /**
     * Initialize Redis connection if enabled
     * @returns {Promise<void>}
     */
    async connect() {
        if (process.env.USE_REDIS !== 'true') {
            logger.info('Redis disabled via USE_REDIS environment variable');
            return;
        }

        if (this.connecting) {
            return;
        }

        this.connecting = true;

        try {
            this.client = redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        logger.warn('Redis server connection refused');
                        return new Error('Redis server connection refused');
                    }
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        logger.error('Redis retry time exhausted');
                        return new Error('Retry time exhausted');
                    }
                    if (options.attempt > 10) {
                        logger.error('Redis connection attempts exceeded');
                        return undefined;
                    }
                    // Reconnect after
                    return Math.min(options.attempt * 100, 3000);
                }
            });

            this.client.on('connect', () => {
                logger.info('Redis client connected');
                this.enabled = true;
            });

            this.client.on('error', (err) => {
                logger.error('Redis client error', { error: err.message });
                this.enabled = false;
            });

            this.client.on('end', () => {
                logger.info('Redis client disconnected');
                this.enabled = false;
            });

            await this.client.connect();
            
        } catch (error) {
            logger.warn('Redis connection failed, continuing without cache', {
                error: error.message
            });
            this.enabled = false;
        } finally {
            this.connecting = false;
        }
    }

    /**
     * Get aquarium data from cache
     * @param {string} psid - Player session ID
     * @returns {Promise<Object|null>} Cached aquarium data
     */
    async getAquarium(psid) {
        if (!this.enabled || !this.client) {
            return null;
        }

        try {
            const key = `psid:${psid}:aquarium`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Redis get aquarium failed', {
                psid,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Set aquarium data in cache
     * @param {string} psid - Player session ID
     * @param {Object} aquariumData - Aquarium data to cache
     * @param {number} ttl - Time to live in seconds (default: 300)
     * @returns {Promise<boolean>} Success status
     */
    async setAquarium(psid, aquariumData, ttl = 300) {
        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            const key = `psid:${psid}:aquarium`;
            const value = JSON.stringify(aquariumData);
            
            if (ttl > 0) {
                await this.client.setEx(key, ttl, value);
            } else {
                await this.client.set(key, value);
            }
            
            return true;
        } catch (error) {
            logger.error('Redis set aquarium failed', {
                psid,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get fish data from cache
     * @param {string} psid - Player session ID
     * @param {number} fishId - Fish ID
     * @returns {Promise<Object|null>} Cached fish data
     */
    async getFish(psid, fishId) {
        if (!this.enabled || !this.client) {
            return null;
        }

        try {
            const key = `psid:${psid}:fish:${fishId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Redis get fish failed', {
                psid,
                fishId,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Set fish data in cache
     * @param {string} psid - Player session ID
     * @param {number} fishId - Fish ID
     * @param {Object} fishData - Fish data to cache
     * @param {number} ttl - Time to live in seconds (default: 300)
     * @returns {Promise<boolean>} Success status
     */
    async setFish(psid, fishId, fishData, ttl = 300) {
        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            const key = `psid:${psid}:fish:${fishId}`;
            const value = JSON.stringify(fishData);
            
            if (ttl > 0) {
                await this.client.setEx(key, ttl, value);
            } else {
                await this.client.set(key, value);
            }
            
            return true;
        } catch (error) {
            logger.error('Redis set fish failed', {
                psid,
                fishId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Remove fish from cache
     * @param {string} psid - Player session ID
     * @param {number} fishId - Fish ID
     * @returns {Promise<boolean>} Success status
     */
    async removeFish(psid, fishId) {
        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            const key = `psid:${psid}:fish:${fishId}`;
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis remove fish failed', {
                psid,
                fishId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Clear all cache data for a player
     * @param {string} psid - Player session ID
     * @returns {Promise<boolean>} Success status
     */
    async clearPlayer(psid) {
        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            const pattern = `psid:${psid}:*`;
            const keys = await this.client.keys(pattern);
            
            if (keys.length > 0) {
                await this.client.del(keys);
            }
            
            return true;
        } catch (error) {
            logger.error('Redis clear player failed', {
                psid,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Check if Redis is available
     * @returns {boolean} Redis availability status
     */
    isEnabled() {
        return this.enabled && this.client && this.client.isOpen;
    }

    /**
     * Close Redis connection
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.client) {
            try {
                await this.client.quit();
                logger.info('Redis client disconnected gracefully');
            } catch (error) {
                logger.error('Redis disconnect error', { error: error.message });
            }
        }
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache statistics
     */
    async getStats() {
        if (!this.enabled || !this.client) {
            return { enabled: false };
        }

        try {
            const info = await this.client.info('memory');
            const keyspace = await this.client.info('keyspace');
            
            return {
                enabled: true,
                connected: this.client.isOpen,
                memory: info,
                keyspace: keyspace
            };
        } catch (error) {
            logger.error('Redis stats failed', { error: error.message });
            return { enabled: true, error: error.message };
        }
    }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;