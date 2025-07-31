import { Fish } from './models/Fish.js';
import { Clownfish } from './models/Clownfish.js';
import { Angelfish } from './models/Angelfish.js';
import { Betta } from './models/Betta.js';
import { Goldfish } from './models/Goldfish.js';
import { Dragonfish } from './models/Dragonfish.js';

class FishManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.fish = [];
        this.fishTypes = new Map();
        this.fishClasses = {
            'clownfish': Clownfish,
            'angelfish': Angelfish,
            'betta': Betta,
            'goldfish': Goldfish,
            'dragonfish': Dragonfish
        };
    }

    loadFishTypes(fishTypeConfigs) {
        fishTypeConfigs.forEach(config => {
            this.fishTypes.set(config.name.toLowerCase(), config);
        });
    }

    addFish(fishData) {
        const fishType = this.fishTypes.get(fishData.type.toLowerCase());
        if (!fishType) return null;

        const FishClass = this.fishClasses[fishData.type.toLowerCase()];
        if (FishClass) {
            const fish = new FishClass(fishData, fishType, this.world);
            this.fish.push(fish);
            this.scene.add(fish.object);
            return fish;
        }
        return null;
    }

    spawnRandomFish() {
        const availableTypes = Array.from(this.fishTypes.values());
        if (availableTypes.length === 0) return;
        const fishType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        const newFishData = {
            id: Date.now(),
            type: fishType.name,
            x: Math.random() * this.world.width,
            y: Math.random() * this.world.height,
        };
        this.addFish(newFishData);
    }

    updateAll(deltaTime, foodItems) {
        this.fish.forEach(fish => fish.update(deltaTime, foodItems));
    }

    getFishNeedingUpdate() { return []; }
    getAllServerData() { return []; }
    getCount() { return this.fish.length; }
}

let fishManager = null;
export function initializeFishManager(scene, world, fishTypeConfigs = []) {
    if (!fishManager) {
        fishManager = new FishManager(scene, world);
        fishManager.loadFishTypes(fishTypeConfigs);
    }
    return fishManager;
}
export function getFishManager() { return fishManager; }
