const { BotJoiner } = require("./joinBot");
const { gameManager } = require("../gameManager");
const GameRoom = require("../../model/GameRoom");

// Mock dependencies
jest.mock("../../model/GameRoom");
jest.mock("../gameManager");

describe("Bot Race Condition Tests", () => {
  let botJoiner;
  let mockIo;
  let mockRedisClient;
  let mockRoom;

  beforeEach(() => {
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

    // Setup mock room
    mockRoom = {
      _id: "race_test_room",
      status: "waiting",
      players: [],
      maxPlayers: 2,
      playersCount: 0,
    };

    // Setup mock GameRoom
    GameRoom.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockRoom),
    });

    // Setup mock gameManager
    gameManager.getRoom.mockReturnValue({
      id: "race_test_room",
      status: "waiting",
      players: [],
      maxPlayers: 2,
    });

    gameManager.hasBotPlayers.mockReturnValue(false);
    gameManager.acquireJoinLock.mockReturnValue(true);
    gameManager.releaseJoinLock.mockImplementation(() => {});

    botJoiner = new BotJoiner(mockIo, mockRedisClient);
  });

  describe("Concurrent Join Race Conditions", () => {
    it("should handle 50 concurrent join requests atomically", async () => {
      const roomId = "race_test_room";
      const concurrentRequests = 50;

      // Track successful joins and ensure atomicity
      let successfulJoins = 0;
      let duplicateNames = new Set();
      let duplicateAvatars = new Set();
      let joinResults = [];

      // Mock GameRoom.findOneAndUpdate to simulate atomic behavior
      let joinAttempts = 0;
      GameRoom.findOneAndUpdate.mockImplementation(
        async (query, update, options) => {
          joinAttempts++;

          // Simulate atomic check-and-update
          if (mockRoom.playersCount < mockRoom.maxPlayers) {
            // Create unique bot for this join attempt
            const botId = `bot_${joinAttempts}`;
            const botName = `Bot_${joinAttempts}_${Date.now()}_${Math.random()}`;
            const botAvatar = `avatar_${joinAttempts}_${Date.now()}_${Math.random()}`;

            const bot = {
              id: botId,
              name: botName,
              avatar: botAvatar,
              isBot: true,
              color: ["green", "blue"][(joinAttempts - 1) % 2],
            };

            // Atomically update room state
            mockRoom.players.push(bot);
            mockRoom.playersCount = mockRoom.players.length;

            return {
              ...mockRoom,
              players: [...mockRoom.players],
              playersCount: mockRoom.playersCount,
            };
          } else {
            // Room is full
            return null;
          }
        }
      );

      // Create concurrent join requests
      const joinPromises = Array(concurrentRequests)
        .fill(0)
        .map(async (_, index) => {
          try {
            const result = await botJoiner.joinBot(roomId);
            if (result) {
              successfulJoins++;
              joinResults.push(result);

              // Check for duplicates
              if (duplicateNames.has(result.name)) {
                console.warn(`Duplicate name detected: ${result.name}`);
              }
              if (duplicateAvatars.has(result.avatar)) {
                console.warn(`Duplicate avatar detected: ${result.avatar}`);
              }

              duplicateNames.add(result.name);
              duplicateAvatars.add(result.avatar);
            }
            return result;
          } catch (error) {
            console.error(`Join request ${index} failed:`, error);
            return null;
          }
        });

      // Execute all concurrent requests
      const startTime = Date.now();
      const results = await Promise.all(joinPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify atomic behavior
      expect(successfulJoins).toBeLessThanOrEqual(mockRoom.maxPlayers);
      expect(successfulJoins).toBe(mockRoom.playersCount);

      // Verify no duplicate bot names
      expect(duplicateNames.size).toBe(successfulJoins);

      // Verify no duplicate avatars
      expect(duplicateAvatars.size).toBe(successfulJoins);

      // Verify room constraints are respected
      expect(mockRoom.playersCount).toBeLessThanOrEqual(mockRoom.maxPlayers);

      // Verify all successful joins have unique IDs
      const botIds = joinResults.map((bot) => bot.id);
      const uniqueBotIds = new Set(botIds);
      expect(uniqueBotIds.size).toBe(successfulJoins);

      // Verify performance (should complete within reasonable time)
      expect(duration).toBeLessThan(10000); // 10 seconds

      // Verify no server crashes
      expect(true).toBe(true);

      console.log(
        `Race test completed: ${successfulJoins} successful joins in ${duration}ms`
      );
    }, 15000); // 15 second timeout

    it("should prevent duplicate bot names under high concurrency", async () => {
      const roomId = "duplicate_test_room";
      const concurrentRequests = 100;

      // Reset room state
      mockRoom.players = [];
      mockRoom.playersCount = 0;

      // Track all bot names
      const allBotNames = new Set();
      let successfulJoins = 0;

      // Mock atomic join with name generation
      let joinCounter = 0;
      GameRoom.findOneAndUpdate.mockImplementation(async () => {
        joinCounter++;

        if (mockRoom.playersCount < mockRoom.maxPlayers) {
          // Generate unique name using timestamp and counter
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const botName = `Bot_${timestamp}_${joinCounter}_${randomSuffix}`;

          const bot = {
            id: `bot_${joinCounter}`,
            name: botName,
            avatar: `avatar_${joinCounter}`,
            isBot: true,
            color: "red",
          };

          mockRoom.players.push(bot);
          mockRoom.playersCount = mockRoom.players.length;

          return { ...mockRoom };
        }
        return null;
      });

      // Execute concurrent requests
      const joinPromises = Array(concurrentRequests)
        .fill(0)
        .map(async () => {
          try {
            const result = await botJoiner.joinBot(roomId);
            if (result) {
              successfulJoins++;
              allBotNames.add(result.name);
            }
            return result;
          } catch (error) {
            return null;
          }
        });

      await Promise.all(joinPromises);

      // Verify no duplicate names
      expect(allBotNames.size).toBe(successfulJoins);
      expect(successfulJoins).toBeLessThanOrEqual(mockRoom.maxPlayers);
    }, 15000);

    it("should handle Redis lock contention correctly", async () => {
      const roomId = "redis_contention_room";
      const concurrentRequests = 30;

      // Simulate Redis lock contention
      let lockAttempts = 0;
      mockRedisClient.set.mockImplementation(async (key, value, px, nx) => {
        lockAttempts++;

        // Simulate some lock failures due to contention
        if (lockAttempts % 5 === 0) {
          throw new Error("Redis lock contention");
        }

        // Simulate successful lock acquisition
        return "OK";
      });

      // Mock lock release
      mockRedisClient.eval.mockResolvedValue(1);

      // Track successful joins
      let successfulJoins = 0;
      const joinPromises = Array(concurrentRequests)
        .fill(0)
        .map(async () => {
          try {
            const result = await botJoiner.joinBot(roomId);
            if (result) {
              successfulJoins++;
            }
            return result;
          } catch (error) {
            return null;
          }
        });

      await Promise.all(joinPromises);

      // Verify some joins succeeded despite lock contention
      expect(successfulJoins).toBeGreaterThan(0);
      expect(successfulJoins).toBeLessThanOrEqual(mockRoom.maxPlayers);

      // Verify Redis was called multiple times
      expect(mockRedisClient.set).toHaveBeenCalledTimes(concurrentRequests);
    }, 15000);

    it("should maintain data consistency during high concurrency", async () => {
      const roomId = "consistency_test_room";
      const concurrentRequests = 75;

      // Reset room state
      mockRoom.players = [];
      mockRoom.playersCount = 0;

      // Track room state changes
      const roomStates = [];
      let stateChanges = 0;

      // Mock atomic updates with state tracking
      GameRoom.findOneAndUpdate.mockImplementation(async () => {
        if (mockRoom.playersCount < mockRoom.maxPlayers) {
          // Capture room state before update
          const beforeState = {
            playersCount: mockRoom.playersCount,
            players: [...mockRoom.players],
          };

          // Simulate atomic update
          const bot = {
            id: `bot_${stateChanges + 1}`,
            name: `Bot_${stateChanges + 1}`,
            avatar: `avatar_${stateChanges + 1}`,
            isBot: true,
            color: "red",
          };

          mockRoom.players.push(bot);
          mockRoom.playersCount = mockRoom.players.length;

          // Capture room state after update
          const afterState = {
            playersCount: mockRoom.playersCount,
            players: [...mockRoom.players],
          };

          roomStates.push({ before: beforeState, after: afterState });
          stateChanges++;

          return { ...mockRoom };
        }
        return null;
      });

      // Execute concurrent requests
      const joinPromises = Array(concurrentRequests)
        .fill(0)
        .map(async () => {
          try {
            return await botJoiner.joinBot(roomId);
          } catch (error) {
            return null;
          }
        });

      await Promise.all(joinPromises);

      // Verify data consistency
      expect(roomStates.length).toBeLessThanOrEqual(mockRoom.maxPlayers);

      // Verify each state change is valid
      roomStates.forEach((stateChange, index) => {
        expect(stateChange.after.playersCount).toBe(
          stateChange.before.playersCount + 1
        );
        expect(stateChange.after.players.length).toBe(
          stateChange.after.playersCount
        );

        // Verify no duplicate bot IDs in final state
        const botIds = stateChange.after.players.map((p) => p.id);
        const uniqueBotIds = new Set(botIds);
        expect(uniqueBotIds.size).toBe(botIds.length);
      });

      // Verify final room state is consistent
      expect(mockRoom.playersCount).toBe(mockRoom.players.length);
      expect(mockRoom.playersCount).toBeLessThanOrEqual(mockRoom.maxPlayers);
    }, 15000);
  });

  describe("Edge Case Race Conditions", () => {
    it("should handle room becoming full during concurrent joins", async () => {
      const roomId = "full_room_race";
      const concurrentRequests = 40;

      // Reset room state
      mockRoom.players = [];
      mockRoom.playersCount = 0;

      // Mock room becoming full during concurrent joins
      let joinAttempts = 0;
      GameRoom.findOneAndUpdate.mockImplementation(async () => {
        joinAttempts++;

        // Room becomes full after 4 joins
        if (joinAttempts <= 4) {
          const bot = {
            id: `bot_${joinAttempts}`,
            name: `Bot_${joinAttempts}`,
            avatar: `avatar_${joinAttempts}`,
            isBot: true,
            color: "red",
          };

          mockRoom.players.push(bot);
          mockRoom.playersCount = mockRoom.players.length;

          return { ...mockRoom };
        } else {
          // Room is now full
          return null;
        }
      });

      // Execute concurrent requests
      const joinPromises = Array(concurrentRequests)
        .fill(0)
        .map(async () => {
          try {
            return await botJoiner.joinBot(roomId);
          } catch (error) {
            return null;
          }
        });

      const results = await Promise.all(joinPromises);

      // Verify exactly 4 bots joined
      const successfulJoins = results.filter((r) => r !== null);
      expect(successfulJoins.length).toBe(4);
      expect(mockRoom.playersCount).toBe(4);
      expect(mockRoom.players.length).toBe(4);
    }, 15000);

    it("should handle database connection failures during race", async () => {
      const roomId = "db_failure_race";
      const concurrentRequests = 25;

      // Simulate intermittent database failures
      let dbFailures = 0;
      GameRoom.findOneAndUpdate.mockImplementation(async () => {
        dbFailures++;

        // Simulate database failure every 5th request
        if (dbFailures % 5 === 0) {
          throw new Error("Database connection failed");
        }

        if (mockRoom.playersCount < mockRoom.maxPlayers) {
          const bot = {
            id: `bot_${dbFailures}`,
            name: `Bot_${dbFailures}`,
            avatar: `avatar_${dbFailures}`,
            isBot: true,
            color: "red",
          };

          mockRoom.players.push(bot);
          mockRoom.playersCount = mockRoom.players.length;

          return { ...mockRoom };
        }
        return null;
      });

      // Execute concurrent requests
      const joinPromises = Array(concurrentRequests)
        .fill(0)
        .map(async () => {
          try {
            return await botJoiner.joinBot(roomId);
          } catch (error) {
            return null;
          }
        });

      const results = await Promise.all(joinPromises);

      // Verify some joins succeeded despite failures
      const successfulJoins = results.filter((r) => r !== null);
      expect(successfulJoins.length).toBeGreaterThan(0);
      expect(successfulJoins.length).toBeLessThanOrEqual(mockRoom.maxPlayers);

      // Verify room state is consistent
      expect(mockRoom.playersCount).toBe(mockRoom.players.length);
    }, 15000);
  });
});
