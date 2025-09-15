# Bot Controller Implementation

## Overview

The `BotController` class handles bot turns in the Ludo game, automatically rolling dice and making moves when it's a bot's turn. It integrates seamlessly with the existing game system and emits the same events as human players.

## Key Features

### 1. **Automatic Bot Turn Management**

- **Game Start Detection**: Automatically identifies bot players when a game starts
- **Turn Scheduling**: Schedules bot turns with configurable reaction delays
- **Turn Execution**: Automatically executes complete bot turns (roll dice + make move)

### 2. **Intelligent Move Selection**

- **Legal Move Evaluation**: Uses existing `getMovableTokens`, `getNextPosition`, and `isSafePosition` functions
- **Priority-Based Selection**: Prioritizes winning moves, home moves, and safe positions
- **Difficulty-Based Behavior**: Different difficulty levels affect move selection and timing

### 3. **Event Emission**

- **Same Events as Humans**: Emits `rolling_dice`, `roll_dice`, `piece_moved`, and `room_update` events
- **Bot Action Logging**: Emits `botAction` events for monitoring and debugging
- **Game State Updates**: Maintains consistency with the existing game flow

## Implementation Details

### Core Methods

#### `handleGameStart(roomId)`

- Identifies bot players in the room
- Sets up tracking for active bots
- Schedules first bot turn if applicable

#### `handleTurnChange(roomId, currentTurn)`

- Detects when it becomes a bot's turn
- Automatically schedules the bot's turn execution

#### `scheduleBotTurn(roomId, botId)`

- Calculates reaction delay based on bot difficulty
- Sets up timer for automatic turn execution
- Prevents duplicate scheduling

#### `executeBotTurn(roomId, botId)`

- Orchestrates the complete bot turn sequence
- Rolls dice, evaluates moves, and makes the best move
- Handles errors and edge cases gracefully

### Bot Turn Sequence

1. **Turn Detection**: Bot controller detects it's a bot's turn
2. **Turn Scheduling**: Schedules execution with calculated delay
3. **Dice Rolling**: Automatically rolls dice for the bot
4. **Move Evaluation**: Identifies all legal moves
5. **Move Selection**: Selects the best move based on priority and difficulty
6. **Move Execution**: Applies the move using existing game logic
7. **Event Emission**: Emits appropriate events to update the game state

### Move Priority System

1. **Winning Moves**: Highest priority - moves that complete a piece
2. **Home Moves**: Second priority - moving pieces out of home (with roll 6)
3. **Safe Positions**: Third priority - moves to safe positions
4. **Strategic Considerations**: Additional logic for higher difficulty levels

### Difficulty Levels

- **Easy**: Slower reaction times, more random move selection
- **Medium**: Balanced reaction times, priority-based move selection
- **Hard**: Faster reaction times, strategic move selection

## Integration Points

### Game System Integration

The bot controller integrates with the existing game system through:

1. **Socket.io Events**: Listens for game state changes and emits bot actions
2. **Game Manager**: Accesses room and game state information
3. **Existing Utilities**: Uses `getMovableTokens`, `getNextPosition`, `isSafePosition`
4. **Event Handlers**: Integrates with `join_room`, `move_piece`, and `roll_dice` handlers

### Event Flow Integration

```javascript
// In handlers.js - Game start
if (room.players.length >= 2) {
  room.gameStatus = gameManager.GAME_STATUS.PLAYING;
  botController.handleGameStart(roomId);
}

// In handlers.js - Turn changes
io.to(roomId).emit("room_update", {
  /* ... */
});
if (room.currentTurn) {
  botController.handleTurnChange(roomId, room.currentTurn);
}

// In handlers.js - Game end
io.to(roomId).emit("game_over", matchResults);
botController.handleGameEnd(roomId);
```

## Configuration

### Environment Variables

```bash
# Bot behavior configuration
BOT_MOVE_DELAY_MS=2000          # Base delay before bot moves
BOT_DICE_ROLL_DELAY_MS=1500     # Delay after rolling dice
MAX_BOTS_PER_GAME=3             # Maximum bots per game
```

### Runtime Configuration

```javascript
const botController = new BotController({
  logger: customLogger, // Custom logger instance
  io: socketIoInstance, // Socket.io instance
});
```

## Event Emission

### Bot Actions

The controller emits `botAction` events for monitoring:

```javascript
{
  action: "turn_scheduled",
  timestamp: "2024-01-01T00:00:00.000Z",
  botId: "bot_123",
  botName: "Alpha",
  delay: 2000,
  difficulty: "medium"
}
```

### Game Events

Bots emit the same events as human players:

- `rolling_dice`: Dice rolling animation
- `roll_dice`: Dice roll result
- `piece_moved`: Piece movement
- `room_update`: Room state changes
- `piece_finished`: Piece completion
- `game_over`: Game completion

## Error Handling

### Graceful Degradation

- **Room Not Found**: Logs warning and continues
- **Game Status Changes**: Detects and aborts bot actions
- **Turn Changes**: Handles mid-execution turn changes
- **Database Errors**: Falls back to safe defaults

### Timer Management

- **Automatic Cleanup**: Cleans up timers when games end
- **Duplicate Prevention**: Prevents multiple timers for the same bot
- **Error Recovery**: Releases timers on failures

## Testing

### Test Coverage

The implementation includes comprehensive tests covering:

- **Initialization**: Bot controller setup and configuration
- **Game Lifecycle**: Start, turn changes, and end handling
- **Bot Behavior**: Turn scheduling, execution, and move selection
- **Error Scenarios**: Edge cases and failure modes
- **Integration**: Event emission and game state consistency

### Test Structure

```javascript
describe("BotController", () => {
  describe("Initialization", () => {
    /* ... */
  });
  describe("Game Start Handling", () => {
    /* ... */
  });
  describe("Turn Change Handling", () => {
    /* ... */
  });
  describe("Bot Turn Scheduling", () => {
    /* ... */
  });
  describe("Bot Turn Execution", () => {
    /* ... */
  });
  describe("Dice Rolling", () => {
    /* ... */
  });
  describe("Move Making", () => {
    /* ... */
  });
  describe("Timer Management", () => {
    /* ... */
  });
  describe("Error Handling", () => {
    /* ... */
  });
});
```

## Usage Examples

### Basic Integration

```javascript
// Initialize bot controller
const { botController } = require("./bots/controller");
botController.initialize(io);

// Bot controller automatically handles bot turns
// No additional code needed in game handlers
```

### Custom Configuration

```javascript
const botController = new BotController({
  logger: winstonLogger,
  customDelay: 3000,
});

botController.initialize(io);
```

### Monitoring Bot Actions

```javascript
// Listen for bot actions
socket.on("botAction", (action) => {
  console.log(`Bot action: ${action.action}`, action);
});
```

## Performance Considerations

### Timer Management

- **Efficient Scheduling**: Uses `setTimeout` with proper cleanup
- **Memory Management**: Automatic cleanup of completed operations
- **Scalability**: Supports multiple rooms and bots simultaneously

### Event Optimization

- **Minimal Overhead**: Only emits events when necessary
- **Batch Updates**: Groups related state changes
- **Conditional Emission**: Avoids unnecessary event emissions

## Future Enhancements

### Planned Features

1. **Advanced AI**: More sophisticated move selection algorithms
2. **Learning**: Bot behavior adaptation based on game outcomes
3. **Customization**: Player-configurable bot personalities
4. **Analytics**: Detailed bot performance metrics

### Scalability Improvements

1. **Distributed Processing**: Support for multiple game instances
2. **Queue Management**: Better handling of concurrent bot actions
3. **Caching**: Optimized game state access
4. **Load Balancing**: Distribution of bot processing across instances

## Conclusion

The Bot Controller provides a robust, scalable solution for automated bot gameplay in the Ludo game. It seamlessly integrates with the existing system while maintaining the same event flow and game logic as human players.

The implementation is designed to be:

- **Reliable**: Comprehensive error handling and graceful degradation
- **Efficient**: Optimized timer management and event emission
- **Maintainable**: Clear separation of concerns and comprehensive testing
- **Extensible**: Easy to add new features and configuration options

The system automatically handles bot turns without requiring changes to the core game logic, ensuring consistency and reliability across all gameplay scenarios.
