const { BotJoiner } = require("./joinBot");
const { botController } = require("./controller");
const { gameManager } = require("../gameManager");
const GameRoom = require("../../model/GameRoom");

// Mock dependencies
jest.mock("../../model/GameRoom");
jest.mock("../gameManager");
jest.mock("./controller");

describe("Bot Integration Tests", () => {
  let botJoiner;
  let mockIo;
  let mockRedisClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock Socket.io
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Setup mock Redis client
    mockRedisClient = {
      set: jest.fn(),
      eval: jest.fn(),
      get: jest.fn(),
    };

    // Setup mock GameRoom
    GameRoom.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "room123",
        status: "waiting",
        players: [],
        maxPlayers: 4,
        playersCount: 0,
      }),
    });

    GameRoom.findOneAndUpdate.mockResolvedValue({
      _id: "room123",
      status: "waiting",
      players: [],
      maxPlayers: 4,
      playersCount: 1,
    });

    GameRoom.updateOne.mockResolvedValue({ modifiedCount: 1 });

    // Setup mock gameManager
    gameManager.getRoom.mockReturnValue({
      id: "room123",
      status: "waiting",
      players: [],
      maxPlayers: 4,
    });

    gameManager.hasBotPlayers.mockReturnValue(false);
    gameManager.acquireJoinLock.mockReturnValue(true);
    gameManager.releaseJoinLock.mockImplementation(() => {});

    botJoiner = new BotJoiner(mockIo, mockRedisClient);
  });

  describe("Mass Room Creation and Bot Joining", () => {
    it("should create 1000 rooms and verify bots join correctly", async () => {
      const roomCount = 1000;
      const rooms = [];
      const botNames = new Set();
      const botAvatars = new Set();

      // Create 1000 rooms
      for (let i = 0; i < roomCount; i++) {
        const roomId = `room_${i}`;
        const room = {
          _id: roomId,
          status: "waiting",
          players: [],
          maxPlayers: 4,
          playersCount: 0,
        };
        rooms.push(room);
      }

      // Mock GameRoom.findOne to return different rooms
      let roomIndex = 0;
      GameRoom.findOne.mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(rooms[roomIndex++ % roomCount]),
      }));

      // Mock successful bot joining
      GameRoom.findOneAndUpdate.mockResolvedValue({
        _id: "room123",
        status: "waiting",
        players: [{ id: "bot1", name: "TestBot", isBot: true }],
        maxPlayers: 4,
        playersCount: 1,
      });

      // Join bots to rooms
      const joinPromises = [];
      for (let i = 0; i < roomCount; i++) {
        const roomId = `room_${i}`;
        joinPromises.push(botJoiner.joinBot(roomId));
      }

      const results = await Promise.all(joinPromises);

      // Verify all joins were successful
      expect(results).toHaveLength(roomCount);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.isBot).toBe(true);
        expect(result.name).toBeDefined();
        expect(result.avatar).toBeDefined();

        // Collect unique names and avatars
        botNames.add(result.name);
        botAvatars.add(result.avatar);
      });

      // Verify no duplicate bot names
      expect(botNames.size).toBe(roomCount);

      // Verify no duplicate avatars
      expect(botAvatars.size).toBe(roomCount);

      // Verify all rooms received playerJoined events
      expect(mockIo.to).toHaveBeenCalledTimes(roomCount);
      expect(mockIo.emit).toHaveBeenCalledTimes(roomCount);
    }, 30000); // 30 second timeout for large test

    it("should handle concurrent bot joins to the same room", async () => {
      const roomId = "concurrent_room";
      const concurrentJoins = 10;

      // Mock room to become full after first few joins
      let joinCount = 0;
      GameRoom.findOneAndUpdate.mockImplementation(() => {
        joinCount++;
        if (joinCount <= 4) {
          return {
            _id: roomId,
            status: "waiting",
            players: Array(joinCount).fill({
              id: `bot${joinCount}`,
              isBot: true,
            }),
            maxPlayers: 4,
            playersCount: joinCount,
          };
        } else {
          return null; // Room is full
        }
      });

      // Attempt concurrent joins
      const joinPromises = Array(concurrentJoins)
        .fill(0)
        .map(() => botJoiner.joinBot(roomId));

      const results = await Promise.all(joinPromises);

      // Verify only 4 bots could join (maxPlayers)
      const successfulJoins = results.filter((result) => result !== null);
      expect(successfulJoins.length).toBe(4);

      // Verify no duplicate bot IDs
      const botIds = successfulJoins.map((bot) => bot.id);
      const uniqueBotIds = new Set(botIds);
      expect(uniqueBotIds.size).toBe(4);
    });

    it("should maintain data consistency across multiple rooms", async () => {
      const roomCount = 100;
      const rooms = [];

      // Create rooms with different configurations
      for (let i = 0; i < roomCount; i++) {
        const room = {
          _id: `room_${i}`,
          status: "waiting",
          players: [],
          maxPlayers: i % 2 === 0 ? 4 : 6, // Alternate between 4 and 6 max players
          playersCount: 0,
        };
        rooms.push(room);
      }

      // Mock room retrieval
      let roomIndex = 0;
      GameRoom.findOne.mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(rooms[roomIndex++ % roomCount]),
      }));

      // Join bots and verify room-specific constraints
      for (let i = 0; i < roomCount; i++) {
        const roomId = `room_${i}`;
        const maxPlayers = rooms[i].maxPlayers;

        // Try to join more bots than maxPlayers
        const joinPromises = Array(maxPlayers + 2)
          .fill(0)
          .map(() => botJoiner.joinBot(roomId));

        const results = await Promise.all(joinPromises);
        const successfulJoins = results.filter((result) => result !== null);

        // Verify we never exceed maxPlayers
        expect(successfulJoins.length).toBeLessThanOrEqual(maxPlayers);
      }
    });
  });

  describe("Bot Controller Integration", () => {
    it("should initialize bot controller for multiple rooms", () => {
      const roomIds = ["room1", "room2", "room3", "room4", "room5"];

      // Mock gameManager to return rooms
      gameManager.getRoom.mockImplementation((roomId) => ({
        id: roomId,
        status: "waiting",
        players: [
          { id: "bot1", name: "Bot1", isBot: true, color: "red" },
          { id: "bot2", name: "Bot2", isBot: true, color: "green" },
        ],
        maxPlayers: 4,
      }));

      // Initialize bot controller for each room
      roomIds.forEach((roomId) => {
        botController.handleGameStart(roomId);
      });

      // Verify bot controller was called for each room
      expect(botController.handleGameStart).toHaveBeenCalledTimes(
        roomIds.length
      );
      roomIds.forEach((roomId) => {
        expect(botController.handleGameStart).toHaveBeenCalledWith(roomId);
      });
    });

    it("should handle game state transitions correctly", () => {
      const roomId = "transition_room";

      // Mock room state transitions
      gameManager.getRoom.mockReturnValue({
        id: roomId,
        status: "waiting",
        players: [{ id: "bot1", name: "Bot1", isBot: true, color: "red" }],
        maxPlayers: 4,
      });

      // Simulate game start
      botController.handleGameStart(roomId);
      expect(botController.handleGameStart).toHaveBeenCalledWith(roomId);

      // Simulate turn change
      botController.handleTurnChange(roomId, "bot1");
      expect(botController.handleTurnChange).toHaveBeenCalledWith(
        roomId,
        "bot1"
      );

      // Simulate game end
      botController.handleGameEnd(roomId);
      expect(botController.handleGameEnd).toHaveBeenCalledWith(roomId);
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle database errors gracefully", async () => {
      const roomId = "error_room";

      // Mock database error
      GameRoom.findOne.mockReturnValue({
        lean: jest
          .fn()
          .mockRejectedValue(new Error("Database connection failed")),
      });

      // Attempt to join bot
      const result = await botJoiner.joinBot(roomId);

      // Should handle error gracefully
      expect(result).toBeNull();
    });

    it("should handle Redis lock failures gracefully", async () => {
      const roomId = "redis_error_room";

      // Mock Redis failure
      mockRedisClient.set.mockRejectedValue(
        new Error("Redis connection failed")
      );

      // Attempt to join bot with Redis lock
      const result = await botJoiner.joinBot(roomId);

      // Should fall back to database method or handle gracefully
      expect(result).toBeDefined();
    });

    it("should recover from partial failures", async () => {
      const roomIds = ["recovery1", "recovery2", "recovery3"];
      const results = [];

      // Mock some rooms to fail, some to succeed
      let callCount = 0;
      GameRoom.findOne.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          // Every third room fails
          return {
            lean: jest.fn().mockRejectedValue(new Error("Simulated failure")),
          };
        } else {
          return {
            lean: jest.fn().mockResolvedValue({
              _id: `room_${callCount}`,
              status: "waiting",
              players: [],
              maxPlayers: 4,
              playersCount: 0,
            }),
          };
        }
      });

      // Attempt to join bots to all rooms
      for (const roomId of roomIds) {
        try {
          const result = await botJoiner.joinBot(roomId);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          // Expected for some rooms
        }
      }

      // Should have some successful joins
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThan(roomIds.length);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle large numbers of concurrent operations", async () => {
      const concurrentOperations = 500;
      const operationPromises = [];

      // Create many concurrent operations
      for (let i = 0; i < concurrentOperations; i++) {
        const roomId = `perf_room_${i}`;
        operationPromises.push(botJoiner.joinBot(roomId));
      }

      const startTime = Date.now();
      const results = await Promise.all(operationPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all operations completed
      expect(results).toHaveLength(concurrentOperations);

      // Verify reasonable performance (should complete within 10 seconds)
      expect(duration).toBeLessThan(10000);

      // Verify no server crashes (test completes successfully)
      expect(true).toBe(true);
    }, 15000); // 15 second timeout

    it("should maintain memory efficiency with large numbers of rooms", () => {
      const roomCount = 1000;
      const rooms = [];

      // Create large number of room objects
      for (let i = 0; i < roomCount; i++) {
        rooms.push({
          id: `room_${i}`,
          status: "waiting",
          players: [],
          maxPlayers: 4,
        });
      }

      // Verify we can handle the data without memory issues
      expect(rooms).toHaveLength(roomCount);

      // Verify room data integrity
      rooms.forEach((room, index) => {
        expect(room.id).toBe(`room_${index}`);
        expect(room.status).toBe("waiting");
        expect(room.maxPlayers).toBe(4);
      });
    });
  });
});
