# Aquae - Virtual Aquarium

A tamagotchi-style virtual aquarium built with Node.js, SQLite/PostgreSQL, and p5.js. Care for virtual fish, unlock decorations, compete on the leaderboard, and watch your aquarium come to life! This application is designed for both traditional server and serverless (AWS Lambda) deployments.

## 🐠 Features

- **Virtual Fish Care**: Feed fish to keep them healthy and happy.
- **Fish AI**: Realistic fish behavior with day/night cycles, hunger, and movement patterns.
- **Unlockable Decorations**: Castle (2+ fish) and Submarine (4+ fish).
- **Leaderboard**: Compete for the top spot based on tank life, fish count, and feedings.
- **Dynamic Environment**: Day/night cycle with appropriate lighting and music.
- **Flexible Backend**: Supports both SQLite and PostgreSQL databases.
- **Real-time Persistence**: Auto-save every 5 seconds.
- **Serverless Ready**: Can be deployed to AWS Lambda for scalable, cost-effective hosting.
- **Cross-browser Compatible**: Supports Chromium M69+ with graceful degradation.

## 🛠️ Technology Stack

### Backend
- **Node.js** (LTS) - Server runtime
- **Express.js** - Web framework
- **SQLite / PostgreSQL** - Selectable database backend
- **pg** - PostgreSQL client for Node.js
- **Winston** - Structured logging
- **serverless-http** - Wrapper for AWS Lambda deployment

### Frontend
- **p5.js** - Graphics and animation
- **Howler.js** - Audio management
- **Vanilla JavaScript** - No frameworks, pure ES6+
- **HTML5/CSS3** - Modern web standards

## 📦 Installation & Deployment

### Local Development

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd aquae
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure environment**
    ```bash
    cp .env.example .env
    # Edit .env with your settings (default is SQLite)
    ```

4.  **Initialize database** (only needed for SQLite)
    ```bash
    npm run setup
    ```

5.  **Start development server**
    ```bash
    npm run dev
    ```

6.  **Access the application**
   Open http://localhost:3000 in your browser

### Serverless Deployment (AWS Lambda)

For deploying to a scalable, serverless environment, please refer to the detailed instructions in **[deployment.md](deployment.md)**.

## ⚙️ Configuration

### Environment Variables (.env)

The backend can be configured using the `.env` file. You can switch between SQLite and PostgreSQL.

```env
# -- DATABASE SELECTION --
# Use 'sqlite' for a file-based database (default)
# Use 'postgres' for a PostgreSQL server
DB_CLIENT=sqlite

# Server Configuration
PORT=3000
NODE_ENV=development

# SQLite Configuration (if DB_CLIENT=sqlite)
DB_PATH=./aquae.db

# PostgreSQL Configuration (if DB_CLIENT=postgres)
PG_HOST=localhost
PG_PORT=5432
PG_USER=aquae_user
PG_PASSWORD=password
PG_DATABASE=aquae

# ... other configurations (Fish, etc.)

For instructions on setting up a PostgreSQL database, see database.md.
🎮 Game Controls
Keyboard Controls
 * Space: Dispense food
 * ← (Left Arrow): Toggle castle decoration
 * → (Right Arrow): Toggle submarine decoration
 * ↓ (Down Arrow): Toggle background music
 * ↑ (Up Arrow): Toggle leaderboard
Development Controls (localhost only)
 * T: Toggle day/night cycle
 * I: Show/hide debug information panel
 * F: Spawn a random fish
 * C: Unlock the castle
 * V: Unlock the submarine
🏗️ Architecture
Project Structure
aquae/
├── backend/
│   ├── db/
│   │   ├── index.js             # Database factory
│   │   ├── sqlite.js            # SQLite client
│   │   └── postgres.js          # PostgreSQL client
│   ├── routes/
│   │   └── aquarium.js          # API routes
│   ├── server.js                # Main Express server (Lambda compatible)
│   └── ...                      # Other backend files
├── frontend/
│   ├── index.html
│   └── ...                      # Frontend JS files
├── lambda.js                    # AWS Lambda handler
├── database.md                  # PostgreSQL setup guide
├── deployment.md                # AWS Lambda deployment guide
└── ...                          # Other project files

API Endpoints
 * GET /aquarium/state?psid={id}: Returns current aquarium state.
 * POST /aquarium/state?psid={id}: Updates aquarium state.
 * GET /aquarium/config: Returns game configuration.
 * GET /aquarium/leaderboard: Returns top 10 leaderboard entries.
 * GET /health: Health check endpoint.
Database Schema
The schema includes tables for aquariums, fish, and leaderboard. Both SQLite and PostgreSQL backends use this structure.
🎯 Game Mechanics
Leaderboard
 * The top 10 players are displayed on the leaderboard.
 * Ranking is primarily based on the longest Tank Life.
 * Your score is automatically submitted to the leaderboard when your game state is saved.
 * The leaderboard display refreshes every 30 seconds.
Fish Lifecycle
 * Fish can spawn after being well-fed.
 * Fish hunger increases over time; they will die if not fed.
 * If all fish die, the tank's life and feeding counters reset.
Unlockables
 * Castle: Unlocked with 2+ fish.
 * Submarine: Unlocked with 4+ fish.
🔧 Development
Adding New Fish Types
 * Define in .env:
   FISH_6=NewFish,3,90,rare,diurnal,35x25

 * Add color mapping in frontend/fish.js:
   const colorMap = {
    'NewFish': '#FF6B6B',
    // ... existing fish
};

 * Optional: Add custom rendering in the drawFishBody method
Browser Compatibility
 * Primary target: Chromium M69+
 * Audio: Progressive enhancement with user interaction unlocking
🐛 Debugging
Debug Panel
Press I to toggle the debug panel showing:
 * FPS and performance metrics
 * Fish statistics (count, health status)
 * Food system status
 * Network connectivity
 * Game state information
Logging
Winston logs are written to:
 * Console (development)
 * logs/aquae.log (all levels)
 * logs/exceptions.log (uncaught exceptions)
 * logs/rejections.log (unhandled promise rejections)
📄 License
MIT License - See LICENSE file for details.
Aquae - Where virtual fish thrive! 🐠✨