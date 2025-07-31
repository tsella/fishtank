class FoodManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.foodLevel = 50;
        this.maxFood = 100;
        this.refillRate = 0.1;
        this.fishRefillBonus = 0.05;
        this.activeFoodItems = [];
        this.foodTTL = 30000;
        this.feedCooldown = 500;
        this.lastFeedTime = 0;
    }

    update(deltaTime, fishCount = 0) {
        const dtSeconds = deltaTime;
        if (this.foodLevel < this.maxFood) {
            this.foodLevel += (this.refillRate + (fishCount * this.fishRefillBonus)) * dtSeconds;
            this.foodLevel = Math.min(this.maxFood, this.foodLevel);
        }

        this.activeFoodItems.forEach(food => {
            food.mesh.position.y -= 60 * dtSeconds;
            if (Date.now() - food.createdAt > this.foodTTL || food.mesh.position.y < -this.world.height / 2) {
                this.scene.remove(food.mesh);
                food.consumed = true;
            }
        });

        this.activeFoodItems = this.activeFoodItems.filter(f => !f.consumed);
    }

    dispenseFoodRandom() {
        if (Date.now() - this.lastFeedTime < this.feedCooldown || this.foodLevel < 10) {
            return null;
        }

        this.foodLevel -= 10;
        this.lastFeedTime = Date.now();

        const geo = new THREE.SphereGeometry(5, 8, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            Math.random() * this.world.width - this.world.width / 2, 
            this.world.height / 2, 
            0
        );

        const foodItem = { mesh, createdAt: Date.now(), consumed: false };
        this.activeFoodItems.push(foodItem);
        this.scene.add(mesh);

        return foodItem;
    }

    feedFish(food, fish) {
        if (food.consumed) return false;
        food.consumed = true;
        this.scene.remove(food.mesh);
        return true;
    }

    getActiveFoodItems() { return this.activeFoodItems; }
    getFoodLevel() { return this.foodLevel; }
    canDispenseFood() { return Date.now() - this.lastFeedTime >= this.feedCooldown && this.foodLevel >= 10; }
}

let foodManager = null;
function initializeFoodManager(scene, world) {
    if (!foodManager) foodManager = new FoodManager(scene, world);
    return foodManager;
}
function getFoodManager() { return foodManager; }
