# Bot Replacement Implementation

## Overview

This document describes the implementation of bot replacement functionality when human players join rooms that contain bot players. The system atomically removes the last-joined bot and replaces it with the human player, ensuring data consistency and proper event emission.

## Key Features

### 1. Atomic Bot Replacement
- **Status Verification**: Checks that room status is 'waiting' before allowing bot replacement
- **Bot Identification**: Identifies the last-joined bot using `joinedAt` timestamp
- **Atomic Operations**: Uses MongoDB's atomic operations to prevent race conditions
- **Redis Lock Support**: Optional Redis-based locking for distributed environments

### 2. Event Emission
- **playerLeft Event**: Emitted when a bot is removed (includes bot name/id and reason)
- **playerJoined Event**: Emitted when a human player joins
- **room_update Event**: Emitted to reflect the new room state

### 3. Race Condition Prevention
- **Join Lock Mechanism**: In-memory locks prevent multiple simultaneous joins
- **Database Atomicity**: MongoDB operations ensure consistency
- **Error Handling**: Proper cleanup of locks and state on failures

## Implementation Details

### GameManager Extensions

#### New Methods Added:
```javascript
// Bot management
removeLastJoinedBot(roomId)           // Removes last-joined bot and clears timers
hasBotPlayers(roomId)                 // Checks if room contains bots
getBotPlayerCount(roomId)             // Returns count of bot players
getHumanPlayerCount(roomId)           // Returns count of human players

// Join lock management
acquireJoinLock(roomId)               // Acquires join lock for a room
releaseJoinLock(roomId)               // Releases join lock
isJoinLocked(roomId)                  // Checks if room is locked for joins
```

#### RoomState Extensions:
```javascript
class RoomState {
  constructor(roomId) {
    // ... existing properties
    this.joinLock = false;            // Simple in-memory lock for join operations
  }

  acquireJoinLock()                    // Acquires join lock
  releaseJoinLock()                    // Releases join lock
}
```

### Bot Replacement Functions

#### Main Function:
```javascript
async function handleBotReplacement(roomId, humanPlayer, io, options = {})
```

#### Redis Lock Version:
```javascript
async function handleBotReplacementWithRedisLock(roomId, humanPlayer, io, redisClient)
```

#### Atomic Database Version:
```javascript
async function handleBotReplacementWithAtomicUpdate(roomId, humanPlayer, io)
```

### Join Room Handler Modifications

The `join_room` socket handler has been enhanced with:

1. **Join Lock Acquisition**: Prevents multiple simultaneous joins
2. **Bot Detection**: Checks if room contains bot players
3. **Bot Replacement**: Atomically replaces bots with human players
4. **Proper Cleanup**: Ensures locks are released in all scenarios

## Usage Examples

### Basic Bot Replacement
```javascript
// When a human joins a room with bots:
socket.on("join_room", async ({ roomId }) => {
  // ... validation logic
  
  if (gameManager.hasBotPlayers(roomId)) {
    // Replace a bot with the human player
    const removedBot = await handleBotReplacement(roomId, humanPlayer, io);
    if (removedBot) {
      console.log(`Bot ${removedBot.name} replaced by human ${humanPlayer.name}`);
    }
  }
  
  // ... continue with normal join logic
});
```

### Redis-Enabled Bot Replacement
```javascript
// With Redis support:
const removedBot = await handleBotReplacement(roomId, humanPlayer, io, {
  useRedisLock: true,
  redisClient: redisClient
});
```

## Event Flow

### Bot Replacement Event Sequence:
1. **Human joins room** → `join_room` event
2. **Join lock acquired** → Prevents other joins
3. **Bot detection** → Check if room has bots
4. **Bot removal** → Atomic database update
5. **playerLeft event** → Notify room about bot departure
6. **Human addition** → Add human to room
7. **playerJoined event** → Notify room about human arrival
8. **room_update event** → Update room state
9. **Join lock released** → Allow other joins

### Event Payloads:

#### playerLeft Event:
```javascript
{
  id: "bot_1234567890_abc123",
  name: "Alpha",
  reason: "replaced_by_human"
}
```

#### playerJoined Event:
```javascript
{
  id: "socket_123",
  userId: "user_456",
  name: "JohnDoe",
  color: "green",
  isBot: false,
  joinedAt: "2024-01-01T00:00:00.000Z"
}
```

## Error Handling

### Lock Management:
- **Automatic Release**: Locks are released in `finally` blocks
- **Error Recovery**: Locks are released even if errors occur
- **Timeout Protection**: Redis locks have 10-second timeout

### Database Consistency:
- **Atomic Operations**: MongoDB operations prevent partial updates
- **State Verification**: Post-update verification ensures consistency
- **Rollback Support**: In-memory state changes are reverted on database failures

### Edge Cases Handled:
- **Room Status Changes**: Detects if room status changes during replacement
- **Bot Count Changes**: Handles cases where bot count changes unexpectedly
- **Concurrent Joins**: Prevents multiple humans from replacing the same bot
- **Database Failures**: Graceful degradation and error reporting

## Configuration Options

### Environment Variables:
```bash
# Redis configuration (optional)
USE_REDIS_LOCK=true
REDIS_URL=redis://localhost:6379

# Bot replacement settings
BOT_REPLACEMENT_TIMEOUT=10000  # 10 seconds
MAX_CONCURRENT_JOINS=1         # Maximum simultaneous joins per room
```

### Runtime Options:
```javascript
const options = {
  useRedisLock: false,         // Enable Redis locks
  redisClient: null,           // Redis client instance
  timeout: 10000,              // Lock timeout in milliseconds
  logger: console              // Custom logger
};
```

## Testing

### Test Coverage:
- **Bot Replacement Logic**: Verifies correct bot identification and removal
- **Join Lock Mechanism**: Tests concurrent join prevention
- **Event Emission**: Validates correct event sequence and payloads
- **Error Scenarios**: Tests various failure modes and recovery
- **Database Consistency**: Ensures in-memory and database state alignment

### Running Tests:
```bash
# Run bot replacement tests
npm test -- socket/bots/botReplacement.test.js

# Run all bot-related tests
npm test -- socket/bots/
```

## Performance Considerations

### Lock Duration:
- **Minimal Lock Time**: Locks are held only during critical operations
- **Efficient Cleanup**: Quick lock release in finally blocks
- **Timeout Protection**: Prevents deadlocks with configurable timeouts

### Database Operations:
- **Atomic Updates**: Single database operation for bot removal
- **Efficient Queries**: Optimized MongoDB queries with proper indexing
- **Connection Pooling**: Reuses database connections for better performance

### Memory Management:
- **In-Memory Locks**: Lightweight join locks without external dependencies
- **State Cleanup**: Proper cleanup of bot-related timers and state
- **Garbage Collection**: Automatic cleanup of completed operations

## Future Enhancements

### Planned Features:
1. **Queue System**: Handle multiple join requests in order
2. **Priority Joins**: Allow VIP users to bypass join locks
3. **Distributed Locks**: Redis-based locks for multi-instance deployments
4. **Metrics Collection**: Track bot replacement statistics
5. **Admin Controls**: Manual bot replacement via admin interface

### Scalability Improvements:
1. **Connection Pooling**: Better database connection management
2. **Caching Layer**: Redis-based caching for frequently accessed data
3. **Async Processing**: Background processing for non-critical operations
4. **Load Balancing**: Distribute join requests across multiple instances

## Troubleshooting

### Common Issues:

#### Lock Not Released:
```javascript
// Check if lock is properly released in finally block
try {
  // ... operations
} finally {
  gameManager.releaseJoinLock(roomId);
}
```

#### Bot Not Replaced:
```javascript
// Verify room eligibility
if (!gameManager.hasBotPlayers(roomId)) {
  console.log("Room has no bots to replace");
  return;
}
```

#### Database Inconsistency:
```javascript
// Check post-update verification
const updatedRoom = await GameRoom.findOne({ roomId }).lean();
if (!updatedRoom || updatedRoom.gameStatus !== "waiting") {
  console.log("Room state changed after update");
  return;
}
```

### Debug Logging:
```javascript
// Enable debug logging
console.log(`[BotReplacement] Room ${roomId} state:`, {
  hasBots: gameManager.hasBotPlayers(roomId),
  botCount: gameManager.getBotPlayerCount(roomId),
  humanCount: gameManager.getHumanPlayerCount(roomId),
  isLocked: gameManager.isJoinLocked(roomId)
});
```

## Conclusion

The bot replacement implementation provides a robust, scalable solution for handling human players joining rooms with bots. It ensures data consistency, prevents race conditions, and maintains proper event flow while supporting both single-instance and distributed deployments.

The system is designed to be:
- **Reliable**: Atomic operations and proper error handling
- **Scalable**: Support for Redis locks and distributed environments
- **Maintainable**: Clear separation of concerns and comprehensive testing
- **Extensible**: Easy to add new features and configuration options
