/**
 * Main Aquarium System for Aquae
 * Orchestrates all systems and handles p5.js rendering
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
        this.backgroundImage = null;
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
                p5.preload = () => {
                    // Load background image
                    try {
                        this.backgroundImage = p5.loadImage('/assets/images/bg.jpg', 
                            () => {
                                console.log('Background image loaded successfully');
                                // Force immediate use of the preloaded image
                                updateLoadingProgress(90, 'Background loaded...');
                            },
                            () => {
                                console.warn('Failed to load background image, using fallback');
                                this.backgroundImage = null;
                            }
                        );
                    } catch (error) {
                        console.warn('Background image load error:', error);
                        this.backgroundImage = null;
                    }
                };
                
                p5.setup = () => {
                    // Create canvas
                    this.canvas = p5.createCanvas(1920, 1080);
                    this.canvas.parent('game-container');
                    
                    // Initialize environment effects
                    this.initializeEnvironment(p5);
                    
                    console.log('Graphics initialized');
                    resolve();
                };
                
                p5.draw = () => {
                    this.renderFrame(p5);
                };
                
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
            // Food dispensed - mark for server save
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
            // Update time of day music
            this.updateTimeOfDay();
        });
        
        this.controlsManager.on('debugToggle', (visible) => {
            if (visible) {
                this.updateDebugPanel();
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
        
        // Start background music
        this.updateTimeOfDay();
        
        // Initial UI update
        this.updateUI();
        
        // Mark as started
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
        
        // Clear and setup
        p5.clear();
        this.renderBackground(p5);
        
        // Render environment
        this.renderSeaweed(p5);
        this.renderDecorations(p5);
        
        // Render game objects
        if (this.fishManager) {
            this.fishManager.renderAll(p5);
        }
        
        if (this.foodManager) {
            this.foodManager.render(p5);
        }
        
        this.renderBubbles(p5);
        
        // Render effects
        this.renderWaterEffects(p5);
        
        // Update performance
        this.updatePerformance();
    }

    /**
     * Update all systems
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    update(deltaTime) {
        // Update food system
        if (this.foodManager) {
            const fishCount = this.fishManager ? this.fishManager.getCount() : 0;
            this.foodManager.update(deltaTime, fishCount);
        }
        
        // Update fish system
        if (this.fishManager && this.foodManager) {
            const foodItems = this.foodManager.getActiveFoodItems();
            this.fishManager.updateAll(deltaTime, foodItems);
            
            // Check if we need to respawn fish (no fish alive)
            if (this.fishManager.getCount() === 0) {
                this.respawnFish();
            }
        }
        
        // Update controls
        if (this.controlsManager) {
            this.controlsManager.update(deltaTime);
        }
        
        // Update environment effects
        this.updateBubbles(deltaTime);
    }

    /**
     * Render background
     * @param {Object} p5 - p5.js instance
     */
    renderBackground(p5) {
        // If we have a background image, use it
        if (this.backgroundImage && this.backgroundImage.width > 0) {
            p5.push();
            // Scale and position the background image to cover the canvas
            const scaleX = 1920 / this.backgroundImage.width;
            const scaleY = 1080 / this.backgroundImage.height;
            const scale = Math.max(scaleX, scaleY); // Cover the entire canvas
            
            p5.scale(scale);
            p5.image(this.backgroundImage, 0, 0);
            p5.pop();
        } else {
            // Fallback: Draw gradient background
            this.renderGradientBackground(p5);
        }
        
        // Always add water overlay and effects
        this.renderWaterOverlay(p5);
    }

    /**
     * Render gradient background as fallback
     * @param {Object} p5 - p5.js instance
     */
    renderGradientBackground(p5) {
        // Sky gradient
        const hour = new Date().getHours();
        let skyColor1, skyColor2;
        
        if (hour >= 6 && hour < 20) {
            // Day colors
            skyColor1 = p5.color(135, 206, 235); // Sky blue
            skyColor2 = p5.color(176, 224, 230); // Powder blue
        } else {
            // Night colors
            skyColor1 = p5.color(25, 25, 112); // Midnight blue
            skyColor2 = p5.color(72, 61, 139); // Dark slate blue
        }
        
        // Draw gradient
        for (let y = 0; y <= 300; y++) {
            const inter = p5.map(y, 0, 300, 0, 1);
            const c = p5.lerpColor(skyColor1, skyColor2, inter);
            p5.stroke(c);
            p5.line(0, y, 1920, y);
        }
    }

    /**
     * Render water overlay and effects
     * @param {Object} p5 - p5.js instance
     */
    renderWaterOverlay(p5) {
        // Water overlay
        const waterColor = p5.color(64, 164, 223, 150);
        p5.fill(waterColor);
        p5.noStroke();
        p5.rect(0, 150, 1920, 930);
        
        // Water surface shimmer
        p5.stroke(255, 255, 255, 100);
        p5.strokeWeight(2);
        for (let x = 0; x < 1920; x += 20) {
            const wave = Math.sin((x + Date.now() * 0.002) * 0.02) * 3;
            p5.point(x, 150 + wave);
        }
    }

    /**
     * Render seaweed
     * @param {Object} p5 - p5.js instance
     */
    renderSeaweed(p5) {
        this.seaweed.forEach(weed => {
            p5.push();
            p5.translate(weed.x, 1050);
            
            const swayAmount = Math.sin((Date.now() + weed.swayOffset) * 0.001) * 15;
            
            p5.fill(weed.color);
            p5.noStroke();
            
            for (let i = 0; i < weed.segments; i++) {
                const segmentHeight = weed.height / weed.segments;
                const y = -i * segmentHeight;
                const sway = swayAmount * (i / weed.segments);
                
                p5.ellipse(sway, y, 8 - i * 0.5, segmentHeight + 5);
            }
            
            p5.pop();
        });
    }

    /**
     * Render decorations (castle, submarine)
     * @param {Object} p5 - p5.js instance
     */
    renderDecorations(p5) {
        // Castle
        if (this.decorations.castle.enabled) {
            this.renderCastle(p5, this.decorations.castle.x, this.decorations.castle.y);
        }
        
        // Submarine
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
        p5.translate(x, y);
        
        // Castle base
        p5.fill(139, 139, 139); // Gray
        p5.stroke(105, 105, 105);
        p5.strokeWeight(2);
        p5.rect(-50, -60, 100, 60);
        
        // Castle towers
        p5.rect(-40, -100, 25, 40);
        p5.rect(15, -100, 25, 40);
        
        // Castle flags
        p5.fill(220, 20, 60); // Crimson
        p5.triangle(-40, -100, -25, -90, -40, -80);
        p5.triangle(15, -100, 30, -90, 15, -80);
        
        // Castle door
        p5.fill(101, 67, 33); // Brown
        p5.arc(0, 0, 30, 40, 0, p5.PI);
        
        // Castle windows
        p5.fill(135, 206, 235); // Sky blue
        p5.rect(-30, -80, 8, 8);
        p5.rect(22, -80, 8, 8);
        
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
        p5.translate(x, y);
        
        // Submarine body
        p5.fill(70, 70, 70); // Dark gray
        p5.stroke(50, 50, 50);
        p5.strokeWeight(2);
        p5.ellipse(0, 0, 120, 40);
        
        // Submarine conning tower
        p5.rect(-20, -30, 40, 30);
        
        // Periscope
        p5.strokeWeight(3);
        p5.line(-10, -30, -10, -45);
        p5.line(-10, -45, -5, -45);
        
        // Propeller
        p5.push();
        p5.translate(60, 0);
        p5.rotate(Date.now() * 0.01);
        p5.strokeWeight(1);
        p5.line(-8, 0, 8, 0);
        p5.line(0, -8, 0, 8);
        p5.pop();
        
        // Windows
        p5.fill(135, 206, 235); // Sky blue
        p5.noStroke();
        p5.ellipse(-30, -5, 12, 8);
        p5.ellipse(-10, -5, 12, 8);
        p5.ellipse(10, -5, 12, 8);
        
        // Bubbles from submarine
        for (let i = 0; i < 3; i++) {
            const bubbleY = -50 - (i * 15) - Math.sin(Date.now() * 0.005 + i) * 5;
            p5.fill(255, 255, 255, 150);
            p5.ellipse(-5, bubbleY, 4 + i, 4 + i);
        }
        
        p5.pop();
    }

    /**
     * Update and render bubbles
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    updateBubbles(deltaTime) {
        const dtSeconds = deltaTime / 1000;
        
        this.bubbles.forEach(bubble => {
            // Move bubble up
            bubble.y -= bubble.speed * dtSeconds;
            
            // Add slight horizontal drift
            bubble.x += Math.sin(Date.now() * 0.001 + bubble.y * 0.01) * 0.5;
            
            // Reset bubble when it reaches the top
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
        this.bubbles.forEach(bubble => {
            if (bubble.y < 1080 && bubble.y > 150) { // Only render in water
                p5.push();
                p5.fill(255, 255, 255, bubble.opacity);
                p5.noStroke();
                p5.ellipse(bubble.x, bubble.y, bubble.size, bubble.size);
                
                // Bubble highlight
                p5.fill(255, 255, 255, bubble.opacity * 1.5);
                p5.ellipse(bubble.x - bubble.size * 0.2, bubble.y - bubble.size * 0.2, 
                          bubble.size * 0.3, bubble.size * 0.3);
                p5.pop();
            }
        });
    }

    /**
     * Render water effects
     * @param {Object} p5 - p5.js instance
     */
    renderWaterEffects(p5) {
        // Light rays in water
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 20) {
            p5.push();
            p5.stroke(255, 255, 255, 30);
            p5.strokeWeight(10);
            
            for (let i = 0; i < 5; i++) {
                const x = 200 + i * 350;
                const waveOffset = Math.sin((Date.now() + i * 1000) * 0.002) * 20;
                p5.line(x + waveOffset, 150, x - waveOffset, 1080);
            }
            p5.pop();
        }
        
        // Water surface ripples
        p5.push();
        p5.stroke(255, 255, 255, 80);
        p5.strokeWeight(1);
        p5.noFill();
        
        const time = Date.now() * 0.001;
        for (let x = 0; x < 1920; x += 100) {
            const rippleY = 150 + Math.sin(time + x * 0.01) * 2;
            p5.ellipse(x, rippleY, 50, 10);
        }
        p5.pop();
    }

    /**
     * Update time of day and related systems
     */
    updateTimeOfDay() {
        const hour = new Date().getHours();
        const newTimeOfDay = (hour >= 6 && hour < 20) ? 'day' : 'night';
        
        if (newTimeOfDay !== this.currentTimeOfDay) {
            this.currentTimeOfDay = newTimeOfDay;
            
            // Update audio
            if (this.audioManager) {
                this.audioManager.updateTimeOfDay(newTimeOfDay);
            }
            
            console.log(`Time of day changed to: ${newTimeOfDay}`);
        }
    }

    /**
     * Update UI elements
     */
    updateUI() {
        // Food level
        if (this.foodManager) {
            const foodLevel = this.foodManager.getFoodLevel();
            const foodLevelElement = document.getElementById('food-level');
            const foodTextElement = document.getElementById('food-text');
            
            if (foodLevelElement) {
                foodLevelElement.style.width = foodLevel + '%';
            }
            
            if (foodTextElement) {
                foodTextElement.textContent = Math.round(foodLevel) + '%';
            }
        }
        
        // Tank time
        const tankTimeElement = document.getElementById('tank-time');
        if (tankTimeElement) {
            const hours = Math.floor(this.tankLifeSeconds / 3600);
            const minutes = Math.floor((this.tankLifeSeconds % 3600) / 60);
            tankTimeElement.textContent = `${hours}h ${minutes}m`;
        }
        
        // Fish count
        const fishCountElement = document.getElementById('fish-count');
        if (fishCountElement && this.fishManager) {
            fishCountElement.textContent = this.fishManager.getCount().toString();
        }
        
        // Feeding count
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
            tankLife: this.tankLifeSeconds,
            fishCount: this.fishManager ? this.fishManager.getCount() : 0,
            foodLevel: this.foodManager ? Math.round(this.foodManager.getFoodLevel()) : 0,
            activeFoodItems: this.foodManager ? this.foodManager.getActiveFoodItems().length : 0,
            timeOfDay: this.currentTimeOfDay,
            isOnline: this.isOnline,
            lastSync: this.lastServerSync ? new Date(this.lastServerSync).toLocaleTimeString() : 'Never'
        };
        
        if (this.fishManager) {
            Object.assign(debugInfo, this.fishManager.getStats());
        }
        
        debugContent.innerHTML = Object.entries(debugInfo)
            .map(([key, value]) => `<div>${key}: ${value}</div>`)
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
        
        return this.needsSave && 
               timeSinceLastSave >= this.saveInterval && 
               this.isOnline;
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
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(saveData)
            });
            
            if (!response.ok) {
                throw new Error(`Save failed: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error('Server returned error: ' + result.error);
            }
            
            // Update local state with server response
            this.aquariumState = result.data;
            
            // Update fish IDs with server-assigned IDs if they were temporary
            if (result.data.fish && this.fishManager) {
                result.data.fish.forEach(serverFish => {
                    const localFish = this.fishManager.getFish(serverFish.id);
                    if (!localFish) {
                        // Find fish by position if ID doesn't match (new fish case)
                        const matchingFish = this.fishManager.fish.find(f => 
                            Math.abs(f.x - serverFish.x) < 50 && 
                            Math.abs(f.y - serverFish.y) < 50 &&
                            f.type === serverFish.type
                        );
                        if (matchingFish && matchingFish.id !== serverFish.id) {
                            matchingFish.id = serverFish.id; // Update with server ID
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
        
        if (constants.saveInterval) {
            this.saveInterval = constants.saveInterval;
        }
        
        if (constants.hungerMultiplier && this.fishManager) {
            // Pass hunger multiplier to fish manager for fish instances
            this.fishManager.setHungerMultiplier(constants.hungerMultiplier);
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
            
            // Get available fish types from the fish manager
            const fishTypes = this.fishManager.fishTypes;
            if (fishTypes.size === 0) {
                console.warn('No fish types available for respawning');
                return;
            }
            
            // Select a common fish as starter, or first available
            const availableTypes = Array.from(fishTypes.values());
            const commonFish = availableTypes.filter(fish => fish.rarity === 'common');
            const starterFishType = commonFish.length > 0 ? commonFish[0] : availableTypes[0];
            
            // Create new fish data
            const newFishData = {
                id: Date.now(), // Temporary ID
                type: starterFishType.name,
                hunger: 0,
                x: 400 + Math.random() * 1120, // Random position in safe area
                y: 400 + Math.random() * 400,
                last_fed: new Date().toISOString(),
                spawn_count: 0
            };
            
            // Add fish to the manager
            const fish = this.fishManager.addFish(newFishData);
            if (fish) {
                console.log(`Respawned ${starterFishType.name} fish`);
                
                // Reset tank life since all fish died
                this.tankLifeSeconds = 0;
                
                // Mark for server save to persist the new fish
                this.markForSave();
                
                // Update UI
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
        // Save final state
        if (this.isOnline) {
            this.saveToServer();
        }
        
        // Cleanup systems
        if (this.audioManager) {
            this.audioManager.destroy();
        }
        
        if (this.controlsManager) {
            this.controlsManager.destroy();
        }
        
        // Remove p5 canvas
        if (this.p5) {
            this.p5.remove();
        }
        
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
    // Browser global
    window.AquariumSystem = AquariumSystem;
    window.initializeAquarium = initializeAquarium;
    window.getAquariumSystem = getAquariumSystem;
}