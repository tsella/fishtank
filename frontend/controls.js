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
            feed: ['Space', ' '],
            castle: ['ArrowLeft', 'KeyA'],
            submarine: ['ArrowRight', 'KeyD'],
            music: ['ArrowDown', 'KeyS'],
            debug: ['F12', 'KeyI'] // Ctrl+Shift+I
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
            onDebugToggle: null
        };
        
        this.setupEventListeners();
        this.setupButtonElements();
    }

    /**
     * Setup keyboard and mouse event listeners
     */
    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
        
        // Prevent default behavior for game keys
        document.addEventListener('keydown', (event) => {
            if (this.isGameKey(event.code) || this.isGameKey(event.key)) {
                event.preventDefault();
            }
        });
        
        // Mouse events for buttons
        document.addEventListener('click', (event) => {
            this.handleClick(event);
        });
        
        // Touch events for mobile support
        document.addEventListener('touchstart', (event) => {
            this.handleTouch(event);
        });
        
        // Focus management
        window.addEventListener('focus', () => {
            this.clearKeyStates();
        });
        
        window.addEventListener('blur', () => {
            this.clearKeyStates();
        });
    }

    /**
     * Setup button element references and click handlers
     */
    setupButtonElements() {
        // Get button elements
        this.buttons.feed = document.getElementById('feed-btn');
        this.buttons.castle = document.getElementById('castle-btn');
        this.buttons.submarine = document.getElementById('submarine-btn');
        this.buttons.music = document.getElementById('music-btn');
        
        // Setup click handlers
        if (this.buttons.feed) {
            this.buttons.feed.addEventListener('click', () => this.triggerFeed());
        }
        
        if (this.buttons.castle) {
            this.buttons.castle.addEventListener('click', () => this.triggerCastleToggle());
        }
        
        if (this.buttons.submarine) {
            this.buttons.submarine.addEventListener('click', () => this.triggerSubmarineToggle());
        }
        
        if (this.buttons.music) {
            this.buttons.music.addEventListener('click', () => this.triggerMusicToggle());
        }
        
        // Update initial button states
        this.updateButtonStates();
    }

    /**
     * Handle keydown events
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyDown(event) {
        const key = event.code || event.key;
        const now = Date.now();
        
        // Track key state
        if (!this.keyStates.get(key)) {
            this.keyStates.set(key, true);
            this.keyPressedThisFrame.set(key, true);
            this.lastKeyTimes.set(key, now);
            
            // Handle key press
            this.handleKeyPress(key, event);
        } else {
            // Handle key repeat
            const lastTime = this.lastKeyTimes.get(key) || 0;
            if (now - lastTime > this.keyRepeatDelay) {
                if ((now - lastTime) % this.keyRepeatRate < 50) {
                    this.handleKeyPress(key, event, true);
                }
            }
        }
    }

    /**
     * Handle keyup events
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyUp(event) {
        const key = event.code || event.key;
        this.keyStates.set(key, false);
        this.keyPressedThisFrame.set(key, false);
    }

    /**
     * Handle key press actions
     * @param {string} key - Key code or key
     * @param {KeyboardEvent} event - Keyboard event
     * @param {boolean} isRepeat - Whether this is a repeated key press
     */
    handleKeyPress(key, event, isRepeat = false) {
        // Feed controls
        if (this.isKeyForAction('feed', key)) {
            this.triggerFeed();
            return;
        }
        
        // Castle controls
        if (this.isKeyForAction('castle', key)) {
            this.triggerCastleToggle();
            return;
        }
        
        // Submarine controls
        if (this.isKeyForAction('submarine', key)) {
            this.triggerSubmarineToggle();
            return;
        }
        
        // Music controls
        if (this.isKeyForAction('music', key)) {
            this.triggerMusicToggle();
            return;
        }
        
        // Debug controls
        if (this.isKeyForAction('debug', key) && (event.ctrlKey && event.shiftKey || key === 'F12')) {
            this.triggerDebugToggle();
            return;
        }
    }

    /**
     * Handle mouse click events
     * @param {MouseEvent} event - Mouse event
     */
    handleClick(event) {
        // Audio unlock for browsers that require user interaction
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            audioManager.handleUserInteraction();
        }
    }

    /**
     * Handle touch events for mobile
     * @param {TouchEvent} event - Touch event
     */
    handleTouch(event) {
        // Audio unlock for mobile browsers
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            audioManager.handleUserInteraction();
        }
    }

    /**
     * Check if key is mapped to a specific action
     * @param {string} action - Action name
     * @param {string} key - Key code or key
     * @returns {boolean} Whether key is mapped to action
     */
    isKeyForAction(action, key) {
        const mappedKeys = this.controls[action] || [];
        return mappedKeys.includes(key);
    }

    /**
     * Check if key is a game control key
     * @param {string} key - Key code or key
     * @returns {boolean} Whether key is a game key
     */
    isGameKey(key) {
        for (const action in this.controls) {
            if (this.isKeyForAction(action, key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Trigger feed action
     */
    triggerFeed() {
        if (!this.feedAvailable) {
            this.showFeedback('Not enough food!', 'warning');
            return;
        }
        
        const foodManager = window.getFoodManager?.();
        if (foodManager) {
            const foodItem = foodManager.dispenseFoodRandom();
            if (foodItem) {
                this.showFeedback('Food dispensed!', 'success');
                
                // Visual feedback on button
                this.flashButton('feed');
                
                // Callback
                if (this.callbacks.onFeed) {
                    this.callbacks.onFeed(foodItem);
                }
            } else {
                this.showFeedback('Feed cooldown active', 'warning');
            }
        }
    }

    /**
     * Trigger castle toggle
     */
    triggerCastleToggle() {
        if (!this.castleUnlocked) {
            this.showFeedback('Need 2+ fish to unlock castle', 'warning');
            return;
        }
        
        // Toggle castle state
        const newState = !this.getCastleState();
        this.setCastleState(newState);
        
        // Visual feedback
        this.flashButton('castle');
        this.showFeedback(newState ? 'Castle enabled!' : 'Castle disabled', 'info');
        
        // Callback
        if (this.callbacks.onCastleToggle) {
            this.callbacks.onCastleToggle(newState);
        }
    }

    /**
     * Trigger submarine toggle
     */
    triggerSubmarineToggle() {
        if (!this.submarineUnlocked) {
            this.showFeedback('Need 4+ fish to unlock submarine', 'warning');
            return;
        }
        
        // Toggle submarine state
        const newState = !this.getSubmarineState();
        this.setSubmarineState(newState);
        
        // Visual feedback
        this.flashButton('submarine');
        this.showFeedback(newState ? 'Submarine deployed!' : 'Submarine docked', 'info');
        
        // Callback
        if (this.callbacks.onSubmarineToggle) {
            this.callbacks.onSubmarineToggle(newState);
        }
    }

    /**
     * Trigger music toggle
     */
    triggerMusicToggle() {
        const audioManager = window.getAudioManager?.();
        if (audioManager) {
            const newState = audioManager.toggleMusic();
            this.musicEnabled = newState;
            
            // Update button state
            this.updateMusicButton();
            
            // Visual feedback
            this.flashButton('music');
            this.showFeedback(newState ? 'Music enabled' : 'Music disabled', 'info');
            
            // Callback
            if (this.callbacks.onMusicToggle) {
                this.callbacks.onMusicToggle(newState);
            }
        }
    }

    /**
     * Trigger debug toggle
     */
    triggerDebugToggle() {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            const isVisible = debugPanel.style.display !== 'none';
            debugPanel.style.display = isVisible ? 'none' : 'block';
            
            this.showFeedback(isVisible ? 'Debug panel hidden' : 'Debug panel shown', 'info');
            
            // Callback
            if (this.callbacks.onDebugToggle) {
                this.callbacks.onDebugToggle(!isVisible);
            }
        }
    }

    /**
     * Update button states based on current game state
     */
    updateButtonStates() {
        // Feed button
        if (this.buttons.feed) {
            this.buttons.feed.disabled = !this.feedAvailable;
            this.buttons.feed.classList.toggle('disabled', !this.feedAvailable);
        }
        
        // Castle button
        if (this.buttons.castle) {
            this.buttons.castle.disabled = !this.castleUnlocked;
            this.buttons.castle.classList.toggle('disabled', !this.castleUnlocked);
            this.buttons.castle.classList.toggle('active', this.getCastleState());
        }
        
        // Submarine button
        if (this.buttons.submarine) {
            this.buttons.submarine.disabled = !this.submarineUnlocked;
            this.buttons.submarine.classList.toggle('disabled', !this.submarineUnlocked);
            this.buttons.submarine.classList.toggle('active', this.getSubmarineState());
        }
        
        // Music button
        this.updateMusicButton();
    }

    /**
     * Update music button state
     */
    updateMusicButton() {
        if (this.buttons.music) {
            this.buttons.music.classList.toggle('active', this.musicEnabled);
            
            // Update icon based on state
            const icon = this.buttons.music.querySelector('.btn-icon');
            if (icon) {
                icon.textContent = this.musicEnabled ? '🎵' : '🔇';
            }
        }
    }

    /**
     * Flash button for visual feedback
     * @param {string} buttonName - Button to flash
     */
    flashButton(buttonName) {
        const button = this.buttons[buttonName];
        if (button) {
            button.classList.add('flash');
            setTimeout(() => {
                button.classList.remove('flash');
            }, 200);
        }
    }

    /**
     * Show user feedback message
     * @param {string} message - Message to show
     * @param {string} type - Message type ('success', 'warning', 'info', 'error')
     */
    showFeedback(message, type = 'info') {
        // Create or update feedback element
        let feedback = document.getElementById('feedback-message');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = 'feedback-message';
            feedback.className = 'feedback-message';
            document.body.appendChild(feedback);
        }
        
        // Set message and type
        feedback.textContent = message;
        feedback.className = `feedback-message ${type}`;
        feedback.style.display = 'block';
        
        // Auto-hide after 2 seconds
        clearTimeout(feedback.hideTimeout);
        feedback.hideTimeout = setTimeout(() => {
            feedback.style.display = 'none';
        }, 2000);
    }

    /**
     * Update feed availability
     * @param {boolean} available - Whether feeding is available
     */
    setFeedAvailable(available) {
        this.feedAvailable = available;
        this.updateButtonStates();
    }

    /**
     * Update castle unlock status
     * @param {boolean} unlocked - Whether castle is unlocked
     */
    setCastleUnlocked(unlocked) {
        this.castleUnlocked = unlocked;
        this.updateButtonStates();
    }

    /**
     * Update submarine unlock status
     * @param {boolean} unlocked - Whether submarine is unlocked
     */
    setSubmarineUnlocked(unlocked) {
        this.submarineUnlocked = unlocked;
        this.updateButtonStates();
    }

    /**
     * Get castle state from local storage or default
     * @returns {boolean} Castle state
     */
    getCastleState() {
        // Since we can't use localStorage, use a class property
        return this.castleEnabled || false;
    }

    /**
     * Set castle state
     * @param {boolean} enabled - Castle state
     */
    setCastleState(enabled) {
        this.castleEnabled = enabled;
        this.updateButtonStates();
    }

    /**
     * Get submarine state from local storage or default
     * @returns {boolean} Submarine state
     */
    getSubmarineState() {
        // Since we can't use localStorage, use a class property
        return this.submarineEnabled || false;
    }

    /**
     * Set submarine state
     * @param {boolean} enabled - Submarine state
     */
    setSubmarineState(enabled) {
        this.submarineEnabled = enabled;
        this.updateButtonStates();
    }

    /**
     * Update game state from server data
     * @param {Object} aquariumState - Aquarium state from server
     */
    updateFromServerState(aquariumState) {
        // Update unlock status based on fish count
        this.setCastleUnlocked(aquariumState.num_fish >= 2);
        this.setSubmarineUnlocked(aquariumState.num_fish >= 4);
        
        // Update toggle states
        this.setCastleState(aquariumState.castle_unlocked || false);
        this.setSubmarineState(aquariumState.submarine_unlocked || false);
        
        // Update music state
        this.musicEnabled = aquariumState.music_enabled !== false;
        this.updateMusicButton();
        
        // Update feed availability
        const foodManager = window.getFoodManager?.();
        if (foodManager) {
            this.setFeedAvailable(foodManager.canDispenseFood());
        }
    }

    /**
     * Register callback for control events
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (this.callbacks.hasOwnProperty(`on${event.charAt(0).toUpperCase()}${event.slice(1)}`)) {
            this.callbacks[`on${event.charAt(0).toUpperCase()}${event.slice(1)}`] = callback;
        }
    }

    /**
     * Check if key is currently pressed
     * @param {string} key - Key code or key
     * @returns {boolean} Whether key is pressed
     */
    isKeyPressed(key) {
        return this.keyStates.get(key) || false;
    }

    /**
     * Check if key was pressed this frame
     * @param {string} key - Key code or key
     * @returns {boolean} Whether key was pressed this frame
     */
    wasKeyPressedThisFrame(key) {
        return this.keyPressedThisFrame.get(key) || false;
    }

    /**
     * Clear all key states (called on focus loss)
     */
    clearKeyStates() {
        this.keyStates.clear();
        this.keyPressedThisFrame.clear();
    }

    /**
     * Clear pressed-this-frame states (called each frame)
     */
    clearFrameStates() {
        this.keyPressedThisFrame.clear();
    }

    /**
     * Update controls system (called each frame)
     * @param {number} deltaTime - Time elapsed since last update
     */
    update(deltaTime) {
        // Update feed availability based on food manager
        const foodManager = window.getFoodManager?.();
        if (foodManager) {
            this.setFeedAvailable(foodManager.canDispenseFood());
        }
        
        // Clear frame-specific key states
        this.clearFrameStates();
    }

    /**
     * Get control mappings for help display
     * @returns {Object} Control mappings
     */
    getControlMappings() {
        return {
            'Feed Fish': this.controls.feed,
            'Toggle Castle': this.controls.castle,
            'Toggle Submarine': this.controls.submarine,
            'Toggle Music': this.controls.music,
            'Debug Panel': this.controls.debug
        };
    }

    /**
     * Set custom key mapping
     * @param {string} action - Action name
     * @param {Array} keys - Array of key codes/keys
     */
    setKeyMapping(action, keys) {
        if (this.controls.hasOwnProperty(action)) {
            this.controls[action] = Array.isArray(keys) ? keys : [keys];
        }
    }

    /**
     * Reset to default key mappings
     */
    resetKeyMappings() {
        this.controls = {
            feed: ['Space', ' '],
            castle: ['ArrowLeft', 'KeyA'],
            submarine: ['ArrowRight', 'KeyD'],
            music: ['ArrowDown', 'KeyS'],
            debug: ['F12', 'KeyI']
        };
    }

    /**
     * Get current state for debugging
     * @returns {Object} Current control state
     */
    getDebugState() {
        return {
            feedAvailable: this.feedAvailable,
            castleUnlocked: this.castleUnlocked,
            submarineUnlocked: this.submarineUnlocked,
            castleEnabled: this.getCastleState(),
            submarineEnabled: this.getSubmarineState(),
            musicEnabled: this.musicEnabled,
            activeKeys: Array.from(this.keyStates.entries()).filter(([key, pressed]) => pressed),
            controlMappings: this.controls
        };
    }

    /**
     * Cleanup event listeners
     */
    destroy() {
        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('touchstart', this.handleTouch);
        
        // Clear states
        this.clearKeyStates();
        
        // Remove feedback element
        const feedback = document.getElementById('feedback-message');
        if (feedback) {
            feedback.remove();
        }
    }
}

// Add CSS for feedback messages and button effects
const feedbackStyles = `
.feedback-message {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-weight: 600;
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    animation: fadeInOut 2s ease-in-out;
    display: none;
}

.feedback-message.success {
    background: rgba(16, 185, 129, 0.9);
}

.feedback-message.warning {
    background: rgba(245, 158, 11, 0.9);
}

.feedback-message.error {
    background: rgba(239, 68, 68, 0.9);
}

.feedback-message.info {
    background: rgba(59, 130, 246, 0.9);
}

@keyframes fadeInOut {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
}

.control-btn.flash {
    animation: buttonFlash 0.2s ease-in-out;
}

@keyframes buttonFlash {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); background: rgba(255, 255, 255, 0.2); }
    100% { transform: scale(1); }
}

.control-btn.disabled {
    opacity: 0.4;
    pointer-events: none;
}
`;

// Inject styles
const styleElement = document.createElement('style');
styleElement.textContent = feedbackStyles;
document.head.appendChild(styleElement);

// Global controls manager instance
let controlsManager = null;

/**
 * Initialize global controls manager
 * @param {Object} options - Initialization options
 * @returns {ControlsManager} Controls manager instance
 */
function initializeControls(options = {}) {
    if (controlsManager) {
        return controlsManager;
    }
    
    controlsManager = new ControlsManager();
    
    // Apply custom key mappings if provided
    if (options.keyMappings) {
        Object.entries(options.keyMappings).forEach(([action, keys]) => {
            controlsManager.setKeyMapping(action, keys);
        });
    }
    
    return controlsManager;
}

/**
 * Get global controls manager
 * @returns {ControlsManager|null} Controls manager instance
 */
function getControlsManager() {
    return controlsManager;
}

// Export for module systems and global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ControlsManager, initializeControls, getControlsManager };
} else {
    // Browser global
    window.ControlsManager = ControlsManager;
    window.initializeControls = initializeControls;
    window.getControlsManager = getControlsManager;
}