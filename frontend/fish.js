/**
 * Fish AI and Animation System for Aquae
 * Handles fish behavior, movement, feeding, and rendering
 * Compatible with Chromium M69
 */

class Fish {
    constructor(data, fishType) {
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
        this.size = fishType.size.width * 1.5; // 1.5x bigger for collision detection
        this.width = fishType.size.width;
        this.height = fishType.size.height;
        this.feedIntervalMin = fishType.feedIntervalMin;
        this.hungerThreshold = fishType.hungerThreshold;
        this.rarity = fishType.rarity;
        this.cycle = fishType.cycle;
        
        // Movement and animation properties
        this.vx = 0; // Velocity X
        this.vy = 0; // Velocity Y
        this.targetX = this.x;
        this.targetY = this.y;
        this.speed = this.getBaseSpeed();
        this.direction = 1; // 1 for right, -1 for left
        
        // Animation state
        this.animationTime = Math.random() * 1000; // Random start offset
        this.tailOffset = 0;
        this.finOffset = 0;
        this.breathingOffset = 0;
        
        // Behavior state
        this.state = 'wandering'; // 'wandering', 'seeking_food', 'eating', 'resting', 'dying'
        this.targetFood = null;
        this.restTimer = 0;
        this.lastStateChange = Date.now();
        this.hungerMultiplier = 1.0; // Will be set by fish manager
        
        // Death animation state
        this.isDying = false;
        this.deathStartTime = 0;
        this.deathDuration = 3000; // 3 seconds death animation
        this.deathOpacity = 1.0;
        this.deathGrayscale = 0.0;
        
        // Visual properties
        this.color = this.getFishColor();
        this.opacity = 1;
        this.scale = 1;
        
        // Constraints
        this.minX = 50;
        this.maxX = 1870;
        this.minY = 200;
        this.maxY = 900;
        
        // Activity based on cycle
        this.isActive = this.checkActivity();
    }

    /**
     * Get base movement speed based on fish type
     * @returns {number} Base speed in pixels per second
     */
    getBaseSpeed() {
        const speedMap = {
            'common': 40,
            'uncommon': 45,
            'rare': 50,
            'very_rare': 60
        };
        return speedMap[this.rarity] || 40;
    }

    /**
     * Get fish color based on type and rarity
     * @returns {string} Hex color code
     */
    getFishColor() {
        const colorMap = {
            'Clownfish': '#FF4500',
            'Angelfish': '#FFD700',
            'Betta': '#8B008B',
            'Goldfish': '#FFA500',
            'Dragonfish': '#4B0082'
        };
        return colorMap[this.type] || '#4169E1';
    }

    /**
     * Check if fish should be active based on time and cycle
     * @returns {boolean} Whether fish is active
     */
    checkActivity() {
        // Get current time of day from aquarium system for debug override support
        const aquariumSystem = window.getAquariumSystem?.();
        let hour;
        
        if (aquariumSystem && aquariumSystem.debugTimeOverride) {
            hour = aquariumSystem.debugTimeOverride === 'day' ? 12 : 0;
        } else {
            hour = new Date().getHours();
        }
        
        if (this.cycle === 'diurnal') {
            return hour >= 6 && hour < 20;
        } else {
            return hour >= 20 || hour < 6;
        }
    }

    /**
     * Update fish state and behavior
     * @param {number} deltaTime - Time elapsed in milliseconds
     * @param {Array} foodItems - Available food items
     */
    update(deltaTime, foodItems = []) {
        const dtSeconds = deltaTime / 1000;
        
        // Update animation timers
        this.animationTime += deltaTime;
        
        // Update activity status
        this.isActive = this.checkActivity();
        
        // Update death animation if dying
        if (this.isDying) {
            this.updateDeathAnimation(deltaTime);
            return; // Skip other updates when dying
        }
        
        // Update hunger over time
        this.updateHunger(dtSeconds);
        
        // Update behavior based on state
        this.updateBehavior(dtSeconds, foodItems);
        
        // Update movement
        this.updateMovement(dtSeconds);
        
        // Update animation offsets
        this.updateAnimation(dtSeconds);
        
        // Constrain position
        this.constrainPosition();
    }

    /**
     * Update hunger level over time
     * @param {number} deltaTime - Time in seconds
     */
    updateHunger(deltaTime) {
        if (this.isDying || this.hunger >= this.hungerThreshold) {
            return; // Fish is dying or already at max hunger
        }
        
        // Calculate hunger rate based on activity - now configurable
        const baseRate = this.hungerThreshold / (this.feedIntervalMin * 60); // per second
        const hungerMultiplier = this.hungerMultiplier || 1.0; // Use configured multiplier
        const activityMultiplier = this.isActive ? 1.0 : 0.5; // Less difference between day/night
        const hungerRate = baseRate * hungerMultiplier * activityMultiplier;
        
        this.hunger = Math.min(this.hungerThreshold, this.hunger + (hungerRate * deltaTime));
        
        // Check if fish should die from hunger
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
        const now = Date.now();
        
        // Always check for food if hungry - check every frame for immediate response
        if (this.hunger > 5 && foodItems.length > 0) {
            this.seekNearestFood(foodItems);
        } else if (this.state === 'seeking_food' && (!this.targetFood || this.hunger <= 5 || foodItems.length === 0)) {
            // Stop seeking food if no longer hungry, target is gone, or no food available
            this.targetFood = null;
            this.setState('wandering');
        }
        
        // Execute behavior based on current state
        switch (this.state) {
            case 'wandering':
                this.wanderBehavior(deltaTime);
                break;
            case 'seeking_food':
                this.seekFoodBehavior(deltaTime);
                break;
            case 'resting':
                this.restBehavior(deltaTime);
                break;
        }
        
        // Occasionally change direction when wandering
        if (this.state === 'wandering' && Math.random() < 0.02) {
            this.chooseNewTarget();
        }
    }

    /**
     * Wandering behavior - random movement
     * @param {number} deltaTime - Time in seconds
     */
    wanderBehavior(deltaTime) {
        // If close to target, choose new target
        const distanceToTarget = Math.sqrt(
            Math.pow(this.targetX - this.x, 2) + Math.pow(this.targetY - this.y, 2)
        );
        
        if (distanceToTarget < 30) {
            this.chooseNewTarget();
        }
        
        // Occasionally rest if not active
        if (!this.isActive && Math.random() < 0.005) {
            this.setState('resting');
        }
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
        
        // Update target position to food location
        this.targetX = this.targetFood.x;
        this.targetY = this.targetFood.y;
        
        // Face the food direction immediately when seeking food
        const dx = this.targetFood.x - this.x;
        if (Math.abs(dx) > 5) { // Only change direction if there's significant movement
            this.direction = dx > 0 ? -1 : 1;
        }
        
        // Check if reached food (larger collision radius for easier eating)
        const distance = Math.sqrt(
            Math.pow(this.targetFood.x - this.x, 2) + Math.pow(this.targetFood.y - this.y, 2)
        );
        
        // Debug logging
        if (Math.random() < 0.01) { // Log occasionally to avoid spam
            console.log(`Fish ${this.id} chasing food, distance: ${Math.round(distance)}`);
        }
        
        if (distance < 40) { // Generous collision radius
            // Try to eat the food
            const foodManager = window.getFoodManager?.();
            if (foodManager && foodManager.feedFish(this.targetFood, this)) {
                this.hunger = Math.max(0, this.hunger - 20);
                this.lastFed = new Date();
                this.spawnCount++;
                
                // Mark for server update with feeding flag
                this.needsUpdate = true;
                this.justFed = true; // Flag to indicate this fish was just fed
                
                console.log(`Fish ${this.id} ate food! Hunger now: ${this.hunger}, Spawn count: ${this.spawnCount}/5`);
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
        
        // Gentle swaying motion while resting
        this.targetX = this.x + Math.sin(this.animationTime * 0.001) * 10;
        this.targetY = this.y + Math.cos(this.animationTime * 0.0008) * 5;
        
        // Rest for 5-15 seconds
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
        if (foodItems.length === 0) {
            this.targetFood = null;
            return;
        }
        
        let nearestFood = null;
        let nearestDistance = Infinity;
        
        foodItems.forEach(food => {
            // Only consider food that isn't consumed
            if (!food.consumed) {
                const distance = Math.sqrt(
                    Math.pow(food.x - this.x, 2) + Math.pow(food.y - this.y, 2)
                );
                
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestFood = food;
                }
            }
        });
        
        // Fish will seek food if hungry and food is within detection range
        if (nearestFood && nearestDistance < 800) {
            this.targetFood = nearestFood;
            this.setState('seeking_food');
            
            // Debug logging
            console.log(`Fish ${this.id} seeking food at distance ${Math.round(nearestDistance)}`);
        }
    }

    /**
     * Choose a new random target position
     */
    chooseNewTarget() {
        // Use dynamic bounds that account for fish size
        const margin = Math.max(this.width, this.height) * 0.75;
        const minX = margin;
        const maxX = 1920 - margin;
        const minY = 200 + margin; // Below water surface
        const maxY = 1000 - margin; // Above aquarium bottom
        
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
            // Calculate movement speed based on state and activity
            let currentSpeed = this.speed;
            
            if (this.state === 'seeking_food') {
                currentSpeed *= 2.0; // Much faster when seeking food
            } else if (this.state === 'resting') {
                currentSpeed *= 0.3; // Slower when resting
            }
            
            if (!this.isActive) {
                currentSpeed *= 0.7; // Less speed reduction when not active
            }
            
            // Calculate velocity
            this.vx = (dx / distance) * currentSpeed;
            this.vy = (dy / distance) * currentSpeed;
            
            // Update direction for sprite flipping - prioritize food seeking
            if (this.state === 'seeking_food' && this.targetFood) {
                // When seeking food, face the food regardless of general movement
                const foodDx = this.targetFood.x - this.x;
                if (Math.abs(foodDx) > 5) {
                    this.direction = foodDx > 0 ? -1 : 1;
                }
            } else {
                // Normal movement direction
                if (this.vx > 0) {
                    this.direction = 1;
                } else if (this.vx < 0) {
                    this.direction = -1;
                }
            }
            
            // Apply movement with smoothing
            this.x += this.vx * deltaTime;
            this.y += this.vy * deltaTime;
        } else {
            // Stop moving when close to target
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
        
        // Tail animation - faster when moving
        this.tailOffset = Math.sin(this.animationTime * animationSpeed * 2) * 15;
        
        // Fin animation - subtle movement
        this.finOffset = Math.sin(this.animationTime * animationSpeed * 1.5) * 8;
        
        // Breathing animation - constant slow rhythm
        this.breathingOffset = Math.sin(this.animationTime * 0.003) * 2;
    }

    /**
     * Start death animation
     */
    startDying() {
        if (this.isDying) return; // Already dying
        
        this.isDying = true;
        this.state = 'dying';
        this.deathStartTime = Date.now();
        this.deathOpacity = 1.0;
        this.deathGrayscale = 0.0;
        
        // Play death sound
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            audioManager.playEffect('death', 0.5); // Assuming death sound exists
        }
        
        console.log(`Fish ${this.id} (${this.type}) is dying from hunger`);
    }

    /**
     * Update death animation
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    updateDeathAnimation(deltaTime) {
        const elapsed = Date.now() - this.deathStartTime;
        const progress = Math.min(elapsed / this.deathDuration, 1.0);
        
        // Animate grayscale transition (0 to 1)
        this.deathGrayscale = progress;
        
        // Animate opacity fade out (1 to 0)
        this.deathOpacity = 1.0 - progress;
        
        // Slow down movement
        this.vx *= 0.95;
        this.vy *= 0.95;
        
        // Fish sinks slowly
        this.y += 10 * (deltaTime / 1000);
        
        // Check if death animation is complete
        if (progress >= 1.0) {
            this.markForRemoval();
        }
    }

    /**
     * Mark fish for removal from the aquarium
     */
    markForRemoval() {
        this.shouldRemove = true;
        console.log(`Fish ${this.id} death animation complete - ready for removal`);
    }

    /**
     * Check if fish should be removed
     */
    shouldBeRemoved() {
        return this.shouldRemove === true;
    }

    /**
     * Constrain fish position within aquarium bounds
     */
    constrainPosition() {
        // Skip constraining when dying (let them sink)
        if (this.isDying) return;
        
        // Add margin for fish size to prevent going offscreen
        const margin = Math.max(this.width, this.height) * 0.75; // Account for 1.5x scale
        
        const minX = margin;
        const maxX = 1920 - margin;
        const minY = 200 + margin; // Below water surface
        const maxY = 1000 - margin; // Above aquarium bottom
        
        // Constrain current position
        this.x = Math.max(minX, Math.min(maxX, this.x));
        this.y = Math.max(minY, Math.min(maxY, this.y));
        
        // Update target if it's outside bounds
        this.targetX = Math.max(minX, Math.min(maxX, this.targetX));
        this.targetY = Math.max(minY, Math.min(maxY, this.targetY));
        
        // Update class bounds for consistency
        this.minX = minX;
        this.maxX = maxX;
        this.minY = minY;
        this.maxY = maxY;
    }

    /**
     * Set fish behavior state
     * @param {string} newState - New behavior state
     */
    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.lastStateChange = Date.now();
            
            // Reset state-specific timers
            if (newState === 'resting') {
                this.restTimer = 0;
            }
        }
    }

    /**
     * Render fish using p5.js
     * @param {Object} p5 - p5.js instance
     */
    render(p5) {
        p5.push();
        
        // Apply position and scale
        p5.translate(this.x, this.y);
        p5.scale(this.direction, 1); // Flip horizontally based on direction
        
        // Apply breathing scale and make fish 1.5x bigger
        const breathingScale = 1 + (this.breathingOffset * 0.02);
        const fishScale = 1.5 * breathingScale; // 1.5x bigger fish
        p5.scale(fishScale);
        
        // Set opacity based on activity and death state
        let alpha = this.isActive ? 255 : 180;
        if (this.isDying) {
            alpha = alpha * this.deathOpacity;
        }
        
        // Apply grayscale filter for dying fish
        if (this.isDying && this.deathGrayscale > 0) {
            // p5.js doesn't have built-in grayscale, so we'll modify colors manually
        }
        
        // Draw fish body
        this.drawFishBody(p5, alpha);
        
        // Draw fins
        this.drawFins(p5, alpha);
        
        // Draw tail
        this.drawTail(p5, alpha);
        
        // Draw eye (X eyes when dying)
        if (this.isDying) {
            this.drawDeadEye(p5, alpha);
        } else {
            this.drawEye(p5, alpha);
        }
        
        p5.pop();
        
        // Don't draw hunger bar or indicators when dying
        if (!this.isDying) {
            // Draw hunger bar above fish (outside of scaled transform)
            this.drawHungerBar(p5);
            
            // Draw hunger indicator if very hungry
            if (this.hunger > 70) {
                p5.push();
                p5.translate(this.x, this.y - this.height * 1.5);
                this.drawHungerIndicator(p5);
                p5.pop();
            }
        }
    }

    /**
     * Draw fish body
     * @param {Object} p5 - p5.js instance
     * @param {number} alpha - Opacity value
     */
    drawFishBody(p5, alpha) {
        // Get base color
        let bodyColor = p5.color(this.color);
        
        // Apply grayscale effect when dying
        if (this.isDying && this.deathGrayscale > 0) {
            const gray = (p5.red(bodyColor) + p5.green(bodyColor) + p5.blue(bodyColor)) / 3;
            const r = p5.lerp(p5.red(bodyColor), gray, this.deathGrayscale);
            const g = p5.lerp(p5.green(bodyColor), gray, this.deathGrayscale);
            const b = p5.lerp(p5.blue(bodyColor), gray, this.deathGrayscale);
            bodyColor = p5.color(r, g, b);
        }
        
        // Main body (ellipse)
        p5.fill(p5.red(bodyColor), p5.green(bodyColor), p5.blue(bodyColor), alpha);
        p5.stroke(0, 0, 0, alpha * 0.3);
        p5.strokeWeight(1);
        p5.ellipse(0, 0, this.width, this.height);
        
        // Body highlight
        p5.fill(255, 255, 255, alpha * 0.3);
        p5.noStroke();
        p5.ellipse(-this.width * 0.1, -this.height * 0.2, this.width * 0.6, this.height * 0.4);
        
        // Body pattern (stripes for some fish types)
        if (this.type === 'Clownfish') {
            p5.fill(255, 255, 255, alpha * 0.8);
            p5.ellipse(-this.width * 0.2, 0, 4, this.height * 0.8);
            p5.ellipse(this.width * 0.1, 0, 4, this.height * 0.8);
        }
    }

    /**
     * Draw dead fish eyes (X marks)
     * @param {Object} p5 - p5.js instance
     * @param {number} alpha - Opacity value
     */
    drawDeadEye(p5, alpha) {
        p5.push();
        p5.translate(-this.width * 0.2, -this.height * 0.1);
        
        // Draw X over the eye
        p5.stroke(0, 0, 0, alpha);
        p5.strokeWeight(2);
        p5.line(-3, -3, 3, 3);
        p5.line(-3, 3, 3, -3);
        
        p5.pop();
    }

    /**
     * Draw fish fins
     * @param {Object} p5 - p5.js instance
     * @param {number} alpha - Opacity value
     */
    drawFins(p5, alpha) {
        const finColor = p5.color(this.color);
        finColor.setAlpha(alpha * 0.7);
        p5.fill(finColor);
        p5.noStroke();
        
        // Dorsal fin (top)
        p5.push();
        p5.translate(0, -this.height * 0.5);
        p5.rotate(this.finOffset * 0.01);
        p5.triangle(-8, 0, 8, 0, 0, -12);
        p5.pop();
        
        // Pectoral fins (sides)
        p5.push();
        p5.translate(-this.width * 0.3, this.height * 0.1);
        p5.rotate(this.finOffset * 0.015);
        p5.ellipse(0, 0, 8, 16);
        p5.pop();
        
        // Ventral fin (bottom)
        p5.push();
        p5.translate(this.width * 0.1, this.height * 0.4);
        p5.rotate(-this.finOffset * 0.01);
        p5.triangle(-4, 0, 4, 0, 0, 8);
        p5.pop();
    }

    /**
     * Draw fish tail
     * @param {Object} p5 - p5.js instance
     * @param {number} alpha - Opacity value
     */
    drawTail(p5, alpha) {
        const tailColor = p5.color(this.color);
        tailColor.setAlpha(alpha * 0.8);
        p5.fill(tailColor);
        p5.stroke(0, 0, 0, alpha * 0.2);
        p5.strokeWeight(1);
        
        p5.push();
        p5.translate(this.width * 0.5, 0);
        p5.rotate(this.tailOffset * 0.02);
        
        // Tail fin
        p5.triangle(0, -8, 0, 8, 16, 0);
        p5.triangle(0, -12, 0, -4, 12, -8);
        p5.triangle(0, 4, 0, 12, 12, 8);
        
        p5.pop();
    }

    /**
     * Draw fish eye
     * @param {Object} p5 - p5.js instance
     * @param {number} alpha - Opacity value
     */
    drawEye(p5, alpha) {
        // Eye white
        p5.fill(255, 255, 255, alpha);
        p5.stroke(0, 0, 0, alpha * 0.5);
        p5.strokeWeight(1);
        p5.ellipse(-this.width * 0.2, -this.height * 0.1, 8, 8);
        
        // Pupil
        p5.fill(0, 0, 0, alpha);
        p5.noStroke();
        p5.ellipse(-this.width * 0.2, -this.height * 0.1, 4, 4);
        
        // Eye highlight
        p5.fill(255, 255, 255, alpha * 0.8);
        p5.ellipse(-this.width * 0.2 + 1, -this.height * 0.1 - 1, 2, 2);
    }

    /**
     * Draw hunger bar above fish
     * @param {Object} p5 - p5.js instance
     */
    drawHungerBar(p5) {
        p5.push();
        
        // Position above fish
        const barY = this.y - this.height * 1.2;
        const barWidth = this.width * 1.2;
        const barHeight = 6;
        const barX = this.x - barWidth / 2;
        
        // Calculate hunger percentage (0 = full, 100 = starving)
        const hungerPercent = Math.min(100, (this.hunger / this.hungerThreshold) * 100);
        const fillPercent = Math.max(0, 100 - hungerPercent); // Invert so full = 100%
        
        // Background bar (dark)
        p5.fill(0, 0, 0, 100);
        p5.stroke(255, 255, 255, 150);
        p5.strokeWeight(1);
        p5.rect(barX, barY, barWidth, barHeight, 3);
        
        // Hunger fill bar
        if (fillPercent > 0) {
            // Color based on hunger level
            let barColor;
            if (fillPercent > 60) {
                // Well fed - green
                barColor = p5.color(76, 175, 80);
            } else if (fillPercent > 30) {
                // Getting hungry - yellow
                barColor = p5.color(255, 193, 7);
            } else {
                // Very hungry - red
                barColor = p5.color(244, 67, 54);
            }
            
            p5.fill(barColor);
            p5.noStroke();
            p5.rect(barX + 1, barY + 1, (barWidth - 2) * (fillPercent / 100), barHeight - 2, 2);
        }
        
        // Optional: Show hunger percentage text for debugging
        if (window.location.hostname === 'localhost' && fillPercent < 50) {
            p5.fill(255, 255, 255);
            p5.textAlign(p5.CENTER, p5.CENTER);
            p5.textSize(10);
            p5.text(Math.round(fillPercent) + '%', this.x, barY - 12);
        }
        
        p5.pop();
    }

    /**
     * Draw hunger indicator if very hungry
     * @param {Object} p5 - p5.js instance
     */
    drawHungerIndicator(p5) {
        p5.push();
        
        // Thought bubble
        p5.fill(255, 255, 255, 200);
        p5.stroke(0, 0, 0, 100);
        p5.strokeWeight(1);
        p5.ellipse(0, 0, 20, 15);
        
        // Food icon in bubble
        p5.fill(139, 69, 19); // Brown food color
        p5.noStroke();
        p5.ellipse(0, 0, 6, 6);
        
        // Small bubbles leading to main bubble
        p5.fill(255, 255, 255, 150);
        p5.ellipse(-8, 8, 4, 4);
        p5.ellipse(-12, 12, 3, 3);
        
        p5.pop();
    }

    /**
     * Get fish data for server synchronization
     * @returns {Object} Fish data
     */
    getServerData() {
        const data = {
            id: this.id,
            type: this.type,
            hunger: Math.round(this.hunger * 100) / 100,
            x: Math.round(this.x),
            y: Math.round(this.y),
            last_fed: this.lastFed.toISOString(),
            spawn_count: this.spawnCount
        };
        
        // Include feeding flag if fish was just fed
        if (this.justFed) {
            data.fed = true;
            this.justFed = false; // Reset flag after including it
        }
        
        return data;
    }

    /**
     * Check if fish needs server update
     * @returns {boolean} Whether fish needs update
     */
    needsServerUpdate() {
        return this.needsUpdate === true;
    }

    /**
     * Mark server update as completed
     */
    markServerUpdated() {
        this.needsUpdate = false;
    }

    /**
     * Get fish health status
     * @returns {string} Health status ('healthy', 'hungry', 'critical')
     */
    getHealthStatus() {
        const hungerPercent = (this.hunger / this.hungerThreshold) * 100;
        
        if (hungerPercent < 30) {
            return 'healthy';
        } else if (hungerPercent < 70) {
            return 'hungry';
        } else {
            return 'critical';
        }
    }

    /**
     * Get time since last fed in minutes
     * @returns {number} Minutes since last fed
     */
    getTimeSinceLastFed() {
        return (Date.now() - this.lastFed.getTime()) / (1000 * 60);
    }
}

/**
 * Fish Manager class to handle multiple fish
 */
class FishManager {
    constructor() {
        this.fish = [];
        this.fishTypes = new Map();
        this.hungerMultiplier = 1.0; // Default multiplier
        this.spawnPoints = [
            { x: 300, y: 400 },
            { x: 1620, y: 400 },
            { x: 960, y: 300 },
            { x: 960, y: 600 }
        ];
    }

    /**
     * Set hunger multiplier for all fish
     * @param {number} multiplier - Hunger rate multiplier
     */
    setHungerMultiplier(multiplier) {
        this.hungerMultiplier = multiplier;
        // Update existing fish
        this.fish.forEach(fish => {
            fish.hungerMultiplier = multiplier;
        });
    }

    /**
     * Load fish type configurations
     * @param {Array} fishTypeConfigs - Fish type configurations from server
     */
    loadFishTypes(fishTypeConfigs) {
        fishTypeConfigs.forEach(config => {
            this.fishTypes.set(config.name.toLowerCase(), config);
        });
    }

    /**
     * Add fish to the aquarium
     * @param {Object} fishData - Fish data from server
     * @returns {Fish|null} Created fish instance
     */
    addFish(fishData) {
        const fishType = this.fishTypes.get(fishData.type.toLowerCase());
        if (!fishType) {
            console.warn(`Unknown fish type: ${fishData.type}`);
            return null;
        }
        
        const fish = new Fish(fishData, fishType);
        fish.hungerMultiplier = this.hungerMultiplier; // Apply current multiplier
        this.fish.push(fish);
        
        return fish;
    }

    /**
     * Remove fish by ID
     * @param {number} fishId - Fish ID to remove
     * @returns {boolean} Whether fish was removed
     */
    removeFish(fishId) {
        const index = this.fish.findIndex(f => f.id === fishId);
        if (index !== -1) {
            this.fish.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get fish by ID
     * @param {number} fishId - Fish ID
     * @returns {Fish|null} Fish instance
     */
    getFish(fishId) {
        return this.fish.find(f => f.id === fishId) || null;
    }

    /**
     * Update all fish and handle death cleanup
     * @param {number} deltaTime - Time elapsed in milliseconds
     * @param {Array} foodItems - Available food items
     */
    updateAll(deltaTime, foodItems = []) {
        // Update all fish
        this.fish.forEach(fish => {
            fish.update(deltaTime, foodItems);
        });
        
        // Remove dead fish
        const aliveFish = this.fish.filter(fish => !fish.shouldBeRemoved());
        const deadFishCount = this.fish.length - aliveFish.length;
        
        if (deadFishCount > 0) {
            console.log(`Removed ${deadFishCount} dead fish from aquarium`);
            this.fish = aliveFish;
            
            // Trigger respawn logic if all fish died
            if (this.fish.length === 0) {
                this.scheduleRespawn();
            }
        }
    }

    /**
     * Schedule respawn after delay when all fish die
     */
    scheduleRespawn() {
        if (this.respawnTimeout) {
            clearTimeout(this.respawnTimeout);
        }
        
        console.log('All fish died - scheduling respawn in 5 seconds...');
        
        this.respawnTimeout = setTimeout(() => {
            // Trigger respawn through main aquarium system
            const aquariumSystem = window.getAquariumSystem?.();
            if (aquariumSystem) {
                aquariumSystem.respawnFish();
                
                // Play spawn sound
                const audioManager = window.getAudioManager?.();
                if (audioManager) {
                    audioManager.playEffect('spawn', 0.7);
                }
            }
            this.respawnTimeout = null;
        }, 5000); // 5 second delay
    }

    /**
     * Render all fish
     * @param {Object} p5 - p5.js instance
     */
    renderAll(p5) {
        // Sort fish by Y position for proper depth
        const sortedFish = [...this.fish].sort((a, b) => a.y - b.y);
        
        sortedFish.forEach(fish => {
            fish.render(p5);
        });
    }

    /**
     * Get all fish data for server sync
     * @returns {Array} Array of fish data
     */
    getAllServerData() {
        return this.fish.map(fish => fish.getServerData());
    }

    /**
     * Get fish that need server updates
     * @returns {Array} Array of fish needing updates
     */
    getFishNeedingUpdate() {
        return this.fish.filter(fish => fish.needsServerUpdate());
    }

    /**
     * Clear all fish
     */
    clearAll() {
        this.fish = [];
    }

    /**
     * Get fish count
     * @returns {number} Number of fish
     */
    getCount() {
        return this.fish.length;
    }

    /**
     * Get fish statistics
     * @returns {Object} Fish statistics
     */
    getStats() {
        const totalFish = this.fish.length;
        const healthyFish = this.fish.filter(f => f.getHealthStatus() === 'healthy').length;
        const hungryFish = this.fish.filter(f => f.getHealthStatus() === 'hungry').length;
        const criticalFish = this.fish.filter(f => f.getHealthStatus() === 'critical').length;
        
        return {
            total: totalFish,
            healthy: healthyFish,
            hungry: hungryFish,
            critical: criticalFish,
            activeFish: this.fish.filter(f => f.isActive).length
        };
    }
}

// Global fish manager instance
let fishManager = null;

/**
 * Initialize global fish manager
 * @param {Array} fishTypeConfigs - Fish type configurations
 * @returns {FishManager} Fish manager instance
 */
function initializeFishManager(fishTypeConfigs = []) {
    if (fishManager) {
        return fishManager;
    }
    
    fishManager = new FishManager();
    fishManager.loadFishTypes(fishTypeConfigs);
    
    return fishManager;
}

/**
 * Get global fish manager
 * @returns {FishManager|null} Fish manager instance
 */
function getFishManager() {
    return fishManager;
}

// Export for module systems and global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Fish, FishManager, initializeFishManager, getFishManager };
} else {
    // Browser global
    window.Fish = Fish;
    window.FishManager = FishManager;
    window.initializeFishManager = initializeFishManager;
    window.getFishManager = getFishManager;
}