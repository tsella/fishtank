/**
 * Fish Configuration Parser for Aquae
 * Parses fish definitions from environment variables
 */

const logger = require('../logger');

/**
 * Fish type definitions parsed from environment
 */
class FishConfig {
    constructor() {
        this.fishTypes = new Map();
        this.rarityWeights = {
            'common': 0.5,
            'uncommon': 0.3,
            'rare': 0.15,
            'very_rare': 0.05
        };
        this.loadFishTypes();
    }

    /**
     * Load fish types from environment variables
     * Format: name,feed_interval_min,hunger_threshold,rarity,cycle,size
     */
    loadFishTypes() {
        const fishKeys = Object.keys(process.env).filter(key => key.startsWith('FISH_'));
        
        fishKeys.forEach(key => {
            try {
                const fishData = process.env[key];
                const fish = this.parseFishDefinition(fishData);
                if (fish) {
                    this.fishTypes.set(fish.name.toLowerCase(), fish);
                    logger.info('Loaded fish type', { 
                        name: fish.name, 
                        rarity: fish.rarity 
                    });
                }
            } catch (error) {
                logger.error('Failed to parse fish definition', {
                    key,
                    value: process.env[key],
                    error: error.message
                });
            }
        });

        if (this.fishTypes.size === 0) {
            logger.warn('No fish types loaded, using defaults');
            this.loadDefaultFishTypes();
        }

        logger.info('Fish configuration loaded', { 
            totalTypes: this.fishTypes.size,
            types: Array.from(this.fishTypes.keys())
        });
    }

    /**
     * Parse individual fish definition string
     * @param {string} definition - Fish definition string
     * @returns {Object|null} Parsed fish data
     */
    parseFishDefinition(definition) {
        const parts = definition.split(',').map(part => part.trim());
        
        if (parts.length !== 6) {
            throw new Error(`Invalid fish definition format: expected 6 parts, got ${parts.length}`);
        }

        const [name, feedInterval, hungerThreshold, rarity, cycle, size] = parts;
        
        // Validate and parse size (format: widthxheight)
        const sizeMatch = size.match(/^(\d+)x(\d+)$/);
        if (!sizeMatch) {
            throw new Error(`Invalid size format: ${size}. Expected format: WIDTHxHEIGHT`);
        }

        // Validate rarity
        if (!this.rarityWeights.hasOwnProperty(rarity)) {
            throw new Error(`Invalid rarity: ${rarity}. Valid values: ${Object.keys(this.rarityWeights).join(', ')}`);
        }

        // Validate cycle
        if (!['diurnal', 'nocturnal'].includes(cycle)) {
            throw new Error(`Invalid cycle: ${cycle}. Valid values: diurnal, nocturnal`);
        }

        return {
            name,
            feedIntervalMin: parseInt(feedInterval),
            hungerThreshold: parseInt(hungerThreshold),
            rarity,
            cycle,
            size: {
                width: parseInt(sizeMatch[1]),
                height: parseInt(sizeMatch[2])
            }
        };
    }

    /**
     * Load default fish types if none configured
     */
    loadDefaultFishTypes() {
        const defaults = [
            'Clownfish,5,60,common,diurnal,30x20',
            'Angelfish,4,80,uncommon,diurnal,28x22',
            'Betta,3,45,rare,nocturnal,25x18',
            'Goldfish,6,100,common,diurnal,32x24',
            'Dragonfish,2,120,very_rare,nocturnal,40x30'
        ];

        defaults.forEach(definition => {
            const fish = this.parseFishDefinition(definition);
            this.fishTypes.set(fish.name.toLowerCase(), fish);
        });
    }

    /**
     * Get fish type by name
     * @param {string} name - Fish name
     * @returns {Object|null} Fish configuration
     */
    getFishType(name) {
        return this.fishTypes.get(name.toLowerCase()) || null;
    }

    /**
     * Get all fish types
     * @returns {Array<Object>} All fish configurations
     */
    getAllFishTypes() {
        return Array.from(this.fishTypes.values());
    }

    /**
     * Get fish types by rarity
     * @param {string} rarity - Rarity level
     * @returns {Array<Object>} Fish of specified rarity
     */
    getFishByRarity(rarity) {
        return this.getAllFishTypes().filter(fish => fish.rarity === rarity);
    }

    /**
     * Get fish types by activity cycle
     * @param {string} cycle - Activity cycle (diurnal/nocturnal)
     * @returns {Array<Object>} Fish of specified cycle
     */
    getFishByCycle(cycle) {
        return this.getAllFishTypes().filter(fish => fish.cycle === cycle);
    }

    /**
     * Select random fish type based on rarity weights
     * @param {number} tankLifeHours - Tank life in hours (affects rarity)
     * @returns {Object|null} Selected fish type
     */
    selectRandomFish(tankLifeHours = 0) {
        const fishTypes = this.getAllFishTypes();
        if (fishTypes.length === 0) return null;

        // Adjust rarity weights based on tank maturity
        const adjustedWeights = { ...this.rarityWeights };
        
        // Increase rare fish chances for mature tanks
        if (tankLifeHours > 24) {
            adjustedWeights.rare *= 1.5;
            adjustedWeights.very_rare *= 2;
        }
        if (tankLifeHours > 72) {
            adjustedWeights.very_rare *= 1.5;
        }

        // Normalize weights
        const totalWeight = Object.values(adjustedWeights).reduce((sum, weight) => sum + weight, 0);
        Object.keys(adjustedWeights).forEach(rarity => {
            adjustedWeights[rarity] /= totalWeight;
        });

        // Select rarity first
        const random = Math.random();
        let cumulative = 0;
        let selectedRarity = 'common';

        for (const [rarity, weight] of Object.entries(adjustedWeights)) {
            cumulative += weight;
            if (random <= cumulative) {
                selectedRarity = rarity;
                break;
            }
        }

        // Select random fish of chosen rarity
        const fishOfRarity = this.getFishByRarity(selectedRarity);
        if (fishOfRarity.length === 0) {
            // Fallback to any fish
            return fishTypes[Math.floor(Math.random() * fishTypes.length)];
        }

        return fishOfRarity[Math.floor(Math.random() * fishOfRarity.length)];
    }

    /**
     * Check if fish should be active based on time and cycle
     * @param {Object} fishType - Fish configuration
     * @param {Date} currentTime - Current time
     * @returns {boolean} Whether fish should be active
     */
    isFishActive(fishType, currentTime = new Date()) {
        const hour = currentTime.getHours();
        
        if (fishType.cycle === 'diurnal') {
            // Active during day (6 AM to 8 PM)
            return hour >= 6 && hour < 20;
        } else {
            // Active during night (8 PM to 6 AM)
            return hour >= 20 || hour < 6;
        }
    }

    /**
     * Calculate hunger rate based on fish type and activity
     * @param {Object} fishType - Fish configuration
     * @param {boolean} isActive - Whether fish is currently active
     * @returns {number} Hunger rate per minute
     */
    getHungerRate(fishType, isActive = true) {
        const baseRate = fishType.hungerThreshold / (fishType.feedIntervalMin * 60); // per second
        
        // Active fish get hungry faster
        const activityMultiplier = isActive ? 1.0 : 0.3;
        
        return baseRate * activityMultiplier * 60; // per minute
    }

    /**
     * Get fish spawn conditions
     * @param {Object} fishType - Fish configuration
     * @returns {Object} Spawn conditions
     */
    getSpawnConditions(fishType) {
        return {
            feedingsRequired: 5, // Feed any fish 5 times (not necessarily when full)
            minTankLife: fishType.feedIntervalMin, // Minimum tank age in minutes (reduced)
            maxHunger: 50 // More lenient hunger requirement
        };
    }

    /**
     * Export configuration as JSON schema
     * @returns {Object} JSON schema for validation
     */
    exportSchema() {
        return {
            fishTypes: Object.fromEntries(this.fishTypes),
            rarityWeights: this.rarityWeights,
            schema: {
                fishType: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        feedIntervalMin: { type: 'number', minimum: 1 },
                        hungerThreshold: { type: 'number', minimum: 1 },
                        rarity: { 
                            type: 'string', 
                            enum: Object.keys(this.rarityWeights) 
                        },
                        cycle: { 
                            type: 'string', 
                            enum: ['diurnal', 'nocturnal'] 
                        },
                        size: {
                            type: 'object',
                            properties: {
                                width: { type: 'number', minimum: 1 },
                                height: { type: 'number', minimum: 1 }
                            },
                            required: ['width', 'height']
                        }
                    },
                    required: ['name', 'feedIntervalMin', 'hungerThreshold', 'rarity', 'cycle', 'size']
                }
            }
        };
    }
}

// Create singleton instance
const fishConfig = new FishConfig();

module.exports = fishConfig;