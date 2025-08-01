/**
 * Aquae Main Server
 * Express.js server with selectable SQLite/PostgreSQL backend for virtual aquarium.
 * Refactored for serverless deployment on AWS Lambda.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const logger = require('./logger');
const dbFactory = require('./db');
const { createAquariumRoutes } = require('./routes/aquarium');
const redisClient = require('./redis/client');
const fishConfig = require('./config/fish');

class AquaeServer {
    constructor() {
        this.app = express();
        this.db = null;
        this.initialized = false;
        
        this.setupMiddleware();
    }

    /**
     * Configure Express middleware
     */
    setupMiddleware() {
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    mediaSrc: ["'self'", "https:", "data:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'", "https:"],
                    objectSrc: ["'none'"],
                    frameSrc: ["'none'"],
                }
            },
            crossOriginEmbedderPolicy: false
        }));

        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production' 
                ? process.env.ALLOWED_ORIGINS?.split(',') || true
                : true,
            credentials: true,
            optionsSuccessStatus: 200
        }));

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        this.app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
        this.app.use('/', express.static(path.join(__dirname, '..', 'public')));
    }

    /**
     * Setup routes after database initialization
     */
    setupRoutes() {
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                services: {
                    database: this.db ? 'connected' : 'disconnected',
                    db_client: process.env.DB_CLIENT || 'sqlite',
                    redis: redisClient.isEnabled() ? 'connected' : 'disabled'
                }
            });
        });
        
        const aquariumRoutes = createAquariumRoutes(this.db);
        this.app.use('/aquarium', aquariumRoutes);

        this.app.use('/', express.static(path.join(__dirname, '..', 'frontend')));
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
        });
    }

    /**
     * Setup error handling middleware
     */
    setupErrorHandlers() {
        this.app.use((req, res) => {
            res.status(404).json({
                success: false, error: 'Endpoint not found', code: 'NOT_FOUND'
            });
        });

        this.app.use((error, req, res, next) => {
            logger.error('Unhandled error', { error: error.message, stack: error.stack });
            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
                code: 'INTERNAL_ERROR'
            });
        });
    }

    /**
     * Initialize database and Redis connections
     */
    async initialize() {
        if (this.initialized) return;

        try {
            logger.info('Initializing services...');
            this.db = await dbFactory.initialize();
            await redisClient.connect();
            
            this.setupRoutes();
            this.setupErrorHandlers();
            
            this.initialized = true;
            logger.info('All services initialized successfully');
        } catch (error) {
            logger.error('Service initialization failed', { error: error.message });
            throw error;
        }
    }
}

const aquaeServer = new AquaeServer();

// This part is for local development. It won't be used in Lambda.
if (require.main === module) {
    const port = process.env.PORT || 3000;
    aquaeServer.initialize().then(() => {
        aquaeServer.app.listen(port, () => {
            logger.info('Aquae server started locally', {
                port: port,
                environment: process.env.NODE_ENV || 'development',
                db_client: process.env.DB_CLIENT || 'sqlite'
            });
        });
    }).catch(error => {
        logger.error('Failed to start local server', { error: error.message });
        process.exit(1);
    });
}

// Export the initialized app for serverless use
module.exports = aquaeServer;
