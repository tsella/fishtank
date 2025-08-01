/**
 * Controls and Input Management for Aquae
 * Handles keyboard input, button clicks, and game controls
 * Compatible with Chromium M69
 */

class ControlsManager {
    constructor() {
        this.keyStates = new Map();
        this.keyPressedThisFrame = new Map();
        this.lastKeyTimes = new Map();
        this.keyRepeatDelay = 250; // ms before key repeat starts
        this.keyRepeatRate = 100; // ms between repeats
        
        // Control mappings
        this.controls = {
            feed: ['Space', ' ', 'Enter'],
            castle: ['ArrowLeft', 'KeyA'],
            submarine: ['ArrowRight', 'KeyD'],
            music: ['ArrowDown', 'KeyS'],
            leaderboard: ['ArrowUp', 'KeyW'],
            debug: ['KeyI'], // I key for debug panel
            debugTime: ['KeyT'], // T key for time toggle (development only)
            spawnFish: ['KeyF'], // F key to spawn fish (development only)
            unlockCastle: ['KeyC'], // C key to unlock castle (development only)
            unlockSubmarine: ['KeyV'] // V key to unlock submarine (development only)
        };
        
        // Button references
        this.buttons = {
            feed: null,
            castle: null,
            submarine: null,
            music: null
        };
        
        // State tracking
        this.musicEnabled = true;
        this.castleUnlocked = false;
        this.submarineUnlocked = false;
        this.feedAvailable = true;
        
        // Event callbacks
        this.callbacks = {
            onFeed: null,
            onCastleToggle: null,
            onSubmarineToggle: null,
            onMusicToggle: null,
            onLeaderboardToggle: null,
            onDebugToggle: null,
            onSpawnFish: null,
            onUnlockCastle: null,
            onUnlockSubmarine: null
        };
        
        this.setupEventListeners();
        this.setupButtonElements();
    }

    /**
     * Setup keyboard and mouse event listeners
     */
    setupEventListeners() {
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
        
        document.addEventListener('keydown', (event) => {
            if (this.isGameKey(event.code) || this.isGameKey(event.key)) {
                event.preventDefault();
            }
        });
        
        document.addEventListener('click', (event) => this.handleClick(event));
        document.addEventListener('touchstart', (event) => this.handleTouch(event));
        
        window.addEventListener('focus', () => this.clearKeyStates());
        window.addEventListener('blur', () => this.clearKeyStates());
    }

    /**
     * Setup button element references and click handlers
     */
    setupButtonElements() {
        this.buttons.feed = document.getElementById('feed-btn');
        this.buttons.castle = document.getElementById('castle-btn');
        this.buttons.submarine = document.getElementById('submarine-btn');
        this.buttons.music = document.getElementById('music-btn');
        
        if (this.buttons.feed) this.buttons.feed.addEventListener('click', () => this.triggerFeed());
        if (this.buttons.castle) this.buttons.castle.addEventListener('click', () => this.triggerCastleToggle());
        if (this.buttons.submarine) this.buttons.submarine.addEventListener('click', () => this.triggerSubmarineToggle());
        if (this.buttons.music) this.buttons.music.addEventListener('click', () => this.triggerMusicToggle());
        
        this.updateButtonStates();
    }

    handleKeyDown(event) {
        const key = event.code || event.key;
        if (!this.keyStates.get(key)) {
            this.keyStates.set(key, true);
            this.keyPressedThisFrame.set(key, true);
            this.handleKeyPress(key, event);
        }
    }

    handleKeyUp(event) {
        const key = event.code || event.key;
        this.keyStates.set(key, false);
    }

    handleKeyPress(key, event) {
        window.getAudioManager()?.handleUserInteraction();
        if (this.isKeyForAction('feed', key)) this.triggerFeed();
        else if (this.isKeyForAction('castle', key)) this.triggerCastleToggle();
        else if (this.isKeyForAction('submarine', key)) this.triggerSubmarineToggle();
        else if (this.isKeyForAction('music', key)) this.triggerMusicToggle();
        else if (this.isKeyForAction('leaderboard', key)) this.triggerLeaderboardToggle();
        else if (this.isKeyForAction('debug', key)) this.triggerDebugToggle();
        else if (this.isKeyForAction('debugTime', key) && this.isDev()) this.triggerDebugTimeToggle();
        else if (this.isKeyForAction('spawnFish', key) && this.isDev()) this.triggerSpawnFish();
        else if (this.isKeyForAction('unlockCastle', key) && this.isDev()) this.triggerUnlockCastle();
        else if (this.isKeyForAction('unlockSubmarine', key) && this.isDev()) this.triggerUnlockSubmarine();
    }

    isDev() {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }

    handleClick(event) { window.getAudioManager?.().handleUserInteraction(); }
    handleTouch(event) { window.getAudioManager?.().handleUserInteraction(); }
    isKeyForAction(action, key) { return (this.controls[action] || []).includes(key); }
    isGameKey(key) { return Object.values(this.controls).some(keys => keys.includes(key)); }

    triggerFeed() {
        if (!this.feedAvailable) return;
        const foodManager = window.getFoodManager?.();
        if (foodManager?.dispenseFoodRandom()) {
            this.flashButton('feed');
            this.callbacks.onFeed?.();
        }
    }

    triggerCastleToggle() {
        if (!this.castleUnlocked) return;
        const newState = !this.getCastleState();
        this.setCastleState(newState);
        this.flashButton('castle');
        this.callbacks.onCastleToggle?.(newState);
    }

    triggerSubmarineToggle() {
        if (!this.submarineUnlocked) return;
        const newState = !this.getSubmarineState();
        this.setSubmarineState(newState);
        this.flashButton('submarine');
        this.callbacks.onSubmarineToggle?.(newState);
    }

    triggerMusicToggle() {
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            const newState = audioManager.toggleMusic();
            this.musicEnabled = newState;
            this.updateMusicButton();
            this.flashButton('music');
            this.callbacks.onMusicToggle?.(newState);
        }
    }

    triggerLeaderboardToggle() {
        this.callbacks.onLeaderboardToggle?.();
    }

    triggerDebugToggle() {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            const isVisible = debugPanel.style.display === 'block';
            debugPanel.style.display = isVisible ? 'none' : 'block';
            this.callbacks.onDebugToggle?.(!isVisible);
        }
    }

    triggerDebugTimeToggle() {
        window.getAquariumSystem?.().toggleDebugTimeOfDay();
    }

    triggerSpawnFish() {
        this.callbacks.onSpawnFish?.();
    }

    triggerUnlockCastle() {
        this.callbacks.onUnlockCastle?.();
    }

    triggerUnlockSubmarine() {
        this.callbacks.onUnlockSubmarine?.();
    }

    updateButtonStates() {
        if (this.buttons.feed) this.buttons.feed.disabled = !this.feedAvailable;
        if (this.buttons.castle) this.buttons.castle.disabled = !this.castleUnlocked;
        if (this.buttons.submarine) this.buttons.submarine.disabled = !this.submarineUnlocked;
        if (this.buttons.castle) this.buttons.castle.classList.toggle('active', this.getCastleState());
        if (this.buttons.submarine) this.buttons.submarine.classList.toggle('active', this.getSubmarineState());
        this.updateMusicButton();
    }

    updateMusicButton() {
        if (this.buttons.music) {
            this.buttons.music.classList.toggle('active', this.musicEnabled);
            const icon = this.buttons.music.querySelector('.btn-icon');
            if (icon) icon.textContent = this.musicEnabled ? '🎵' : '🔇';
        }
    }

    flashButton(buttonName) {
        const button = this.buttons[buttonName];
        if (button) {
            button.classList.add('flash');
            setTimeout(() => button.classList.remove('flash'), 200);
        }
    }

    setFeedAvailable(available) { this.feedAvailable = available; this.updateButtonStates(); }
    setCastleUnlocked(unlocked) { this.castleUnlocked = unlocked; this.updateButtonStates(); }
    setSubmarineUnlocked(unlocked) { this.submarineUnlocked = unlocked; this.updateButtonStates(); }

    getCastleState() { return this.castleEnabled || false; }
    setCastleState(enabled) { this.castleEnabled = enabled; this.updateButtonStates(); }
    getSubmarineState() { return this.submarineEnabled || false; }
    setSubmarineState(enabled) { this.submarineEnabled = enabled; this.updateButtonStates(); }

    updateFromServerState(aquariumState) {
        this.setCastleUnlocked(aquariumState.num_fish >= 2);
        this.setSubmarineUnlocked(aquariumState.num_fish >= 4);
        this.setCastleState(aquariumState.castle_unlocked || false);
        this.setSubmarineState(aquariumState.submarine_unlocked || false);
        this.musicEnabled = aquariumState.music_enabled !== false;
        this.updateMusicButton();
    }

    on(event, callback) {
        const callbackName = `on${event.charAt(0).toUpperCase() + event.slice(1)}`;
        if (this.callbacks.hasOwnProperty(callbackName)) {
            this.callbacks[callbackName] = callback;
        }
    }

    update(deltaTime) {
        const foodManager = window.getFoodManager?.();
        if (foodManager) this.setFeedAvailable(foodManager.canDispenseFood());
    }

    clearKeyStates() { this.keyStates.clear(); }
    destroy() { /* remove event listeners */ }
}

let controlsManager = null;
function initializeControls(options = {}) {
    if (!controlsManager) controlsManager = new ControlsManager();
    return controlsManager;
}
function getControlsManager() { return controlsManager; }

window.initializeControls = initializeControls;
window.getControlsManager = getControlsManager;
