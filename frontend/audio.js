/**
 * Audio Management System for Aquae
 * Handles background music and sound effects using Howler.js
 * Compatible with Chromium M69
 */

class AudioManager {
    constructor() {
        this.enabled = true;
        this.musicEnabled = true;
        this.effectsEnabled = true;
        this.masterVolume = 0.7;
        this.musicVolume = 0.5;
        this.effectsVolume = 0.8;
        
        this.music = null;
        this.sounds = new Map();
        this.loadPromises = [];
        
        // Audio file definitions
        this.audioAssets = {
            music: {
                ambient: '/assets/sounds/ambient-ocean.mp3',
                day: '/assets/sounds/day-theme.mp3',
                night: '/assets/sounds/night-theme.mp3'
            },
            effects: {
                feed: '/assets/sounds/feed.wav',
                spawn: '/assets/sounds/spawn.wav',
                bubble: '/assets/sounds/bubble.mp3',
                unlock: '/assets/sounds/unlock.wav',
                death: '/assets/sounds/chew.mp3'
            }
        };
        
        this.currentTrack = null;
        this.currentTime = 'day'; // 'day' or 'night'
        
        this.initializeAudio();
    }

    /**
     * Initialize audio system
     */
    initializeAudio() {
        try {
            // Check if Howl is available
            if (typeof Howl === 'undefined') {
                console.warn('Howler.js not loaded, audio disabled');
                this.enabled = false;
                return;
            }

            // Load all audio assets
            this.loadAudioAssets();
            
        } catch (error) {
            console.error('Audio initialization failed:', error);
            this.enabled = false;
        }
    }

    /**
     * Load all audio assets
     */
    loadAudioAssets() {
        // Load music tracks
        Object.entries(this.audioAssets.music).forEach(([name, src]) => {
            const loadPromise = this.loadMusicTrack(name, src);
            this.loadPromises.push(loadPromise);
        });

        // Load sound effects
        Object.entries(this.audioAssets.effects).forEach(([name, src]) => {
            const loadPromise = this.loadSoundEffect(name, src);
            this.loadPromises.push(loadPromise);
        });
    }

    /**
     * Load a music track
     * @param {string} name - Track name
     * @param {string} src - Audio file path
     * @returns {Promise} Load promise
     */
    loadMusicTrack(name, src) {
        return new Promise((resolve, reject) => {
            try {
                const howl = new Howl({
                    src: [src],
                    loop: true,
                    volume: this.musicVolume * this.masterVolume,
                    preload: true,
                    onload: () => {
                        console.log(`Music track loaded: ${name}`);
                        resolve(howl);
                    },
                    onloaderror: (id, error) => {
                        console.warn(`Failed to load music: ${name}`, error);
                        // Create silent placeholder
                        resolve(this.createSilentHowl());
                    },
                    onplayerror: () => {
                        howl.once('unlock', () => {
                            howl.play();
                        });
                    }
                });

                this.sounds.set(`music_${name}`, howl);
            } catch (error) {
                console.warn(`Error creating music track: ${name}`, error);
                resolve(this.createSilentHowl());
            }
        });
    }

    /**
     * Load a sound effect
     * @param {string} name - Effect name
     * @param {string} src - Audio file path
     * @returns {Promise} Load promise
     */
    loadSoundEffect(name, src) {
        return new Promise((resolve, reject) => {
            try {
                const howl = new Howl({
                    src: [src],
                    volume: this.effectsVolume * this.masterVolume,
                    preload: true,
                    onload: () => {
                        console.log(`Sound effect loaded: ${name}`);
                        resolve(howl);
                    },
                    onloaderror: (id, error) => {
                        console.warn(`Failed to load sound: ${name}`, error);
                        resolve(this.createSilentHowl());
                    }
                });

                this.sounds.set(`effect_${name}`, howl);
            } catch (error) {
                console.warn(`Error creating sound effect: ${name}`, error);
                resolve(this.createSilentHowl());
            }
        });
    }

    /**
     * Create a silent placeholder Howl instance
     * @returns {Object} Silent Howl-like object
     */
    createSilentHowl() {
        return {
            play: () => {},
            stop: () => {},
            pause: () => {},
            volume: () => {},
            fade: () => {},
            state: () => 'loaded',
            playing: () => false
        };
    }

    /**
     * Wait for all audio assets to load
     * @returns {Promise} Promise that resolves when all audio is loaded
     */
    async waitForLoad() {
        try {
            await Promise.allSettled(this.loadPromises);
            console.log('Audio loading completed');
            return true;
        } catch (error) {
            console.error('Audio loading failed:', error);
            return false;
        }
    }

    /**
     * Start background music based on time of day
     * @param {string} timeOfDay - 'day' or 'night'
     */
    startMusic(timeOfDay = 'day') {
        if (!this.enabled || !this.musicEnabled) {
            return;
        }

        // Stop current music
        this.stopMusic();

        // Select track based on time
        let trackName = 'ambient';
        if (timeOfDay === 'day') {
            trackName = 'day';
        } else if (timeOfDay === 'night') {
            trackName = 'night';
        }

        const track = this.sounds.get(`music_${trackName}`);
        if (track && track.state() === 'loaded') {
            try {
                track.play();
                this.music = track;
                this.currentTrack = trackName;
                this.currentTime = timeOfDay;
                console.log(`Started music: ${trackName}`);
            } catch (error) {
                console.warn('Failed to play music:', error);
            }
        }
    }

    /**
     * Stop background music
     */
    stopMusic() {
        if (this.music) {
            try {
                this.music.stop();
                this.music = null;
                this.currentTrack = null;
            } catch (error) {
                console.warn('Error stopping music:', error);
            }
        }
    }

    /**
     * Toggle music on/off
     * @returns {boolean} New music state
     */
    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        
        if (this.musicEnabled) {
            this.startMusic(this.currentTime);
        } else {
            this.stopMusic();
        }
        
        return this.musicEnabled;
    }

    /**
     * Play a sound effect
     * @param {string} effectName - Name of the effect
     * @param {number} volume - Volume override (0-1)
     */
    playEffect(effectName, volume = null) {
        if (!this.enabled || !this.effectsEnabled) {
            return;
        }

        const effect = this.sounds.get(`effect_${effectName}`);
        if (effect && effect.state() === 'loaded') {
            try {
                if (volume !== null) {
                    effect.volume(volume * this.masterVolume);
                }
                effect.play();
            } catch (error) {
                console.warn(`Failed to play effect: ${effectName}`, error);
            }
        }
    }

    /**
     * Update time of day and switch music if needed
     * @param {string} timeOfDay - 'day' or 'night'
     */
    updateTimeOfDay(timeOfDay) {
        if (timeOfDay !== this.currentTime && this.musicEnabled) {
            this.currentTime = timeOfDay;
            
            // Fade out current track and start new one
            if (this.music) {
                this.music.fade(this.musicVolume * this.masterVolume, 0, 1000);
                setTimeout(() => {
                    this.startMusic(timeOfDay);
                }, 1000);
            } else {
                this.startMusic(timeOfDay);
            }
        }
    }

    /**
     * Set master volume
     * @param {number} volume - Volume level (0-1)
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        
        // Update all sound volumes
        this.sounds.forEach((howl, key) => {
            if (key.startsWith('music_')) {
                howl.volume(this.musicVolume * this.masterVolume);
            } else if (key.startsWith('effect_')) {
                howl.volume(this.effectsVolume * this.masterVolume);
            }
        });
    }

    /**
     * Set music volume
     * @param {number} volume - Volume level (0-1)
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        
        this.sounds.forEach((howl, key) => {
            if (key.startsWith('music_')) {
                howl.volume(this.musicVolume * this.masterVolume);
            }
        });
    }

    /**
     * Set effects volume
     * @param {number} volume - Volume level (0-1)
     */
    setEffectsVolume(volume) {
        this.effectsVolume = Math.max(0, Math.min(1, volume));
        
        this.sounds.forEach((howl, key) => {
            if (key.startsWith('effect_')) {
                howl.volume(this.effectsVolume * this.masterVolume);
            }
        });
    }

    /**
     * Enable/disable sound effects
     * @param {boolean} enabled - Whether effects should be enabled
     */
    setEffectsEnabled(enabled) {
        this.effectsEnabled = enabled;
    }

    /**
     * Get current audio state
     * @returns {Object} Current audio state
     */
    getState() {
        return {
            enabled: this.enabled,
            musicEnabled: this.musicEnabled,
            effectsEnabled: this.effectsEnabled,
            masterVolume: this.masterVolume,
            musicVolume: this.musicVolume,
            effectsVolume: this.effectsVolume,
            currentTrack: this.currentTrack,
            currentTime: this.currentTime,
            isPlaying: this.music ? this.music.playing() : false
        };
    }

    /**
     * Handle user interaction to unlock audio (required for autoplay policies)
     */
    handleUserInteraction() {
        if (!this.enabled || Howler.ctx.state === 'running') return;
        Howler.ctx.resume().then(() => {
            console.log('Audio context unlocked');
        });
    }

    /**
     * Cleanup audio resources
     */
    destroy() {
        this.stopMusic();
        
        this.sounds.forEach(howl => {
            try {
                if (typeof howl.unload === 'function') {
                    howl.unload();
                }
            } catch (error) {
                console.warn('Error unloading audio:', error);
            }
        });
        
        this.sounds.clear();
        this.enabled = false;
    }

    /**
     * Preload critical audio assets
     * @returns {Promise} Promise that resolves when critical assets are loaded
     */
    async preloadCritical() {
        const criticalAssets = [
            this.loadSoundEffect('feed', this.audioAssets.effects.feed),
            this.loadMusicTrack('ambient', this.audioAssets.music.ambient)
        ];

        try {
            await Promise.allSettled(criticalAssets);
            return true;
        } catch (error) {
            console.warn('Critical audio preload failed:', error);
            return false;
        }
    }

    /**
     * Create audio manager with fallback for missing files
     * @param {Object} customAssets - Custom asset paths
     * @returns {AudioManager} Audio manager instance
     */
    static createWithFallback(customAssets = {}) {
        const manager = new AudioManager();
        
        // Override asset paths if provided
        if (customAssets.music) {
            Object.assign(manager.audioAssets.music, customAssets.music);
        }
        if (customAssets.effects) {
            Object.assign(manager.audioAssets.effects, customAssets.effects);
        }
        
        return manager;
    }
}

// Global audio manager instance
let audioManager = null;

/**
 * Initialize global audio manager
 * @param {Object} options - Initialization options
 * @returns {Promise<AudioManager>} Audio manager instance
 */
async function initializeAudio(options = {}) {
    if (audioManager) {
        return audioManager;
    }

    audioManager = AudioManager.createWithFallback(options.customAssets);
    
    // Wait for critical assets to load
    await audioManager.preloadCritical();
    
    // Load remaining assets in background
    audioManager.waitForLoad().then(() => {
        console.log('All audio assets loaded');
    });
    
    return audioManager;
}

/**
 * Get global audio manager
 * @returns {AudioManager|null} Audio manager instance
 */
function getAudioManager() {
    return audioManager;
}

// Export for module systems and global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioManager, initializeAudio, getAudioManager };
} else {
    // Browser global
    window.AudioManager = AudioManager;
    window.initializeAudio = initializeAudio;
    window.getAudioManager = getAudioManager;
}
