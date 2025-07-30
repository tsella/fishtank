/**
 * Food Management System for Aquae
 * Handles food dispensing, falling, and fish feeding mechanics
 * Compatible with Chromium M69
 */

class FoodManager {
    constructor() {
        this.foodLevel = 50; // Percentage (0-100)
        this.maxFood = 100;
        this.refillRate = 0.1; // Per second base rate
        this.fishRefillBonus = 0.05; // Additional rate per fish
        
        this.activeFoodItems = [];
        this.foodTTL = 30000; // 30 seconds in milliseconds
        this.feedCooldown = 500; // Minimum time between feeds in ms
        this.lastFeedTime = 0;
        
        // Food appearance settings
        this.foodSize = 8;
        this.fallSpeed = 60; // pixels per second
        this.foodColors = ['#8B4513', '#D2691E', '#F4A460', '#DEB887'];
        
        // Food drop area constraints
        this.dropAreaMargin = 100; // Margin from screen edges
        this.waterSurfaceY = 150; // Y position where food enters water
        this.aquariumBottom = 950; // Y position of aquarium bottom
        
        this.lastUpdateTime = Date.now();
    }

    /**
     * Update food system
     * @param {number} deltaTime - Time elapsed since last update (ms)
     * @param {number} fishCount - Number of fish in aquarium
     */
    update(deltaTime, fishCount = 0) {
        const now = Date.now();
        const dtSeconds = deltaTime / 1000;
        
        // Update food level (passive refill)
        this.updateFoodLevel(dtSeconds, fishCount);
        
        // Update active food items
        this.updateFoodItems(deltaTime);
        
        this.lastUpdateTime = now;
    }

    /**
     * Update food level with passive refill
     * @param {number} deltaTime - Time in seconds
     * @param {number} fishCount - Number of fish
     */
    updateFoodLevel(deltaTime, fishCount) {
        if (this.foodLevel < this.maxFood) {
            const refillAmount = (this.refillRate + (fishCount * this.fishRefillBonus)) * deltaTime;
            this.foodLevel = Math.min(this.maxFood, this.foodLevel + refillAmount);
        }
    }

    /**
     * Update active food items (movement, collision, expiration)
     * @param {number} deltaTime - Time elapsed in ms
     */
    updateFoodItems(deltaTime) {
        const dtSeconds = deltaTime / 1000;
        const now = Date.now();
        
        // Update positions and remove expired food
        this.activeFoodItems = this.activeFoodItems.filter(food => {
            // Move food downward
            food.y += this.fallSpeed * dtSeconds;
            
            // Add slight horizontal drift for realism
            food.x += food.drift * dtSeconds;
            
            // Slow down when hitting water surface
            if (food.y > this.waterSurfaceY && !food.inWater) {
                food.inWater = true;
                this.fallSpeed *= 0.7; // Reduce speed in water
            }
            
            // Remove if expired or reached bottom
            const expired = (now - food.createdAt) > this.foodTTL;
            const reachedBottom = food.y > this.aquariumBottom;
            
            if (expired || reachedBottom) {
                return false; // Remove from array
            }
            
            return true; // Keep in array
        });
    }

    /**
     * Attempt to dispense food
     * @param {number} x - X coordinate for food drop (optional)
     * @returns {Object|null} Created food item or null if unavailable
     */
    dispenseFoodAt(x = null) {
        const now = Date.now();
        
        // Check cooldown
        if (now - this.lastFeedTime < this.feedCooldown) {
            return null;
        }
        
        // Check if food is available
        if (this.foodLevel < 10) {
            return null; // Not enough food
        }
        
        // Calculate drop position
        const dropX = x !== null ? x : this.getRandomDropX();
        const dropY = 50; // Start above screen
        
        // Create food item
        const foodItem = this.createFoodItem(dropX, dropY);
        this.activeFoodItems.push(foodItem);
        
        // Consume food level
        this.foodLevel = Math.max(0, this.foodLevel - 10);
        this.lastFeedTime = now;
        
        // Play feed sound effect
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            audioManager.playEffect('feed', 0.6);
        }
        
        return foodItem;
    }

    /**
     * Dispense food at random location
     * @returns {Object|null} Created food item or null if unavailable
     */
    dispenseFoodRandom() {
        return this.dispenseFoodAt();
    }

    /**
     * Create a food item object
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {Object} Food item
     */
    createFoodItem(x, y) {
        return {
            id: Date.now() + Math.random(), // Unique ID
            x: x,
            y: y,
            size: this.foodSize + (Math.random() * 4 - 2), // Slight size variation
            color: this.foodColors[Math.floor(Math.random() * this.foodColors.length)],
            drift: (Math.random() - 0.5) * 20, // Horizontal drift speed
            createdAt: Date.now(),
            inWater: false,
            consumed: false
        };
    }

    /**
     * Get random X position within drop area
     * @returns {number} Random X coordinate
     */
    getRandomDropX() {
        const minX = this.dropAreaMargin;
        const maxX = 1920 - this.dropAreaMargin; // Assuming 1920px width
        return minX + Math.random() * (maxX - minX);
    }

    /**
     * Check collision between food and fish
     * @param {Object} food - Food item
     * @param {Object} fish - Fish object
     * @returns {boolean} Whether collision occurred
     */
    checkFoodFishCollision(food, fish) {
        if (food.consumed) {
            return false;
        }
        
        const dx = food.x - fish.x;
        const dy = food.y - fish.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Generous collision threshold for better game feel
        const threshold = Math.max(20, (food.size + fish.size) / 2);
        
        return distance < threshold;
    }

    /**
     * Handle fish eating food
     * @param {Object} food - Food item
     * @param {Object} fish - Fish object
     * @returns {boolean} Whether food was consumed
     */
    feedFish(food, fish) {
        if (food.consumed) {
            return false;
        }
        
        food.consumed = true;
        
        // Remove food from active items
        const index = this.activeFoodItems.findIndex(item => item.id === food.id);
        if (index !== -1) {
            this.activeFoodItems.splice(index, 1);
        }
        
        // Update fish hunger (this will be handled by fish system)
        fish.lastFed = Date.now();
        
        // Play eating sound effect
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            audioManager.playEffect('bubble', 0.4);
        }
        
        return true;
    }

    /**
     * Render food items using p5.js
     * @param {Object} p5 - p5.js instance
     */
    render(p5) {
        p5.push();
        
        this.activeFoodItems.forEach(food => {
            if (!food.consumed) {
                // Draw food pellet with slight glow effect
                p5.fill(food.color);
                p5.noStroke();
                
                // Add glow effect
                for (let i = 0; i < 3; i++) {
                    const alpha = 100 - (i * 30);
                    const size = food.size + (i * 2);
                    p5.fill(p5.red(food.color), p5.green(food.color), p5.blue(food.color), alpha);
                    p5.ellipse(food.x, food.y, size, size);
                }
                
                // Draw main food pellet
                p5.fill(food.color);
                p5.ellipse(food.x, food.y, food.size, food.size);
                
                // Add small highlight
                p5.fill(255, 255, 255, 150);
                p5.ellipse(food.x - food.size * 0.2, food.y - food.size * 0.2, food.size * 0.3, food.size * 0.3);
            }
        });
        
        p5.pop();
    }

    /**
     * Get all active food items
     * @returns {Array} Array of food items
     */
    getActiveFoodItems() {
        return this.activeFoodItems.filter(food => !food.consumed);
    }

    /**
     * Get food level percentage
     * @returns {number} Food level (0-100)
     */
    getFoodLevel() {
        return this.foodLevel;
    }

    /**
     * Get food level as normalized value
     * @returns {number} Food level (0-1)
     */
    getFoodLevelNormalized() {
        return this.foodLevel / this.maxFood;
    }

    /**
     * Check if food can be dispensed
     * @returns {boolean} Whether food dispensing is available
     */
    canDispenseFood() {
        const now = Date.now();
        const cooldownOk = (now - this.lastFeedTime) >= this.feedCooldown;
        const foodAvailable = this.foodLevel >= 10;
        
        return cooldownOk && foodAvailable;
    }

    /**
     * Set food level (for testing or admin functions)
     * @param {number} level - Food level (0-100)
     */
    setFoodLevel(level) {
        this.foodLevel = Math.max(0, Math.min(this.maxFood, level));
    }

    /**
     * Clear all active food items
     */
    clearAllFood() {
        this.activeFoodItems = [];
    }

    /**
     * Get food statistics for debugging
     * @returns {Object} Food system statistics
     */
    getStats() {
        return {
            foodLevel: this.foodLevel,
            activeFoodItems: this.activeFoodItems.length,
            canDispense: this.canDispenseFood(),
            lastFeedTime: this.lastFeedTime,
            refillRate: this.refillRate,
            foodTTL: this.foodTTL
        };
    }

    /**
     * Update food system settings
     * @param {Object} settings - New settings to apply
     */
    updateSettings(settings) {
        if (settings.refillRate !== undefined) {
            this.refillRate = Math.max(0, settings.refillRate);
        }
        
        if (settings.fishRefillBonus !== undefined) {
            this.fishRefillBonus = Math.max(0, settings.fishRefillBonus);
        }
        
        if (settings.foodTTL !== undefined) {
            this.foodTTL = Math.max(1000, settings.foodTTL);
        }
        
        if (settings.feedCooldown !== undefined) {
            this.feedCooldown = Math.max(100, settings.feedCooldown);
        }
        
        if (settings.fallSpeed !== undefined) {
            this.fallSpeed = Math.max(10, settings.fallSpeed);
        }
    }

    /**
     * Reset food system to initial state
     */
    reset() {
        this.foodLevel = 50;
        this.activeFoodItems = [];
        this.lastFeedTime = 0;
        this.lastUpdateTime = Date.now();
    }
}

// Global food manager instance
let foodManager = null;

/**
 * Initialize global food manager
 * @param {Object} options - Initialization options
 * @returns {FoodManager} Food manager instance
 */
function initializeFoodManager(options = {}) {
    if (foodManager) {
        return foodManager;
    }
    
    foodManager = new FoodManager();
    
    // Apply custom settings if provided
    if (options.settings) {
        foodManager.updateSettings(options.settings);
    }
    
    return foodManager;
}

/**
 * Get global food manager
 * @returns {FoodManager|null} Food manager instance
 */
function getFoodManager() {
    return foodManager;
}

// Export for module systems and global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FoodManager, initializeFoodManager, getFoodManager };
} else {
    // Browser global
    window.FoodManager = FoodManager;
    window.initializeFoodManager = initializeFoodManager;
    window.getFoodManager = getFoodManager;
}