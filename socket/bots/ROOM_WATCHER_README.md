# Room Watcher System

The Room Watcher is a core component of the bot system that automatically monitors game rooms and identifies when they're ready for bot joining after a configurable delay.

## Overview

The Room Watcher performs periodic sweeps (every 5 seconds) to find rooms that meet the criteria for bot joining:
- **Status**: `waiting` (game hasn't started yet)
- **Age**: Created at least `BOT_JOIN_DELAY_MS` ago (default: 30 seconds)
- **Capacity**: Has fewer than 4 players (standard Ludo game max)

## Architecture

### Core Components

1. **Periodic Sweeper**: Runs every 5 seconds to scan for eligible rooms
2. **Eligibility Checker**: Validates rooms against bot joining criteria
3. **Pending Room Manager**: Tracks rooms marked for bot joining
4. **Storage Backends**: Supports both in-memory and Redis storage

### Storage Variants

#### In-Memory Storage (Default)
- Uses JavaScript `Map` for storing pending rooms
- Fast and simple for single-instance deployments
- Data lost on server restart

#### Redis Storage
- Atomic operations with `SET NX EX` for race condition prevention
- Persistent across server restarts
- Suitable for multi-instance deployments
- Automatic expiry (5 minutes) for cleanup

## Usage

### Basic Setup

```javascript
const { RoomWatcher } = require('./socket/bots/roomWatcher');

// Create in-memory watcher
const watcher = new RoomWatcher({
  logger: console,
  useRedis: false
});

// Start monitoring
watcher.start();
```

### Redis Setup

```javascript
const redis = require('redis');
const redisClient = redis.createClient();

const watcher = new RoomWatcher({
  useRedis: true,
  redisClient: redisClient,
  logger: console
});

watcher.start();
```

### Configuration Options

```javascript
const watcher = new RoomWatcher({
  useRedis: false,           // Use Redis or in-memory storage
  redisClient: null,         // Redis client instance
  logger: console,           // Logger instance
});
```

## API Reference

### Methods

#### `start()`
Starts the room watcher and begins periodic sweeps.

```javascript
watcher.start();
// Logs: "[RoomWatcher] Started with 5000ms sweep interval"
```

#### `stop()`
Stops the room watcher and clears all pending joins.

```javascript
watcher.stop();
// Logs: "[RoomWatcher] Stopped"
```

#### `sweep()`
Performs a manual sweep for eligible rooms.

```javascript
await watcher.sweep();
// Finds and processes eligible rooms
```

#### `markRoomAsPending(roomId, joinData)`
Marks a room as pending for bot joining.

```javascript
await watcher.markRoomAsPending('room123', {
  roomId: 'room123',
  maxBotsAllowed: 3,
  currentPlayerCount: 1,
  gameSettings: { stake: 10, requiredPieces: 2 }
});
```

#### `isRoomPending(roomId)`
Checks if a room is pending for bot joining.

```javascript
const isPending = await watcher.isRoomPending('room123');
// Returns: true/false
```

#### `clearPendingRoom(roomId)`
Removes a room from pending status.

```javascript
await watcher.clearPendingRoom('room123');
```

#### `getStatus()`
Returns current watcher status.

```javascript
const status = watcher.getStatus();
// Returns: {
//   isRunning: true,
//   sweepInterval: 5000,
//   pendingJoinsCount: 1,
//   useRedis: false,
//   botConfig: { joinDelayMs: 30000, maxBotsPerGame: 3 }
// }
```

#### `getPendingJoins()`
Returns all pending room joins.

```javascript
const pendingJoins = await watcher.getPendingJoins();
// Returns array of pending room data
```

## How It Works

### 1. Periodic Sweeping
Every 5 seconds, the watcher queries the database for eligible rooms:

```javascript
const query = {
  gameStatus: 'waiting',
  createdAt: { $lte: new Date(cutoffTime) },
  $expr: { $lt: [{ $size: '$players' }, 4] }
};
```

### 2. Eligibility Criteria
A room is eligible if:
- `gameStatus === 'waiting'`
- `createdAt <= now - BOT_JOIN_DELAY_MS` (30 seconds default)
- `players.length < 4`

### 3. Pending Room Management
Eligible rooms are marked as pending with:
- Room ID and metadata
- Timestamp when marked pending
- Attempt counter for retry logic

### 4. Event Emission
When a room is marked pending, it emits a `bot_join_pending` event:

```javascript
// TODO: Integrate with event system
// global.io.emit('bot_join_pending', { roomId, ...joinData });
```

## Integration Points

### Bot Manager
The Room Watcher signals the Bot Manager when rooms are ready:

```javascript
// In roomWatcher.js
emitBotJoinPending(roomId, joinData) {
  // This will be handled by the bot manager
  // global.io.emit('bot_join_pending', { roomId, ...joinData });
}
```

### Game Flow
The system integrates with:
- Room creation and status updates
- Player joining/disconnection
- Game state transitions

## Testing

### Unit Tests
Run the comprehensive test suite:

```bash
npm test socket/bots/roomWatcher.test.js
```

### Manual Testing
Test the room watcher functionality:

```bash
# Test basic functionality
node socket/bots/simple-test.js

# Test with room creation scenario
node socket/bots/demo-room-watcher.js
```

### Test Scenarios

1. **Room Too New**: Room created < 30 seconds ago should not be eligible
2. **Room Eligible**: Room created > 30 seconds ago should be marked pending
3. **Full Room**: Room with 4 players should not be eligible
4. **Game Started**: Room with status 'playing' should not be eligible
5. **Already Pending**: Room already marked pending should not be re-marked

## Configuration

### Environment Variables

All timing values can be overridden via environment variables:

```bash
# Bot joining delay (default: 30 seconds)
BOT_JOIN_DELAY_MS=30000

# Maximum bots per game (default: 3)
MAX_BOTS_PER_GAME=3
```

### Sweep Interval

The sweep interval is hardcoded to 5 seconds for optimal performance:

```javascript
const SWEEP_INTERVAL_MS = 5000; // 5 seconds
```

## Performance Considerations

### Database Queries
- Uses MongoDB aggregation with `$expr` for player count
- Indexes on `gameStatus`, `createdAt`, and `players` recommended
- Query excludes already pending rooms to avoid duplicates

### Memory Usage
- In-memory storage: ~100 bytes per pending room
- Redis storage: ~200 bytes per pending room (JSON + overhead)
- Automatic cleanup of expired pending rooms

### Scalability
- Single watcher instance per server
- Redis backend supports multiple server instances
- Atomic operations prevent race conditions

## Error Handling

### Database Errors
- Graceful fallback on query failures
- Logs errors without crashing
- Continues operation on next sweep cycle

### Redis Errors
- Falls back to in-memory operations if Redis fails
- Logs connection and operation errors
- Maintains system stability

### Room Processing Errors
- Individual room failures don't affect others
- Detailed error logging for debugging
- Continues processing remaining rooms

## Monitoring and Debugging

### Status Monitoring
```javascript
const status = watcher.getStatus();
console.log(`Watcher running: ${status.isRunning}`);
console.log(`Pending rooms: ${status.pendingJoinsCount}`);
```

### Logging
The system provides comprehensive logging:
- Info: Normal operations and status changes
- Debug: Detailed sweep information
- Warn: Non-critical issues
- Error: Critical failures and exceptions

### Debugging Pending Rooms
```javascript
const pendingJoins = await watcher.getPendingJoins();
pendingJoins.forEach(join => {
  console.log(`Room ${join.roomId}: ${join.maxBotsAllowed} bots allowed`);
});
```

## Future Enhancements

### Planned Features
- **Difficulty-based timing**: Different delays for easy/medium/hard bots
- **Dynamic configuration**: Runtime configuration changes
- **Metrics collection**: Performance and usage statistics
- **Webhook integration**: External notifications for pending rooms

### Potential Optimizations
- **Batch processing**: Process multiple rooms in single sweep
- **Smart scheduling**: Adaptive sweep intervals based on activity
- **Predictive joining**: Anticipate room eligibility before delay expires
- **Load balancing**: Distribute bot joining across multiple instances

## Troubleshooting

### Common Issues

#### Room Not Being Marked Pending
1. Check room age is > 30 seconds
2. Verify room status is 'waiting'
3. Confirm room has < 4 players
4. Check if room already marked pending

#### Redis Connection Issues
1. Verify Redis server is running
2. Check connection credentials
3. Ensure Redis client is properly initialized
4. Fall back to in-memory storage if needed

#### High Memory Usage
1. Check for memory leaks in pending joins
2. Verify cleanup is working properly
3. Monitor pending room count
4. Restart watcher if necessary

### Debug Commands
```javascript
// Check watcher status
console.log(watcher.getStatus());

// List all pending rooms
console.log(await watcher.getPendingJoins());

// Check specific room
console.log(await watcher.isRoomPending('room123'));

// Manual sweep
await watcher.sweep();
```

## Conclusion

The Room Watcher provides a robust, scalable solution for automatically identifying rooms ready for bot joining. With support for both in-memory and Redis storage, it can be deployed in various environments while maintaining performance and reliability.

The system is designed to be:
- **Efficient**: Minimal database queries with smart filtering
- **Reliable**: Graceful error handling and recovery
- **Scalable**: Redis backend for multi-instance deployments
- **Configurable**: Environment variable overrides for all timing values
- **Monitorable**: Comprehensive logging and status reporting
