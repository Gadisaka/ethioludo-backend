# Bot Configuration System

This directory contains the bot configuration system for the Ludo game, allowing bots to automatically join games after a configurable delay.

## Files

- **`config.js`** - Main configuration file with constants, bot names, and utility functions
- **`config.test.js`** - Comprehensive unit tests for the configuration system
- **`README.md`** - This documentation file

## Features

### Bot Names

- **48 unique bot names** ranging from Greek letters (Alpha, Beta, Gamma...) to space-themed names (Nova, Galaxy, Cosmos...) to explorer names (Pioneer, Captain, Navigator)
- **Automatic name conflict resolution** with fallback suffixes (e.g., Alpha#1, Alpha#2)
- **Timestamp-based fallback** for extreme cases where all names are exhausted

### Configuration Options

All configuration values can be overridden via environment variables:

| Environment Variable        | Default Value | Description                               |
| --------------------------- | ------------- | ----------------------------------------- |
| `BOT_JOIN_DELAY_MS`         | 30000         | Delay before bot joins (30 seconds)       |
| `MAX_BOTS_PER_GAME`         | 3             | Maximum number of bots per game           |
| `BOT_MOVE_DELAY_MS`         | 2000          | Delay before bot makes a move (2 seconds) |
| `BOT_DICE_ROLL_DELAY_MS`    | 1500          | Delay before bot rolls dice (1.5 seconds) |
| `BOT_NAME_SUFFIX_SEPARATOR` | #             | Separator for duplicate names             |
| `MAX_NAME_ATTEMPTS`         | 10            | Maximum attempts to find unique name      |

### Environment Setup

1. Copy `env.example` to `.env` in the project root
2. Modify values as needed:

```bash
# Bot Configuration Overrides
BOT_JOIN_DELAY_MS=45000          # 45 seconds
MAX_BOTS_PER_GAME=2              # Only 2 bots max
BOT_MOVE_DELAY_MS=3000           # 3 seconds delay
BOT_NAME_SUFFIX_SEPARATOR=-      # Use dash instead of hash
```

## Usage

### Basic Configuration Access

```javascript
const {
  BOT_CONFIG,
  BOT_NAMES,
  generateUniqueBotName,
  getBotConfig,
} = require("./socket/bots/config");

// Get configuration
const config = getBotConfig();
console.log(`Bot join delay: ${config.JOIN_DELAY_MS}ms`);

// Generate unique bot name
const botName = generateUniqueBotName(existingPlayers, existingBotNames);
```

### Name Generation Examples

```javascript
// No conflicts - returns original name
generateUniqueBotName([], []); // Returns: "Alpha"

// Avoid player conflicts
const players = [{ name: "Alpha" }, { name: "Beta" }];
generateUniqueBotName(players, []); // Returns: "Gamma"

// Avoid bot conflicts
const botNames = ["Gamma", "Delta"];
generateUniqueBotName(players, botNames); // Returns: "Epsilon"

// Add suffix when needed
const allNamesTaken = BOT_NAMES.map((name) => ({ name }));
generateUniqueBotName(allNamesTaken, []); // Returns: "Alpha#1"

// Fallback with timestamp
// When all names + suffixes exhausted, returns: "Bot_abc123_def4"
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

The test suite covers:

- ✅ Bot name uniqueness and validation
- ✅ Configuration property validation
- ✅ Environment variable override handling
- ✅ Name conflict resolution logic
- ✅ Edge cases (null/undefined inputs)
- ✅ Integration scenarios
- ✅ Immutability of returned objects

Current coverage: **100% statements, 100% functions, 100% lines, 90.9% branches**

## Integration Points

This configuration system is designed to integrate with:

1. **Game Room Creation** - Set up bot joining timers
2. **Bot AI Logic** - Configure bot behavior timing
3. **Player Management** - Handle name conflicts with real players
4. **Game Flow** - Manage bot turn timing and delays

## Future Enhancements

- **Difficulty-based timing** - Different delays for easy/medium/hard bots
- **Dynamic configuration** - Runtime configuration changes
- **Bot personality system** - Different naming schemes per bot type
- **Localization** - Multi-language bot names
