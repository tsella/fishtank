/**
 * Aquarium API Routes for Aquae
 * Handles GET/POST requests for aquarium state management
 */

const express = require('express');
const logger = require('../logger');
const fishConfig = require('../config/fish');

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
     * Get or create aquarium state, simulating time passage.
     * This is used when loading the game.
     * @param {string} psid - Player session ID
     * @returns {Promise<Object>} Aquarium state
     */
    async getAndUpdateAquariumState(psid) {
        try {
            let aquarium = await this.db.getAquarium(psid);
            
            if (!aquarium) {
                aquarium = await this.db.createAquarium(psid);
                logger.aquarium.stateEvent(psid, 'created');
            } else {
                aquarium = await this.updateFishStates(aquarium);
            }

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
     * Update aquarium state based on client data.
     * This is used when saving the game.
     * @param {string} psid - Player session ID
     * @param {Object} updates - State updates from the client
     * @returns {Promise<Object>} Updated aquarium state
     */
    async saveAquariumState(psid, updates) {
        try {
            // Fetch the raw state from DB without simulating time forward
            const aquarium = await this.db.getAquarium(psid);
            if (!aquarium) {
                throw new Error('Aquarium not found for saving state.');
            }
            
            const dbUpdates = {};

            if (updates.tank_life_sec !== undefined) {
                dbUpdates.tank_life_sec = updates.tank_life_sec;
                aquarium.tank_life_sec = updates.tank_life_sec;
            }

            if (updates.food_level !== undefined) {
                dbUpdates.food_level = updates.food_level;
                aquarium.food_level = updates.food_level;
            }

            if (Object.keys(dbUpdates).length > 0) {
                await this.db.updateAquarium(psid, dbUpdates);
            }

            if (updates.fish) {
                await this.updateFishData(aquarium, updates.fish);
            }

            if (updates.unlockables) {
                await this.updateUnlockables(aquarium, updates.unlockables);
            }
            
            // Update leaderboard for all living fish on every save.
            for (const fish of aquarium.fish) {
                await this.db.updateLeaderboard(fish, psid);
            }

            logger.aquarium.stateEvent(psid, 'saved', {
                tank_life_sec: aquarium.tank_life_sec,
                fish_count: aquarium.fish.length,
                food_level: aquarium.food_level
            });

            return aquarium;
        } catch (error) {
            logger.aquarium.error(psid, 'save_state', error);
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
                logger.aquarium.error(aquarium.psid, 'invalid_fish_type', new Error(`Unknown fish type: ${fish.type}`));
                continue;
            }

            let lastFed = new Date(fish.last_fed);

            if (isNaN(lastFed.getTime())) {
                logger.warn('Invalid last_fed date found for fish.', {
                    psid: aquarium.psid, fishId: fish.id, invalidDate: fish.last_fed
                });
                lastFed = now;
            }

            const secondsSinceFed = (now - lastFed) / 1000;
            
            const isActive = fishConfig.isFishActive(fishType, now);
            const hungerRatePerMinute = fishConfig.getHungerRate(fishType, isActive);
            const hungerRatePerSecond = hungerRatePerMinute / 60;
            const newHunger = Math.min(fishType.hungerThreshold, fish.hunger + (secondsSinceFed * hungerRatePerSecond));

            if (newHunger >= fishType.hungerThreshold) {
                logger.aquarium.fishEvent(aquarium.psid, fish.type, 'died', {
                    fishId: fish.id, finalHunger: newHunger, hungerThreshold: fishType.hungerThreshold,
                    secondsSinceFed: secondsSinceFed, lastFedTimestamp: fish.last_fed,
                    currentTime: now.toISOString()
                });
                
                await this.db.removeFish(fish.id);
                fishDied = true;
                continue;
            }

            if (Math.abs(newHunger - fish.hunger) > 0.1) {
                await this.db.updateFish(fish.id, { hunger: newHunger });
                fish.hunger = newHunger;
            }

            updatedFish.push(fish);
        }

        aquarium.fish = updatedFish;
        aquarium.num_fish = updatedFish.length;

        if (fishDied && updatedFish.length === 0) {
            await this.db.updateAquarium(aquarium.psid, {
                tank_life_sec: 0, num_fish: 0, total_feedings: 0
            });
            aquarium.tank_life_sec = 0;
            aquarium.total_feedings = 0;
            
            logger.aquarium.stateEvent(aquarium.psid, 'reset', { reason: 'all_fish_died' });
        } else if (fishDied) {
            await this.db.updateAquarium(aquarium.psid, { num_fish: updatedFish.length });
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
            
            if (update.x !== undefined && update.y !== undefined) {
                changes.x = Math.max(0, Math.min(1920, update.x));
                changes.y = Math.max(0, Math.min(1080, update.y));
            }
            
            // Trust the client's hunger value during a save
            if (update.hunger !== undefined) {
                changes.hunger = update.hunger;
            }

            if (update.fed) {
                const fishType = fishConfig.getFishType(fish.type);
                if (fishType) {
                    changes.hunger = Math.max(0, (changes.hunger || fish.hunger) - 20);
                    changes.last_fed = new Date().toISOString();
                    
                    await this.db.updateAquarium(aquarium.psid, {
                        total_feedings: (aquarium.total_feedings || 0) + 1
                    });
                    aquarium.total_feedings = (aquarium.total_feedings || 0) + 1;
                    
                    const newSpawnCount = (fish.spawn_count || 0) + 1;
                    const spawnConditions = fishConfig.getSpawnConditions(fishType);
                    
                    if (newSpawnCount >= spawnConditions.feedingsRequired) {
                        changes.spawn_count = 0;
                        const tankLifeHours = aquarium.tank_life_sec / 3600;
                        const selectedFishType = fishConfig.selectRandomFish(tankLifeHours);
                        
                        if (selectedFishType) {
                            await this.spawnFish(aquarium, selectedFishType);
                            logger.aquarium.fishEvent(aquarium.psid, selectedFishType.name, 'spawned_from_feeding', {
                                parentFishId: fish.id, parentFishType: fish.type,
                                spawnCount: newSpawnCount, totalFeedings: aquarium.total_feedings
                            });
                        }
                    } else {
                        changes.spawn_count = newSpawnCount;
                    }

                    logger.aquarium.fishEvent(aquarium.psid, fish.type, 'fed', {
                        fishId: fish.id, newHunger: changes.hunger,
                        spawnCount: changes.spawn_count, totalFeedings: aquarium.total_feedings
                    });
                }
            }

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
        const newFishData = {
            type: fishType.name, hunger: 0, x: 200 + Math.random() * 1520,
            y: 200 + Math.random() * 680, last_fed: new Date().toISOString(), spawn_count: 0
        };

        const newFishRow = await this.db.addFish(aquarium.id, newFishData);
        
        aquarium.fish.push(newFishRow);
        aquarium.num_fish = aquarium.fish.length;

        await this.db.updateAquarium(aquarium.psid, { num_fish: aquarium.num_fish });
        await this.db.updateLeaderboard(newFishRow, aquarium.psid);

        logger.aquarium.fishEvent(aquarium.psid, fishType.name, 'spawned', {
            fishId: newFishRow.id, totalFish: aquarium.num_fish
        });
    }

    /**
     * Spawn a starter fish when tank is empty
     * @param {Object} aquarium - Aquarium data
     */
    async spawnStarterFish(aquarium) {
        try {
            const availableFish = fishConfig.getAllFishTypes();
            const commonFish = availableFish.filter(fish => fish.rarity === 'common');
            const starterFishType = commonFish.length > 0 ? commonFish[0] : availableFish[0];
            
            if (!starterFishType) {
                logger.error('No fish types available for starter fish', { psid: aquarium.psid });
                return;
            }

            await this.spawnFish(aquarium, starterFishType);
            
            logger.aquarium.fishEvent(aquarium.psid, starterFishType.name, 'starter_spawned', {
                reason: 'empty_tank', totalFish: aquarium.num_fish
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

        if (unlockables.castle !== undefined) {
            if (aquarium.num_fish >= 2) {
                updates.castle_unlocked = unlockables.castle;
                aquarium.castle_unlocked = unlockables.castle;
                logger.aquarium.unlockableEvent(aquarium.psid, 'castle', 
                    unlockables.castle ? 'enabled' : 'disabled');
            } else if (aquarium.castle_unlocked) {
                updates.castle_unlocked = false;
                aquarium.castle_unlocked = false;
                logger.aquarium.unlockableEvent(aquarium.psid, 'castle', 'removed', { reason: 'insufficient_fish' });
            }
        }

        if (unlockables.submarine !== undefined) {
            if (aquarium.num_fish >= 4) {
                updates.submarine_unlocked = unlockables.submarine;
                aquarium.submarine_unlocked = unlockables.submarine;
                logger.aquarium.unlockableEvent(aquarium.psid, 'submarine', 
                    unlockables.submarine ? 'enabled' : 'disabled');
            } else if (aquarium.submarine_unlocked) {
                updates.submarine_unlocked = false;
                aquarium.submarine_unlocked = false;
                logger.aquarium.unlockableEvent(aquarium.psid, 'submarine', 'removed', { reason: 'insufficient_fish' });
            }
        }

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

    router.get('/test', (req, res) => {
        res.json({ success: true, message: 'Aquarium routes are working', hasDb: !!db, timestamp: new Date().toISOString() });
    });

    router.get('/state', validatePSID, async (req, res) => {
        try {
            const aquarium = await logic.getAndUpdateAquariumState(req.psid);
            res.json({ success: true, data: aquarium, timestamp: new Date().toISOString() });
        } catch (error) {
            logger.aquarium.error(req.psid, 'get_state_endpoint', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve aquarium state', code: 'GET_STATE_ERROR' });
        }
    });

    router.post('/state', validatePSID, async (req, res) => {
        try {
            const updates = req.body;
            if (!updates || typeof updates !== 'object') {
                return res.status(400).json({ success: false, error: 'Invalid request body', code: 'INVALID_BODY' });
            }
            const aquarium = await logic.saveAquariumState(req.psid, updates);
            res.json({ success: true, data: aquarium, timestamp: new Date().toISOString() });
        } catch (error) {
            logger.aquarium.error(req.psid, 'update_state_endpoint', error);
            res.status(500).json({ success: false, error: 'Failed to update aquarium state', code: 'UPDATE_STATE_ERROR' });
        }
    });

    router.get('/config', (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    fishTypes: fishConfig.getAllFishTypes(),
                    rarityWeights: fishConfig.rarityWeights,
                    gameConstants: {
                        foodTTL: 30000, saveInterval: 5000, hungerCheckInterval: 60000,
                        maxHunger: 100, hungerMultiplier: parseFloat(process.env.HUNGER_MULTIPLIER) || 1.0,
                        fishScaleMultiplier: parseFloat(process.env.FISH_SCALE_MULTIPLIER) || 1.5
                    }
                }
            });
        } catch (error) {
            logger.error('Config endpoint error', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to retrieve configuration', code: 'CONFIG_ERROR' });
        }
    });

    router.get('/leaderboard', async (req, res) => {
        try {
            const leaderboardData = await db.getLeaderboard();
            res.json({ success: true, data: leaderboardData, timestamp: new Date().toISOString() });
        } catch (error) {
            logger.error('Leaderboard endpoint error', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to retrieve leaderboard data', code: 'LEADERBOARD_ERROR' });
        }
    });

    return router;
}

module.exports = { createAquariumRoutes, AquariumLogic };
