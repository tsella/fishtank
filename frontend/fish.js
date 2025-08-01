/**
 * Fish AI and Animation System for Aquae
 * Handles fish behavior, movement, feeding, and rendering in WebGL
 * Compatible with Chromium M69
 */

class Fish {
    constructor(data, fishType, scaleMultiplier = 1.5) {
        // Basic properties from server
        this.id = data.id;
        this.type = data.type;
        this.hunger = data.hunger || 0;
        this.x = data.x || 400;
        this.y = data.y || 300;
        this.lastFed = new Date(data.last_fed || Date.now());
        this.spawnCount = data.spawn_count || 0;
        
        // Fish type configuration
        this.fishType = fishType;
        this.scaleMultiplier = scaleMultiplier;
        this.size = fishType.size.width * this.scaleMultiplier;
        this.width = fishType.size.width;
        this.height = fishType.size.height;
        this.feedIntervalMin = fishType.feedIntervalMin;
        this.hungerThreshold = fishType.hungerThreshold;
        this.rarity = fishType.rarity;
        this.cycle = fishType.cycle;
        
        // Movement and animation properties
        this.vx = 0;
        this.vy = 0;
        this.targetX = this.x;
        this.targetY = this.y;
        this.speed = this.getBaseSpeed();
        this.direction = 1;
        
        // Animation state
        this.animationTime = Math.random() * 1000;
        this.tailOffset = 0;
        this.finOffset = 0;
        this.breathingOffset = 0;
        
        // Behavior state
        this.state = 'wandering';
        this.targetFood = null;
        this.restTimer = 0;
        this.lastStateChange = Date.now();
        this.hungerMultiplier = 1.0;
        
        // Death animation state
        this.isDying = false;
        this.deathStartTime = 0;
        this.deathDuration = 3000;
        this.deathOpacity = 1.0;
        this.deathGrayscale = 0.0;
        
        // Visual properties
        this.color = this.getFishColor();
        
        // Constraints
        this.minX = 50;
        this.maxX = 1870;
        this.minY = 200;
        this.maxY = 900;
        
        this.isActive = this.checkActivity();
    }

    /**
     * Get base movement speed based on fish type
     * @returns {number} Base speed in pixels per second
     */
    getBaseSpeed() {
        const speedMap = { 'common': 40, 'uncommon': 45, 'rare': 50, 'very_rare': 60 };
        return speedMap[this.rarity] || 40;
    }

    /**
     * Get fish color based on type and rarity
     * @returns {string} Hex color code
     */
    getFishColor() {
        const colorMap = {
            'Clownfish': '#FF4500', 'Angelfish': '#FFD700', 'Betta': '#8B008B',
            'Goldfish': '#FFA500', 'Dragonfish': '#4B0082'
        };
        return colorMap[this.type] || '#4169E1';
    }

    /**
     * Check if fish should be active based on time and cycle
     * @returns {boolean} Whether fish is active
     */
    checkActivity() {
        const aquariumSystem = window.getAquariumSystem?.();
        let hour;
        if (aquariumSystem && aquariumSystem.debugTimeOverride) {
            hour = aquariumSystem.debugTimeOverride === 'day' ? 12 : 0;
        } else {
            hour = new Date().getHours();
        }
        if (this.cycle === 'diurnal') return hour >= 6 && hour < 20;
        return hour >= 20 || hour < 6;
    }

    /**
     * Update fish state and behavior
     * @param {number} deltaTime - Time elapsed in milliseconds
     * @param {Array} foodItems - Available food items
     */
    update(deltaTime, foodItems = []) {
        const dtSeconds = deltaTime / 1000;
        this.animationTime += deltaTime;
        this.isActive = this.checkActivity();

        if (this.isDying) {
            this.updateDeathAnimation(deltaTime);
            return;
        }

        this.updateHunger(dtSeconds);
        this.updateBehavior(dtSeconds, foodItems);
        this.updateMovement(dtSeconds);
        this.updateAnimation(dtSeconds);
        this.constrainPosition();
    }

    /**
     * Update hunger level over time
     * @param {number} deltaTime - Time in seconds
     */
    updateHunger(deltaTime) {
        if (this.isDying || this.hunger >= this.hungerThreshold) return;
        
        const baseRate = this.hungerThreshold / (this.feedIntervalMin * 60);
        const hungerMultiplier = this.hungerMultiplier || 1.0;
        const activityMultiplier = this.isActive ? 1.0 : 0.5;
        const hungerRate = baseRate * hungerMultiplier * activityMultiplier;
        
        this.hunger = Math.min(this.hungerThreshold, this.hunger + (hungerRate * deltaTime));
        
        if (this.hunger >= this.hungerThreshold && !this.isDying) {
            this.startDying();
        }
    }

    /**
     * Update fish behavior and AI
     * @param {number} deltaTime - Time in seconds
     * @param {Array} foodItems - Available food items
     */
    updateBehavior(deltaTime, foodItems) {
        if (this.hunger > 5 && foodItems.length > 0) {
            this.seekNearestFood(foodItems);
        } else if (this.state === 'seeking_food' && (!this.targetFood || this.hunger <= 5 || foodItems.length === 0)) {
            this.targetFood = null;
            this.setState('wandering');
        }
        
        switch (this.state) {
            case 'wandering': this.wanderBehavior(deltaTime); break;
            case 'seeking_food': this.seekFoodBehavior(deltaTime); break;
            case 'resting': this.restBehavior(deltaTime); break;
        }
        
        if (this.state === 'wandering' && Math.random() < 0.02) {
            this.chooseNewTarget();
        }
    }

    /**
     * Wandering behavior - random movement
     * @param {number} deltaTime - Time in seconds
     */
    wanderBehavior(deltaTime) {
        const distanceToTarget = Math.sqrt(Math.pow(this.targetX - this.x, 2) + Math.pow(this.targetY - this.y, 2));
        if (distanceToTarget < 30) this.chooseNewTarget();
        if (!this.isActive && Math.random() < 0.005) this.setState('resting');
    }

    /**
     * Food seeking behavior
     * @param {number} deltaTime - Time in seconds
     */
    seekFoodBehavior(deltaTime) {
        if (!this.targetFood || this.targetFood.consumed) {
            this.targetFood = null;
            this.setState('wandering');
            return;
        }
        
        this.targetX = this.targetFood.x;
        this.targetY = this.targetFood.y;
        
        const dx = this.targetFood.x - this.x;
        if (Math.abs(dx) > 5) this.direction = dx > 0 ? 1 : -1;
        
        const distance = Math.sqrt(Math.pow(this.targetFood.x - this.x, 2) + Math.pow(this.targetFood.y - this.y, 2));
        
        if (distance < 40) {
            const foodManager = window.getFoodManager?.();
            if (foodManager && foodManager.feedFish(this.targetFood, this)) {
                this.hunger = Math.max(0, this.hunger - 20);
                this.lastFed = new Date();
                this.spawnCount++;
                this.needsUpdate = true;
                this.justFed = true;
            }
            this.targetFood = null;
            this.setState('wandering');
        }
    }

    /**
     * Resting behavior - minimal movement
     * @param {number} deltaTime - Time in seconds
     */
    restBehavior(deltaTime) {
        this.restTimer += deltaTime;
        this.targetX = this.x + Math.sin(this.animationTime * 0.001) * 10;
        this.targetY = this.y + Math.cos(this.animationTime * 0.0008) * 5;
        if (this.restTimer > 5 + Math.random() * 10) {
            this.restTimer = 0;
            this.setState('wandering');
        }
    }

    /**
     * Seek the nearest food item
     * @param {Array} foodItems - Available food items
     */
    seekNearestFood(foodItems) {
        let nearestFood = null;
        let nearestDistance = Infinity;
        
        foodItems.forEach(food => {
            if (!food.consumed) {
                const distance = Math.sqrt(Math.pow(food.x - this.x, 2) + Math.pow(food.y - this.y, 2));
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestFood = food;
                }
            }
        });
        
        if (nearestFood && nearestDistance < 800) {
            this.targetFood = nearestFood;
            this.setState('seeking_food');
        }
    }

    /**
     * Choose a new random target position
     */
    chooseNewTarget() {
        const margin = Math.max(this.width, this.height) * 0.75 * this.scaleMultiplier;
        const minX = margin;
        const maxX = 1920 - margin;
        const minY = 200 + margin;
        const maxY = 1000 - margin;
        
        this.targetX = minX + Math.random() * (maxX - minX);
        this.targetY = minY + Math.random() * (maxY - minY);
    }

    /**
     * Update fish movement towards target
     * @param {number} deltaTime - Time in seconds
     */
    updateMovement(deltaTime) {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
            let currentSpeed = this.speed;
            if (this.state === 'seeking_food') currentSpeed *= 2.0;
            else if (this.state === 'resting') currentSpeed *= 0.3;
            if (!this.isActive) currentSpeed *= 0.7;
            
            this.vx = (dx / distance) * currentSpeed;
            this.vy = (dy / distance) * currentSpeed;
            
            if (this.vx > 0) this.direction = 1;
            else if (this.vx < 0) this.direction = -1;
            
            this.x += this.vx * deltaTime;
            this.y += this.vy * deltaTime;
        } else {
            this.vx = 0;
            this.vy = 0;
        }
    }

    /**
     * Update animation offsets for natural movement
     * @param {number} deltaTime - Time in seconds
     */
    updateAnimation(deltaTime) {
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const animationSpeed = 0.005 + (speed * 0.0001);
        
        this.tailOffset = Math.sin(this.animationTime * animationSpeed * 2) * 15;
        this.finOffset = Math.sin(this.animationTime * animationSpeed * 1.5) * 8;
        this.breathingOffset = Math.sin(this.animationTime * 0.003) * 2;
    }

    /**
     * Start death animation
     */
    startDying() {
        if (this.isDying) return;
        this.isDying = true;
        this.state = 'dying';
        this.deathStartTime = Date.now();
        window.getAudioManager?.().playEffect('death', 0.5);
    }

    /**
     * Update death animation
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    updateDeathAnimation(deltaTime) {
        const elapsed = Date.now() - this.deathStartTime;
        const progress = Math.min(elapsed / this.deathDuration, 1.0);
        this.deathGrayscale = progress;
        this.deathOpacity = 1.0 - progress;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.y += 10 * (deltaTime / 1000);
        if (progress >= 1.0) this.markForRemoval();
    }

    markForRemoval() { this.shouldRemove = true; }
    shouldBeRemoved() { return this.shouldRemove === true; }

    /**
     * Constrain fish position within aquarium bounds
     */
    constrainPosition() {
        if (this.isDying) return;
        const margin = Math.max(this.width, this.height) * 0.75 * this.scaleMultiplier;
        this.x = Math.max(margin, Math.min(1920 - margin, this.x));
        this.y = Math.max(200 + margin, Math.min(1000 - margin, this.y));
    }

    /**
     * Set fish behavior state
     * @param {string} newState - New behavior state
     */
    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.lastStateChange = Date.now();
            if (newState === 'resting') this.restTimer = 0;
        }
    }

    /**
     * Render fish using p5.js in WebGL mode
     * @param {Object} p5 - p5.js instance
     */
    render(p5) {
        p5.push();
        p5.translate(this.x, this.y, 0);
        
        if (!this.isDying) {
            this.drawHungerBar3D(p5);
        }

        p5.scale(this.direction, 1, 1);
        
        const breathingScale = 1 + (this.breathingOffset * 0.02);
        const fishScale = this.scaleMultiplier * breathingScale;
        p5.scale(fishScale);
        
        let c = p5.color(this.color);
        if (this.isDying) {
            let gray = (p5.red(c) + p5.green(c) + p5.blue(c)) / 3;
            c = p5.lerpColor(c, p5.color(gray), this.deathGrayscale);
        }
        p5.ambientMaterial(c);
        p5.noStroke();

        this.drawFishBody3D(p5);
        this.drawFins3D(p5);
        this.drawTail3D(p5);
        this.drawEye3D(p5);

        p5.pop();
    }

    drawFishBody3D(p5) {
        if (this.type === 'Dragonfish') {
            p5.ellipsoid(this.width / 1.5, this.height / 2, this.height / 3);
        } else {
            p5.ellipsoid(this.width / 2, this.height / 2, this.height / 3);
        }

        if (this.type === 'Clownfish') {
            p5.push();
            p5.ambientMaterial(255);
            p5.translate(this.width * 0.2, 0, 0);
            p5.box(2, this.height, this.height / 2);
            p5.translate(-this.width * 0.4, 0, 0);
            p5.box(2, this.height, this.height / 2);
            p5.pop();
        }
    }

    drawFins3D(p5) {
        p5.push();
        if (this.type === 'Angelfish') {
            p5.translate(0, -this.height * 0.5, 0);
            p5.rotateZ(this.finOffset * 0.01 + p5.PI / 4);
            p5.plane(this.width * 1.2, this.height * 1.2);
        } else if (this.type === 'Dragonfish') {
            for(let i = 0; i < 5; i++) {
                p5.push();
                p5.translate(this.width * (0.4 - i * 0.2), -this.height * 0.4, 0);
                p5.rotateZ(this.finOffset * 0.01);
                p5.box(this.width * 0.1, this.height * 0.4, 2);
                p5.pop();
            }
        } else {
            p5.translate(0, -this.height * 0.4, 0);
            p5.rotateZ(this.finOffset * 0.01);
            p5.box(this.width * 0.4, this.height * 0.4, 2);
        }
        p5.pop();

        p5.push();
        p5.translate(0, 0, this.height / 3);
        p5.rotateY(p5.PI / 4 + this.finOffset * 0.015);
        p5.plane(this.width * 0.5, this.height * 0.5);
        p5.pop();
    }

    drawTail3D(p5) {
        p5.push();
        p5.translate(-this.width * 0.5, 0, 0);
        p5.rotateY(this.tailOffset * 0.02);
        if (this.type === 'Betta') {
            p5.plane(this.width * 1.5, this.height * 1.5);
        } else if (this.type === 'Goldfish') {
            p5.push();
            p5.translate(0, this.height * 0.2, 0);
            p5.plane(this.width * 0.8, this.height * 0.8);
            p5.pop();
            p5.push();
            p5.translate(0, -this.height * 0.2, 0);
            p5.plane(this.width * 0.8, this.height * 0.8);
            p5.pop();
        } else {
            p5.plane(this.width * 0.6, this.height);
        }
        p5.pop();
    }
    
    drawEye3D(p5) {
        p5.push();
        p5.translate(this.width * 0.3, -this.height * 0.1, this.height / 3);
        
        // Sclera
        p5.specularMaterial(255);
        p5.sphere(2.5);
        
        // Pupil
        p5.push();
        p5.translate(0,0,0.5);
        p5.ambientMaterial(0);
        p5.sphere(1.5);
        p5.pop();

        p5.pop();
    }

    drawHungerBar3D(p5) {
        p5.push();
        const barWidth = this.width * 1.2 * this.scaleMultiplier;
        const barHeight = 6;
        const barY = - (this.height * this.scaleMultiplier * 0.8);
        
        const hungerPercent = Math.min(100, (this.hunger / this.hungerThreshold) * 100);
        const fillPercent = Math.max(0, 100 - hungerPercent);

        // Background
        p5.push();
        p5.translate(0, barY, 0);
        p5.fill(0, 0, 0, 100);
        p5.box(barWidth, barHeight, 2);
        p5.pop();

        // Fill
        if (fillPercent > 0) {
            let barColor = fillPercent > 60 ? p5.color(76, 175, 80) : (fillPercent > 30 ? p5.color(255, 193, 7) : p5.color(244, 67, 54));
            p5.push();
            const fillWidth = barWidth * (fillPercent / 100);
            p5.translate(- (barWidth - fillWidth) / 2, barY, 1);
            p5.ambientMaterial(barColor);
            p5.box(fillWidth, barHeight - 2, 2);
            p5.pop();
        }
        p5.pop();
    }

    getServerData() {
        const data = {
            id: this.id, type: this.type, hunger: Math.round(this.hunger * 100) / 100,
            x: Math.round(this.x), y: Math.round(this.y),
            last_fed: this.lastFed.toISOString(), spawn_count: this.spawnCount
        };
        if (this.justFed) {
            data.fed = true;
            this.justFed = false;
        }
        return data;
    }

    needsServerUpdate() { return this.needsUpdate === true; }
    markServerUpdated() { this.needsUpdate = false; }
    getHealthStatus() {
        const hungerPercent = (this.hunger / this.hungerThreshold) * 100;
        if (hungerPercent < 30) return 'healthy';
        if (hungerPercent < 70) return 'hungry';
        return 'critical';
    }
    getTimeSinceLastFed() { return (Date.now() - this.lastFed.getTime()) / (1000 * 60); }
}

class FishManager {
    constructor() {
        this.fish = [];
        this.fishTypes = new Map();
        this.hungerMultiplier = 1.0;
        this.fishScaleMultiplier = 1.5;
        this.spawnPoints = [
            { x: 300, y: 400 }, { x: 1620, y: 400 },
            { x: 960, y: 300 }, { x: 960, y: 600 }
        ];
    }

    setFishScaleMultiplier(multiplier) {
        this.fishScaleMultiplier = multiplier;
        this.fish.forEach(fish => {
            fish.scaleMultiplier = multiplier;
            fish.size = fish.fishType.size.width * multiplier;
        });
    }

    setHungerMultiplier(multiplier) {
        this.hungerMultiplier = multiplier;
        this.fish.forEach(fish => fish.hungerMultiplier = multiplier);
    }

    loadFishTypes(fishTypeConfigs) {
        fishTypeConfigs.forEach(config => this.fishTypes.set(config.name.toLowerCase(), config));
    }

    addFish(fishData) {
        const fishType = this.fishTypes.get(fishData.type.toLowerCase());
        if (!fishType) return null;
        const fish = new Fish(fishData, fishType, this.fishScaleMultiplier);
        fish.hungerMultiplier = this.hungerMultiplier;
        this.fish.push(fish);
        return fish;
    }

    spawnRandomFish() {
        const availableTypes = Array.from(this.fishTypes.values());
        if (availableTypes.length === 0) return;
        const fishType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        const newFishData = {
            id: Date.now(), // Temporary ID
            type: fishType.name,
            hunger: 0,
            x: 400 + Math.random() * 1120,
            y: 400 + Math.random() * 400,
            last_fed: new Date().toISOString(),
            spawn_count: 0
        };
        this.addFish(newFishData);
    }

    removeFish(fishId) {
        const index = this.fish.findIndex(f => f.id === fishId);
        if (index !== -1) {
            this.fish.splice(index, 1);
            return true;
        }
        return false;
    }

    getFish(fishId) { return this.fish.find(f => f.id === fishId) || null; }

    updateAll(deltaTime, foodItems = []) {
        this.fish.forEach(fish => fish.update(deltaTime, foodItems));
        
        const aliveFish = this.fish.filter(fish => !fish.shouldBeRemoved());
        if (this.fish.length !== aliveFish.length) {
            this.fish = aliveFish;
            if (this.fish.length === 0) this.scheduleRespawn();
        }
    }

    scheduleRespawn() {
        if (this.respawnTimeout) clearTimeout(this.respawnTimeout);
        this.respawnTimeout = setTimeout(() => {
            window.getAquariumSystem?.().respawnFish();
            window.getAudioManager?.().playEffect('spawn', 0.7);
            this.respawnTimeout = null;
        }, 5000);
    }

    renderAll(p5) {
        const sortedFish = [...this.fish].sort((a, b) => a.y - b.y);
        sortedFish.forEach(fish => fish.render(p5));
    }

    renderUI(p5) {
        // This method is no longer needed as UI is part of the 3D render
    }

    getAllServerData() { return this.fish.map(fish => fish.getServerData()); }
    getFishNeedingUpdate() { return this.fish.filter(fish => fish.needsServerUpdate()); }
    clearAll() { this.fish = []; }
    getCount() { return this.fish.length; }
    getStats() {
        return {
            total: this.fish.length,
            healthy: this.fish.filter(f => f.getHealthStatus() === 'healthy').length,
            hungry: this.fish.filter(f => f.getHealthStatus() === 'hungry').length,
            critical: this.fish.filter(f => f.getHealthStatus() === 'critical').length,
            activeFish: this.fish.filter(f => f.isActive).length
        };
    }
}

let fishManager = null;
function initializeFishManager(fishTypeConfigs = []) {
    if (!fishManager) {
        fishManager = new FishManager();
        fishManager.loadFishTypes(fishTypeConfigs);
    }
    return fishManager;
}
function getFishManager() { return fishManager; }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Fish, FishManager, initializeFishManager, getFishManager };
} else {
    window.Fish = Fish;
    window.FishManager = FishManager;
    window.initializeFishManager = initializeFishManager;
    window.getFishManager = getFishManager;
}
