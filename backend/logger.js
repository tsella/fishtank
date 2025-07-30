/**
 * Winston Logger Configuration for Aquae
 * Provides structured logging with timestamps and levels
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format with timestamp and structured output
 */
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
        }`;
    })
);

/**
 * Logger instance with file and console transports
 */
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // File transport for all logs
        new winston.transports.File({
            filename: process.env.LOG_FILE || path.join(logsDir, 'aquae.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Console transport for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ],
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log')
        })
    ],
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log')
        })
    ]
});

/**
 * Specialized logging methods for aquarium events
 */
logger.aquarium = {
    /**
     * Log fish state changes
     * @param {string} psid - Player session ID
     * @param {string} fishType - Type of fish
     * @param {string} event - Event type (fed, died, spawned)
     * @param {Object} data - Additional event data
     */
    fishEvent: (psid, fishType, event, data = {}) => {
        logger.info('Fish event', {
            psid,
            fishType,
            event,
            ...data,
            category: 'fish'
        });
    },

    /**
     * Log aquarium state changes
     * @param {string} psid - Player session ID
     * @param {string} event - Event type (save, load, reset)
     * @param {Object} data - Additional event data
     */
    stateEvent: (psid, event, data = {}) => {
        logger.info('Aquarium state event', {
            psid,
            event,
            ...data,
            category: 'state'
        });
    },

    /**
     * Log unlockable changes
     * @param {string} psid - Player session ID
     * @param {string} unlockable - Unlockable type (castle, submarine)
     * @param {string} action - Action (unlock, lock, toggle)
     * @param {Object} data - Additional event data
     */
    unlockableEvent: (psid, unlockable, action, data = {}) => {
        logger.info('Unlockable event', {
            psid,
            unlockable,
            action,
            ...data,
            category: 'unlockable'
        });
    },

    /**
     * Log errors with aquarium context
     * @param {string} psid - Player session ID
     * @param {string} operation - Operation that failed
     * @param {Error} error - Error object
     * @param {Object} context - Additional context
     */
    error: (psid, operation, error, context = {}) => {
        logger.error('Aquarium error', {
            psid,
            operation,
            error: error.message,
            stack: error.stack,
            ...context,
            category: 'error'
        });
    }
};

module.exports = logger;