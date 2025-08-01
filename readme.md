# Aquae - Virtual Aquarium

A tamagotchi-style virtual aquarium built with Node.js, SQLite, Redis, and p5.js. Care for virtual fish, unlock decorations, and watch your aquarium come to life!

## 🐠 Features

- **Virtual Fish Care**: Feed fish to keep them healthy and happy
- **Fish AI**: Realistic fish behavior with day/night cycles, hunger, and movement patterns
- **Unlockable Decorations**: Castle (2+ fish) and Submarine (4+ fish)
- **Dynamic Environment**: Day/night cycle with appropriate lighting and music
- **Real-time Persistence**: Auto-save every 5 seconds with optional Redis caching
- **Audio System**: Background music and sound effects (toggleable)
- **Responsive Controls**: Keyboard and button controls with visual feedback
- **Cross-browser Compatible**: Supports Chromium M69+ with graceful degradation

## 🛠️ Technology Stack

### Backend
- **Node.js** (LTS) - Server runtime
- **Express.js** - Web framework
- **SQLite** - Persistent storage
- **Redis** (optional) - In-memory caching
- **Winston** - Structured logging
- **dotenv** - Configuration management

### Frontend
- **p5.js** - Graphics and animation
- **Howler.js** - Audio management
- **Vanilla JavaScript** - No frameworks, pure ES6+
- **HTML5/CSS3** - Modern web standards

## 📦 Installation

### Prerequisites
- Node.js 16+ (LTS recommended)
- Redis (optional, for caching)

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd aquae
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Initialize database**
   ```bash
   npm run setup
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   Open http://localhost:3000 in your browser

### Production Deployment

1. **Set environment to production**
   ```bash
   export NODE_ENV=production
   ```

2. **Configure production settings in .env**
   ```env
   NODE_ENV=production
   PORT=3000
   USE_REDIS=true
   LOG_LEVEL=warn
   ```

3. **Start production server**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Environment Variables (.env)

```env
# Cache Configuration
USE_REDIS=true

# Asset Configuration  
BACKGROUND_IMAGE=/assets/images/bg.jpg

# Fish Definitions (name,feed_interval_min,hunger_threshold,rarity,cycle,size)
FISH_1=Clownfish,5,60,common,diurnal,30x20
FISH_2=Angelfish,4,80,uncommon,diurnal,28x22
FISH_3=Betta,3,45,rare,nocturnal,25x18
FISH_4=Goldfish,6,100,common,diurnal,32x24
FISH_5=Dragonfish,2,120,very_rare,nocturnal,40x30

# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_PATH=./aquae.db

# Redis Configuration (if USE_REDIS=true)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/aquae.log
```

### Fish Configuration Format

Fish definitions follow this format:
```
FISH_X=name,feed_interval_min,hunger_threshold,rarity,cycle,size
```

- **name**: Fish species name
- **feed_interval_min**: Minutes between required feedings
- **hunger_threshold**: Maximum hunger before fish dies (0-120)
- **rarity**: Spawn rarity (common, uncommon, rare, very_rare)
- **cycle**: Activity cycle (diurnal, nocturnal)
- **size**: Sprite dimensions as WIDTHxHEIGHT

## 🎮 Game Controls

### Keyboard Controls
- **Space**: Dispense food
- **← (Left Arrow)**: Toggle castle decoration
- **→ (Right Arrow)**: Toggle submarine decoration  
- **↓ (Down Arrow)**: Toggle background music
- **I**: Toggle debug panel (development only)

### Development Controls (localhost only)
- **T**: Toggle day/night cycle for testing fish behavior
- **I**: Show/hide debug information panel
- **F**: Spawn a random fish
- **C**: Unlock the castle
- **V**: Unlock the submarine

### Mouse/Touch Controls
- Click UI buttons for the same functionality as keyboard controls
- All controls have visual feedback and tooltips

## 🏗️ Architecture

### Project Structure
```
aquae/
├── backend/
│   ├── server.js                 # Main Express server
│   ├── routes/
│   │   └── aquarium.js          # API routes
│   ├── db/
│   │   └── setup.js             # Database schema & operations
│   ├── redis/
│   │   └── client.js            # Redis client wrapper
│   ├── config/
│   │   └── fish.js              # Fish configuration parser
│   └── logger.js                # Winston logging setup
├── frontend/
│   ├── index.html               # Main HTML page
│   ├── aquarium.js              # Main game system
│   ├── fish.js                  # Fish AI and rendering
│   ├── food.js                  # Food management system
│   ├── controls.js              # Input handling
│   └── audio.js                 # Audio management
├── assets/
│   ├── images/
│   │   ├── bg.jpg               # Background image
│   │   └── favicon.ico          # Site favicon
│   └── sounds/
│       ├── ambient-ocean.mp3    # Background music
│       ├── day-theme.mp3        # Day music
│       ├── night-theme.mp3      # Night music
│       ├── feed.wav             # Feed sound effect
│       ├── spawn.wav            # Fish spawn sound
│       ├── bubble.wav           # Bubble sound
│       └── unlock.wav           # Unlock sound
├── public/
│   └── style.css                # Main stylesheet
├── .env                         # Environment configuration
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

### API Endpoints

#### GET /aquarium/state?psid={id}
Returns current aquarium state for a player session.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "psid": "player_123",
    "tank_life_sec": 3600,
    "num_fish": 2,
    "castle_unlocked": true,
    "submarine_unlocked": false,
    "music_enabled": true,
    "fish": [
      {
        "id": 1,
        "type": "Clownfish",
        "hunger": 25,
        "x": 400,
        "y": 300,
        "last_fed": "2025-01-01T12:00:00Z",
        "spawn_count": 0
      }
    ]
  }
}
```

#### POST /aquarium/state?psid={id}
Updates aquarium state.

**Request Body:**
```json
{
  "tank_life_sec": 3600,
  "fish": [
    {
      "id": 1,
      "hunger": 20,
      "x": 450,
      "y": 320,
      "fed": true
    }
  ],
  "unlockables": {
    "castle": true,
    "submarine": false,
    "music": true
  }
}
```

#### GET /aquarium/config
Returns fish types and game configuration.

#### GET /health
Health check endpoint for monitoring.

### Database Schema

#### aquariums table
```sql
CREATE TABLE aquariums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    psid TEXT NOT NULL UNIQUE,
    tank_life_sec INTEGER NOT NULL DEFAULT 0,
    num_fish INTEGER NOT NULL DEFAULT 0,
    castle_unlocked BOOLEAN DEFAULT FALSE,
    submarine_unlocked BOOLEAN DEFAULT FALSE,
    music_enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### fish table
```sql
CREATE TABLE fish (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aquarium_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    hunger INTEGER NOT NULL DEFAULT 0,
    x REAL NOT NULL DEFAULT 400,
    y REAL NOT NULL DEFAULT 300,
    last_fed DATETIME DEFAULT CURRENT_TIMESTAMP,
    spawn_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (aquarium_id) REFERENCES aquariums (id) ON DELETE CASCADE
);
```

### Redis Schema (Optional)

When Redis is enabled, data is cached using these key patterns:
- `psid:{id}:aquarium` - Aquarium state JSON
- `psid:{id}:fish:{fishId}` - Individual fish state JSON

## 🎯 Game Mechanics

### Fish Lifecycle
- Fish spawn when fed to full 5 times consecutively
- Fish hunger increases over time based on activity cycle
- Fish die if hunger reaches the threshold without feeding
- Tank life resets to 0 if all fish die

### Food System
- Food level passively refills over time (faster with more fish)
- Each feeding consumes 10% food level
- Food items fall and expire after 30 seconds
- Fish actively seek and consume nearby food

### Unlockables
- **Castle**: Unlocked with 2+ fish, removed if fish count drops below 2
- **Submarine**: Unlocked with 4+ fish, removed if fish count drops below 4
- Decorations persist between sessions and can be toggled

### Day/Night Cycle
- **Diurnal fish**: Active 6 AM - 8 PM
- **Nocturnal fish**: Active 8 PM - 6 AM  
- Background and music change based on time
- Fish behavior and hunger rates adjust to activity level

## 🔧 Development

### Adding New Fish Types

1. **Define in .env**:
   ```env
   FISH_6=NewFish,3,90,rare,diurnal,35x25
   ```

2. **Add color mapping** in `frontend/fish.js`:
   ```javascript
   const colorMap = {
       'NewFish': '#FF6B6B',
       // ... existing fish
   };
   ```

3. **Optional: Add custom rendering** in the `drawFishBody` method

### Module Architecture

The codebase follows a modular architecture with clear separation of concerns:

- **Backend modules**: Database, Redis, logging, routing, configuration
- **Frontend modules**: Audio, food, fish, controls, main aquarium system
- **Event-driven communication**: Systems communicate via callbacks and events
- **State management**: Centralized state with distributed updates

### Performance Considerations

- Fish AI updates run at 60 FPS with delta time calculations
- Food collision detection uses spatial optimization
- Database writes are batched and throttled
- Redis caching reduces database load
- Asset preloading ensures smooth experience

### Browser Compatibility

- **Primary target**: Chromium M69+
- **Fallbacks**: Graceful degradation for older browsers
- **No localStorage**: Uses in-memory state only (per requirements)
- **Audio**: Progressive enhancement with user interaction unlocking

## 🐛 Debugging

### Debug Panel
Press I to toggle the debug panel showing:
- FPS and performance metrics
- Fish statistics (count, health status)
- Food system status
- Network connectivity
- Game state information

### Logging
Winston logs are written to:
- Console (development)
- `logs/aquae.log` (all levels)
- `logs/exceptions.log` (uncaught exceptions)
- `logs/rejections.log` (unhandled promise rejections)

### Common Issues

1. **Fish not spawning**: Check fish feeding requirements and tank maturity
2. **Audio not playing**: User interaction required for browser autoplay policies
3. **Decorations locked**: Verify fish count meets unlock requirements
4. **Save failures**: Check network connectivity and server logs

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following the coding standards
4. Test thoroughly on Chromium M69+
5. Submit a pull request with detailed description

## 🚀 Roadmap

- [ ] Mobile touch controls optimization
- [ ] Additional fish species and rarities
- [ ] More unlockable decorations
- [ ] Fish breeding system
- [ ] Aquarium themes and backgrounds
- [ ] Multiplayer features
- [ ] Achievement system

---

**Aquae** - Where virtual fish thrive! 🐠✨