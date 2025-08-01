/**
 * AWS Lambda handler for the Aquae application.
 * This file wraps the Express server for serverless execution.
 */
const serverless = require('serverless-http');
const aquaeServer = require('./backend/server');

let handler;

module.exports.handler = async (event, context) => {
    // Initialize the server on the first invocation
    if (!handler) {
        await aquaeServer.initialize();
        handler = serverless(aquaeServer.app);
    }
    
    // Pass the event to the serverless-http wrapper
    return handler(event, context);
};
