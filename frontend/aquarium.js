/**
 * Main Aquarium System for Aquae
 * Orchestrates all systems and handles p5.js rendering with WebGL
 * Compatible with Chromium M69
 */

class AquariumSystem {
    constructor() {
        this.initialized = false;
        this.psid = null;
        this.serverUrl = window.location.origin;
        
        // System managers
        this.audioManager = null;
        this.foodManager = null;
        this.fishManager = null;
        this.controlsManager = null;
        
        // Game state
        this.aquariumState = null;
        this.tankLifeSeconds = 0;
        this.lastSaveTime = 0;
        this.saveInterval = 5000; // 5 seconds
        
        // Rendering state
        this.canvas = null;
        this.currentTimeOfDay = 'day';
        
        // Environment effects
        this.bubbles = [];
        this.seaweed = [];
        this.decorations = {
            castle: { enabled: false, x: 300, y: 800 },
            submarine: { enabled: false, x: 1500, y: 750 }
        };
        
        // Performance tracking
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 60;
        
        // Debug features
        this.debugTimeOverride = null; // null = normal time, 'day' or 'night' = forced
        
        // Network state
        this.isOnline = true;
        this.lastServerSync = 0;
        this.syncAttempts = 0;
        this.maxSyncAttempts = 3;
        
        this.setupPSID();
    }

    /**
     * Setup player session ID
     */
    setupPSID() {
        // Try to get PSID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.psid = urlParams.get('psid');
        
        // Generate PSID if not provided
        if (!this.psid) {
            this.psid = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Update URL without reloading
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('psid', this.psid);
            window.history.replaceState({}, '', newUrl);
        }
        
        console.log('Player Session ID:', this.psid);
    }

    /**
     * Initialize all systems
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            updateLoadingProgress(10, 'Loading audio system...');
            this.audioManager = await initializeAudio();
            
            updateLoadingProgress(25, 'Loading food system...');
            this.foodManager = initializeFoodManager();
            
            updateLoadingProgress(40, 'Loading controls...');
            this.controlsManager = initializeControls();
            this.setupControlCallbacks();
            
            updateLoadingProgress(55, 'Connecting to server...');
            await this.loadGameConfig();
            
            updateLoadingProgress(70, 'Loading aquarium state...');
            await this.loadAquariumState();
            
            updateLoadingProgress(85, 'Setting up graphics...');
            await this.setupGraphics();
            
            updateLoadingProgress(95, 'Starting game systems...');
            this.setupGameLoop();
            
            updateLoadingProgress(100, 'Ready!');
            
            // Hide loading screen after short delay
            setTimeout(() => {
                hideLoadingScreen();
                this.startGame();
            }, 500);
            
            this.initialized = true;
            return true;
            
        } catch (error) {
            console.error('Aquarium initialization failed:', error);
            showError('Failed to initialize aquarium: ' + error.message);
            return false;
        }
    }

    /**
     * Load game configuration from server
     */
    async loadGameConfig() {
        try {
            const response = await fetch(`${this.serverUrl}/aquarium/config`);
            
            if (!response.ok) {
                throw new Error(`Config request failed: ${response.status}`);
            }
            
            const configData = await response.json();
            
            if (!configData.success) {
                throw new Error('Server returned error: ' + configData.error);
            }
            
            // Initialize fish manager with fish types
            this.fishManager = initializeFishManager(configData.data.fishTypes);
            
            // Update game constants
            if (configData.data.gameConstants) {
                this.updateGameConstants(configData.data.gameConstants);
            }
            
            console.log('Game configuration loaded');
            
        } catch (error) {
            console.warn('Failed to load server config, using defaults:', error);
            
            // Initialize with default fish types
            this.fishManager = initializeFishManager([
                {
                    name: 'Clownfish',
                    feedIntervalMin: 5,
                    hungerThreshold: 60,
                    rarity: 'common',
                    cycle: 'diurnal',
                    size: { width: 30, height: 20 }
                }
            ]);
        }
    }

    /**
     * Load aquarium state from server
     */
    async loadAquariumState() {
        try {
            const response = await fetch(`${this.serverUrl}/aquarium/state?psid=${this.psid}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    // Create new aquarium
                    await this.createNewAquarium();
                    return;
                }
                throw new Error(`State request failed: ${response.status}`);
            }
            
            const stateData = await response.json();
            
            if (!stateData.success) {
                throw new Error('Server returned error: ' + stateData.error);
            }
            
            this.aquariumState = stateData.data;
            this.tankLifeSeconds = this.aquariumState.tank_life_sec || 0;
            
            // Load fish into fish manager
            if (this.aquariumState.fish) {
                this.aquariumState.fish.forEach(fishData => {
                    this.fishManager.addFish(fishData);
                });
            }
            
            // Update decorations
            this.decorations.castle.enabled = this.aquariumState.castle_unlocked || false;
            this.decorations.submarine.enabled = this.aquariumState.submarine_unlocked || false;
            
            // Update controls
            this.controlsManager.updateFromServerState(this.aquariumState);
            
            this.lastServerSync = Date.now();
            this.isOnline = true;
            
            console.log('Aquarium state loaded:', this.aquariumState);
            
        } catch (error) {
            console.warn('Failed to load aquarium state:', error);
            this.isOnline = false;
            
            // Create minimal state for offline mode
            this.aquariumState = {
                id: 0,
                psid: this.psid,
                tank_life_sec: 0,
                num_fish: 0,
                total_feedings: 0,
                castle_unlocked: false,
                submarine_unlocked: false,
                music_enabled: true,
                fish: []
            };
        }
    }

    /**
     * Create new aquarium on server
     */
    async createNewAquarium() {
        try {
            const response = await fetch(`${this.serverUrl}/aquarium/state?psid=${this.psid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tank_life_sec: 0,
                    fish: []
                })
            });
            
            if (!response.ok) {
                throw new Error(`Create aquarium failed: ${response.status}`);
            }
            
            const stateData = await response.json();
            
            if (!stateData.success) {
                throw new Error('Server returned error: ' + stateData.error);
            }
            
            this.aquariumState = stateData.data;
            console.log('New aquarium created');
            
        } catch (error) {
            console.warn('Failed to create new aquarium:', error);
            throw error;
        }
    }

    /**
     * Setup graphics and p5.js
     */
    async setupGraphics() {
        return new Promise((resolve) => {
            // p5.js sketch
            const sketch = (p5) => {
                p5.setup = () => {
                    // Create canvas with WEBGL renderer
                    this.canvas = p5.createCanvas(1920, 1080, p5.WEBGL);
                    this.canvas.parent('game-container');
                    
                    // Initialize environment effects
                    this.initializeEnvironment(p5);
                    
                    console.log('Graphics initialized in WEBGL mode');
                    resolve();
                };
                
                p5.draw = () => {
                    this.renderFrame(p5);
                };

                p5.windowResized = () => {
                    p5.resizeCanvas(p5.windowWidth, p5.windowHeight);
                }
                
                // Store p5 instance
                this.p5 = p5;
            };
            
            // Create p5 instance
            new p5(sketch);
        });
    }

    /**
     * Initialize environment effects
     * @param {Object} p5 - p5.js instance
     */
    initializeEnvironment(p5) {
        // Create bubbles
        for (let i = 0; i < 15; i++) {
            this.bubbles.push({
                x: Math.random() * 1920,
                y: Math.random() * 1080 + 1080, // Start below screen
                size: 3 + Math.random() * 8,
                speed: 20 + Math.random() * 30,
                opacity: 100 + Math.random() * 155
            });
        }
        
        // Create seaweed
        for (let i = 0; i < 8; i++) {
            this.seaweed.push({
                x: 100 + i * 200 + Math.random() * 100,
                height: 100 + Math.random() * 150,
                segments: 8 + Math.floor(Math.random() * 6),
                swayOffset: Math.random() * 1000,
                color: p5.color(34 + Math.random() * 30, 139 + Math.random() * 40, 34 + Math.random() * 30)
            });
        }
    }

    /**
     * Setup control event callbacks
     */
    setupControlCallbacks() {
        this.controlsManager.on('feed', (foodItem) => {
            this.markForSave();
        });
        
        this.controlsManager.on('castleToggle', (enabled) => {
            this.decorations.castle.enabled = enabled;
            this.markForSave();
        });
        
        this.controlsManager.on('submarineToggle', (enabled) => {
            this.decorations.submarine.enabled = enabled;
            this.markForSave();
        });
        
        this.controlsManager.on('musicToggle', (enabled) => {
            this.updateTimeOfDay();
        });
        
        this.controlsManager.on('debugToggle', (visible) => {
            if (visible) {
                this.updateDebugPanel();
            }
        });

        this.controlsManager.on('spawnFish', () => {
            if (this.fishManager) {
                this.fishManager.spawnRandomFish();
            }
        });
    }

    /**
     * Setup game loop
     */
    setupGameLoop() {
        // Auto-save interval
        setInterval(() => {
            if (this.shouldSaveToServer()) {
                this.saveToServer();
            }
        }, this.saveInterval);
        
        // Time tracking
        setInterval(() => {
            this.tankLifeSeconds++;
            this.updateTimeOfDay();
            this.updateUI();
        }, 1000);
        
        this.lastFrameTime = Date.now();
    }

    /**
     * Start the game
     */
    startGame() {
        console.log('Aquarium started!');
        this.updateTimeOfDay();
        this.updateUI();
        this.gameStarted = true;
    }

    /**
     * Main render loop
     * @param {Object} p5 - p5.js instance
     */
    renderFrame(p5) {
        if (!this.initialized) return;

        const now = Date.now();
        const deltaTime = now - this.lastFrameTime;
        this.lastFrameTime = now;

        // Update systems
        this.update(deltaTime);

        // --- 3D Scene Rendering ---
        p5.clear();
        
        p5.ambientLight(150);
        p5.pointLight(255, 255, 255, p5.width/2, p5.height/2, 600);
        
        // Translate to use top-left coordinates for drawing 3D objects
        p5.translate(-p5.width / 2, -p5.height / 2, 0);

        this.renderWaterEffects(p5);
        this.renderSeaweed(p5);
        this.renderDecorations(p5);

        if (this.fishManager) {
            this.fishManager.renderAll(p5);
        }
        if (this.foodManager) {
            this.foodManager.render(p5);
        }

        this.renderBubbles(p5);
        
        this.updatePerformance();
    }

    /**
     * Update all systems
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    update(deltaTime) {
        if (this.foodManager) {
            const fishCount = this.fishManager ? this.fishManager.getCount() : 0;
            this.foodManager.update(deltaTime, fishCount);
        }
        
        if (this.fishManager && this.foodManager) {
            const foodItems = this.foodManager.getActiveFoodItems();
            this.fishManager.updateAll(deltaTime, foodItems);
            
            const fishNeedingUpdate = this.fishManager.getFishNeedingUpdate();
            if (fishNeedingUpdate.length > 0) {
                this.markForSave();
            }
        }
        
        if (this.controlsManager) {
            this.controlsManager.update(deltaTime);
        }
        
        this.updateBubbles(deltaTime);
        
        if (this.frameCount % 30 === 0) {
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel && debugPanel.style.display === 'block') {
                this.updateDebugPanel();
            }
        }
    }
    
    /**
     * Render seaweed
     * @param {Object} p5 - p5.js instance
     */
    renderSeaweed(p5) {
        this.seaweed.forEach(weed => {
            p5.push();
            p5.translate(weed.x, 1050, -200);
            
            const swayAmount = Math.sin((Date.now() + weed.swayOffset) * 0.001) * 15;
            
            p5.fill(weed.color);
            p5.noStroke();
            
            for (let i = 0; i < weed.segments; i++) {
                p5.push();
                const segmentHeight = weed.height / weed.segments;
                const y = -i * segmentHeight;
                const sway = swayAmount * (i / weed.segments);
                
                p5.translate(sway, y, 0);
                p5.box(8 - i * 0.5, segmentHeight + 5, 4);
                p5.pop();
            }
            
            p5.pop();
        });
    }

    /**
     * Render decorations (castle, submarine)
     * @param {Object} p5 - p5.js instance
     */
    renderDecorations(p5) {
        if (this.decorations.castle.enabled) {
            this.renderCastle(p5, this.decorations.castle.x, this.decorations.castle.y);
        }
        if (this.decorations.submarine.enabled) {
            this.renderSubmarine(p5, this.decorations.submarine.x, this.decorations.submarine.y);
        }
    }

    /**
     * Render castle decoration
     * @param {Object} p5 - p5.js instance
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderCastle(p5, x, y) {
        p5.push();
        p5.translate(x, y, -300);
        p5.fill(139, 139, 139);
        p5.stroke(105, 105, 105);
        
        // Base
        p5.push();
        p5.translate(0, -30, 0);
        p5.box(100, 60, 50);
        p5.pop();
        
        // Towers
        p5.push();
        p5.translate(-30, -80, 0);
        p5.cylinder(15, 80);
        p5.pop();
        p5.push();
        p5.translate(30, -80, 0);
        p5.cylinder(15, 80);
        p5.pop();
        
        p5.pop();
    }

    /**
     * Render submarine decoration
     * @param {Object} p5 - p5.js instance
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderSubmarine(p5, x, y) {
        p5.push();
        p5.translate(x, y, -100);
        p5.rotateY(p5.PI / 8);
        p5.fill(70, 70, 70);
        p5.stroke(50, 50, 50);

        // Body
        p5.ellipsoid(60, 20, 25);

        // Tower
        p5.push();
        p5.translate(0, -25, 0);
        p5.box(40, 30, 20);
        p5.pop();

        p5.pop();
    }

    /**
     * Update and render bubbles
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    updateBubbles(deltaTime) {
        const dtSeconds = deltaTime / 1000;
        
        this.bubbles.forEach(bubble => {
            bubble.y -= bubble.speed * dtSeconds;
            bubble.x += Math.sin(Date.now() * 0.001 + bubble.y * 0.01) * 0.5;
            if (bubble.y < 100) {
                bubble.y = 1100 + Math.random() * 200;
                bubble.x = Math.random() * 1920;
            }
        });
    }

    /**
     * Render bubbles
     * @param {Object} p5 - p5.js instance
     */
    renderBubbles(p5) {
        p5.noStroke();
        p5.ambientMaterial(255); // Shiny material
        this.bubbles.forEach(bubble => {
            if (bubble.y < 1080 && bubble.y > 150) {
                p5.push();
                p5.translate(bubble.x, bubble.y, Math.sin(bubble.y * 0.1) * 50);
                p5.sphere(bubble.size);
                p5.pop();
            }
        });
    }

    /**
     * Render water effects
     * @param {Object} p5 - p5.js instance
     */
    renderWaterEffects(p5) {
        let isDayTime = this.debugTimeOverride ? this.debugTimeOverride === 'day' : (new Date().getHours() >= 6 && new Date().getHours() < 20);
        
        if (isDayTime) {
            p5.push();
            p5.noFill();
            p5.stroke(255, 255, 255, 15);
            for (let i = 0; i < 5; i++) {
                p5.push();
                const x = 200 + i * 350;
                const waveOffset = Math.sin((Date.now() + i * 1000) * 0.002) * 50;
                p5.translate(x + waveOffset, p5.height / 2, -200);
                p5.rotateZ(p5.PI / 16); // Slight angle
                p5.plane(20, p5.height * 1.5);
                p5.pop();
            }
            p5.pop();
        }
    }

    /**
     * Update time of day and related systems
     */
    updateTimeOfDay() {
        let newTimeOfDay;
        
        if (this.debugTimeOverride) {
            newTimeOfDay = this.debugTimeOverride;
        } else {
            const hour = new Date().getHours();
            newTimeOfDay = (hour >= 6 && hour < 20) ? 'day' : 'night';
        }
        
        if (newTimeOfDay !== this.currentTimeOfDay) {
            this.currentTimeOfDay = newTimeOfDay;
            if (this.audioManager) {
                this.audioManager.updateTimeOfDay(newTimeOfDay);
            }
            
            const gameContainer = document.getElementById('game-container');
            if(gameContainer) {
                if(newTimeOfDay === 'night') {
                    gameContainer.classList.add('night');
                } else {
                    gameContainer.classList.remove('night');
                }
            }
            
            console.log(`Time of day changed to: ${newTimeOfDay}${this.debugTimeOverride ? ' (DEBUG)' : ''}`);
        }
    }

    /**
     * Toggle debug day/night mode (development only)
     */
    toggleDebugTimeOfDay() {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            return;
        }
        
        if (this.debugTimeOverride === null) {
            this.debugTimeOverride = 'night';
        } else if (this.debugTimeOverride === 'night') {
            this.debugTimeOverride = 'day';
        } else {
            this.debugTimeOverride = null;
        }
        
        console.log(`Debug time override: ${this.debugTimeOverride || 'disabled (using real time)'}`);
        this.updateTimeOfDay();
    }

    /**
     * Update UI elements
     */
    updateUI() {
        if (this.foodManager) {
            const foodLevel = this.foodManager.getFoodLevel();
            const foodLevelElement = document.getElementById('food-level');
            const foodTextElement = document.getElementById('food-text');
            if (foodLevelElement) foodLevelElement.style.width = foodLevel + '%';
            if (foodTextElement) foodTextElement.textContent = Math.round(foodLevel) + '%';
        }
        
        const tankTimeElement = document.getElementById('tank-time');
        if (tankTimeElement) {
            const hours = Math.floor(this.tankLifeSeconds / 3600);
            const minutes = Math.floor((this.tankLifeSeconds % 3600) / 60);
            tankTimeElement.textContent = `${hours}h ${minutes}m`;
        }
        
        const fishCountElement = document.getElementById('fish-count');
        if (fishCountElement && this.fishManager) {
            fishCountElement.textContent = this.fishManager.getCount().toString();
        }
        
        const feedingCountElement = document.getElementById('feeding-count');
        if (feedingCountElement && this.aquariumState) {
            feedingCountElement.textContent = (this.aquariumState.total_feedings || 0).toString();
        }
    }

    /**
     * Update debug panel
     */
    updateDebugPanel() {
        const debugContent = document.getElementById('debug-content');
        if (!debugContent) return;
        
        const debugInfo = {
            fps: Math.round(this.fps),
            tankLife: `${Math.floor(this.tankLifeSeconds / 3600)}h ${Math.floor((this.tankLifeSeconds % 3600) / 60)}m`,
            fishCount: this.fishManager ? this.fishManager.getCount() : 0,
            foodLevel: this.foodManager ? Math.round(this.foodManager.getFoodLevel()) : 0,
            activeFoodItems: this.foodManager ? this.foodManager.getActiveFoodItems().length : 0,
            totalFeedings: this.aquariumState ? (this.aquariumState.total_feedings || 0) : 0,
            timeOfDay: this.currentTimeOfDay + (this.debugTimeOverride ? ' (DEBUG)' : ''),
            isOnline: this.isOnline,
            lastSync: this.lastServerSync ? new Date(this.lastServerSync).toLocaleTimeString() : 'Never'
        };
        
        if (this.fishManager) {
            const fishStats = this.fishManager.getStats();
            Object.assign(debugInfo, {
                healthyFish: fishStats.healthy,
                hungryFish: fishStats.hungry,
                criticalFish: fishStats.critical,
                activeFish: fishStats.activeFish
            });
        }
        
        debugContent.innerHTML = Object.entries(debugInfo)
            .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
            .join('');
    }

    /**
     * Update performance metrics
     */
    updatePerformance() {
        this.frameCount++;
        if (this.frameCount % 60 === 0) {
            const now = Date.now();
            this.fps = 60000 / (now - this.lastFpsTime || now);
            this.lastFpsTime = now;
        }
    }

    /**
     * Mark aquarium for server save
     */
    markForSave() {
        this.needsSave = true;
    }

    /**
     * Check if aquarium should be saved to server
     * @returns {boolean} Whether save is needed
     */
    shouldSaveToServer() {
        const now = Date.now();
        const timeSinceLastSave = now - this.lastSaveTime;
        return this.needsSave && timeSinceLastSave >= this.saveInterval && this.isOnline;
    }

    /**
     * Save aquarium state to server
     */
    async saveToServer() {
        if (!this.isOnline || this.syncAttempts >= this.maxSyncAttempts) {
            return;
        }
        
        try {
            const saveData = {
                tank_life_sec: this.tankLifeSeconds,
                fish: this.fishManager ? this.fishManager.getAllServerData() : [],
                unlockables: {
                    castle: this.decorations.castle.enabled,
                    submarine: this.decorations.submarine.enabled,
                    music: this.audioManager ? this.audioManager.getState().musicEnabled : true
                }
            };
            
            const response = await fetch(`${this.serverUrl}/aquarium/state?psid=${this.psid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData)
            });
            
            if (!response.ok) throw new Error(`Save failed: ${response.status}`);
            
            const result = await response.json();
            if (!result.success) throw new Error('Server returned error: ' + result.error);
            
            const oldFeedingCount = this.aquariumState.total_feedings || 0;
            this.aquariumState = result.data;
            
            if (this.aquariumState.total_feedings !== oldFeedingCount) {
                this.updateUI();
            }
            
            if (result.data.fish && this.fishManager) {
                result.data.fish.forEach(serverFish => {
                    const localFish = this.fishManager.getFish(serverFish.id);
                    if (!localFish) {
                        const matchingFish = this.fishManager.fish.find(f => 
                            Math.abs(f.x - serverFish.x) < 50 && 
                            Math.abs(f.y - serverFish.y) < 50 &&
                            f.type === serverFish.type
                        );
                        if (matchingFish && matchingFish.id !== serverFish.id) {
                            matchingFish.id = serverFish.id;
                        }
                    }
                });
            }
            
            this.lastSaveTime = Date.now();
            this.lastServerSync = Date.now();
            this.needsSave = false;
            this.syncAttempts = 0;
            this.isOnline = true;
            console.log('Aquarium state saved successfully');
            
        } catch (error) {
            console.warn('Failed to save aquarium state:', error);
            this.syncAttempts++;
            if (this.syncAttempts >= this.maxSyncAttempts) {
                this.isOnline = false;
                console.warn('Max sync attempts reached, going offline');
            }
        }
    }

    /**
     * Get current aquarium statistics
     * @returns {Object} Aquarium statistics
     */
    getStats() {
        return {
            tankLifeSeconds: this.tankLifeSeconds,
            fishCount: this.fishManager ? this.fishManager.getCount() : 0,
            foodLevel: this.foodManager ? this.foodManager.getFoodLevel() : 0,
            activeFoodItems: this.foodManager ? this.foodManager.getActiveFoodItems().length : 0,
            isOnline: this.isOnline,
            fps: this.fps,
            decorations: this.decorations
        };
    }

    /**
     * Update game constants from server config
     * @param {Object} constants - Game constants
     */
    updateGameConstants(constants) {
        if (constants.foodTTL && this.foodManager) {
            this.foodManager.updateSettings({ foodTTL: constants.foodTTL });
        }
        if (constants.saveInterval) this.saveInterval = constants.saveInterval;
        if (constants.hungerMultiplier && this.fishManager) {
            this.fishManager.setHungerMultiplier(constants.hungerMultiplier);
        }
        if (constants.fishScaleMultiplier && this.fishManager) {
            this.fishManager.setFishScaleMultiplier(constants.fishScaleMultiplier);
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        if (this.p5 && this.canvas) {
            this.p5.resizeCanvas(window.innerWidth, window.innerHeight);
        }
    }

    /**
     * Respawn a fish when tank is empty
     */
    async respawnFish() {
        try {
            console.log('No fish detected - respawning starter fish');
            const fishTypes = this.fishManager.fishTypes;
            if (fishTypes.size === 0) {
                console.warn('No fish types available for respawning');
                return;
            }
            
            const availableTypes = Array.from(fishTypes.values());
            const commonFish = availableTypes.filter(fish => fish.rarity === 'common');
            const starterFishType = commonFish.length > 0 ? commonFish[0] : availableTypes[0];
            
            const newFishData = {
                id: Date.now(),
                type: starterFishType.name,
                hunger: 0,
                x: 400 + Math.random() * 1120,
                y: 400 + Math.random() * 400,
                last_fed: new Date().toISOString(),
                spawn_count: 0
            };
            
            const fish = this.fishManager.addFish(newFishData);
            if (fish) {
                console.log(`Respawned ${starterFishType.name} fish`);
                this.tankLifeSeconds = 0;
                this.markForSave();
                this.updateUI();
            }
        } catch (error) {
            console.error('Failed to respawn fish:', error);
        }
    }

    /**
     * Cleanup and destroy aquarium
     */
    destroy() {
        if (this.isOnline) this.saveToServer();
        if (this.audioManager) this.audioManager.destroy();
        if (this.controlsManager) this.controlsManager.destroy();
        if (this.p5) this.p5.remove();
        console.log('Aquarium destroyed');
    }
}

// Global aquarium instance
let aquariumSystem = null;

/**
 * Initialize the aquarium system
 * @returns {Promise<boolean>} Success status
 */
async function initializeAquarium() {
    if (aquariumSystem) {
        return true;
    }
    
    aquariumSystem = new AquariumSystem();
    return await aquariumSystem.initialize();
}

/**
 * Get the global aquarium system
 * @returns {AquariumSystem|null} Aquarium system instance
 */
function getAquariumSystem() {
    return aquariumSystem;
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (aquariumSystem) {
        aquariumSystem.destroy();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (aquariumSystem) {
        aquariumSystem.handleResize();
    }
});

// Export for module systems and global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AquariumSystem, initializeAquarium, getAquariumSystem };
} else {
    window.AquariumSystem = AquariumSystem;
    window.initializeAquarium = initializeAquarium;
    window.getAquariumSystem = getAquariumSystem;
}
