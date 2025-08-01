/**
 * Aquae Main Server
 * Express.js server with selectable SQLite/PostgreSQL backend for virtual aquarium
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
        this.server = null;
        this.port = process.env.PORT || 3000;
        
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
                    fontSrc: ["'self'", "https:", "data:"],
                    objectSrc: ["'none'"],
                    frameSrc: ["'none'"],
                }
            },
            crossOriginEmbedderPolicy: false
        }));

        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production' 
                ? process.env.ALLOWED_ORIGINS?.split(',') || false
                : true,
            credentials: true,
            optionsSuccessStatus: 200
        }));

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        this.app.use((req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger.info('HTTP Request', {
                    method: req.method,
                    url: req.url,
                    status: res.statusCode,
                    duration: `${duration}ms`,
                    userAgent: req.get('User-Agent'),
                    ip: req.ip,
                    psid: req.query.psid || req.body?.psid
                });
            });
            
            next();
        });

        this.app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), {
            maxAge: '1d',
            etag: true,
            lastModified: true
        }));

        this.app.use('/', express.static(path.join(__dirname, '..', 'public'), {
            maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
            etag: true
        }));
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
                    redis: redisClient.isEnabled() ? 'connected' : 'disabled',
                    fishConfig: fishConfig.getAllFishTypes().length > 0 ? 'loaded' : 'empty'
                }
            });
        });
        
        this.app.get('/api/test', (req, res) => {
            res.json({ 
                success: true, 
                message: 'API is working',
                timestamp: new Date().toISOString()
            });
        });

        logger.info('Setting up aquarium routes with database:', { hasDb: !!this.db });

        try {
            const aquariumRoutes = createAquariumRoutes(this.db);
            this.app.use('/aquarium', aquariumRoutes);
            logger.info('Aquarium routes mounted successfully');
        } catch (error) {
            logger.error('Failed to mount aquarium routes:', { error: error.message });
        }

        if (process.env.NODE_ENV !== 'production') {
            this.app.get('/debug/config', (req, res) => {
                res.json({
                    fishConfig: fishConfig.exportSchema(),
                    env: {
                        DB_CLIENT: process.env.DB_CLIENT,
                        USE_REDIS: process.env.USE_REDIS,
                        NODE_ENV: process.env.NODE_ENV,
                        PORT: process.env.PORT
                    }
                });
            });

            this.app.get('/debug/cache', async (req, res) => {
                try {
                    const stats = await redisClient.getStats();
                    res.json(stats);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            this.app.get('/debug/routes', (req, res) => {
                const routes = [];
                this.app._router.stack.forEach((middleware) => {
                    if (middleware.route) {
                        routes.push({
                            path: middleware.route.path,
                            methods: Object.keys(middleware.route.methods)
                        });
                    } else if (middleware.name === 'router') {
                        middleware.handle.stack.forEach((handler) => {
                            if (handler.route) {
                                routes.push({
                                    path: `/aquarium${handler.route.path}`,
                                    methods: Object.keys(handler.route.methods)
                                });
                            }
                        });
                    }
                });
                res.json({ routes });
            });
        }
        
        // Serve frontend files (after API routes)
        this.app.use('/', express.static(path.join(__dirname, '..', 'frontend'), {
            maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
            etag: true
        }));
        
        // Catch-all for SPA routing (must be last)
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
        });
    }

    /**
     * Setup error handling middleware
     */
    setupErrorHandlers() {
        this.app.use((req, res) => {
            logger.warn('404 Not Found', {
                method: req.method,
                url: req.url,
                ip: req.ip
            });
            
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                code: 'NOT_FOUND'
            });
        });

        this.app.use((error, req, res, next) => {
            logger.error('Unhandled error', {
                error: error.message,
                stack: error.stack,
                method: req.method,
                url: req.url,
                psid: req.query.psid || req.body?.psid
            });

            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' 
                    ? 'Internal server error' 
                    : error.message,
                code: 'INTERNAL_ERROR'
            });
        });
    }

    /**
     * Initialize database and Redis connections
     */
    async initializeServices() {
        try {
            logger.info('Initializing database...');
            this.db = await dbFactory.initialize();
            logger.info('Database initialized successfully');

            logger.info('Initializing Redis...');
            await redisClient.connect();
            
            if (redisClient.isEnabled()) {
                logger.info('Redis initialized successfully');
            } else {
                logger.info('Redis disabled or unavailable, continuing without cache');
            }
            
            logger.info('All services initialized successfully');
        } catch (error) {
            logger.error('Service initialization failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Start the server
     */
    async start() {
        try {
            await this.initializeServices();
            this.setupRoutes(); // Call after services are up
            this.setupErrorHandlers(); // Call after all routes are defined

            this.server = this.app.listen(this.port, () => {
                logger.info('Aquae server started', {
                    port: this.port,
                    environment: process.env.NODE_ENV || 'development',
                    db_client: process.env.DB_CLIENT || 'sqlite',
                    fishTypes: fishConfig.getAllFishTypes().length,
                    redis: redisClient.isEnabled() ? 'enabled' : 'disabled'
                });
            });

            this.setupGracefulShutdown();
            
        } catch (error) {
            logger.error('Failed to start server', { error: error.message });
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, starting graceful shutdown...`);
            
            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP server closed');
                });
            }

            try {
                if (this.db) {
                    await this.db.close();
                }
                await redisClient.disconnect();
                logger.info('Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                logger.error('Error during shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection', {
                reason: reason instanceof Error ? reason.message : reason,
                stack: reason instanceof Error ? reason.stack : undefined
            });
            process.exit(1);
        });
    }

    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
    }
}

if (require.main === module) {
    const server = new AquaeServer();
    server.start().catch((error) => {
        console.error('Failed to start Aquae server:', error);
        process.exit(1);
    });
}

module.exports = AquaeServer;
