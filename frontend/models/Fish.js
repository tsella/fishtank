/**
 * Fish AI and Animation System for Aquae
 * Handles fish behavior, movement, feeding, and rendering in WebGL
 * Compatible with Chromium M69
 */

export class Fish {
    constructor(data, fishType, world, scaleMultiplier = 1.5) {
        // Basic properties from server
        this.id = data.id;
        this.type = data.type;
        this.hunger = data.hunger || 0;
        this.lastFed = new Date(data.last_fed || Date.now());
        this.spawnCount = data.spawn_count || 0;
        
        // Fish type configuration
        this.fishType = fishType;
        this.world = world;
        this.scaleMultiplier = scaleMultiplier;
        this.width = fishType.size.width;
        this.height = fishType.size.height;
        this.feedIntervalMin = fishType.feedIntervalMin;
        this.hungerThreshold = fishType.hungerThreshold;
        
        // Movement and animation properties
        this.speed = 40 + Math.random() * 20;
        
        // Animation state
        this.animationTime = Math.random() * 1000;
        
        // Behavior state
        this.state = 'wandering';
        this.targetFood = null;
        
        // Three.js object
        this.object = new THREE.Group();
        const initialX = data.x ? data.x - this.world.width / 2 : 0;
        const initialY = data.y ? this.world.height / 2 - data.y : 0;
        this.object.position.set(initialX, initialY, 0);
        this.targetPosition = this.object.position.clone();

        this.createModel();
        this.createHungerBar();
    }

    createModel() {
        // To be implemented by subclasses
    }

    createHungerBar() {
        this.hungerBar = new THREE.Group();
        const barWidth = this.width * 1.2 * this.scaleMultiplier;
        const barHeight = 6;

        const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const background = new THREE.Mesh(bgGeo, bgMat);
        
        const fillGeo = new THREE.PlaneGeometry(barWidth, barHeight - 2);
        this.hungerBarFillMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        this.hungerBarFill = new THREE.Mesh(fillGeo, this.hungerBarFillMaterial);
        this.hungerBarFill.position.z = 0.5; // Prevent z-fighting

        this.hungerBar.add(background);
        this.hungerBar.add(this.hungerBarFill);
        
        this.hungerBar.position.y = this.height * this.scaleMultiplier * 0.8;
        this.hungerBar.position.z = this.height / 3 + 5;
        this.object.add(this.hungerBar);
    }

    update(deltaTime, foodItems) {
        this.animationTime += deltaTime * 1000;

        this.updateHunger(deltaTime);
        this.updateBehavior(deltaTime, foodItems);

        const direction = this.targetPosition.clone().sub(this.object.position).normalize();
        this.object.position.add(direction.multiplyScalar(this.speed * deltaTime));
        
        this.object.rotation.y = direction.x > 0 ? 0 : Math.PI;
        
        if (this.hungerBar) {
            this.hungerBar.rotation.y = -this.object.rotation.y;
        }

        this.updateHungerBar();
    }
    
    updateHunger(deltaTime) {
        if (this.hunger >= this.hungerThreshold) return;
        
        const baseRate = this.hungerThreshold / (this.feedIntervalMin * 60);
        const hungerRate = baseRate;
        
        this.hunger = Math.min(this.hungerThreshold, this.hunger + (hungerRate * deltaTime));
    }

    updateBehavior(deltaTime, foodItems) {
        // Check for food if hungry enough
        if (this.hunger > 20 && this.state !== 'seeking_food') {
            this.seekNearestFood(foodItems);
        }

        if (this.state === 'seeking_food') {
            if (!this.targetFood || this.targetFood.consumed) {
                this.state = 'wandering';
                this.targetFood = null;
                return;
            }
            
            this.targetPosition.copy(this.targetFood.mesh.position);
            
            if (this.object.position.distanceTo(this.targetPosition) < 20) {
                const foodManager = getFoodManager();
                if (foodManager && foodManager.feedFish(this.targetFood, this)) {
                    this.hunger = Math.max(0, this.hunger - 20);
                    this.lastFed = new Date();
                }
                this.state = 'wandering';
                this.targetFood = null;
            }
        } else if (this.state === 'wandering') {
            if (this.object.position.distanceTo(this.targetPosition) < 50) {
                this.targetPosition.set(
                    Math.random() * this.world.width - this.world.width / 2,
                    Math.random() * this.world.height - this.world.height / 2,
                    0
                );
            }
        }
    }

    seekNearestFood(foodItems) {
        let nearestFood = null;
        let nearestDistance = Infinity;

        foodItems.forEach(food => {
            if (!food.consumed) {
                const foodPosition = food.mesh.position;
                const distance = this.object.position.distanceTo(foodPosition);
                
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestFood = food;
                }
            }
        });

        if (nearestFood && nearestDistance < 400) {
            this.targetFood = nearestFood;
            this.state = 'seeking_food';
        }
    }

    updateHungerBar() {
        const hungerPercent = Math.max(0, 1 - this.hunger / this.hungerThreshold);
        const barWidth = this.width * 1.2 * this.scaleMultiplier;
        
        this.hungerBarFill.scale.x = hungerPercent;
        this.hungerBarFill.position.x = - (barWidth * (1 - hungerPercent)) / 2;

        if (hungerPercent > 0.6) {
            this.hungerBarFillMaterial.color.setHex(0x4CAF50); // Green
        } else if (hungerPercent > 0.3) {
            this.hungerBarFillMaterial.color.setHex(0xFFC107); // Yellow
        } else {
            this.hungerBarFillMaterial.color.setHex(0xF44336); // Red
        }
    }
}
