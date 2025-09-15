// Mock dependencies first
jest.mock('../../model/GameRoom');
jest.mock('../gameManager');

// Then import after mocking
const { RoomWatcher, roomWatcher } = require('./roomWatcher');
const { getBotConfig } = require('./config');
const GameRoom = require('../../model/GameRoom');

// Mock Redis client
const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
};

describe('RoomWatcher', () => {
  let watcher;
  let mockLogger;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up GameRoom.find mock
    GameRoom.find = jest.fn();
    
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    // Create fresh watcher instance
    watcher = new RoomWatcher({
      logger: mockLogger,
      useRedis: false
    });
    
    // Mock Date.now() for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1000000000000); // Fixed timestamp
  });
  
  afterEach(() => {
    if (watcher.isRunning) {
      watcher.stop();
    }
    jest.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default values', () => {
      expect(watcher.isRunning).toBe(false);
      expect(watcher.sweepInterval).toBeNull();
      expect(watcher.pendingJoins).toBeInstanceOf(Map);
      expect(watcher.useRedis).toBe(false);
      expect(watcher.redisClient).toBeNull();
      expect(watcher.logger).toBe(mockLogger);
    });

    test('should initialize with Redis options', () => {
      const redisWatcher = new RoomWatcher({
        useRedis: true,
        redisClient: mockRedisClient,
        logger: mockLogger
      });
      
      expect(redisWatcher.useRedis).toBe(true);
      expect(redisWatcher.redisClient).toBe(mockRedisClient);
    });
  });

  describe('Start/Stop', () => {
    test('should start successfully', () => {
      watcher.start();
      
      expect(watcher.isRunning).toBe(true);
      expect(watcher.sweepInterval).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Started with 5000ms sweep interval'));
    });

    test('should not start if already running', () => {
      watcher.start();
      watcher.start(); // Try to start again
      
      expect(mockLogger.warn).toHaveBeenCalledWith('[RoomWatcher] Already running');
    });

    test('should stop successfully', () => {
      watcher.start();
      watcher.stop();
      
      expect(watcher.isRunning).toBe(false);
      expect(watcher.sweepInterval).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('[RoomWatcher] Stopped');
    });

    test('should not stop if not running', () => {
      watcher.stop(); // Try to stop when not running
      
      expect(mockLogger.warn).toHaveBeenCalledWith('[RoomWatcher] Not running');
    });

    test('should clear pending joins on stop', () => {
      watcher.pendingJoins.set('room1', { scheduledAt: Date.now() });
      watcher.start();
      watcher.stop();
      
      expect(watcher.pendingJoins.size).toBe(0);
    });
  });

  describe('Sweep Functionality', () => {
    beforeEach(() => {
      // Mock GameRoom.find to return test data
      GameRoom.find.mockResolvedValue([]);
    });

    test('should perform sweep on start', async () => {
      const sweepSpy = jest.spyOn(watcher, 'sweep');
      watcher.start();
      
      // Wait for initial sweep
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(sweepSpy).toHaveBeenCalled();
    });

    test('should handle sweep errors gracefully', async () => {
      GameRoom.find.mockRejectedValue(new Error('Database error'));
      
      await watcher.sweep();
      
      expect(mockLogger.error).toHaveBeenCalledWith('[RoomWatcher] Error during sweep:', expect.any(Error));
    });

    test('should calculate correct cutoff time', async () => {
      const BOT_CONFIG = getBotConfig();
      const expectedCutoffTime = Date.now() - BOT_CONFIG.JOIN_DELAY_MS;
      
      await watcher.sweep();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(new Date(expectedCutoffTime).toISOString())
      );
    });
  });

  describe('Room Eligibility Detection', () => {
    test('should find eligible rooms', async () => {
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [{ name: 'Player1' }],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 35000), // 35 seconds ago
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 eligible rooms for bot joining')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Room room1 eligible: 1/4 players, 3 bots allowed')
      );
    });

    test('should exclude rooms that are not waiting', async () => {
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [{ name: 'Player1' }],
          gameStatus: 'playing', // Not waiting
          createdAt: new Date(Date.now() - 35000),
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Found 1 eligible rooms')
      );
    });

    test('should exclude rooms that are too recent', async () => {
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [{ name: 'Player1' }],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 25000), // 25 seconds ago (less than 30s delay)
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Found 1 eligible rooms')
      );
    });

    test('should exclude full rooms', async () => {
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [
            { name: 'Player1' },
            { name: 'Player2' },
            { name: 'Player3' },
            { name: 'Player4' }
          ],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 35000),
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Found 1 eligible rooms')
      );
    });

    test('should exclude already pending rooms', async () => {
      // Mark a room as pending first
      watcher.pendingJoins.set('room1', { scheduledAt: Date.now() });
      
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [{ name: 'Player1' }],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 35000),
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Found 1 eligible rooms')
      );
    });
  });

  describe('Pending Room Management', () => {
    test('should mark room as pending in memory', async () => {
      const roomId = 'room1';
      const joinData = {
        roomId,
        maxBotsAllowed: 3,
        currentPlayerCount: 1,
        gameSettings: { stake: 10, requiredPieces: 2 }
      };
      
      await watcher.markRoomAsPending(roomId, joinData);
      
      expect(watcher.pendingJoins.has(roomId)).toBe(true);
      expect(watcher.pendingJoins.get(roomId)).toMatchObject({
        ...joinData,
        scheduledAt: expect.any(Number),
        attempts: 0
      });
    });

    test('should prevent duplicate pending rooms', async () => {
      const roomId = 'room1';
      const joinData = { roomId, maxBotsAllowed: 3, currentPlayerCount: 1 };
      
      // Mark as pending first time
      await watcher.markRoomAsPending(roomId, joinData);
      
      // Try to mark again
      await expect(watcher.markRoomAsPending(roomId, joinData))
        .rejects.toThrow(`Room ${roomId} already marked as pending`);
    });

    test('should check if room is pending', () => {
      const roomId = 'room1';
      
      expect(watcher.isRoomPending(roomId)).toBe(false);
      
      watcher.pendingJoins.set(roomId, { scheduledAt: Date.now() });
      
      expect(watcher.isRoomPending(roomId)).toBe(true);
    });

    test('should clear pending room', async () => {
      const roomId = 'room1';
      watcher.pendingJoins.set(roomId, { scheduledAt: Date.now() });
      
      await watcher.clearPendingRoom(roomId);
      
      expect(watcher.pendingJoins.has(roomId)).toBe(false);
    });

    test('should emit bot join pending event', async () => {
      const emitSpy = jest.spyOn(watcher, 'emitBotJoinPending');
      const roomId = 'room1';
      const joinData = { roomId, maxBotsAllowed: 3, currentPlayerCount: 1 };
      
      await watcher.markRoomAsPending(roomId, joinData);
      
      expect(emitSpy).toHaveBeenCalledWith(roomId, joinData);
    });
  });

  describe('Redis Integration', () => {
    let redisWatcher;
    
    beforeEach(() => {
      redisWatcher = new RoomWatcher({
        useRedis: true,
        redisClient: mockRedisClient,
        logger: mockLogger
      });
    });

    test('should mark room as pending in Redis', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      
      const roomId = 'room1';
      const joinData = { roomId, maxBotsAllowed: 3, currentPlayerCount: 1 };
      
      await redisWatcher.markRoomAsPending(roomId, joinData);
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `bot_join_pending:${roomId}`,
        expect.stringContaining(roomId),
        'EX',
        300,
        'NX'
      );
    });

    test('should handle Redis set failure', async () => {
      mockRedisClient.set.mockResolvedValue(null); // NX failed
      
      const roomId = 'room1';
      const joinData = { roomId, maxBotsAllowed: 3, currentPlayerCount: 1 };
      
      await expect(redisWatcher.markRoomAsPending(roomId, joinData))
        .rejects.toThrow(`Room ${roomId} already marked as pending`);
    });

    test('should check Redis pending status', async () => {
      mockRedisClient.get.mockResolvedValue('{"roomId":"room1"}');
      
      const result = await redisWatcher.isRoomPending('room1');
      
      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith('bot_join_pending:room1');
    });

    test('should clear Redis pending room', async () => {
      await redisWatcher.clearPendingRoom('room1');
      
      expect(mockRedisClient.del).toHaveBeenCalledWith('bot_join_pending:room1');
    });

    test('should get Redis pending room IDs', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'bot_join_pending:room1',
        'bot_join_pending:room2'
      ]);
      
      const result = await redisWatcher.getRedisPendingRoomIds();
      
      expect(result).toEqual(['room1', 'room2']);
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should cleanup expired pending joins', () => {
      const now = Date.now();
      const BOT_CONFIG = getBotConfig();
      const oldTimestamp = now - (BOT_CONFIG.JOIN_DELAY_MS * 3); // Very old
      
      watcher.pendingJoins.set('oldRoom', { scheduledAt: oldTimestamp });
      watcher.pendingJoins.set('newRoom', { scheduledAt: now });
      
      watcher.cleanupExpiredPendingJoins(now);
      
      expect(watcher.pendingJoins.has('oldRoom')).toBe(false);
      expect(watcher.pendingJoins.has('newRoom')).toBe(true);
    });

    test('should get status information', () => {
      const status = watcher.getStatus();
      
      expect(status).toMatchObject({
        isRunning: false,
        sweepInterval: 5000,
        pendingJoinsCount: 0,
        useRedis: false,
        botConfig: {
          joinDelayMs: expect.any(Number),
          maxBotsPerGame: expect.any(Number)
        }
      });
    });

    test('should get pending joins for debugging', () => {
      const roomId = 'room1';
      const joinData = { roomId, maxBotsAllowed: 3, currentPlayerCount: 1 };
      
      watcher.pendingJoins.set(roomId, joinData);
      
      const pendingJoins = watcher.getPendingJoins();
      
      expect(pendingJoins).toHaveLength(1);
      expect(pendingJoins[0]).toMatchObject({
        roomId,
        ...joinData
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete bot joining flow', async () => {
      // Create a room that's ready for bot joining
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [{ name: 'Player1' }],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 35000), // 35 seconds ago
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      // Start watcher and perform sweep
      watcher.start();
      await watcher.sweep();
      
      // Verify room was marked as pending
      expect(watcher.pendingJoins.has('room1')).toBe(true);
      expect(watcher.pendingJoins.get('room1')).toMatchObject({
        roomId: 'room1',
        maxBotsAllowed: 3,
        currentPlayerCount: 1,
        scheduledAt: expect.any(Number),
        attempts: 0
      });
      
      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Room room1 marked as pending for bot joining')
      );
    });

    test('should handle multiple eligible rooms', async () => {
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: [{ name: 'Player1' }],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 35000),
          gameSettings: { stake: 10, requiredPieces: 2 }
        },
        {
          _id: 'room2',
          roomId: 'room2',
          players: [{ name: 'Player1' }, { name: 'Player2' }],
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 40000),
          gameSettings: { stake: 20, requiredPieces: 3 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(watcher.pendingJoins.size).toBe(2);
      expect(watcher.pendingJoins.get('room1')).toMatchObject({
        maxBotsAllowed: 3,
        currentPlayerCount: 1
      });
      expect(watcher.pendingJoins.get('room2')).toMatchObject({
        maxBotsAllowed: 2,
        currentPlayerCount: 2
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle database query errors gracefully', async () => {
      GameRoom.find.mockRejectedValue(new Error('Connection timeout'));
      
      await watcher.sweep();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[RoomWatcher] Error finding eligible rooms:',
        expect.any(Error)
      );
    });

    test('should handle Redis errors gracefully', async () => {
      const redisWatcher = new RoomWatcher({
        useRedis: true,
        redisClient: mockRedisClient,
        logger: mockLogger
      });
      
      mockRedisClient.set.mockRejectedValue(new Error('Redis connection failed'));
      
      const roomId = 'room1';
      const joinData = { roomId, maxBotsAllowed: 3, currentPlayerCount: 1 };
      
      await redisWatcher.markRoomAsPending(roomId, joinData);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error marking room room1 as pending:'),
        expect.any(Error)
      );
    });

    test('should handle room processing errors gracefully', async () => {
      const mockRooms = [
        {
          _id: 'room1',
          roomId: 'room1',
          players: null, // This will cause an error
          gameStatus: 'waiting',
          createdAt: new Date(Date.now() - 35000),
          gameSettings: { stake: 10, requiredPieces: 2 }
        }
      ];
      
      GameRoom.find.mockResolvedValue(mockRooms);
      
      await watcher.sweep();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing room room1:'),
        expect.any(Error)
      );
    });
  });
});

describe('roomWatcher Singleton', () => {
  test('should export singleton instance', () => {
    expect(roomWatcher).toBeInstanceOf(RoomWatcher);
    expect(roomWatcher.isRunning).toBe(false);
  });
});
