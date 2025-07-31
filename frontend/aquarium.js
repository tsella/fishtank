import { initializeFishManager, getFishManager } from './fish.js';
import { Castle } from './models/Castle.js';
import { Submarine } from './models/Submarine.js';
import { Bubbles } from './models/Bubbles.js';
import { Seaweed } from './models/Seaweed.js';
import { Sunrays } from './models/Sunrays.js';

class AquariumSystem {
    constructor() {
        this.psid = null;
        this.serverUrl = window.location.origin;
        this.scene = new THREE.Scene();
        this.world = { width: 1920, height: 1080 };
        this.camera = new THREE.PerspectiveCamera(75, this.world.width / this.world.height, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true });
        this.decorations = {};
        this.effects = {};
        this.setupPSID();
        this.lastFrameTime = Date.now();
        this.frameCount = 0;
        this.fps = 0;
    }

    async initialize() {
        this.setupRenderer();
        this.setupLighting();
        this.handleResize(); // Initial resize

        this.audioManager = await initializeAudio();
        this.foodManager = initializeFoodManager(this.scene, this.world);
        this.controlsManager = initializeControls();
        
        await this.loadGameConfig();
        this.fishManager = initializeFishManager(this.scene, this.world, this.fishTypes);
        
        this.setupEnvironment();
        await this.loadAquariumState();
        
        this.setupControlCallbacks();
        this.animate();

        window.addEventListener('resize', () => this.handleResize());

        hideLoadingScreen();
    }

    setupRenderer() {
        document.getElementById('game-container').appendChild(this.renderer.domElement);
        this.camera.position.z = 700;
    }

    handleResize() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.aspect = aspect;

        const fov = 75;
        const planeZ = 1;
        const planeHeight = 2 * Math.tan((fov * Math.PI / 180) / 2) * (this.camera.position.z - planeZ);
        const planeWidth = planeHeight * aspect;

        const scaleX = planeWidth / this.world.width;
        const scaleY = planeHeight / this.world.height;
        
        const scale = Math.min(scaleX, scaleY);
        this.scene.scale.set(scale, scale, 1);

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);
    }

    setupEnvironment() {
        this.decorations.castle = new Castle();
        this.decorations.submarine = new Submarine();
        this.effects.bubbles = new Bubbles(this.scene, this.world);
        this.effects.seaweed = new Seaweed(this.scene, this.world);
        this.effects.sunRays = new Sunrays(this.scene, this.world);
    }

    async loadGameConfig() {
        const response = await fetch(`${this.serverUrl}/aquarium/config`);
        const configData = await response.json();
        this.fishTypes = configData.data.fishTypes;
    }

    async loadAquariumState() {
        const response = await fetch(`${this.serverUrl}/aquarium/state?psid=${this.psid}`);
        const stateData = await response.json();
        this.aquariumState = stateData.data;

        this.aquariumState.fish.forEach(fishData => this.fishManager.addFish(fishData));
        this.updateDecorations();
        this.updateUI();
    }

    updateDecorations() {
        if (this.aquariumState.castle_unlocked) this.scene.add(this.decorations.castle.object);
        else this.scene.remove(this.decorations.castle.object);

        if (this.aquariumState.submarine_unlocked) this.scene.add(this.decorations.submarine.object);
        else this.scene.remove(this.decorations.submarine.object);
    }

    setupControlCallbacks() {
        this.controlsManager.on('spawnFish', () => this.fishManager.spawnRandomFish());
        this.controlsManager.on('debugToggle', (visible) => {
            if (visible) {
                this.updateDebugPanel();
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        const now = Date.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        this.fishManager.updateAll(deltaTime, this.foodManager.getActiveFoodItems());
        this.foodManager.update(deltaTime, this.fishManager.getCount());
        this.effects.bubbles.update(deltaTime);
        this.effects.seaweed.update(deltaTime);
        this.effects.sunRays.update(deltaTime);

        this.updateUI();
        this.updateDebugPanel();

        this.renderer.render(this.scene, this.camera);
    }

    updateUI() {
        const foodLevel = this.foodManager.getFoodLevel();
        document.getElementById('food-level').style.width = `${foodLevel}%`;
        document.getElementById('food-text').textContent = `${Math.round(foodLevel)}%`;
        document.getElementById('fish-count').textContent = this.fishManager.getCount();
        
        const hours = Math.floor(this.tankLifeSeconds / 3600);
        const minutes = Math.floor((this.tankLifeSeconds % 3600) / 60);
        document.getElementById('tank-time').textContent = `${hours}h ${minutes}m`;
    }

    updateDebugPanel() {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel.style.display === 'none') return;

        this.frameCount++;
        if(this.frameCount % 10 === 0) {
            this.fps = 1 / ((Date.now() - this.lastFrameTime) / 1000 * 0.1);
        }

        const content = `
            <div><strong>FPS:</strong> ${Math.round(this.fps)}</div>
            <div><strong>Fish:</strong> ${this.fishManager.getCount()}</div>
            <div><strong>Food Level:</strong> ${Math.round(this.foodManager.getFoodLevel())}%</div>
            <div><strong>Tank Life:</strong> ${Math.floor(this.tankLifeSeconds / 3600)}h ${Math.floor((this.tankLifeSeconds % 3600) / 60)}m</div>
        `;
        document.getElementById('debug-content').innerHTML = content;
    }

    setupPSID() {
        const urlParams = new URLSearchParams(window.location.search);
        this.psid = urlParams.get('psid') || `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

let aquariumSystem = null;
document.addEventListener('DOMContentLoaded', () => {
    aquariumSystem = new AquariumSystem();
    window.getAquariumSystem = () => aquariumSystem;
    aquariumSystem.initialize();
});
