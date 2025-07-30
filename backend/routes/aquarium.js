/**
 * Aquarium API Routes for Aquae
 * Handles GET/POST requests for aquarium state management
 */

const express = require('express');
const logger = require('../logger');
const fishConfig = require('../config/fish');
const redisClient = require('../redis/client');

/**
 * Middleware to validate and sanitize PSID
 */
function validatePSID(req, res, next) {
    const psid = req.query.psid || req.body.psid;
    
    if (!psid) {
        return res.status(400).json({
            error: 'PSID parameter is required',
            code: 'MISSING_PSID'
        });
    }

    // Sanitize PSID - alphanumeric and hyphens only, max 64 chars
    const sanitizedPSID = psid.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64);
    
    if (!sanitizedPSID || sanitizedPSID.length < 3) {
        return res.status(400).json({
            error: 'Invalid PSID format',
            code: 'INVALID_PSID'
        });
    }

    req.psid = sanitizedPSID;
    next();
}

/**
 * Game logic for aquarium state management
 */
class AquariumLogic {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get or create aquarium state
     * @param {string} psid - Player session ID
     * @returns {Promise<Object>} Aquarium state
     */
    async getAquariumState(psid) {
        try {
            // Try Redis cache first
            let aquarium = await redisClient.getAquarium(psid);
            
            if (!aquarium) {
                // Load from database
                aquarium = await this.db.getAquarium(psid);
                
                if (!aquarium) {
                    // Create new aquarium
                    aquarium = await this.db.createAquarium(psid);
                    logger.aquarium.stateEvent(psid, 'created');
                } else {
                    // Update fish hunger and check for deaths
                    aquarium = await this.updateFishStates(aquarium);
                }

                // Cache the result
                await redisClient.setAquarium(psid, aquarium, 300);
            }

            // If no fish in tank, spawn a starter fish
            if (aquarium.fish.length === 0) {
                await this.spawnStarterFish(aquarium);
            }

            return aquarium;
        } catch (error) {
            logger.aquarium.error(psid, 'get_state', error);
            throw error;
        }
    }

    /**
     * Update aquarium state
     * @param {string} psid - Player session ID
     * @param {Object} updates - State updates
     * @returns {Promise<Object>} Updated aquarium state
     */
    async updateAquariumState(psid, updates) {
        try {
            const aquarium = await this.getAquariumState(psid);
            
            // Process updates
            if (updates.tank_life_sec !== undefined) {
                await this.db.updateAquarium(psid, {
                    tank_life_sec: updates.tank_life_sec
                });
                aquarium.tank_life_sec = updates.tank_life_sec;
            }

            if (updates.fish) {
                await this.updateFishData(aquarium, updates.fish);
            }

            if (updates.unlockables) {
                await this.updateUnlockables(aquarium, updates.unlockables);
            }

            // Update cache
            await redisClient.setAquarium(psid, aquarium, 300);
            
            logger.aquarium.stateEvent(psid, 'updated', {
                tank_life_sec: aquarium.tank_life_sec,
                fish_count: aquarium.fish.length
            });

            return aquarium;
        } catch (error) {
            logger.aquarium.error(psid, 'update_state', error);
            throw error;
        }
    }

    /**
     * Update fish states based on time elapsed
     * @param {Object} aquarium - Aquarium data
     * @returns {Promise<Object>} Updated aquarium
     */
    async updateFishStates(aquarium) {
        const now = new Date();
        const updatedFish = [];
        let fishDied = false;

        for (const fish of aquarium.fish) {
            const fishType = fishConfig.getFishType(fish.type);
            if (!fishType) {
                logger.aquarium.error(aquarium.psid, 'invalid_fish_type', 
                    new Error(`Unknown fish type: ${fish.type}`));
                continue;
            }

            const lastFed = new Date(fish.last_fed);
            const minutesSinceFed = (now - lastFed) / (1000 * 60);
            
            // Calculate hunger increase
            const isActive = fishConfig.isFishActive(fishType, now);
            const hungerRate = fishConfig.getHungerRate(fishType, isActive);
            const newHunger = Math.min(fishType.hungerThreshold, 
                fish.hunger + (minutesSinceFed * hungerRate));

            // Check if fish died from hunger
            if (newHunger >= fishType.hungerThreshold) {
                logger.aquarium.fishEvent(aquarium.psid, fish.type, 'died', {
                    fishId: fish.id,
                    hunger: newHunger,
                    minutesSinceFed
                });
                
                await this.db.removeFish(fish.id);
                await redisClient.removeFish(aquarium.psid, fish.id);
                fishDied = true;
                continue;
            }

            // Update fish state
            if (Math.abs(newHunger - fish.hunger) > 0.1) {
                await this.db.updateFish(fish.id, { hunger: newHunger });
                fish.hunger = newHunger;
            }

            updatedFish.push(fish);
        }

        aquarium.fish = updatedFish;
        aquarium.num_fish = updatedFish.length;

        // Reset tank life if all fish died
        if (fishDied && updatedFish.length === 0) {
            await this.db.updateAquarium(aquarium.psid, {
                tank_life_sec: 0,
                num_fish: 0
            });
            aquarium.tank_life_sec = 0;
            
            logger.aquarium.stateEvent(aquarium.psid, 'reset', {
                reason: 'all_fish_died'
            });
        } else if (fishDied) {
            await this.db.updateAquarium(aquarium.psid, {
                num_fish: updatedFish.length
            });
        }

        return aquarium;
    }

    /**
     * Update fish data from client
     * @param {Object} aquarium - Aquarium data
     * @param {Array} fishUpdates - Fish updates from client
     */
    async updateFishData(aquarium, fishUpdates) {
        for (const update of fishUpdates) {
            const fish = aquarium.fish.find(f => f.id === update.id);
            if (!fish) continue;

            const changes = {};
            
            // Update position
            if (update.x !== undefined && update.y !== undefined) {
                changes.x = Math.max(0, Math.min(1920, update.x));
                changes.y = Math.max(0, Math.min(1080, update.y));
            }

            // Handle feeding
            if (update.fed) {
                const fishType = fishConfig.getFishType(fish.type);
                if (fishType) {
                    changes.hunger = Math.max(0, fish.hunger - 20);
                    changes.last_fed = new Date().toISOString();
                    
                    // Check for spawning
                    if (changes.hunger <= 10) {
                        fish.spawn_count = (fish.spawn_count || 0) + 1;
                        changes.spawn_count = fish.spawn_count;
                        
                        const spawnConditions = fishConfig.getSpawnConditions(fishType);
                        if (fish.spawn_count >= spawnConditions.feedingsRequired) {
                            // Select a random fish type based on tank maturity, not the same type
                            const tankLifeHours = aquarium.tank_life_sec / 3600;
                            const selectedFishType = fishConfig.selectRandomFish(tankLifeHours);
                            
                            if (selectedFishType) {
                                await this.spawnFish(aquarium, selectedFishType);
                            }
                            changes.spawn_count = 0;
                        }
                    }

                    logger.aquarium.fishEvent(aquarium.psid, fish.type, 'fed', {
                        fishId: fish.id,
                        newHunger: changes.hunger,
                        spawnCount: changes.spawn_count
                    });
                }
            }

            // Apply changes
            if (Object.keys(changes).length > 0) {
                await this.db.updateFish(fish.id, changes);
                Object.assign(fish, changes);
            }
        }
    }

    /**
     * Spawn new fish
     * @param {Object} aquarium - Aquarium data
     * @param {Object} fishType - Fish type to spawn
     */
    async spawnFish(aquarium, fishType) {
        const newFish = {
            type: fishType.name,
            hunger: 0,
            x: 200 + Math.random() * 1520, // Random x position
            y: 200 + Math.random() * 680,  // Random y position
            last_fed: new Date().toISOString(),
            spawn_count: 0
        };

        const fishId = await this.db.addFish(aquarium.id, newFish);
        newFish.id = fishId;
        
        aquarium.fish.push(newFish);
        aquarium.num_fish = aquarium.fish.length;

        await this.db.updateAquarium(aquarium.psid, {
            num_fish: aquarium.num_fish
        });

        logger.aquarium.fishEvent(aquarium.psid, fishType.name, 'spawned', {
            fishId: fishId,
            totalFish: aquarium.num_fish
        });
    }

    /**
     * Spawn a starter fish when tank is empty
     * @param {Object} aquarium - Aquarium data
     */
    async spawnStarterFish(aquarium) {
        try {
            // Get a common fish type as starter
            const availableFish = fishConfig.getAllFishTypes();
            const commonFish = availableFish.filter(fish => fish.rarity === 'common');
            
            // Default to first common fish, or first available fish if no common ones
            const starterFishType = commonFish.length > 0 ? commonFish[0] : availableFish[0];
            
            if (!starterFishType) {
                logger.error('No fish types available for starter fish', { psid: aquarium.psid });
                return;
            }

            // Spawn the starter fish
            await this.spawnFish(aquarium, starterFishType);
            
            logger.aquarium.fishEvent(aquarium.psid, starterFishType.name, 'starter_spawned', {
                reason: 'empty_tank',
                totalFish: aquarium.num_fish
            });

        } catch (error) {
            logger.aquarium.error(aquarium.psid, 'spawn_starter_fish', error);
        }
    }

    /**
     * Update unlockable states
     * @param {Object} aquarium - Aquarium data
     * @param {Object} unlockables - Unlockable updates
     */
    async updateUnlockables(aquarium, unlockables) {
        const updates = {};

        // Castle logic
        if (unlockables.castle !== undefined) {
            if (aquarium.num_fish >= 2) {
                updates.castle_unlocked = unlockables.castle;
                aquarium.castle_unlocked = unlockables.castle;
                
                logger.aquarium.unlockableEvent(aquarium.psid, 'castle', 
                    unlockables.castle ? 'enabled' : 'disabled');
            } else if (aquarium.castle_unlocked) {
                // Remove castle if fish count drops below 2
                updates.castle_unlocked = false;
                aquarium.castle_unlocked = false;
                
                logger.aquarium.unlockableEvent(aquarium.psid, 'castle', 'removed', {
                    reason: 'insufficient_fish'
                });
            }
        }

        // Submarine logic
        if (unlockables.submarine !== undefined) {
            if (aquarium.num_fish >= 4) {
                updates.submarine_unlocked = unlockables.submarine;
                aquarium.submarine_unlocked = unlockables.submarine;
                
                logger.aquarium.unlockableEvent(aquarium.psid, 'submarine', 
                    unlockables.submarine ? 'enabled' : 'disabled');
            } else if (aquarium.submarine_unlocked) {
                // Remove submarine if fish count drops below 4
                updates.submarine_unlocked = false;
                aquarium.submarine_unlocked = false;
                
                logger.aquarium.unlockableEvent(aquarium.psid, 'submarine', 'removed', {
                    reason: 'insufficient_fish'
                });
            }
        }

        // Music toggle
        if (unlockables.music !== undefined) {
            updates.music_enabled = unlockables.music;
            aquarium.music_enabled = unlockables.music;
        }

        if (Object.keys(updates).length > 0) {
            await this.db.updateAquarium(aquarium.psid, updates);
        }
    }
}

/**
 * Initialize routes with database connection
 * @param {AquariumDB} db - Database instance
 * @returns {express.Router} Configured router
 */
function createAquariumRoutes(db) {
    const router = express.Router();
    const logic = new AquariumLogic(db);

    // Test route to verify the router is working
    router.get('/test', (req, res) => {
        res.json({
            success: true,
            message: 'Aquarium routes are working',
            hasDb: !!db,
            timestamp: new Date().toISOString()
        });
    });

    /**
     * GET /aquarium/state?psid=<id>
     * Returns current aquarium state
     */
    router.get('/state', validatePSID, async (req, res) => {
        try {
            const aquarium = await logic.getAquariumState(req.psid);
            res.json({
                success: true,
                data: aquarium,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.aquarium.error(req.psid, 'get_state_endpoint', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve aquarium state',
                code: 'GET_STATE_ERROR'
            });
        }
    });

    /**
     * POST /aquarium/state?psid=<id>
     * Updates aquarium state
     */
    router.post('/state', validatePSID, async (req, res) => {
        try {
            const updates = req.body;
            
            // Validate request body
            if (!updates || typeof updates !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    code: 'INVALID_BODY'
                });
            }

            const aquarium = await logic.updateAquariumState(req.psid, updates);
            
            res.json({
                success: true,
                data: aquarium,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.aquarium.error(req.psid, 'update_state_endpoint', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update aquarium state',
                code: 'UPDATE_STATE_ERROR'
            });
        }
    });

    /**
     * GET /aquarium/config
     * Returns fish configuration and game constants
     */
    router.get('/config', (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    fishTypes: fishConfig.getAllFishTypes(),
                    rarityWeights: fishConfig.rarityWeights,
                    gameConstants: {
                        foodTTL: 30000, // 30 seconds
                        saveInterval: 5000, // 5 seconds
                        hungerCheckInterval: 60000, // 1 minute
                        maxHunger: 100,
                        hungerMultiplier: parseFloat(process.env.HUNGER_MULTIPLIER) || 1.0
                    }
                }
            });
        } catch (error) {
            logger.error('Config endpoint error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve configuration',
                code: 'CONFIG_ERROR'
            });
        }
    });

    return router;
}

module.exports = { createAquariumRoutes, AquariumLogic };